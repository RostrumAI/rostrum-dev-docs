# Restart-only server framework proposal

Status: Proposed architecture and implementation direction

Applies to: `@rostrum/server`, `@rostrum/daemon`, and `@rostrum/control-api`

Last researched: 2026-09-14

## Decision

Application configuration is immutable for one process lifetime. Configuration, environment, token-file, and direct-TLS changes take effect only after process restart. Remove application-managed SIGHUP reload, candidate comparison, and resource replacement.

Start a production service with one call:

```ts
await boot(import.meta.dir, daemonConfig, Daemon.open);
```

`boot` loads and validates configuration, initializes logging, asks the service to open its database-backed resources and application, binds Bun, and owns bounded shutdown. The service factory owns database-specific construction.

Feature slices export one value containing schemas, the complete route, OpenAPI metadata, responses, and `handler(request, context)`. Each daemon or application defines its own `context` shape. The framework only passes that typed object through.

## Target API

### Application-defined context

The Control API could define this context:

```ts
export interface ControlApiContext {
    readonly config: Readonly<ControlApiConfig>;
    readonly database: {
        readonly workflows: WorkflowOperations;
        readonly readiness: (signal: AbortSignal) => Promise<Readiness>;
    };
    readonly abortSignal: AbortSignal;
}

export const ControlApiTag = {
    System: "system",
    Workflows: "workflows",
} as const;

export type ControlApiTag = (typeof ControlApiTag)[keyof typeof ControlApiTag];

export const defineControlFeature =
    createFeatureBuilder<ControlApiContext, ControlApiTag>();
```

`ControlApiContext` is an example, not a framework interface. Another daemon may expose different fields. The framework constrains context only to an object and does not require `config`, `database`, or `abortSignal`.

`ControlApiTag` is the application's tag enum. Rostrum's `erasableSyntaxOnly` compiler setting rejects native TypeScript `enum`; the `as const` value and derived union provide the runtime values and compile-time constraint without emitted enum code.

The Control API's `database` field is a handler-facing facade. The owned connection and its `close` method remain private to the production service.

### Feature slice

Adding `request.body` means the route requires a JSON body:

```ts
export const RewindParameters = Type.Object({
    workflowId: WorkflowIdSchema,
});

export const rewindWorkflow = defineControlFeature({
    method: "POST",
    path: "/api/workflows/:workflowId/rewind",
    request: {
        body: RewindRequestSchema,
        params: RewindParameters,
    },
    openapi: {
        operationId: "rewindWorkflow",
        summary: "Rewind a workflow draft",
        tags: [ControlApiTag.Workflows],
    },
    responses: {
        200: { description: "The selected revision is current", body: WorkflowRevisionSchema },
        404: { description: "The workflow or revision does not exist", body: ErrorResponseSchema },
    },
    handler: async (request, context) => {
        const { body, params, raw } = request;
        const { database, abortSignal } = context;

        const result = await database.workflows.rewind(
            params.workflowId,
            body.targetRevisionId,
            { signal: abortSignal },
        );

        return raw.json(revisionResponse(result.revision));
    },
});
```

The handler receives:

- `request.body`: decoded and validated `StaticParse` output, or `undefined` when no body schema exists;
- `request.params`: validated, schema-derived path parameters;
- `request.headers`: the native `Headers` object;
- `request.raw`: the original typed Hono context, including `req`, `var`, `res`, and response builders;
- `context`: exactly the application-defined context type.

For a declared body, middleware reads the body once, strictly decodes JSON, retains the source text for the Control API's byte-exact workflow document behavior, and validates with TypeBox `Value.Parse` before invoking the handler. Missing, malformed, or schema-invalid bodies receive the standard 400 response. Handlers use decoded `request.body`; the raw stream is already consumed. The public feature API has no form, text, multipart, or custom-decoder variants.

### Explicit routes

Each application has one static `routes.ts`:

```ts
import { health } from "./features/system/health";
import { readiness } from "./features/system/readiness";
import { rewindWorkflow } from "./features/workflows/rewind";

export function registerRoutes(app: FeatureApp<ControlApiContext>): void {
    const register = createFeatureRegistrar(app);

    register(health);
    register(readiness);
    register(rewindWorkflow);
}
```

Application construction needs no production resources:

```ts
export function createControlApiApp(): FeatureApp<ControlApiContext> {
    const app = createFeatureApp<ControlApiContext>();

    app.use("*", requestId());
    app.use("*", accessLog());
    registerRoutes(app);
    app.get("/openapi.json", serveOpenApi(app));
    app.notFound(notFound);
    app.onError(serverError);
    return app;
}
```

There is no filesystem scan, dynamic import, folder-derived path, or heterogeneous feature array. OpenAPI is generated from the same schemas and metadata registered by `routes.ts`.

### Listener-free test

Tests construct the app and supply the application context to Hono's third `request` argument:

```ts
const workflows = new FakeWorkflowOperations();
const app = createControlApiApp();

const response = await app.request(
    `/api/workflows/${workflowId}/rewind`,
    {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetRevisionId }),
    },
    {
        config: testControlApiConfig,
        database: { workflows, readiness: async () => ready },
        abortSignal: new AbortController().signal,
    },
);

expect(response.status).toBe(200);
expect(await response.json()).toEqual(expectedRevision);
```

This exercises routing, automatic JSON decoding, validation, middleware, the handler, and serialization without a listener or database connection.

## Framework responsibilities

`@rostrum/server` provides:

- one-shot `defineConfig` and `loadConfig`;
- `boot(root, definition, open)`;
- `createFeatureBuilder<Context, Tag>()`;
- `createFeatureApp<Context>()` and `createFeatureRegistrar(app)`;
- strict JSON body and path-parameter validation;
- OpenAPI translation from registered feature values;
- request admission, abort, drain, and exactly-once service close.

The registrar rejects duplicate method/path pairs, mismatched path schemas, bodies on unsupported methods, duplicate operation IDs, invalid responses, and missing application tags.

The framework does not define application context fields, construct Postgres, discover feature files, own domain recovery, or statically prove that an arbitrary raw `Response` matches its documented response schema.

Production services retain immutable configuration and owned resources. Their `fetch(request, abortSignal)` supplies the application-specific context to the app. Database reachability remains readiness behavior; migrations remain an operator command.

SIGHUP never rereads configuration. A handler may log that restart is required, or a guaranteed supervisor may map it to graceful exit. SIGINT and SIGTERM stop admission, drain accepted requests under one deadline, abort overdue work, and close the service once.

M2 still loses in-memory daemon runs on exit. Durable checkpoints, attempts, idempotency, and restart recovery remain M3 responsibilities.

## Implementation sequence

1. Change the daemon decision and operator guide to startup-only configuration; remove reload and rotation claims.
2. Make daemon and Control API configuration one-shot and service-owned while preserving precedence, validation, and secret-safe errors.
3. Add the context-generic feature builder, automatic strict JSON validation, tag constraint, OpenAPI translation, and registrar.
4. Convert feature slices and add explicit `routes.ts` modules; delete discovery, service accessors, and obsolete loader tests.
5. Separate resource-free application construction from production service opening, then replace the lifecycle with `boot`.

Verification must compile positive and negative handler fixtures, exercise valid and invalid JSON through `app.request`, compare generated OpenAPI, verify configuration failure before resource acquisition, and smoke-test both real executables through startup and bounded shutdown.

## Sources

- [Current shared configuration](https://github.com/RostrumAI/rostrum/blob/main/packages/server/src/config.ts)
- [Current shared lifecycle](https://github.com/RostrumAI/rostrum/blob/main/packages/server/src/lifecycle.ts)
- [Current feature loader](https://github.com/RostrumAI/rostrum/blob/main/packages/server/src/loader.ts)
- [Current Control API application](https://github.com/RostrumAI/rostrum/blob/main/apis/control-api/src/app.ts)
- [M3 durable restart recovery](../epics/m3/1-recover-durable-runs.md)
- [Hono testing](https://hono.dev/docs/guides/testing)
- [TypeBox](https://github.com/sinclairzx81/typebox)
- [`hono-openapi`](https://github.com/rhinobase/hono-openapi)
