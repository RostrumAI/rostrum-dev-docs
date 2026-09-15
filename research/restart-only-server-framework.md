# Restart-only server framework proposal

Status: Proposed architecture and implementation direction

Applies to: `@rostrum/server`, `@rostrum/daemon`, and `@rostrum/control-api`

Last researched: 2026-09-14
Terminology: route modules are **services**, not feature slices. This is a naming and directory change only: `/features/workflows/create.ts` becomes `/services/workflows/create.ts`.

## Decision

Application configuration is immutable for one process lifetime. Configuration, environment, token-file, and direct-TLS changes take effect only after process restart. Remove application-managed SIGHUP reload, candidate comparison, and resource replacement.

Start a production service with one call:

```ts
await boot(import.meta.dir, daemonConfig, Daemon.open);
```

`boot` loads and validates configuration, initializes logging, asks the service to open its database-backed resources and application, binds Bun, and owns bounded shutdown. The service factory owns database-specific construction.

Service modules export one value containing schemas, the complete route, OpenAPI metadata, responses, and `handler(context)`. Each daemon or application defines the additional fields placed on that Hono context.

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

export const CONTROL_API_TAG = {
    SYSTEM: "system",
    WORKFLOWS: "workflows",
} as const;

export type ControlApiTag = (typeof CONTROL_API_TAG)[keyof typeof CONTROL_API_TAG];

export const defineControlService =
    createServiceBuilder<ControlApiContext, ControlApiTag>();
```

`ControlApiContext` is an example, not a framework interface. Another daemon may expose different fields. The framework constrains these additions only to an object and rejects names that collide with Hono or framework-provided context fields.

`CONTROL_API_TAG` is the application's tag enum. Rostrum's `erasableSyntaxOnly` compiler setting rejects native TypeScript `enum`; the `as const` value and derived union provide the runtime values and compile-time constraint without emitted enum code.

The Control API's `database` field is a handler-facing facade. The owned connection and its `close` method remain private to the production service.

### Service module

Adding `request.body` means the service requires a JSON body:

```ts
export const RewindParameters = Type.Object({
    workflowId: WorkflowIdSchema,
});

export const rewindWorkflow = defineControlService({
    method: "POST",
    path: "/api/workflows/:workflowId/rewind",
    request: {
        body: RewindRequestSchema,
        params: RewindParameters,
    },
    openapi: {
        operationId: "rewindWorkflow",
        summary: "Rewind a workflow draft",
        tags: [CONTROL_API_TAG.WORKFLOWS],
    },
    responses: {
        200: { description: "The selected revision is current", body: WorkflowRevisionSchema },
        404: { description: "The workflow or revision does not exist", body: ErrorResponseSchema },
    },
    handler: async (context) => {
        const { req, database, abortSignal, json } = context;
        const body = req.valid("json");
        const params = req.valid("param");

        const result = await database.workflows.rewind(
            params.workflowId,
            body.targetRevisionId,
            { signal: abortSignal },
        );

        return json(revisionResponse(result.revision));
    },
});
```

The handler receives the original typed Hono context with every field from the application-defined context added at the top level. Handlers destructure the fields they use. Native Hono members such as `req`, `var`, `res`, and `json` remain unchanged.

Declared body and parameter schemas type Hono's validation store. Handlers read the decoded values through `req.valid("json")` and `req.valid("param")`; native headers remain available through `req.raw.headers`.

For a declared body, middleware reads the body once, strictly decodes JSON, retains the source text for the Control API's byte-exact workflow document behavior, and validates with TypeBox `Value.Parse` before invoking the handler. Missing, malformed, or schema-invalid bodies receive the standard 400 response. The raw stream is already consumed. The public service API has no form, text, multipart, or custom-decoder variants.

### Explicit routes

Each application has one static `routes.ts`:

```ts
import { health } from "./services/system/health";
import { readiness } from "./services/system/readiness";
import { rewindWorkflow } from "./services/workflows/rewind";

export function registerRoutes(app: ServerApp<ControlApiContext>): void {
    const register = createServiceRegistrar(app);

    register(health);
    register(readiness);
    register(rewindWorkflow);
}
```

Application construction needs no production resources:

```ts
export function createControlApiApp(): ServerApp<ControlApiContext> {
    const app = createServerApp<ControlApiContext>({
        serviceName: "control-api",
    });

    app.use("*", controlApiMiddleware());
    registerRoutes(app);
    app.get("/openapi.json", serveOpenApi(app));
    app.notFound(notFound);
    app.onError(serverError);
    return app;
}
```

`createServerApp` installs package-owned mandatory middleware, including request IDs and access logging, before returning. Shared telemetry belongs in the same stack. Applications may add their own middleware before registering routes, as shown above. `ServerApp` carries a package-private brand, so registrars and production services cannot accept a bare Hono app that skipped the mandatory stack. Server package tests verify the stack and its order.

Route registration remains static: no filesystem scan, dynamic import, folder-derived path, or heterogeneous array. OpenAPI uses the same registered service schemas and metadata.

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
- `createServiceBuilder<Context, Tag>()`;
- branded `createServerApp<Context>()` and `createServiceRegistrar(app)`;
- mandatory request ID, access logging, and shared telemetry middleware;
- strict JSON body and path-parameter validation;
- OpenAPI translation from registered service values;
- request admission, abort, drain, and exactly-once service close.

The registrar rejects duplicate method/path pairs, mismatched path schemas, bodies on unsupported methods, duplicate operation IDs, invalid responses, missing application tags, and context field collisions.

The framework does not prescribe application context fields, construct Postgres, discover service files, own domain recovery, or statically prove that an arbitrary raw `Response` matches its documented response schema.

Production services retain immutable configuration and owned resources. Their `fetch(request, abortSignal)` supplies the application-specific context to the app. Database reachability remains readiness behavior; migrations remain an operator command.

SIGHUP never rereads configuration. A handler may log that restart is required, or a guaranteed supervisor may map it to graceful exit. SIGINT and SIGTERM stop admission, drain accepted requests under one deadline, abort overdue work, and close the service once.

M2 still loses in-memory daemon runs on exit. Durable checkpoints, attempts, idempotency, and restart recovery remain M3 responsibilities.

## Implementation sequence

1. Change the daemon decision and operator guide to startup-only configuration; remove reload and rotation claims.
2. Make daemon and Control API configuration one-shot and service-owned while preserving precedence, validation, and secret-safe errors.
3. Add the context-generic service builder, augmented Hono handler context, automatic strict JSON validation, tag constraint, OpenAPI translation, and registrar.
4. Move route modules from `features` to `services`, add explicit `routes.ts` modules, and delete dynamic discovery, service accessors, and obsolete loader tests.
5. Add the branded server-app constructor with mandatory middleware and application middleware extension, separate resource-free application construction from production service opening, then replace the lifecycle with `boot`.

Verification must compile positive and negative handler fixtures, prove mandatory and application middleware ordering, exercise valid and invalid JSON through `app.request`, compare generated OpenAPI, verify configuration failure before resource acquisition, and smoke-test both real executables through startup and bounded shutdown.

## Sources

- [Current shared configuration](https://github.com/RostrumAI/rostrum/blob/main/packages/server/src/config.ts)
- [Current shared lifecycle](https://github.com/RostrumAI/rostrum/blob/main/packages/server/src/lifecycle.ts)
- [Current feature loader](https://github.com/RostrumAI/rostrum/blob/main/packages/server/src/loader.ts)
- [Current Control API application](https://github.com/RostrumAI/rostrum/blob/main/apis/control-api/src/app.ts)
- [M3 durable restart recovery](../epics/m3/1-recover-durable-runs.md)
- [Hono testing](https://hono.dev/docs/guides/testing)
- [TypeBox](https://github.com/sinclairzx81/typebox)
- [`hono-openapi`](https://github.com/rhinobase/hono-openapi)
