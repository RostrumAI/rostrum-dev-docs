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

Feature slices export one feature value containing request schemas, route and OpenAPI information, and a handler. Keeping those fields in one value lets TypeScript derive the handler contract from the schemas without a second annotation or runtime module protocol. A small application-specific builder connects the value to Hono's existing context types. Handlers use:

- `context.req.valid("json")` for a runtime-validated, schema-derived body type;
- `context.req.valid("param")` for runtime-validated, schema-derived path parameters;
- `context.env` for typed application services;
- `context.var`, `context.req.raw`, and `context.res` when native Hono access is needed.

Do not introduce a second Rostrum request-context wrapper over Hono.

Build the Hono application independently of production resources. Unit and route tests call `app.request(...)` with controlled bindings and no TCP listener, logger initialization, configuration file, or database connection. Production resource construction and real-process smoke tests remain separate layers.

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

The application defines its Hono environment once:

```ts
export interface ControlApiEnv {
    Bindings: {
        readonly workflows: WorkflowOperations;
        readonly readiness: (signal: AbortSignal) => Promise<Readiness>;
        readonly signal: AbortSignal;
    };
    Variables: {
        readonly requestId: string;
        readonly rawBodyText?: string;
    };
}

export const defineControlFeature = createFeatureBuilder<ControlApiEnv>();
```

A feature then declares its complete boundary in one value. Individual TypeBox schemas remain named exports when another module needs them.

Bindings expose service interfaces such as `WorkflowOperations`, not concrete classes with private state. Production supplies `WorkflowService`; tests can supply a structural fake implementing only the contract the handlers consume.

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
        tags: ["workflows"],
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
    handler: async (context) => {
        const request = context.req.valid("json");
        const { workflowId } = context.req.valid("param");

        const result = await context.env.workflows.rewind(
            workflowId,
            request.targetRevisionId,
        );

        if (result.outcome === "target-not-found") {
            throw new WorkflowApiError(
                workflowRevisionNotFound(
                    `Revision ${request.targetRevisionId} of workflow ${workflowId} does not exist`,
                ),
            );
        }
        if (result.outcome === "not-found") {
            throw new WorkflowApiError(
                workflowNotFound(`Workflow ${workflowId} does not exist`),
            );
        }

        return context.json(revisionResponse(result.revision));
    },
});
```

Inside this handler, TypeScript derives `request` from `RewindRequestSchema`, `workflowId` from `RewindParameters`, services from `ControlApiEnv.Bindings`, and variables from `ControlApiEnv.Variables`. Invalid input receives the application's standard 400 response before the handler runs.

The handler remains a native Hono handler. An exceptional route can use the complete boundary without an adapter:

```ts
context.var.requestId;
context.req.raw;
context.req.header("if-match");
context.res;
context.json(body, status);
```

The Control API's JSON decoder reads the request bytes once, performs the existing strict parse, and stores the decoded source text in the typed `rawBodyText` Hono variable before TypeBox validates the feature schema. Workflow create and save can therefore preserve the byte-exact `document` member while `context.req.valid("json")` still returns `StaticParse<TSchema>`. Body validation consumes the request stream, so a handler must not assume `context.req.raw.body` remains unread. Ordinary handlers use the validated value rather than parsing the body again.

### Listener-free route test

Application construction does not need production dependencies. A test supplies structural fakes as Hono bindings:

```ts
const app = createControlApiApp();
const workflows = new FakeWorkflowService();

const response = await app.request(
    `/api/workflows/${workflowId}/rewind`,
    {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetRevisionId }),
    },
    {
        workflows,
        readiness: async () => ready,
        signal: new AbortController().signal,
    },
);

expect(response.status).toBe(200);
expect(await response.json()).toEqual(expectedRevision);
```

This exercises real route registration, body and parameter validation, middleware, the feature handler, and response serialization without `Bun.serve()`. Tests that need the real database can open the service and call its `fetch` method directly. Only process and transport smoke tests bind a listener.

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
| Feature definition | Method, complete path, request schemas, response schemas, OpenAPI prose, handler | Filesystem discovery, production resources |
| `ControlApiApp` / `DaemonApp` | Middleware, explicit feature registry, validation binding, errors, OpenAPI | Config loading, database construction, process signals |
| `ControlApi` / `Daemon` | Immutable config, database and domain services, application bindings, recovery when implemented | Signal installation, listener draining |
| `boot` | Startup order, logger, listener, request admission, abort controllers, bounded shutdown | Database-specific policy, routes, run recovery |
| Supervisor | Stop/start replacement and deployment policy | Application configuration parsing |

The framework-facing public surface consists of three cohesive leaf modules: `config` exports `defineConfig`, `ConfigDefinition`, and `loadConfig`; `feature` exports the feature builder, validators, and registry; `lifecycle` exports `boot` and `RunningService`. Protocol schemas, network checks, tokens, readiness, and logging may remain separate leaf utilities, but they do not create competing startup or route-registration conventions.

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
    fetch(request: Request, signal: AbortSignal): Response | Promise<Response>;
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

A service object holds the immutable configuration and production resources:

```ts
export class Daemon implements RunningService {
    private constructor(
        private readonly config: DaemonConfig,
        private readonly database: DatabaseHandle,
        private readonly app: DaemonApp,
        private readonly services: DaemonRequestServices,
    ) {}

    static async open(config: DaemonConfig): Promise<Daemon> {
        const options = databaseOptions(config);
        validateDatabaseOptions(options);

        const app = createDaemonApp();
        const database = createDatabase(options);
        try {
            const services = createDaemonRequestServices(config, database);
            return new Daemon(config, database, app, services);
        } catch (error) {
            await database.close({ timeoutMs: config.shutdownTimeoutMs });
            throw error;
        }
    }

    authenticate(request: Request): Response | undefined {
        return authenticateRequest(request, this.config.tokens);
    }

    fetch(request: Request, signal: AbortSignal): Response | Promise<Response> {
        return this.app.fetch(request, {
            ...this.services,
            signal,
        });
    }

    close(options: { timeoutMs: number }): Promise<void> {
        return this.database.close(options);
    }
}
```

Database option validation and handle construction happen before listening. Database reachability continues to flow through readiness unless a later durable-recovery plan requires the daemon to complete recovery before admission. Migrations remain an explicit operator command.

Request bindings expose only the handler-facing service interfaces. Database URLs, tokens, TLS keys, and other process configuration remain private to the service object unless a feature has a concrete need for a safe derived setting.

## Typed feature contract

The framework should be small enough to read without reconstructing an implicit plugin protocol. Its compile-time core is an identity builder over Hono's own types:

```ts
interface RequestSchemas {
    readonly body?: TSchema;
    readonly params?: TObject;
}

type BodyOutput<R extends RequestSchemas> =
    R extends { readonly body: infer B extends TSchema }
        ? { readonly json: StaticParse<B> }
        : {};

type ParameterOutput<R extends RequestSchemas> =
    R extends { readonly params: infer P extends TObject }
        ? { readonly param: StaticParse<P> }
        : {};

type FeatureInput<R extends RequestSchemas> = {
    readonly out: BodyOutput<R> & ParameterOutput<R>;
};

export interface FeatureDefinition<
    E extends Env,
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
        readonly tags: readonly string[];
    };
    readonly responses: Readonly<Record<number, {
        readonly description: string;
        readonly body?: TSchema;
    }>>;
    readonly handler: Handler<E, Path, FeatureInput<Request>>;
}

export function createFeatureBuilder<E extends Env>() {
    return function defineFeature<
        const Path extends string,
        const Request extends RequestSchemas,
    >(definition: FeatureDefinition<E, Path, Request>) {
        return definition;
    };
}
```

The builder owns no runtime state. Its purpose is to contextually type the handler from the schemas and application environment in the same object.

Route registration adds middleware in one visible order:

```ts
app.on(
    feature.method,
    feature.path,
    describeRoute(toOpenApi(feature)),
    ...requestValidators(feature.request, options.decodeJson),
    feature.handler,
);
```

`requestValidators` installs TypeBox validators for declared targets. The body decoder parses once, and each validator returns the `Value.Parse` result through Hono's validation store or the service's standard 400 response on failure. `toOpenApi` receives the same schema objects, so runtime validation and documentation cannot select different request schemas.

The framework validates at application construction that:

- each method and complete path pair is unique;
- each `:pathParameter` has exactly one property in the parameter object and no extra property exists;
- a body schema is only registered for a method that accepts a body;
- every response has a valid HTTP status and description;
- operation identifiers are unique.

Response schemas produce OpenAPI response content directly. They do not use a separate string `schemaName` lookup. Inline schemas are the default; named components are only needed where OpenAPI recursion or meaningful reuse requires them.

`toOpenApi` also combines the slice declaration with application-wide responses and security requirements. A private daemon feature does not repeat the same authentication response and bearer scheme in every file.

Request body and parameter types are both compile-time and runtime contracts. Response schemas are OpenAPI contracts; existing boundary tests continue to compare observable response bodies and the generated document. Do not claim that an arbitrary raw `Response` is statically proven to match a TypeBox response schema.

The heterogeneous registry requires one deliberate type-erasure point when passing already-checked definitions through Hono's dynamic `app.on` overload. Keep that assertion inside `registerFeatures`; feature modules and handlers contain no casts.

## Explicit feature registration

Replace runtime filesystem discovery with a static application registry:

```ts
import { health } from "./features/system/health";
import { readiness } from "./features/system/readiness";
import { createWorkflow } from "./features/workflows/create";
import { rewindWorkflow } from "./features/workflows/rewind";

const FEATURES = [
    health,
    readiness,
    createWorkflow,
    rewindWorkflow,
] as const;

export function createControlApiApp(): Hono<ControlApiEnv> {
    const app = new Hono<ControlApiEnv>();

    app.use("*", requestId());
    app.use("*", accessLog());
    registerFeatures(app, FEATURES, { decodeJson: parseControlApiJson });
    app.get("/openapi.json", serveOpenApi(app));
    app.notFound(notFound);
    app.onError(serverError);

    return app;
}
```

A new feature requires a feature file and one explicit registry import. This is preferable to implicit folder-derived paths, runtime module-shape assertions, dynamic imports, duplicate component-name bookkeeping, and type erasure across a 320-line loader. The complete HTTP path is visible in the feature that owns it.

Feature modules must be side-effect-free declarations. Importing the static registry may construct schema values, but configuration validation still precedes application construction, database acquisition, and listener binding.

Static registration does not require application resources because Hono bindings arrive on `fetch` or `request`. OpenAPI generation constructs the same application and never calls a handler.

## Testing boundaries

Use the narrowest real surface for each behavior.

### Feature and middleware tests

Construct the application and call `app.request` with fakes. These tests prove routing, validation, typed bindings, errors, and serialization without a listener or database.

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

Rejected. Automatic folder scanning saves one registry line per feature but erases static module relationships and requires runtime validation, implicit path derivation, and conflict bookkeeping. Explicit imports are boring and inspectable.

### A database-aware generic server

Rejected. The startup call should orchestrate resource creation, but `@rostrum/server` should not accept database options or construct Postgres directly. The service factory owns its resource types and remains replaceable in tests.

### A custom Rostrum request context

Rejected. Hono already provides typed bindings, typed variables, validated request targets, the raw request, and response builders. A wrapper would create a second access convention and need an escape hatch back to the original context.

### Per-service lifecycle copies

Rejected. Daemon and Control API still share admission, drain, abort, listener, logging, and close mechanics. Keep one small restart-only lifecycle implementation.

## Prototype evidence

Throwaway strict-TypeScript prototypes exercised the proposed seams without changing tracked implementation files.

The feature prototype established:

- request body and path parameter types were inferred from TypeBox schemas;
- invalid property access was rejected by TypeScript through negative compile assertions;
- Hono bindings and variables were typed;
- `context.req.raw`, `context.var`, and `context.res` remained available;
- a valid in-process request returned 201 and called the fake service once;
- an invalid body returned 400 and did not call the service;
- a heterogeneous static registry mounted body-bearing and body-free features through one internal type-erasure point;
- `hono-openapi` generated `/owners/{owner}/records` from the same feature definition;
- no Bun listener was started.

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

- Add the small `createFeatureBuilder`, TypeBox validation middleware, OpenAPI translation, and registry checks.
- Create one environment type per application so feature handlers receive typed bindings and variables.
- Convert body and path validation to `context.req.valid` and keep the strict source-preserving decoder for workflow create/save.
- Move repeated domain-error translation to the application error boundary where observable behavior remains identical.

### 4. Replace discovery with explicit registries

- Give every feature its complete route path.
- Register imported feature values in `ControlApiApp` and `DaemonApp`.
- Generate OpenAPI from the registered definitions and their direct schema objects.
- Remove `loadFeatures`, `FeatureHandlerFactory`, `ServiceAccessor`, folder-derived paths, and obsolete module-shape tests.

### 5. Separate application and production resources

- Make each application constructible with no configuration or database.
- Define handler-facing service interfaces and make production classes implement them; do not type bindings as concrete classes with private state.
- Make each production service own immutable configuration, database handle, domain services, and application.
- Pass production bindings through `app.fetch`; pass fake bindings through `app.request` in unit tests.
- Keep database integration tests and real-process smoke tests distinct.

### 6. Replace the lifecycle

- Implement `boot(root, definition, open)` with startup validation, logging, service open, Bun binding, request admission, and bounded SIGINT/SIGTERM shutdown.
- Remove SIGHUP reload, runtime configuration generics, dependency/listener identities, replacement and retirement logic, and reload tests.
- Cut over daemon and Control API together and delete the old lifecycle rather than retaining adapters.

### 7. Verify observable behavior

- Compile positive and negative handler-type fixtures.
- Exercise valid and invalid body/parameter requests through `app.request` with no listener.
- Prove raw Hono access and application variables remain available.
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
