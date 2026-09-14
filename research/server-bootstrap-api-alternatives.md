# Server bootstrap API alternatives

Status: Proposed architecture and implementation direction  
Applies to: `@rostrum/server`, `@rostrum/daemon`, and `@rostrum/control-api`  
Last researched: 2026-09-14

## Recommendation

Replace the current configuration and lifecycle surface with one inferred `boot` call, one service object that owns its resources, and one immutable configuration value per admitted request:

```ts
await boot(import.meta.dir, daemonConfig, Daemon.open);
```

Keep SIGHUP reload for settings that can change without replacing an owned resource: tokens, log level, the Control API's outbound daemon URL, and the shutdown deadline. Treat listener, TLS, database, environment/security-mode, and database connection-timeout settings as restart-required. Reject a reload candidate that changes any restart-required setting; do not partially apply its live settings.

This is the only alternative considered here that removes the resource-generation problem instead of exposing it to each service or hiding it behind a shorter call. It retains the operationally important token rotation path and makes the exception explicit: changing a bound listener or a database pool is not an object-property update.

Also simplify feature slices independently. Export a direct handler typed with the service's Hono bindings instead of a factory that receives a `ServiceAccessor`. Hono already passes the object supplied to `app.fetch(request, bindings)` as `context.env`.

The recommendation changes the current operator contract. Today the documentation says SIGHUP reloads configuration without distinguishing fields. Approval must therefore cover the restart-required field list and the resulting need to restart a daemon for direct-TLS certificate, listener, or database changes. M2 loses in-memory runs on daemon restart; production deployments that need certificate rotation without daemon restart should terminate TLS at the documented same-host reverse proxy.

If every current field must remain live-reloadable, use the generation-based alternative below. Do not use a shared mutable configuration object as a substitute.

## Scope

This proposal concerns process bootstrap, configuration ownership, request dependency access, reload, and shutdown. It does not change:

- the public Control API or private daemon HTTP routes;
- authentication rules, token syntax, readiness response schemas, or database security policy;
- the workflow format, publication storage, or execution semantics;
- Hono, TypeBox, LogTape, Bun, or the feature-directory convention;
- offline OpenAPI generation.

The goal is a smaller service-facing contract, not a generic RPC or plugin framework.

## Behavior that must remain explicit

Any replacement must preserve these existing guarantees unless this proposal names a deliberate change:

1. Validate a complete configuration before opening a database, loading routes, or binding a listener.
2. Keep the startup environment, selected YAML path, and working directory fixed while rereading file-backed values on SIGHUP.
3. Reject malformed candidates atomically and retain the last admitted configuration.
4. Authenticate daemon requests before the drain gate, route lookup, or body processing.
5. Give an admitted request one internally consistent configuration and resource set.
6. Rotate file-backed tokens through an overlap period without restarting either service.
7. Stop admission on SIGINT or SIGTERM, let accepted requests finish within one deadline, then abort and force close.
8. Close every service-owned resource exactly once.
9. Build and verify OpenAPI documents without opening production resources.

The proposed restart boundary changes only which valid candidates SIGHUP may admit.

## Current implementation

The current path crosses four abstractions before a feature reaches a dependency:

1. `ServiceConfigSource<S>` selects one of two hard-coded service schemas and returns a conditional `ConfigFor<S>` type.
2. `runService<C, D>` accepts configuration loading, dependency creation, authentication, and fetch callbacks.
3. Each service builds a `Dependencies` object that combines its Hono application with owned database resources.
4. Each feature exports a `FeatureHandlerFactory<ServiceAccessor>` and calls the accessor with its Hono context to recover the bindings already present as `context.env`.

The three central shared files are currently 948 lines before their tests: `config.ts` is 295 lines, `lifecycle.ts` is 333, and `loader.ts` is 320. Line count is not itself a defect, but their boundaries are mixed:

- the generic lifecycle requires database URL, TLS, environment, and timeout fields so it can compute a hard-coded database identity;
- the generic service-name type knows the only two applications;
- the generic configuration source owns daemon and Control API schemas, token loading, TLS material, network policy, defaults, and environment names;
- `createDependencies` rebuilds the static Hono application together with the database pool;
- feature factories add a second dependency-access convention over Hono bindings.

The entry points consequently state mechanism rather than intent:

```ts
const config = new ServiceConfigSource("daemon");
await runService<DaemonConfig, Dependencies>({
    name: "daemon",
    loadConfig: () => config.load(),
    createDependencies,
    authenticate,
    fetch: (request, admitted, dependencies, signal) =>
        dependencies.app.fetch(request, {
            database: dependencies.database,
            config: admitted,
            signal,
        }),
});
```

A compiler experiment confirmed that TypeScript can infer the two `runService` type arguments, so deleting `<DaemonConfig, Dependencies>` is a safe local simplification. It does not remove the callbacks, conditional config type, hard-coded identities, or split ownership.

## What pass-by-reference does and does not solve

JavaScript objects are reference values, but mutating a shared object during a request weakens rather than strengthens the contract. A request that reads the same object twice can observe two configurations:

```ts
const config = { marker: "before" };
const request = async () => {
    const first = config.marker;
    await work();
    return [first, config.marker];
};

const pending = request();
config.marker = "after";
// pending resolves to ["before", "after"]
```

Replacing one pointer with a new immutable value is safe when a request captures the pointer once:

```ts
let current = Object.freeze({ marker: "before" });
const admitted = current;
current = Object.freeze({ marker: "after" });
// every read through admitted still returns "before"
```

That technique works for values consulted at request time. It cannot reconfigure an object that copied configuration during construction:

```ts
const config = { databaseUrl: "db-a" };
const database = createDatabase({ url: config.databaseUrl });
config.databaseUrl = "db-b";
// config names db-b; database still connects to db-a
```

The same limitation applies to a Bun listener. Bun documents that `server.reload()` replaces handlers; passing `port` or `hostname` has no effect. TLS, host, and port changes require listener replacement. A database target, TLS policy, or connect timeout similarly requires a new pool.

There are therefore two sound choices:

- declare resource-owning settings restart-required and use one immutable live pointer; or
- create a new resource generation and retain the old generation until every request admitted through it finishes.

Mutating one shared object is not a third sound choice.

## Experiments

The experiments were throwaway TypeScript programs under the implementation repository's ignored `node_modules/.cache` directory. They did not change tracked implementation files.

| Experiment | Observed result | Consequence |
| --- | --- | --- |
| Shared object mutation during one delayed request | The request read `before` and then `after` | Do not expose a mutable config object to request code. |
| Immutable pointer replacement | The admitted request read `before` both times; the next admission read `after` | Pointer replacement is sufficient for request-time values. |
| Config mutation after resource construction | Config named `db-b`; the resource remained bound to `db-a` | Owned resources need restart or replacement. |
| Restart-only controller | A marker-only candidate applied; a database-target candidate was rejected; the prior live value remained intact | A restart boundary gives simple, atomic reload semantics. |
| Reference-counted generation | A new request used `db-b`; the old request completed on `db-a`; the old resource closed only after release | Full reload is possible, but requires explicit generation lifetime management. |
| Direct Hono handler | `app.fetch(request, services)` made the exact service object available as `context.env` | `FeatureHandlerFactory<ServiceAccessor>` is unnecessary. |
| TypeBox parse and inferred `boot` prototype | Strict TypeScript compilation passed without explicit config or dependency type arguments | A schema can be the source of the static config type. |

The existing focused lifecycle suites also passed: 7 tests, 0 failures. A separate experiment against the real current `runService` exposed a missing case in those tests. While a request admitted with configuration `before` and dependency 1 was delayed, a database-identity reload admitted configuration `after` and dependency 2. The delayed request then reported `closedDuringRequest: true` for dependency 1. The runtime retires the old dependency immediately after the swap rather than after requests using it finish.

That result does not make the proposed API correct by itself. It identifies a current correctness gap that implementation must cover before or during the cutover. If full resource reload remains, add a regression and generation leases. If restart-required resource settings are accepted, reject the candidate before resource replacement and remove that path.

## Alternative A: a thin facade over the current runtime

This option keeps `ServiceConfigSource`, `RuntimeConfig`, `ServiceDependencies`, hard-coded dependency identities, and the current reload engine. It adds a wrapper that chooses the config source and lets inference hide the generic arguments.

```ts
await bootService("daemon", {
    create: createDependencies,
    authenticate,
    fetch: (request, config, dependencies, signal) =>
        dependencies.app.fetch(request, {
            database: dependencies.database,
            config,
            signal,
        }),
});
```

### Facade advantages

- Smallest migration.
- Preserves every documented SIGHUP behavior.
- Can make each entry point shorter immediately.

### Facade costs

- Hides the current model without making it easier to maintain.
- Retains a generic package coupled to database fields and two service names.
- Retains separate config, dependency, application, and fetch wiring.
- Does not correct old-resource retirement unless the underlying runtime changes.
- Adds a second public layer whose only purpose is adapting the first.

### Facade assessment

Reject as the destination. Removing explicit type arguments is worthwhile housekeeping, but a facade alone is weightless code.

## Alternative B: immutable live config with restart-required resources

This option opens one service object for the process lifetime. `boot` owns one pointer to an immutable admitted config. Every request captures that pointer once. A valid SIGHUP candidate replaces it only when all restart-required values equal the live values.

### Entry point

```ts
import { boot } from "@rostrum/server";
import { daemonConfig } from "./config";
import { Daemon } from "./daemon";

await boot(import.meta.dir, daemonConfig, Daemon.open);
```

### Configuration definition

The service owns its schema, defaults, environment mapping, security checks, and restart boundary. `@rostrum/server` owns generic file layering and exact primitive parsing.

```ts
export const daemonConfig = defineConfig({
    file: { environment: "DAEMON_CONFIG", default: "config.yaml" },
    schema: DaemonConfigSchema,
    defaults: daemonDefaults,
    environment: daemonEnvironment,
    finalize: finalizeDaemonConfig,
    requiresRestart: [
        "host",
        "port",
        "nodeEnv",
        "databaseUrl",
        "databaseTls",
        "allowInsecureLocal",
        "dependencyTimeoutMs",
        "behindReverseProxy",
        "tls",
    ],
});

export type DaemonConfig = ConfigOf<typeof daemonConfig>;
```

`finalizeDaemonConfig` performs daemon-specific token and TLS loading and network-policy checks. `Value.Parse(schema, candidate)` validates the fully layered candidate and returns its inferred static type; the config loader does not need the current `as unknown as` assertions.

`defineConfig` compares the validated restart-required values structurally, not by object identity. Re-reading unchanged TLS objects therefore remains a no-op. Rejections report the field names from `requiresRestart`, never their values.

### Service object

The class owns values that do not change underneath it. The request context supplies the admitted config and abort signal.

```ts
export class Daemon implements RunningService<DaemonConfig> {
    private constructor(
        private readonly app: DaemonApp,
        private readonly database: DatabaseHandle,
    ) {}

    static async open(config: DaemonConfig): Promise<Daemon> {
        const database = createDatabase(databaseOptions(config));
        try {
            return new Daemon(await DaemonApp.create(), database);
        } catch (error) {
            await database.close({ timeoutMs: config.shutdownTimeoutMs });
            throw error;
        }
    }

    authenticate(request: Request, config: DaemonConfig): Response | undefined {
        return authenticateRequest(request, config);
    }

    fetch(request: Request, context: RequestContext<DaemonConfig>): Response | Promise<Response> {
        return this.app.fetch(request, {
            config: context.config,
            database: this.database,
            signal: context.signal,
        });
    }

    close(options: { timeoutMs: number }): Promise<void> {
        return this.database.close(options);
    }
}
```

### Reload behavior

| Setting | SIGHUP behavior | Reason |
| --- | --- | --- |
| `logLevel` | Apply | Logging can be reconfigured before publishing the candidate. |
| file-backed token contents and selected token-file path | Apply | Authentication reads the admitted request config; no owned resource is replaced. |
| `daemonUrl` on the Control API | Apply | Each readiness request constructs an outbound request from its admitted config. |
| `shutdownTimeoutMs` | Apply | Shutdown reads the current admitted value when drain starts. |
| `host`, `port`, direct TLS material, `behindReverseProxy` | Reject; restart required | Bun cannot retarget the bound listener through `server.reload()`. |
| `databaseUrl`, `databaseTls` | Reject; restart required | The existing pool remains bound to its construction options. |
| `dependencyTimeoutMs` | Reject; restart required | The value is also copied into the database connection timeout. |
| `nodeEnv`, `allowInsecureLocal` | Reject; restart required | These settings gate listener and database security policy. |

A rejected candidate changes nothing, including otherwise-live fields in the same file. Log a stable `restart_required` reason with the changed field names but no values.

### Restart-boundary advantages

- Smallest honest runtime model: one config pointer, one service, one listener, one close path.
- Entrypoints state intent and contain no generic type arguments.
- Service-specific config stays with the service instead of in a central conditional type.
- No resource generations, identity hashes, or reload-time pool overlap.
- Fixes the observed old-resource retirement path by removing resource replacement.

### Restart-boundary costs

- Narrows the current SIGHUP contract.
- Direct-TLS certificate, listener, and database changes restart the process.
- A daemon restart loses M2 in-memory run state until M3 recovery exists.

### Restart-boundary assessment

Recommend. The cost is visible and operational; the alternative complexity is permanent and currently incorrect for admitted requests.

## Alternative C: atomic service generations

This option preserves full valid-config reload. `bootGenerations` calls `Daemon.open(candidate)` for a replacement service, publishes a generation containing the candidate and service, and retires the previous generation only after its admitted requests finish.

```ts
await bootGenerations(import.meta.dir, daemonConfig, Daemon.open);
```

The core lifetime rule is explicit:

```ts
class Generation<C extends BootConfig> {
    private active = 0;
    private retired = false;
    private closing: Promise<void> | undefined;

    constructor(
        readonly config: C,
        private readonly service: RunningService<C>,
    ) {}

    async fetch(request: Request, signal: AbortSignal): Promise<Response> {
        this.active += 1;
        try {
            return await this.service.fetch(request, { config: this.config, signal });
        } finally {
            this.active -= 1;
            await this.closeWhenUnused();
        }
    }

    async retire(): Promise<void> {
        this.retired = true;
        await this.closeWhenUnused();
    }

    private closeWhenUnused(): Promise<void> {
        if (!this.retired || this.active !== 0) {
            return Promise.resolve();
        }

        this.closing ??= this.service.close({
            timeoutMs: this.config.shutdownTimeoutMs,
        });
        return this.closing;
    }
}
```

The rest of the production implementation also needs bounded retirement, failed-candidate cleanup, and listener activation control. A different-address listener can bind before the old one stops, so its handler must not admit requests until the candidate generation is published. A same-address or TLS replacement must stop admission, drain the old listener, bind the candidate, and restore the old listener if binding fails. Shutdown must win every race with reload.

### Generation advantages

- Preserves the current all-field SIGHUP contract.
- Gives each admitted request a consistent config and resource generation.
- Can hide generics and concurrency from service entry points.
- Correctly retains old pools while admitted requests still use them.

### Generation costs

- Keeps the hardest state machine: reload, listener replacement, request leasing, retirement, restoration, and shutdown precedence.
- Reopening the complete service on every SIGHUP rebuilds a pool and route application even for a token-only change. Avoiding that cost requires resource identity or a second live/rebuild classification, returning toward the current design.
- More simultaneous resources and more failure cleanup during reload.
- A short API makes this complexity less visible; it does not remove it.

### Generation assessment

Viable fallback when full reload is a hard requirement. Prefer a named `Generation` abstraction and test its transitions directly rather than coordinating loose `liveConfig`, `liveDependencies`, and identity variables.

## Alternative D: lifecycle code in each service

This option removes the generic lifecycle runtime. Each entry point performs its own sequence using shared leaf helpers for configuration parsing, logging, error bodies, and bounded close.

```ts
const source = daemonConfig.source(import.meta.dir);
const config = source.load();
await configureLogging(config.logLevel);

const daemon = await Daemon.open(config);
const server = Bun.serve({
    hostname: config.host,
    port: config.port,
    tls: config.tls,
    fetch: (request) => serveDaemonRequest(daemon, config, request),
    error: daemonErrorResponse,
});

process.on("SIGHUP", () => reloadDaemon(source, daemon, server));
process.on("SIGTERM", () => shutdownDaemon("SIGTERM", daemon, server));
process.on("SIGINT", () => shutdownDaemon("SIGINT", daemon, server));
```

### Per-service advantages

- Every lifecycle step is visible from the executable.
- No shared lifecycle generics or callbacks.
- Each service can choose different reload behavior without widening a common interface.

### Per-service costs

- The apparent simplicity moves into `reloadDaemon` and `shutdownDaemon`.
- Control API and daemon must separately maintain authentication precedence, reload serialization, shutdown deadlines, listener restoration, abort behavior, logging, and exactly-once close.
- Security and concurrency fixes can land in one service but not the other.
- Full reload duplicates the same hard state machine; restart-only reload duplicates a smaller one.

### Per-service assessment

Reject while the two processes intentionally share the same signal, drain, and boundary behavior. Keep one lifecycle implementation, but give it a small object contract.

## Comparison

| Criterion | A. Facade | B. Restart boundary | C. Generations | D. Per service |
| --- | --- | --- | --- | --- |
| One clear boot call | Yes | Yes | Yes | No |
| Removes explicit caller generics | Yes | Yes | Yes | Yes |
| Removes database knowledge from generic lifecycle | No | Yes | Yes | Yes |
| Preserves every current reloadable field | Yes | No | Yes | Depends on duplicated code |
| Request/config consistency | Only after fixing current runtime | Yes | Yes with leases | Depends on each service |
| Resource lifetime model | Current implicit identities | One process-lifetime owner | Multiple leased generations | Reimplemented per service |
| Internal concurrency complexity | High and partly hidden | Low | Highest | Repeated |
| Operational cost | None | Restart for infrastructure | Temporary duplicate resources | Service-specific |
| Recommended | No | **Yes** | Fallback | No |

## Proposed shared contracts

The public lifecycle surface needs one inferred application-config parameter and no resource-container parameter:

```ts
export interface BootConfig {
    readonly host: string;
    readonly port: number;
    readonly logLevel: LogLevel;
    readonly shutdownTimeoutMs: number;
    readonly tls?: { readonly cert: string; readonly key: string };
}

export interface RequestContext<C> {
    readonly config: C;
    readonly signal: AbortSignal;
}

export interface RunningService<C> {
    authenticate?(request: Request, config: C): Response | undefined;
    fetch(request: Request, context: RequestContext<C>): Response | Promise<Response>;
    close(options: { timeoutMs: number }): Promise<void>;
}

export async function boot<C extends BootConfig>(
    root: string,
    definition: ConfigDefinition<C>,
    open: (initial: C) => Promise<RunningService<C>>,
): Promise<void>;
```

`ConfigDefinition` supplies the listener projection, log level, shutdown deadline, source rules, final validation, and restart-required keys. Those mechanics remain private to the config module where possible. Consumers derive `ConfigOf<typeof definition>`; they do not declare a parallel interface.

`boot` performs this sequence:

1. Resolve and freeze the selected config path, environment, and root.
2. Load and validate the initial config.
3. Configure logging.
4. Open the service object.
5. Bind Bun with the listener projection.
6. For each request, capture the current immutable config, authenticate, apply the drain gate, create an abort controller, and call the service.
7. On SIGHUP, serialize loads, validate the complete candidate, reject restart-required changes, reconfigure logging, then replace the config pointer once.
8. On SIGINT or SIGTERM, stop admission, drain under the admitted deadline, abort overdue requests, and close the service once.

The implementation should not expose `RuntimeConfig`, `ServiceDependencies`, `RunServiceOptions`, `ServiceName`, dependency identity hashes, or listener identity hashes. The config definition owns field classification; the service object owns resources.

## Direct feature handlers

The feature loader can keep runtime module validation and deterministic discovery while dropping the factory/accessor layer:

```ts
export type FeatureHandler<S extends object> = Handler<{ Bindings: S }>;

export interface FeatureModule<S extends object> {
    readonly route: FeatureRoute;
    readonly schema?: FeatureSchemas;
    readonly handler: FeatureHandler<S>;
}
```

A feature then reads the binding Hono already provides:

```ts
export const handler: FeatureHandler<Services> = async (context) => {
    const result = await readiness(
        context.env.config,
        context.env,
        context.env.signal,
    );
    return context.json(result, result.status === "ready" ? 200 : 503);
};
```

`DaemonApp` and `ControlApiApp` remain service-owned. They pass `feature.handler` to Hono and continue to own their different middleware, authentication documentation, error wording, OpenAPI metadata, and route contracts. Do not replace them with a generic API-builder options object.

## Suggested implementation sequence

### 1. Protect the current boundary

- Add a lifecycle regression that holds a request across a database-identity reload and proves its resource remains open until the request finishes.
- Record approval or rejection of the restart-required field list before changing runtime behavior.
- If the list is approved, change the regression target to prove a resource-setting candidate is rejected atomically and leaves the admitted service open.

### 2. Make configuration schema-first and service-owned

- Move daemon and Control API schema/default/environment/finalization declarations into their service packages.
- Add a generic file source that returns the TypeBox schema's inferred type through `Value.Parse`.
- Preserve exact integer and boolean environment parsing, unknown-key rejection, safe errors, fixed source selection, token handling, certificate validation, and transport policy.
- Delete conditional `ConfigFor<S>` and the central service-name switch.

### 3. Introduce the service object and `boot`

- Implement the restart-only lifecycle behind the proposed three-argument call.
- Convert each `Dependencies` interface and its loose callbacks into one service class that owns its application and database.
- Cut over both entry points together so there is one lifecycle convention.
- Remove `runService`, its generic option/resource interfaces, database identity logic, and obsolete tests rather than retaining adapters.

### 4. Simplify feature handlers

- Change the loader contract from `createHandler` to `handler`.
- Change each feature to a direct service-local `FeatureHandler<Services>`.
- Remove both `ServiceAccessor` aliases and every identity accessor passed at route bind time.
- Keep runtime validation that a dynamically imported feature exports a callable handler.

This handler cutover is mechanically independent and can be a separate pull request. It should not be used to delay the lifecycle decision.

### 5. Verify behavior, then update operator documentation

Exercise real daemon and Control API processes, not only in-process applications:

- invalid startup config exits before resource acquisition;
- a valid token/log-level/daemon-URL reload applies without replacing the listener or database;
- a mixed candidate containing a restart-required change applies nothing and names only safe field names;
- token overlap and retirement work across both services;
- requests admitted before a live reload retain one immutable config value;
- SIGTERM drains a held request, closes the database once, and exits zero;
- an overdue request is aborted and produces the documented nonzero exit;
- offline, served, and checked-in OpenAPI documents remain equal;
- `bun run check`, `bun run lint`, `bun test`, and both real-service smoke paths pass.

After the runtime behavior passes, update the root operator guide and the completed daemon-boundary plan's durable decision text. State the live and restart-required fields explicitly; do not continue saying only that SIGHUP reloads “configuration.”

## Sources

- [Current shared config](https://github.com/RostrumAI/rostrum/blob/main/packages/server/src/config.ts)
- [Current shared lifecycle](https://github.com/RostrumAI/rostrum/blob/main/packages/server/src/lifecycle.ts)
- [Current feature loader](https://github.com/RostrumAI/rostrum/blob/main/packages/server/src/loader.ts)
- [Current daemon entry point](https://github.com/RostrumAI/rostrum/blob/main/apis/daemon/src/index.ts)
- [Current Control API entry point](https://github.com/RostrumAI/rostrum/blob/main/apis/control-api/src/index.ts)
- [M2 Epic 1 daemon boundary](../epics/m2/1-establish-daemon-network-boundary.md)
- [M2 Epic 1 implementation plan](../plans/m2-epic-1-daemon-network-boundary.md)
- [Bun `Server.reload`](https://bun.sh/reference/bun/Server/reload)
- [Bun server lifecycle](https://bun.sh/docs/runtime/http/server#server-lifecycle-methods)
- [Hono `app.fetch`](https://hono.dev/docs/api/hono#fetch)
- [TypeBox](https://github.com/sinclairzx81/typebox)
