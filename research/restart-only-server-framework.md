# Restart-only server framework

Status: Delivered. The implementation lives in the rostrum repository; this document remains the design record for `@rostrum/server`.

Applies to: `@rostrum/server`, `@rostrum/daemon`, and `@rostrum/control-api`

Last researched: 2026-09-14
Delivered: 2026-09-15

Terminology: route modules are **services**, not feature slices. This is a naming and directory change only: `/features/workflows/create.ts` becomes `/services/workflows/create.ts`.

## Delivered surface

`@rostrum/server` now owns one implementation of each contract this document proposed, and both backend services are built on it:

- `boot(root, definition, open)` loads and validates configuration once, initializes logging, asks the service to open its resources and application, binds Bun, and owns bounded shutdown. `ServiceRuntimeConfig`, `OpenedService`, and the exactly-once close live beside it.
- `defineConfig` and `loadConfig` declare an application's settings, sources, and defaults, and return one frozen configuration.
- `createServiceBuilder` declares a service as one value: binding, request schemas, OpenAPI metadata, documented responses, contributed components, and `handler(request, response, context)`.
- `createServerApp` returns a branded application that installs the mandatory request-id and access-log middleware before any route, and `createServiceRegistrar` rejects conflicting declarations at startup.
- `serveOpenApi` serves the contract translated from the same registered services.
- Strict JSON body and path-parameter validation run before every handler, and the application owns the error envelope each failure answers with.
- Both applications keep one static `routes.ts`, and the filesystem scan, dynamic import, service accessors, and loader are gone.

Verified by the repository's own gates and by a real two-process run against a disposable database: daemon authentication and readiness, aggregated Control API readiness over HTTP, a full authoring round trip, the documented 400/404/405 shapes, and a bounded zero exit on SIGTERM.

## Decision

Application configuration is immutable for one process lifetime. Configuration, environment, token-file, and direct-TLS changes take effect only after process restart. Remove application-managed SIGHUP reload, candidate comparison, and resource replacement.

Start a production service with one call:

```ts
await boot(import.meta.dir, daemonConfig, Daemon.open);
```

`boot` loads and validates configuration, initializes logging, asks the service to open its database-backed resources and application, binds Bun, and owns bounded shutdown. The service factory owns database-specific construction.

Service modules export one value containing schemas, the complete route, OpenAPI metadata, responses, and `handler(request, response, context)`. Each daemon or application defines the fields in `context`; the framework adds only `context.raw`.

## Target API

### Application-defined context

The Control API could define this context:

```ts
export interface ControlApiContext {
    readonly config: Readonly<ControlApiConfig>;
    readonly database: {
        readonly workflows: WorkflowOperations;
    };
    readonly readiness: (signal: AbortSignal) => Promise<Readiness>;
    readonly abortSignal: AbortSignal;
}
```

`readiness` stays outside `database` because it aggregates more than the database: the Control API's own connection and the daemon it calls.

export const CONTROL_API_TAG = {
    SYSTEM: "system",
    WORKFLOWS: "workflows",
} as const;

export type ControlApiTag = (typeof CONTROL_API_TAG)[keyof typeof CONTROL_API_TAG];

export const defineControlService =
    createServiceBuilder<ControlApiContext, ControlApiTag>();
```

`ControlApiContext` is an example, not a framework interface. Another daemon may expose different fields. The framework constrains the context to an object that does not define `raw`, which is reserved for the original Hono context.

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
    handler: async (request, response, context) => {
        const { body, params } = request;
        const { database, abortSignal } = context;

        const result = await database.workflows.rewind(
            params.workflowId,
            body.targetRevisionId,
            { signal: abortSignal },
        );

        return response.json(revisionResponse(result.revision));
    },
});
```

The builder infers all three arguments:

- `request` contains the decoded schema-derived `body`, validated `params`, and native `headers`;
- `response` exposes Hono's response-facing functions: `header`, `status`, `newResponse`, `body`, `text`, `json`, `html`, `redirect`, `notFound`, `render`, `setRenderer`, `setLayout`, and `getLayout`;
- `context` contains exactly the application-defined fields plus `raw`, the original typed Hono context for remaining capabilities such as `req`, `var`, `res`, and execution context.

`response` and `context.raw` reference the same request-local Hono context. `response` is only a narrower type view, so the framework does not copy or rebind Hono methods.

When a service declares `request.body`, middleware reads the body once, strictly decodes JSON, retains the source text for the Control API's byte-exact workflow document behavior, and validates with TypeBox `Value.Parse` before invoking the handler. The inferred result is passed as `request.body`. Missing, malformed, or schema-invalid bodies receive the standard 400 response; the raw stream is already consumed.

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

The registrar rejects duplicate method/path pairs, mismatched path schemas, bodies on unsupported methods, duplicate operation IDs, invalid responses, missing application tags, and an application context that defines the reserved `raw` field.

The framework does not prescribe application context fields, construct Postgres, discover service files, own domain recovery, or statically prove that an arbitrary response matches its documented response schema.

Production services retain immutable configuration and owned resources. Their `fetch(request, abortSignal)` supplies the application-specific context to the app. Database reachability remains readiness behavior; migrations remain an operator command.

SIGHUP never rereads configuration. A handler may log that restart is required, or a guaranteed supervisor may map it to graceful exit. SIGINT and SIGTERM stop admission, drain accepted requests under one deadline, abort overdue work, and close the service once.

M2 still loses in-memory daemon runs on exit. Durable checkpoints, attempts, idempotency, and restart recovery remain M3 responsibilities.

## Implementation sequence

All five steps are delivered:

1. The daemon decision and the operator guide describe startup-only configuration; the reload and rotation claims are gone.
2. Daemon and Control API configuration is one-shot and service-owned, with the previous precedence, validation, and secret-safe errors preserved.
3. The context-generic service builder, inferred handler arguments, automatic strict JSON validation, the reserved `context.raw`, the tag constraint, OpenAPI translation, and the registrar are in place.
4. Route modules moved from `features` to `services`, each application has one static `routes.ts`, and dynamic discovery, the service accessors, and the loader tests are deleted.
5. The branded application installs the mandatory middleware and still allows application middleware; resource-free application construction is separate from production service opening; the lifecycle is `boot`.

Verification: positive and negative compile fixtures cover all three handler arguments and the reserved `raw` field; server tests prove mandatory and application middleware ordering; valid and invalid bodies and path parameters are exercised through listener-free requests; both generated contracts are compared against their checked-in copies; configuration failure is proven to precede resource acquisition; and both real executables were smoke-tested through startup and bounded shutdown, including a two-process run against a disposable database.

## Sources

- [Current shared configuration](https://github.com/RostrumAI/rostrum/blob/main/packages/server/src/config.ts)
- [Current shared lifecycle](https://github.com/RostrumAI/rostrum/blob/main/packages/server/src/lifecycle.ts)
- [Current feature loader](https://github.com/RostrumAI/rostrum/blob/main/packages/server/src/loader.ts)
- [Current Control API application](https://github.com/RostrumAI/rostrum/blob/main/apis/control-api/src/app.ts)
- [M3 durable restart recovery](../epics/m3/1-recover-durable-runs.md)
- [Hono testing](https://hono.dev/docs/guides/testing)
- [TypeBox](https://github.com/sinclairzx81/typebox)
- [`hono-openapi`](https://github.com/rhinobase/hono-openapi)
