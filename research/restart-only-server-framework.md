# Restart-only server framework proposal

Status: Proposed architecture and implementation direction

Applies to: `@rostrum/server`, `@rostrum/daemon`, and `@rostrum/control-api`

Last researched: 2026-09-14

## Decision

Treat application configuration as immutable for the lifetime of a process. Applying any configuration-file, environment, token-file, or direct-TLS material change requires restarting the affected process. Remove application-managed SIGHUP reload rather than retaining candidate comparison, resource replacement, or partial live settings.

Start each service with one call:

```ts
await boot(import.meta.dir, daemonConfig, Daemon.open);
```

The call performs the complete production startup sequence: select and load the configuration file, apply exact environment overrides, validate and finalize the configuration, initialize logging, ask the service to open its database-backed resources and application, bind Bun, and install bounded shutdown handling. The service factory owns database-specific construction; the generic lifecycle owns ordering and cleanup.

Feature slices export one feature value containing request schemas, route and OpenAPI information, and a handler. Keeping those fields in one value lets TypeScript derive the handler contract from the schemas without a second annotation or runtime module protocol. A small adapter invokes each handler with two explicit arguments:

- `request`, containing the validated `body` and `params`, native `Headers`, and the raw typed Hono context;
- `context`, containing the application's immutable `config`, handler-facing `database` facade, and per-request `abortSignal`.

The common path is `handler: async (request, context) => {}`. `request.raw` preserves the complete Hono API for variables, the underlying request, response inspection, and response builders instead of hiding Hono behind an opaque abstraction.

Build the Hono application independently of production resources. Unit and route tests call `app.request(...)` with a controlled handler context and no TCP listener, logger initialization, configuration file, or database connection. Production resource construction and real-process smoke tests remain separate layers.

Restart and crash continuity belongs to durable execution, not HTTP bootstrap. M2 still loses daemon run state on exit. M3 must make acknowledged runs survive restart from committed checkpoints; this proposal does not pull that recovery forward or reproduce it inside `@rostrum/server`.

## Intended developer experience

### Process entry point

The executable contains imports and one call:

```ts
import { boot } from "@rostrum/server/lifecycle";
import { daemonConfig } from "./config";
import { Daemon } from "./daemon";

await boot(import.meta.dir, daemonConfig, Daemon.open);
```

There are no explicit generic arguments, lifecycle callbacks object, dependency identity, listener identity, or reload policy at the call site.

### Feature slice

The application defines its handler context and OpenAPI tag enum once:

```ts
export interface ControlApiDatabase {
    readonly workflows: WorkflowOperations;
    readonly readiness: (signal: AbortSignal) => Promise<Readiness>;
}

export interface ControlApiContext {
    readonly config: Readonly<ControlApiConfig>;
    readonly database: ControlApiDatabase;
    readonly abortSignal: AbortSignal;
}

export interface ControlApiEnv {
    Bindings: ControlApiContext;
    Variables: {
        readonly requestId: string;
        readonly rawBodyText?: string;
    };
}

export const ControlApiTag = {
    System: "system",
    Workflows: "workflows",
} as const;

export type ControlApiTag =
    (typeof ControlApiTag)[keyof typeof ControlApiTag];

export const defineControlFeature =
    createFeatureBuilder<ControlApiEnv, ControlApiTag>();
```

`ControlApiTag` is the application's runtime enum and compile-time string union. Rostrum enables TypeScript's `erasableSyntaxOnly`, which rejects native `enum` declarations; the `as const` form centralizes the allowed values without emitted enum machinery. A feature must use one of these enum values rather than defining its own tag vocabulary.

`ControlApiDatabase` is a handler-facing database facade, not the raw connection or a concrete class with private state. Production can back `database.workflows` with `WorkflowService`; a test can provide a structural fake implementing the same operations.

A feature declares its complete boundary in one value. Individual TypeBox schemas remain named exports when another module needs them:

```ts
export const RewindParameters = Type.Object({
    workflowId: WorkflowIdSchema,
});

export const rewindWorkflow = defineControlFeature({
    method: "POST",
    path: "/api/workflows/:workflowId/rewind",
    request: {
        params: RewindParameters,
        body: RewindRequestSchema,
    },
    openapi: {
        operationId: "rewindWorkflow",
        summary: "Rewind a workflow draft",
        requestBodyDescription: "The target revision to make current",
        tags: [ControlApiTag.Workflows],
    },
    responses: {
        200: {
            description: "The draft now shows the selected revision",
            body: WorkflowRevisionSchema,
        },
        400: {
            description: "The request body is invalid",
            body: ErrorResponseSchema,
        },
        404: {
            description: "The workflow or selected revision does not exist",
            body: ErrorResponseSchema,
        },
    },
    handler: async (request, context) => {
        const { body, params, raw } = request;
        const { database, abortSignal } = context;

        const result = await database.workflows.rewind(
            params.workflowId,
            body.targetRevisionId,
            { signal: abortSignal },
        );

        if (result.outcome === "target-not-found") {
            throw new WorkflowApiError(
                workflowRevisionNotFound(
                    `Revision ${body.targetRevisionId} of workflow ${params.workflowId} does not exist`,
                ),
            );
        }
        if (result.outcome === "not-found") {
            throw new WorkflowApiError(
                workflowNotFound(`Workflow ${params.workflowId} does not exist`),
            );
        }

        return raw.json(revisionResponse(result.revision));
    },
});
```

Handlers can destructure the complete stable shapes when they need every boundary:

```ts
handler: async (request, context) => {
    const { body, headers, params, raw } = request;
    const { config, database, abortSignal } = context;
    // Route behavior uses only the members it needs.
}
```

TypeScript derives `body` from `RewindRequestSchema`, `params` from `RewindParameters`, and `context` from `ControlApiContext`. `headers` is the native `Headers` object. Invalid schema input receives the application's standard 400 response before the handler runs.

`raw` is the original typed Hono context, so exceptional routes retain the complete framework boundary:

```ts
raw.var.requestId;
raw.req.raw;
raw.req.header("if-match");
raw.res;
raw.json(body, status);
```

The Control API's JSON decoder reads the request bytes once, performs the existing strict parse, and stores the decoded source text in `raw.var.rawBodyText` before TypeBox validates the feature schema. Workflow create and save can therefore preserve the byte-exact `document` member while `request.body` receives `StaticParse<TSchema>`. Body validation consumes the request stream, so a handler must not assume `raw.req.raw.body` remains unread. Ordinary handlers use the validated value rather than parsing the body again.

### Listener-free route test

Application construction does not need production dependencies. A test supplies a structural database facade and configuration as the handler context:

```ts
const app = createControlApiApp();
const workflows = new FakeWorkflowOperations();

const response = await app.request(
    `/api/workflows/${workflowId}/rewind`,
    {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetRevisionId }),
    },
    {
        config: testControlApiConfig,
        database: {
            workflows,
            readiness: async () => ready,
        },
        abortSignal: new AbortController().signal,
    },
);

expect(response.status).toBe(200);
expect(await response.json()).toEqual(expectedRevision);
```

This exercises real route registration, body and parameter validation, middleware, the feature handler, and response serialization without `Bun.serve()` or a database connection. Tests that need the real database can open the service and call its `fetch` method directly. Only process and transport smoke tests bind a listener.

## Required behavior

The replacement must preserve these boundaries unless this proposal states otherwise:

1. Validate the complete startup configuration before acquiring a database handle, constructing the application, or binding a listener.
2. Apply defaults, YAML, and environment values in that order; environment values win and use exact integer, boolean, and string parsing.
3. Reject unknown keys, invalid token or TLS files, unsafe network policy, and invalid database policy without logging supplied secrets.
4. Initialize LogTape after configuration validation and before service resources or the listener.
5. Give one process one immutable configuration and one owned resource set.
6. Authenticate daemon requests before the drain gate, route lookup, or body processing.
7. Stop admission on SIGINT or SIGTERM, let accepted requests finish within one fixed deadline, then abort and force close.
8. Close each returned service exactly once, including listener-bind failure.
9. Generate and verify OpenAPI without opening production resources.
10. Keep liveness and readiness distinct. A transiently unavailable database may leave the process live but unready; removing configuration reload does not turn dependency availability into configuration validity.

The deliberate behavior changes are:

- SIGHUP does not reread application configuration or referenced files.
- Every configuration and credential change takes effect on process restart.
- There is no last-known-good live candidate because there is no runtime candidate.
- Direct certificate and token rotation use process replacement or an external TLS/credential boundary.

An installed SIGHUP handler may emit one fixed warning to prevent accidental default termination:

```text
configuration is loaded only at startup; restart the service to apply changes
```

It must not read the file, compare values, mutate resources, or claim that a restart occurred. A deployment may instead map SIGHUP to graceful exit only when its supervisor contract guarantees replacement; explicit supervisor restart remains clearer.

## Why restart-only configuration

Live application reload protects one planned mutation path while adding a second lifetime model beside process startup and shutdown. It does not protect deployments, crashes, OOM termination, machine restart, or dependency-driven process replacement.

The current lifecycle contains separate identities for database and listener settings, candidate resources, listener rebind and restoration, reload coalescing, and precedence between reload and shutdown. The `applyReload` and `requestReload` functions alone occupy 121 lines of the 333-line lifecycle. Removing their identity and state support directly removes roughly 135 lines before simplifying the public interfaces.

A prior experiment against the real `runService` also found a missing lifetime case: a database-identity reload closed the old dependency while a request admitted against that dependency was still running. The focused lifecycle suites passed 7 tests despite that result. A correct full-reload implementation needs resource-generation leases; restart-only configuration deletes that problem rather than hiding it behind a shorter call.

Durable restart recovery is broader and already planned. M3 requires acknowledged run identity, inputs, checkpoints, attempts, outcomes, and events to survive daemon and Control API restart. Interrupted work may create a later attempt; committed work must not execute again. That execution-domain contract belongs in the daemon and durable store, not in the HTTP lifecycle package.

Restart-only configuration does not make total recovery engineering free. It removes duplicated infrastructure complexity and leaves the necessary durability work in its owning milestone.

## Architecture boundaries

| Layer | Owns | Does not own |
| --- | --- | --- |
| `ConfigDefinition<C>` | Service/log category, input schema, defaults, environment names, file selection, finalization | Process state, reload, database handles |
| `loadConfig` | One-shot file/default/environment layering and schema parsing | Logging, resources, listeners |
| Feature definition | Method, complete path, request schemas, response schemas, enum-backed OpenAPI metadata, two-argument handler | Filesystem discovery, production resources |
| `ControlApiApp` / `DaemonApp` | Middleware, explicit `routes.ts` registration, validation binding, errors, OpenAPI | Config loading, database construction, process signals |
| `ControlApi` / `Daemon` | Immutable config, owned database resources, handler context, application, recovery when implemented | Signal installation, listener draining |
| `boot` | Startup order, logger, listener, request admission, abort controllers, bounded shutdown | Database-specific policy, routes, run recovery |
| Supervisor | Stop/start replacement and deployment policy | Application configuration parsing |

The framework-facing public surface consists of three cohesive leaf modules: `config` exports `defineConfig`, `ConfigDefinition`, and `loadConfig`; `feature` exports the feature builder, validators, and single-feature registrar; `lifecycle` exports `boot` and `RunningService`. Protocol schemas, network checks, tokens, readiness, and logging may remain separate leaf utilities, but they do not create competing startup or route-registration conventions.

The dependency direction is one-way:

```text
boot
  ├─ loadConfig(definition)
  ├─ configureLogging(config)
  ├─ service = open(config)
  │    ├─ validate and create database handle
  │    ├─ construct domain services
  │    └─ create application
  └─ Bun.serve(service.fetch)
```

The generic lifecycle invokes database construction as part of startup but does not import `@rostrum/database`. Adding a database option to `boot` would couple every HTTP service to one resource type and make listener-free testing harder. The service factory is the resource boundary.

## One-shot configuration

Configuration remains schema-first and service-owned:

```ts
export type DaemonConfig = Readonly<StaticParse<typeof DaemonConfigInputSchema>> & {
    readonly tokens: readonly string[];
    readonly tls?: {
        readonly cert: string;
        readonly key: string;
    };
};

export const daemonConfig = defineConfig({
    name: "daemon",
    file: {
        environment: "DAEMON_CONFIG",
        default: "config.yaml",
    },
    schema: DaemonConfigInputSchema,
    defaults: daemonDefaults,
    environment: {
        DAEMON_HOST: "host",
        DAEMON_PORT: "port",
        DAEMON_LOG_LEVEL: "logLevel",
        DATABASE_URL: "databaseUrl",
        DATABASE_TLS: "databaseTls",
        DAEMON_TOKEN_FILE: "daemonTokenFile",
    },
    finalize: finalizeDaemonConfig,
}) satisfies ConfigDefinition<DaemonConfig>;
```

The owning module names its concrete configuration contract. Schema-backed fields come from `StaticParse`; the small intersection names only values added by finalization. `finalizeDaemonConfig` explicitly returns `DaemonConfig`, so consumers do not publish a contract through a utility over the finalizer function.

`loadConfig` performs one deterministic operation:

1. Resolve the selected file against the supplied root.
2. Parse YAML or use an empty object only when the default file is absent.
3. Validate file keys and file-level types.
4. Layer defaults, file values, then supplied environment values.
5. Decode environment strings according to the target schema property. Integers accept only decimal safe integers; booleans accept only `true` or `false`; strings and literal unions remain strings. Complex environment targets are unsupported.
6. Parse the complete input with TypeBox `Value.Parse` so the result carries the schema's parsed static type.
7. Run service-specific finalization for tokens, direct TLS material, daemon URLs, database policy, and network security.
8. Return one immutable-by-contract `C` from the supplied `ConfigDefinition<C>`.

There is no stateful source object, retained environment snapshot, `Service` union, conditional `ConfigFor<S>`, or service-name switch. Tests call `loadConfig` with explicit root, environment, and file-reader inputs rather than mutating global process state.

All referenced files are startup inputs. A changed token file, certificate, or `NODE_EXTRA_CA_CERTS` bundle has no effect until the process restarts.

Provide a configuration-check command that invokes this same loader and exits before logger, database, application, or listener initialization. An operator or supervisor can validate the replacement inputs before stopping the current process. The check prevents known-invalid restarts; it does not probe dependency availability or promise zero-downtime replacement.

## Restart-only lifecycle

The lifecycle contract no longer carries the configuration type after resource construction:

```ts
export interface BootConfig {
    readonly host: string;
    readonly port: number;
    readonly logLevel: LogLevel;
    readonly shutdownTimeoutMs: number;
    readonly tls?: {
        readonly cert: string;
        readonly key: string;
    };
}

export interface RunningService {
    authenticate?(request: Request): Response | undefined;
    fetch(request: Request, abortSignal: AbortSignal): Response | Promise<Response>;
    close(options: { timeoutMs: number }): Promise<void>;
}

export async function boot<C extends BootConfig>(
    root: string,
    definition: ConfigDefinition<C>,
    open: (config: C) => Promise<RunningService>,
): Promise<void>;
```

`boot` performs this sequence:

1. Load and validate configuration.
2. Initialize logging.
3. Call `open(config)`.
4. Bind Bun from the validated listener fields.
5. For each request, authenticate, apply the drain gate, create an abort controller, and invoke the service.
6. On SIGINT or SIGTERM, stop admission, wait under `shutdownTimeoutMs`, abort overdue requests, and close the service once.
7. If listener binding fails after `open`, close the returned service before reporting startup failure.

`open` must unwind any resource it acquires before it returns an error. Once it returns a `RunningService`, `boot` owns calling `close` exactly once.

A service object holds the immutable configuration, owned connection, handler-facing database facade, and application:

```ts
export class ControlApi implements RunningService {
    private constructor(
        private readonly config: ControlApiConfig,
        private readonly connection: DatabaseHandle,
        private readonly database: ControlApiDatabase,
        private readonly app: Hono<ControlApiEnv>,
    ) {}

    static async open(config: ControlApiConfig): Promise<ControlApi> {
        const options = databaseOptions(config);
        validateDatabaseOptions(options);

        const app = createControlApiApp();
        const connection = createDatabase(options);
        try {
            const database = createControlApiDatabase(config, connection);
            return new ControlApi(config, connection, database, app);
        } catch (error) {
            await connection.close({ timeoutMs: config.shutdownTimeoutMs });
            throw error;
        }
    }

    authenticate(request: Request): Response | undefined {
        return authenticateRequest(request, this.config.tokens);
    }

    fetch(request: Request, abortSignal: AbortSignal): Response | Promise<Response> {
        return this.app.fetch(request, {
            config: this.config,
            database: this.database,
            abortSignal,
        });
    }

    close(options: { timeoutMs: number }): Promise<void> {
        return this.connection.close(options);
    }
}
```

Database option validation and connection construction happen before listening. Database reachability continues to flow through readiness unless a later durable-recovery plan requires the daemon to complete recovery before admission. Migrations remain an explicit operator command.

The application-specific context exposes immutable configuration and a database facade with route-level operations such as `database.workflows.rewind`. It does not expose listener control or connection shutdown. `@rostrum/server` only passes the context through and does not know either application's configuration or database types.

## Typed feature contract

The framework should be small enough to read without reconstructing an implicit plugin protocol. Its compile-time core derives a request object from TypeBox schemas and passes the application's Hono bindings as the second argument:

```ts
type FeatureEnvironment = Env & { Bindings: object };

interface RequestSchemas {
    readonly body?: TSchema;
    readonly params?: TObject;
}

type BodyOutput<R extends RequestSchemas> =
    R extends { readonly body: infer B extends TSchema }
        ? StaticParse<B>
        : undefined;

type ParameterOutput<R extends RequestSchemas> =
    R extends { readonly params: infer P extends TObject }
        ? StaticParse<P>
        : {};

type FeatureInput<R extends RequestSchemas> = {
    readonly out:
        & (R extends { readonly body: infer B extends TSchema }
            ? { readonly json: StaticParse<B> }
            : {})
        & (R extends { readonly params: infer P extends TObject }
            ? { readonly param: StaticParse<P> }
            : {});
};

export interface FeatureRequest<
    E extends FeatureEnvironment,
    Path extends string,
    Request extends RequestSchemas,
> {
    readonly body: BodyOutput<Request>;
    readonly headers: Headers;
    readonly params: ParameterOutput<Request>;
    readonly raw: Context<E, Path, FeatureInput<Request>>;
}

export interface FeatureDefinition<
    E extends FeatureEnvironment,
    Tag extends string,
    Path extends string,
    Request extends RequestSchemas,
> {
    readonly method: HttpMethod;
    readonly path: Path;
    readonly request: Request;
    readonly openapi: {
        readonly operationId: string;
        readonly summary: string;
        readonly description?: string;
        readonly requestBodyDescription?: string;
        readonly tags: readonly [Tag, ...Tag[]];
    };
    readonly responses: Readonly<Record<number, {
        readonly description: string;
        readonly body?: TSchema;
    }>>;
    readonly handler: (
        request: FeatureRequest<E, Path, Request>,
        context: E["Bindings"],
    ) => Response | Promise<Response>;
}

export function createFeatureBuilder<
    E extends FeatureEnvironment,
    Tag extends string,
>() {
    return function defineFeature<
        const Path extends string,
        const Request extends RequestSchemas,
    >(definition: FeatureDefinition<E, Tag, Path, Request>) {
        return definition;
    };
}
```

The builder owns no runtime state. It contextually types `handler(request, context)` from the schemas, application context, path, and tag enum in the same object. The stable request shape avoids repeated `req.valid` calls while `request.raw` preserves every Hono capability.

Registration adds middleware and the adapter in one visible order:

```ts
app.on(
    feature.method,
    feature.path,
    describeRoute(toOpenApi(feature)),
    ...requestValidators(feature.request, options.decodeJson),
    (raw) => feature.handler(
        adaptRequest(raw, feature.request),
        raw.env,
    ),
);
```

`requestValidators` installs TypeBox validators for declared targets. The body decoder parses once, and each validator returns the `Value.Parse` result through Hono's validation store or the service's standard 400 response on failure. `adaptRequest` reads those validated values, adds `raw.req.raw.headers`, and preserves the original context as `raw`. `toOpenApi` receives the same schema objects, so runtime validation and documentation cannot select different request schemas.

The registrar validates during application construction that:

- each method and complete path pair is unique;
- each `:pathParameter` has exactly one property in the parameter object and no extra property exists;
- a body schema is only registered for a method that accepts a body;
- every response has a valid HTTP status and description;
- operation identifiers are unique;
- every feature has at least one application enum tag.

Response schemas produce OpenAPI response content directly. They do not use a separate string `schemaName` lookup. Inline schemas are the default; named components are only needed where OpenAPI recursion or meaningful reuse requires them.

`toOpenApi` also combines the slice declaration with application-wide responses and security requirements. A private daemon feature does not repeat the same authentication response and bearer scheme in every file.

Request body and parameter types are both compile-time and runtime contracts. Response schemas are OpenAPI contracts; existing boundary tests continue to compare observable response bodies and the generated document. Do not claim that an arbitrary raw `Response` is statically proven to match a TypeBox response schema.

Hono's dynamic `app.on` overload requires one deliberate assertion inside the package-private adapter that constructs `FeatureRequest`. Feature files, handlers, and `routes.ts` contain no casts.

## Explicit route registration

Replace runtime filesystem discovery with one static `routes.ts` module per application:

```ts
import { health } from "./features/system/health";
import { readiness } from "./features/system/readiness";
import { createWorkflow } from "./features/workflows/create";
import { rewindWorkflow } from "./features/workflows/rewind";

export function registerRoutes(app: Hono<ControlApiEnv>): void {
    const register = createFeatureRegistrar(app, {
        decodeJson: parseControlApiJson,
    });

    register(health);
    register(readiness);
    register(createWorkflow);
    register(rewindWorkflow);
}
```

Application construction invokes that module directly:

```ts
export function createControlApiApp(): Hono<ControlApiEnv> {
    const app = new Hono<ControlApiEnv>();

    app.use("*", requestId());
    app.use("*", accessLog());
    registerRoutes(app);
    app.get("/openapi.json", serveOpenApi(app));
    app.notFound(notFound);
    app.onError(serverError);

    return app;
}
```

A new feature requires a feature file and one explicit `register` call in `routes.ts`. Registering each value separately keeps its schema-derived handler type intact and avoids a heterogeneous feature array. This is preferable to implicit folder-derived paths, runtime module-shape assertions, dynamic imports, duplicate component-name bookkeeping, and type erasure across a 320-line loader. The complete HTTP path remains visible in the feature that owns it.

Feature modules must be side-effect-free declarations. Importing `routes.ts` may construct schema values, but configuration validation still precedes application construction, database acquisition, and listener binding.

Static registration does not require application resources because the request context arrives on `fetch` or `request`. OpenAPI generation constructs the same application and never calls a handler.

## Testing boundaries

Use the narrowest real surface for each behavior.

### Feature and middleware tests

Construct the application and call `app.request` with application-specific contexts containing test configuration, a structural database facade, and an abort signal. These tests prove routing, validation, context adaptation, errors, and serialization without a listener or database connection.

### Configuration tests

Call `loadConfig` with explicit environment and file inputs. Prove precedence, exact decoding, unknown-key rejection, finalization, and sanitized failures without changing `process.env`.

### Database integration tests

Use the real disposable database and construct domain services directly. When the HTTP boundary matters, open the service and call `service.fetch(new Request(...), signal)` without `Bun.serve()`.

### Process smoke tests

Spawn the real executable only for behavior owned by `boot`: startup ordering, listener/TLS binding, authentication before draining, readiness over the actual network, signals, deadlines, abort, cleanup, and exit status.

Starting a listener in a route unit test is unnecessary permanent load. Conversely, an in-process request does not prove the executable starts correctly; retain both seams for their distinct contracts.

## Alternatives not selected

### Partial live configuration

Rejected. It requires field classification, candidate loading, immutable publication, SIGHUP serialization, and operator explanation while still requiring restart for resources. It preserves a second configuration lifetime for limited benefit.

### Full resource-generation reload

Rejected. Correctness requires request leases, concurrent resource generations, listener replacement and restoration, shutdown precedence, and failed-candidate cleanup. Restart recovery solves a broader operational problem.

### Dynamic feature discovery

Rejected. Automatic folder scanning saves one call in `routes.ts` per feature but erases static module relationships and requires runtime validation, implicit path derivation, and conflict bookkeeping. Explicit imports and registration calls are boring and inspectable.

### A database-aware generic server

Rejected. The startup call should orchestrate resource creation, but `@rostrum/server` should not accept database options or construct Postgres directly. The service factory owns its resource types and remains replaceable in tests.

### An opaque Hono replacement

Rejected. The selected two-argument adapter organizes the common route inputs but does not conceal Hono. `request.raw` is the original typed Hono context, and `context` is the application's binding object unchanged. A separate framework-owned request or response API would duplicate Hono and require a second escape hatch.

### Per-service lifecycle copies

Rejected. Daemon and Control API still share admission, drain, abort, listener, logging, and close mechanics. Keep one small restart-only lifecycle implementation.

## Prototype evidence

Throwaway strict-TypeScript prototypes exercised the proposed seams without changing tracked implementation files.

The revised feature prototype established:

- TypeBox schemas inferred `request.body` and `request.params`;
- invalid body and context property access was rejected through negative compile assertions;
- handlers received separate typed `request` and application `context` arguments;
- `request.headers` was the native `Headers` object;
- `request.raw` preserved the typed Hono request, variables, response, and response builders;
- `context` exposed immutable configuration, a structural `database.workflows` facade, and the request abort signal;
- `routes.ts`-style individual registration mounted body-bearing and body-free features without a heterogeneous feature array;
- a valid listener-free request returned 200 with the expected body;
- an invalid body returned 400 and the fake workflow operation was called only for the valid request;
- no Bun listener or database connection was started.

The tag enum prototype initially used native TypeScript `enum` syntax. The repository compiler rejected it with TS1294 because `erasableSyntaxOnly` is enabled. The `as const` `ControlApiTag` runtime enum and derived union compiled under the real root configuration and retained centralized tag values.

An earlier feature prototype also confirmed that `hono-openapi` generated `/owners/{owner}/records` from the same schemas and metadata used for registration.

The restart-only startup prototype compiled without explicit generic arguments and exercised a real Bun listener. Its observed order was logger initialization, service-factory invocation, listener binding, request handling, then resource close. The response was 200. A separate in-process application request covered the same route without startup.

These prototypes validate the API shape, not the complete implementation. The implementation must retain Rostrum's strict JSON parsing, safe error bodies, OpenAPI equality, authentication precedence, and bounded shutdown behavior.

## Suggested implementation sequence

### 1. Record the operator contract change

- Change the completed daemon-boundary decision and operator guide from live reload to startup-only configuration.
- Remove token and certificate SIGHUP rotation instructions.
- State that configuration validation can be run before supervisor restart.
- Keep the current M2 warning that daemon exit loses in-memory runs; link restart continuity to M3 rather than claiming it now.

### 2. Make configuration one-shot and service-owned

- Move daemon and Control API schemas, defaults, environment maps, and finalizers into their service packages.
- Replace `ServiceConfigSource<S>` with `defineConfig`, named schema-derived configuration types, and one-shot `loadConfig`.
- Preserve exact environment parsing, file validation, token and certificate validation, database policy, and safe errors.
- Delete conditional `ConfigFor<S>`, the service-name switch, and all reload-source state.

### 3. Introduce typed feature definitions

- Add the small `createFeatureBuilder`, TypeBox validation middleware, OpenAPI translation, and single-feature registrar.
- Define one handler context and one tag enum object per application.
- Adapt validated values into `request.body`, `request.params`, native `request.headers`, and the original Hono context at `request.raw`.
- Pass immutable `config`, the handler-facing `database` facade, and `abortSignal` as the second handler argument.
- Keep the strict source-preserving decoder for workflow create/save.
- Move repeated domain-error translation to the application error boundary where observable behavior remains identical.

### 4. Replace discovery with explicit route modules

- Give every feature its complete route path.
- Add one `routes.ts` per application that statically imports and registers each feature value.
- Register each feature separately rather than constructing a heterogeneous array.
- Generate OpenAPI from the registered definitions and their direct schema objects.
- Remove `loadFeatures`, `FeatureHandlerFactory`, `ServiceAccessor`, folder-derived paths, and obsolete module-shape tests.

### 5. Separate application and production resources

- Make each application constructible with no configuration or database.
- Define an application context containing immutable `config`, a handler-facing `database` facade, and `abortSignal`.
- Keep the raw database connection and its lifecycle methods on the production service rather than exposing them to handlers.
- Make each production service own immutable configuration, database connection, domain facade, and application.
- Pass the production context through `app.fetch`; pass a structural fake context through `app.request` in unit tests.
- Keep database integration tests and real-process smoke tests distinct.

### 6. Replace the lifecycle

- Implement `boot(root, definition, open)` with startup validation, logging, service open, Bun binding, request admission, and bounded SIGINT/SIGTERM shutdown.
- Remove SIGHUP reload, runtime configuration generics, dependency/listener identities, replacement and retirement logic, and reload tests.
- Cut over daemon and Control API together and delete the old lifecycle rather than retaining adapters.

### 7. Verify observable behavior

- Compile positive and negative fixtures for the two-argument handler, schema-derived body and parameters, application context, and tag enum.
- Exercise valid and invalid body/parameter requests through `app.request` with no listener or database connection.
- Prove `request.raw` retains Hono request, variable, response, and response-builder access.
- Prove `routes.ts` registers body-bearing and body-free features without dynamic discovery.
- Compare offline, in-process served, and checked-in OpenAPI documents.
- Prove configuration precedence and invalid startup failure before resource acquisition.
- Exercise both real executables for listener/TLS startup, readiness, authentication, graceful drain, deadline abort, exactly-once close, and exit status.
- Run `bun run check`, `bun run lint`, `bun test`, and both service smoke paths.

## Sources

- [Current shared configuration](https://github.com/RostrumAI/rostrum/blob/main/packages/server/src/config.ts)
- [Current shared lifecycle](https://github.com/RostrumAI/rostrum/blob/main/packages/server/src/lifecycle.ts)
- [Current feature loader](https://github.com/RostrumAI/rostrum/blob/main/packages/server/src/loader.ts)
- [Current Control API application](https://github.com/RostrumAI/rostrum/blob/main/apis/control-api/src/app.ts)
- [Current daemon application](https://github.com/RostrumAI/rostrum/blob/main/apis/daemon/src/app.ts)
- [M2 Epic 1 daemon boundary](../epics/m2/1-establish-daemon-network-boundary.md)
- [M2 Epic 1 implementation plan](../plans/m2-epic-1-daemon-network-boundary.md)
- [M3 Epic 1 durable restart recovery](../epics/m3/1-recover-durable-runs.md)
- [Hono validation](https://hono.dev/docs/guides/validation)
- [Hono testing with `app.request`](https://hono.dev/docs/guides/testing)
- [Hono `app.fetch`](https://hono.dev/docs/api/hono#fetch)
- [TypeBox](https://github.com/sinclairzx81/typebox)
- [`hono-openapi`](https://github.com/rhinobase/hono-openapi)
