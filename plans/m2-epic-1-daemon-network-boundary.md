# Implement the daemon network boundary

Epic: [M2 Epic 1: Establish the daemon network boundary](../epics/m2/1-establish-daemon-network-boundary.md)

Status: Proposed implementation plan; implementation has not started.
Owner: Implementing agent, with human approval of the security and lifecycle contracts before their implementation.
Last researched: 2026-09-11.

## Purpose

Deliver independently started and stopped Control API and daemon processes, with an authenticated, encrypted HTTP connection between them and independent connections to the same Postgres database. An operator must be able to distinguish process liveness, dependency readiness, configuration failure, and shutdown.

The first complete network path is the Control API's readiness request to the daemon. It proves the real transport without inventing a workflow command before [Epic 2](../epics/m2/2-execute-sequential-workflows.md) supplies execution. Backend services move to `apis/` without aliases under `apps/`.

Governing context: [product strategy](../strategy/product-strategy.md#48-control-api-and-service-boundary), [roadmap](../strategy/product-roadmap.md#3-delivery-milestones), [M2 overview](../epics/m2/overview.md), [workflow specification](../specifications/workflow-interface-v1.md), [delivery methodology](../epic-delivery-methodology.md), and [plan format](../epic-implementation-plan-format.md). No other active plan or durable decision record was present during research.

## Current repository state

Paths in this section describe the implementation repository before relocation.

| Area | Observed implementation | Consequence |
| --- | --- | --- |
| Service | `apps/control-api/src/index.ts` starts Bun/Hono; no daemon exists | Add a separate executable workspace, not an in-process executor |
| Configuration | `env.ts` layers environment over optional YAML over defaults; defaults include loopback HTTP and a localhost database | Retain the layering and existing variable names; explicitly validate transport combinations |
| Configuration ownership | `index.ts` and `ControlApiApp.create()` each call `loadConfig()` | Resolve configuration once and inject it |
| Configuration validation | `loadConfig()` reconstructs only known keys before TypeBox validation; `readConfigLayer()` treats every missing file as optional | Reject unknown YAML keys and missing explicitly selected files rather than silently ignoring security settings |
| HTTP contracts | `loader.ts` discovers `route`/`schema`/`createHandler` feature modules; `app.ts` binds them under `/api` and generates OpenAPI 3.1 | Reuse these conventions and TypeBox validation rather than adding another routing or schema framework |
| Health | `features/system/health.ts` returns `200 {"status":"ok"}` without touching dependencies | Preserve liveness; add readiness separately |
| Errors and logs | JSON errors use `code`, `message`, `findings`; LogTape emits JSON lines; the Bun-level error handler returns plain text | Preserve the public error envelope and remove the inconsistent transport-level fallback |
| Database | `packages/database/src/client.ts` creates Kysely over `postgres(databaseUrl)`; each call owns a pool | Keep driver configuration and probes in the shared database package |
| Ownership | `WorkflowService` owns a `WorkflowDatabase` wrapper and closes its pool | Move pool ownership to service composition so readiness and workflows use the same service-owned connection |
| Publications | `WorkflowRepository.getPublication()` performs canonical-content and digest verification | Epic 2 must reuse this read path; do not add another publication store or integrity algorithm |
| Shutdown | `index.ts` calls `server.stop(true)` without awaiting it, then closes the pool | Active connections are terminated, not gracefully drained; replace this with a bounded, awaited sequence |
| Tooling | Workspace globs include `apps/*` and `packages/*`; CI uses a frozen lockfile and package-name filters | Add `apis/*`, regenerate the lockfile, retain `apps/*` for client applications |
| Deployment | `docker-compose.yml` provisions Postgres only; no service Dockerfiles or orchestration manifests exist | Update actual references and operator startup instructions; do not invent a production deployment stack |
| Existing smoke | Control API smoke serves health/OpenAPI without a database connection; OpenAPI generation constructs the app | Keep contract generation and liveness verification independent of live dependencies and production secrets |

Relevant source entry points: [Control API composition](https://github.com/RostrumAI/rostrum/blob/main/apps/control-api/src/app.ts), [configuration](https://github.com/RostrumAI/rostrum/blob/main/apps/control-api/src/env.ts), [database factory](https://github.com/RostrumAI/rostrum/blob/main/packages/database/src/client.ts), and [disposable Postgres helper](https://github.com/RostrumAI/rostrum/blob/main/packages/database/src/testing/postgres.ts). These links describe the pre-move tree; update durable references during implementation.

## Scope

Include:

- The `apps/control-api` to `apis/control-api` cutover and a new `apis/daemon` executable workspace.
- Private daemon health/readiness endpoints, service authentication, TLS, validated configuration, and a real Control API daemon client.
- Independent database ownership, secure remote connection options, bounded dependency probes, and clear operation ownership.
- Independent startup, request draining, bounded shutdown, diagnostics, and focused behavior verification.
- Essential setup documentation and generated API contracts that match the delivered behavior.

Exclude workflow execution, run creation/retrieval handlers, run storage, subscriptions, scheduling, invocation retries/idempotency, multi-daemon routing, and caller identity/governance. Do not add placeholder run routes, a fake execution command, or an empty run registry. [Epic 6](../epics/m2/6-complete-m2-conformance.md) owns the reusable separate-network environment and combined M2 demonstration; this plan does not build them.

## Decisions

The Epic already establishes separate services, private authenticated HTTP, shared database access, one daemon per deployment, and the directory cutover. The following mechanism choices are proposed here, not previously approved decisions.

1. **Direct TLS plus a service bearer token.** Both service listeners support Bun TLS. The daemon requires the token on every route, including health, readiness, unknown paths, and its OpenAPI document. The Control API's caller-facing routes do not acquire daemon-token authentication. Tokens never reach callers or public OpenAPI examples.
2. **Explicit local-only plaintext exception.** Plaintext requires `ALLOW_INSECURE_LOCAL=true`, a development/test environment, and literal loopback endpoints. DNS names, private LAN addresses, wildcard listeners, and production are not exceptions. TLS and authentication remain mandatory for remote daemon access. Apply the same no-remote-plaintext rule to database connections and service listeners.
3. **No implicit daemon destination or secret.** The executable Control API requires `DAEMON_URL` and `DAEMON_TOKEN_FILE`; the daemon requires its own local copy of the token file. Generate at least 32 random bytes, encoded as 64 hexadecimal characters. Permit one trailing newline from secret provisioning; reject missing, empty, malformed, or insecurely short tokens.
4. **Readiness aggregates; it does not stop unrelated work.** Control API readiness depends on its database and the authenticated daemon readiness response. Daemon readiness depends on its own database. A daemon outage does not stop Control API authoring operations that can still use their database.
5. **Fail configuration, not startup ordering.** Invalid settings, unreadable TLS/token files, and listener failures terminate startup with nonzero status. Dependency outages leave a live, unready process. Neither executable starts, stops, migrates, or waits indefinitely for the other service.
6. **One owner per pool.** Each executable creates one database handle and closes only that handle. Workflow handlers borrow it. Schema migration stays an explicit operator command. No service imports the other executable, shares mutable objects, watches application files, or polls database records for commands.
7. **Bounded shutdown, no recovery promise.** Stop admission, finish outstanding requests and accepted work within one deadline, then force termination if necessary. M2 in-memory state disappears when the daemon exits, even after a graceful drain. This does not introduce a public cancellation state or M3 recovery.
8. **Small shared boundary package.** Add `packages/service-boundary` for the protocol schemas and mechanics both services actually use: configuration-layer parsing, loopback classification, TLS listener options, logging, feature loading, and lifecycle handling. Move existing reusable code into it; do not copy a second loader or introduce a generic RPC/plugin framework. Keep database driver code in `packages/database`, daemon authentication in the daemon, and outbound daemon calls in the Control API.

Required approval before dependent implementation: a security-capable reviewer and human owner approve decisions 1–3, including certificate/token provisioning and the trust boundary; a backend/concurrency reviewer and human owner approve decisions 4–7 and the Epic 2 handoff. Changing these choices requires an entry in the decision log, not a compatibility path or an undocumented fallback.

## Progress

- [x] Read governing documents and map the existing service, database, workspace, and test seams.
- [x] Research Bun transport APIs and exercise TLS verification and graceful HTTP draining on Bun 1.4.0.
- [x] Write this proposed plan; no runtime implementation or Epic acceptance is claimed.
- [ ] Approve the security, readiness, and shutdown contracts.
- [ ] Complete checkpoint 1: runnable backend directory cutover.
- [ ] Complete checkpoint 2: independently runnable secure daemon and database boundary.
- [ ] Complete checkpoint 3: Control API integration and bounded lifecycle.
- [ ] Complete checkpoint 4: focused acceptance evidence and operator handoff.

Record implementation pull requests and checkpoint evidence here as work proceeds.

## Checkpoints

### Checkpoint 1: Backend workspaces run from apis

Owner: Implementing agent. Reviewer: repository/tooling maintainer.

Move `apps/control-api` to `apis/control-api`. Keep its package name and public route contract. Add `apis/*` to root workspaces while retaining `apps/*`. Update `bun.lock`, the generated OpenAPI exclusion in `biome.json`, source/script path references, root setup/layout documentation, and the workspace READMEs. `apps/` describes user-facing applications only. Inspect existing CI/deployment references; package-name CI filters and the two-level `tsconfig.json` relative path do not need gratuitous changes.

Before implementation edits, run `git branch --show-current` in the implementation repository and create a feature branch if it is `main`. Use language-server file renames/references where available, then move the remaining assets. Do not leave re-exports, symlinks, or compatibility workspaces under `apps/`.

Acceptance commands: `bun install`, `bun install --frozen-lockfile`, `bun run --filter @rostrum/control-api typecheck`, and `bun run --filter @rostrum/control-api smoke`. Search tracked implementation/setup/configuration files for remaining `apps/control-api` references; expect none. Existing health and generated OpenAPI behavior must remain unchanged.

Escalate if a consumer depends on the old physical path outside the inspected tree. Recovery/handoff: this checkpoint changes placement, not transport or schema; record the move commit and successful smoke command. Revert the coherent move commit if necessary, not selected lockfile/path edits.

### Checkpoint 2: A secure daemon starts independently

Owner: Implementing agent. Reviewers: security specialist and database maintainer.

Extract the shared mechanics without changing existing public error or route behavior. Create `apis/daemon` with `dev`, `start`, `typecheck`, `generate-openapi`, `smoke`, and focused test commands. Its smoke checks authenticated liveness and served/generated OpenAPI parity with temporary local credentials; it does not require Postgres readiness. Implement configuration validation, TLS, token authentication, daemon health/readiness, a private generated OpenAPI document, and independent database ownership. Extend the shared database connection factory and migrate all its callers in the same checkpoint.

Acceptance: a real daemon process returns authenticated health/readiness; missing/wrong credentials return 401; unavailable Postgres produces liveness 200 and readiness 503; invalid configuration exits nonzero before listening. Trusted TLS works, while an untrusted CA or wrong hostname fails. Plaintext remote configurations are rejected. Existing Control API commands remain runnable until its integration checkpoint.

Commands introduced by this checkpoint: `bun run --filter @rostrum/daemon generate-openapi`, `bun run --filter @rostrum/daemon smoke`, `bun test apis/daemon/src/boundary.test.ts`, and `bun test packages/database/src/client.test.ts`. The daemon smoke must spawn the actual `src/index.ts` executable with temporary configuration, observe its listening log/port, call its authenticated endpoints, send SIGTERM, and assert bounded exit; constructing `DaemonApp` and serving it in the smoke process is insufficient. The boundary tests must also spawn this entry point for invalid-config, database-unavailable, and TLS startup cases. Run the existing database repository/migration tests after changing the factory. These files and commands are planned, not present today.

Escalate if the pinned driver cannot enforce certificate and hostname verification or bounded probe cancellation; do not accept encryption without peer verification. Recovery/handoff: record approved config/protocol schemas, actual TLS evidence, and all migrated factory callers. No database schema change is intended, so reverting service code must not require data rollback.

### Checkpoint 3: The Control API observes the daemon and both drain independently

Owner: Implementing agent. Reviewers: backend/concurrency reviewer and security specialist.

Pass resolved configuration and service-owned dependencies into `ControlApiApp`; add its daemon client and readiness feature. Separate route construction from resource acquisition so OpenAPI generation is offline. Integrate the shared shutdown sequence into both executable entry points. Preserve authoring operations during daemon outages and existing public liveness behavior.

Acceptance: Control API readiness reflects both independently checked dependencies. Wrong service credentials, TLS failure, timeout, invalid upstream JSON, daemon unready state, and daemon refusal are distinguishable without exposing secrets. Stop either process while requests are outstanding; requests within the deadline finish, overdue work is terminated, and the peer's process and database pool remain usable.

Commands: regenerate both OpenAPI artifacts; run `bun test apis/control-api/src/daemon/client.test.ts packages/service-boundary/src/lifecycle.test.ts`, then the existing Control API smoke and focused daemon tests. Exercise the actual executables and signal handlers as described below; in-process application tests alone do not prove independent lifecycle.

Escalate if shutdown would imply a new run state, cancel another process's work, or require durable state. Recovery/handoff: record the protocol/config version delivered, graceful and forced exit evidence, and known M2 state-loss behavior. Roll back coordinated code/config changes together; never enable insecure remote transport to restore connectivity.

### Checkpoint 4: Epic acceptance is demonstrated and documented

Owner: Implementing agent. Reviewers: independent implementation reviewer, then human owner.

Run the focused acceptance matrix against real services and disposable Postgres. Check existing workflow authoring/publication behavior after the move and pool-ownership change. Capture exact commands, configuration names, statuses, exit codes, and sanitized evidence in this plan. Do not claim separate-host proof from two loopback ports.

After the behavior passes, update essential operator setup, local and remote TLS examples, migration ownership, secret rotation/restart instructions, readiness interpretation, and shutdown/state-loss documentation. Keep development design in `dev-docs`; keep executable schemas, generated API contracts, tests, and essential startup instructions with implementation. Remove temporary smoke scripts, credentials, and certificates. Commit/push development documentation inside its independent checkout.

Final commands: `bun install --frozen-lockfile`, `bun run check`, `bun run lint`, `bun test`, and both services' smoke/contract checks. Run the documentation repository's Markdown and relative-link checks. Run independent review against the Epic and this plan before human review.

Escalate any unproved acceptance criterion rather than marking the Epic complete. Recovery/handoff: include pull requests, remaining operational prerequisites, and the Epic 2 seam. On completion, retain durable contracts in code/API docs, setup documentation, and a decision record only where useful across Epics; then retire this plan under the documentation lifecycle.

## Implementation approach

### Files and dependency direction

- `apis/control-api`: retain workflow feature modules and their public schemas. Change `env.ts`, `index.ts`, `app.ts`, `services.ts`, `workflows/service.ts`, and `workflows/database.ts` for resolved configuration and borrowed database ownership. Add `src/daemon/client.ts` and `src/features/system/readiness.ts`.
- `apis/daemon`: add its own `env.ts`, `index.ts`, `app.ts`, dependency container, authentication middleware, and `src/features/system/{health,readiness}.ts`. It owns no workflow executor or run map in this Epic.
- `packages/service-boundary`: move/generalize the existing feature loader's service type, configuration-layer reader, JSON logger, and common HTTP mechanics only as needed by the two consumers. Leave workflow-specific loader behavior with the Control API: the daemon declares no path parameters, so `parameterGuard` and its `invalid_workflow_input` response stay there. Export TypeBox daemon health/readiness/error schemas and their inferred types. Do not import either service or acquire resources at module load. Keep publication findings/schema ownership unchanged; boundary errors have an empty `findings` array compatible with the public envelope.
- `packages/database`: own connection options, driver handles, readiness queries, timeout/cancellation, and pool closure. Update `src/client.ts`, exports, migration CLI, disposable-database helper, and current consumers together. Resolve exported-symbol references before changing signatures. Do not add migrations or run tables.
- Root/workspace tooling: update workspace and generated-file paths; add the daemon to appropriate checks without broadening the Postgres-only development Compose file into the Epic 6 environment.

No compatibility exports remain at moved implementation paths. Share source code and schema definitions, not process instances. A local certificate or token file is operator-provisioned configuration, not a coordination channel; each remote machine has its own copy.

### Configuration contract

Keep environment-over-YAML-over-default precedence and camelCase YAML keys. `CONTROL_API_CONFIG` and new `DAEMON_CONFIG` select each process's file. An absent default `config.yaml` is allowed; an explicitly selected missing file is an error. Validate the file's keys before merging. Boolean environment values accept only `true` or `false`; integer values reject fractions, overflow, and coercion surprises. Report the field and reason, never the supplied secret or full database URL. Resolve relative file paths against the process working directory and recommend absolute paths for service managers.

| Environment / YAML key | Consumer | Rule |
| --- | --- | --- |
| `HOST` / `host` | Both | Default `127.0.0.1`; an explicit remote bind is allowed only with TLS |
| `PORT` / `port` | Both | Control API default 3000; daemon default 3001; 0 allowed for ephemeral test listeners |
| `NODE_ENV` / `nodeEnv` | Both and migration CLI | Retain development/test/production values and current development default; the CLI reads `NODE_ENV` |
| `LOG_LEVEL` / `logLevel` | Both | Retain LogTape levels and environment-dependent default |
| `DATABASE_URL` / `databaseUrl` | Both | Required in executable service configuration; same database target, potentially different credentials |
| `DATABASE_TLS_MODE` / `databaseTlsMode` | Both and migration CLI | `verify-full` by default; `disable` allowed only with the local exception and a literal loopback target |
| `DATABASE_CA_FILE` / `databaseCaFile` | Both and migration CLI | Optional PEM trust bundle; otherwise use system trust, never disable verification |
| `TLS_CERT_FILE` / `tlsCertFile` | Both listeners | PEM certificate chain; required together with key unless a local plaintext listener is explicitly allowed |
| `TLS_KEY_FILE` / `tlsKeyFile` | Both listeners | Matching private key; validate readability and TLS setup before listening |
| `ALLOW_INSECURE_LOCAL` / `allowInsecureLocal` | Both and migration CLI | Default false; valid only in development/test; never bypasses daemon authentication |
| `DAEMON_URL` / `daemonUrl` | Control API | Required origin URL; HTTPS normally; reject userinfo, non-root paths, query, fragment, and unsupported schemes |
| `DAEMON_CA_FILE` / `daemonCaFile` | Control API | Optional PEM trust bundle for the daemon certificate |
| `DAEMON_TOKEN_FILE` / `daemonTokenFile` | Both | Required readable local secret file; no default token or unauthenticated mode |
| `DEPENDENCY_TIMEOUT_MS` / `dependencyTimeoutMs` | Both | Default 2000; positive integer, maximum 30000; bounds readiness, including queue/connect/query/body consumption |
| `SHUTDOWN_TIMEOUT_MS` / `shutdownTimeoutMs` | Both | Default 30000; positive integer, maximum 300000; one total drain-and-close deadline |

Per-process `HOST`/`PORT` variables remain sufficient for independent configuration; do not introduce duplicate prefixed aliases. Update local instructions to supply an explicit database URL, local-exception flag, and token rather than retaining implicit credentials. Development TLS uses a locally trusted certificate, not `rejectUnauthorized: false`.

The migration CLI consumes the database, local-exception, and environment settings from environment variables; it does not gain a second service-config file selector. Preserve explicit migration targeting and document the required TLS settings alongside `db:migrate`.

A remote deployment supplies a private daemon address, certificate whose subject alternative name matches `DAEMON_URL`, trusted CA material where required, independently provisioned token copies, and database connection settings on both services. Operators restrict the daemon port to Control API/management hosts with network controls; a configurable listener is not itself a firewall. Token or certificate replacement takes effect on process restart; zero-downtime rotation is not promised by this Epic.

Provision token and private-key files for the service account only (mode `0600`, or equivalent restricted platform permissions), outside the checkout. Do not mount a common writable configuration directory between services or expose a local-exception listener through a remote plaintext forwarder. Operational examples must not put token contents in command-line arguments, shell tracing, or logged configuration.

### Authentication and transport rules

Use `Authorization: Bearer <token>`. Validate the exact token format once at startup; compare the received token using constant-time comparison over equal-length buffers. Reject missing, malformed, duplicated/combined, or wrong credentials with 401 and `WWW-Authenticate: Bearer`. Authenticate before the draining gate, route matching, method dispatch, dependency probes, or request-body parsing. Unauthorized daemon requests remain 401 during drain whenever an HTTP response can still be served. An authenticated unknown route returns 404; an authenticated unsupported method returns 405 with `Allow`.

The Control API client uses a fixed configured origin and fixed operation paths, `redirect: "error"`, explicit certificate verification, a bounded response reader, and an abort deadline. Disable ambient HTTP proxy routing for these direct private requests; never allow a loopback exception to send a bearer token through an environment-configured proxy. Do not propagate caller authorization headers, follow redirects, log tokens, or retry automatically. No process-global TLS-verification disable switch is acceptable.

For plaintext, classify literal IPv4 loopback addresses in `127.0.0.0/8` and IPv6 `::1` using an IP parser, not a string prefix or DNS lookup. Use the same rule for bind addresses and outbound URLs/database targets. Reject wildcard, IPv4-mapped ambiguity, LAN, and DNS-name exceptions. A forged `Host` or forwarding header cannot change the transport decision. Token auth still applies on local HTTP. A remote TLS listener may bind wildcard addresses only when explicitly configured; document network isolation separately.

### HTTP contract and Epic 2 seam

All bodies below are JSON with `Cache-Control: no-store`. Health does not query dependencies. HEAD follows existing Hono GET behavior with no response body. Daemon OpenAPI is private and declares HTTP bearer security; the caller-facing OpenAPI never exposes private daemon routes or credentials.

| Endpoint | Authentication | Success | Failure |
| --- | --- | --- | --- |
| Control API `GET /api/system/health` | Existing public behavior | 200 `{"status":"ok"}` | Process not reachable if it cannot serve |
| Daemon `GET /api/system/health` | Daemon bearer | 200 `{"status":"ok"}` | 401 for unauthorized requests |
| Daemon `GET /api/system/readiness` | Daemon bearer | 200 readiness body | 401 unauthorized; 503 readiness body |
| Control API `GET /api/system/readiness` | Existing public behavior | 200 readiness body | 503 readiness body |

Readiness body:

```json
{
  "status": "ready",
  "checks": {
    "database": { "status": "ok" },
    "daemon": { "status": "ok" }
  }
}
```

The daemon body has only `database`. On failure use `status: "not_ready"`; failed checks carry `status: "failed"` and a stable `code`. Database codes: `database_unavailable`, `database_timeout`, `database_schema_unavailable`. Control API daemon-check codes: `daemon_unavailable`, `daemon_timeout`, `daemon_unauthorized`, `daemon_tls_error`, `daemon_invalid_response`, `daemon_not_ready`. Do not forward raw upstream error bodies.

A draining service answers 503 with `{ "code": "service_draining", "message": "Service is shutting down", "findings": [] }` if a request reaches it before listener closure and passes any required authentication. The Control API maps a validated daemon `service_draining` response to `daemon_not_ready`. Ordinary boundary errors retain `{code,message,findings:[]}`; unexpected failures return 500 `internal_error` and a sanitized diagnostic.

A readiness check has one overall deadline. Control API database and daemon probes run concurrently. Reject unexpected statuses, non-JSON/oversized bodies (64 KiB limit for these probe responses), invalid schema, and inconsistent status/body combinations. Cancel timed-out work; merely racing a promise while its socket/query keeps running is insufficient.

This freezes the Epic 1 transport seam: origin, `/api` routing, authentication, error envelope, dependency behavior, and lifecycle ownership. Epic 2 adds invocation and live snapshot operations through the same daemon/client boundary. It must freeze its run request/response schemas before engine integration, using exact publication selection (`workflowId`, `publicationNumber`) and daemon-owned run identity/state. Do not publish speculative run schemas here or implement success-shaped placeholders. The M2 overview's parallel-engine workstream can begin only once those additional Epic 2 schemas are agreed; Epic 1 alone does not claim to have frozen them.

### Database ownership and readiness

The Control API owns draft/revision/publication writes and caller-facing workflow reads. The daemon has its own shared-package connection; Epic 2 uses it to read and verify exact publications. This Epic proves daemon schema access without introducing an execution query or write. Separate database credentials are supported; least-privilege grants are an operator responsibility, not a new identity system.

Replace the URL-only database factory with an explicit connection-options contract and a service-owned handle containing the typed Kysely database, a bounded readiness probe, and idempotent `close({ timeoutMs })`. Retain the underlying postgres.js pool inside the handle, not in feature handlers. Set `application_name` to `control-api` or `daemon` for connection diagnostics; retain the current maximum of ten pooled connections per service and document the combined connection budget. Migrate repository tests, the migration runner, disposable-database helper, and Control API wrapper together; remove any wrapper made redundant by the new ownership model.

A probe verifies connectivity and that required workflow tables/columns can be read, even on an empty database. `SELECT 1` alone must not declare a database ready when its migrations are absent. Use a static bounded read over required tables/columns that returns no application rows; no recurring application-record polling, full-table scans, migration-on-start, or run-state schema. Use the underlying postgres.js pending query and its cancellation operation for this package-owned probe, including cancellation while queued. Coalesce concurrent callers into one outstanding probe and clear it only after settlement so repeated readiness requests cannot accumulate abandoned queries.

Do not assume `Kysely.execute({ signal })` bounds pool acquisition with this driver. In the installed dialect, abortable `reserve({ signal })` is selected for **Bun SQL instances**, not merely for a process running under Bun. Rostrum supplies postgres.js, whose reserve path lacks that signal. Prove both queued-query cancellation and an active, lock-blocked probe with the pinned driver before accepting this design; if it cannot settle safely, resolve the acquisition/cancellation mechanism in this checkpoint rather than adding an uncancelled promise race.

Configure remote TLS with explicit certificate-chain and hostname verification. In postgres.js 3.4.9, `require`, `allow`, and `prefer` disable certificate verification; `prefer` can also fall back to plaintext. Reject these modes rather than treating their names as libpq guarantees. Load private CA contents into the explicit `ssl` object with `rejectUnauthorized: true`; this driver does not load arbitrary `sslrootcert` file paths from the URL. Preserve hostname/IP-SAN verification against the configured target, including IP-literal tests.

Reject URL parameters that conflict with the explicit transport policy or redirect the host/socket target. Pin security-sensitive effective options rather than inheriting `PG*` environment fallbacks. Omit unset optional driver properties: an explicit property with value `undefined` takes precedence over URL/default values in this driver. Tests using a disposable loopback database must request the local exception explicitly; externally supplied TLS/CA settings must survive when the helper changes only the disposable database name. The existing embedded/Compose servers have TLS disabled, so a positive database-TLS test requires a separately provisioned disposable TLS server.

Connection and query timeouts, including time waiting for a pool slot, fit within the dependency deadline for probes. Initiate pool shutdown with `postgres.end({ timeout: remainingSeconds })` before calling Kysely destruction: the dialect otherwise calls unbounded `end()`, and a later bounded `end()` returns the already-started promise rather than shortening it. Closing a handle releases only its pool; it does not stop Postgres, drop databases, run migrations, or close another handle. Only the existing disposable-test owner may delete its own temporary database.

### Startup, diagnostics, and shutdown

Process sequence: parse/validate configuration once; initialize logging; load token/TLS material; construct local dependencies and routes; bind listener; perform bounded initial readiness checks. Log `listening` separately from the readiness result. Subsequent readiness requests re-evaluate dependencies so a process recovers from an outage without restart. Schema generation constructs route metadata without loading secrets, opening pools, or starting probes.

Use the existing JSON log format and service categories. Log lifecycle transitions, configuration field failures, dependency failure class, timeout, listener errors, and shutdown result. Retain access logging without adding request/response bodies, authorization headers, full database URLs, TLS key contents, or raw driver errors that might contain credentials. Readiness responses contain stable codes, not internal addresses or exception strings. This is focused diagnostics, not a new telemetry subsystem.

Keep Bun's normal 10-second idle timeout outside shutdown. The lifecycle wrapper tracks admitted requests until their response completes or is aborted, not just until a handler returns a `Response`. At the start of drain, call `server.timeout(request, 0)` for those still outstanding before `server.stop(false)`: the shutdown deadline now bounds them instead of an earlier socket-idle deadline. Remove tracked requests on settlement. This avoids dropping a healthy draining request at Bun's shorter idle timeout without disabling normal idle-connection protection. Verify a held request and a response still being consumed beyond the normal idle timeout; both must remain governed by the drain deadline.

On SIGTERM or SIGINT, enter `draining` exactly once:

1. Close admission immediately. Requests that still reach the handler pass daemon authentication first, where required, then receive `service_draining`; already admitted requests retain access to their dependencies.
2. Disable the normal idle timer for tracked outstanding requests as described above, call `server.stop(false)`, and await active HTTP responses within the remaining deadline. Do not close the database first. Stop initiating readiness probes during drain; finish or abort existing probes within the same bound.
3. Wait for service-owned accepted work, when Epic 2 introduces it, independently of the HTTP connection that accepted it. Already accepted queued/running runs may advance to completion; do not serialize runs or couple them to the caller's socket. Do not add a dummy work registry in Epic 1.
4. Close only this process's pool and other owned resources, then flush logs. Exit 0 after a completed drain.
5. At deadline, abort outstanding local operations, force-close connections with `server.stop(true)`, bound pool termination by the same deadline, log forced shutdown, and exit nonzero. Do not await stop/cleanup promises indefinitely after force-closing: a hard process-exit deadline remains authoritative even if a handler never settles. Repeated signals must not close resources twice or extend the deadline.

Stopping the Control API does not issue a daemon shutdown/cancel command. Stopping the daemon makes Control API readiness fail but leaves authoring and Postgres independently manageable. Daemon exit loses all M2 run state; no accepted work is promised to survive restart. Epic 2 must add multi-run drain/forced-stop tests when actual work exists. In this Epic, lifecycle tests use controlled outstanding requests and resource barriers, not fake production workflow endpoints.

## Verification

All implementation commands below are future acceptance work unless recorded under Discoveries or Outcome. Use disposable resources, readiness barriers, and explicit deadlines rather than fixed sleeps. Never point mutation tests at a developer application database.

| Epic criterion / risk | Scenario and expected observation |
| --- | --- |
| Directory cutover | Frozen install, package commands, OpenAPI smoke, and tracked-reference search pass with no `apps/control-api` alias |
| Independent listeners/processes | Start both executable entry points with different addresses/ports and unrelated working directories; Control API readiness reaches the daemon over HTTP, not an imported app |
| Shared database, separate pools | Create a disposable database through `@rostrum/database/testing`, migrate explicitly, start both services, and confirm both schema probes succeed; closing one service's handle leaves the other's reads working |
| Database ownership | Create/publish through Control API, verify retrieval through a separately constructed shared-package handle, and confirm both service probes remain healthy; do not add daemon publication endpoints merely for this check |
| Authentication | Correct token succeeds; missing/wrong/malformed/combined tokens return 401 even for unknown paths, health, readiness, and OpenAPI; unauthorized requests cannot trigger database probes |
| Encrypted transport | Trusted certificate and correct name succeed; wrong CA, expired certificate, wrong hostname, and plaintext to TLS listener fail; `pg_stat_ssl` on the disposable TLS database confirms encrypted connections from both service pools |
| Local exception containment | Reject production plaintext, wildcard/LAN plaintext listeners, non-loopback HTTP daemon URLs, DNS-name exceptions, and remote plaintext database targets; forged forwarding headers and ambient proxies cannot bypass the rule |
| Invalid settings | Invalid port/timeout/boolean, unknown YAML key, missing explicit config file, missing token, incomplete TLS pair, conflicting database SSL options, and invalid daemon URL fail startup nonzero with sanitized field diagnostics |
| Liveness versus readiness | With Postgres unavailable, each process still returns health 200 and readiness 503; restoring it returns readiness to 200 without restart. An unmigrated database remains unready |
| Daemon dependency failures | Stop daemon, use wrong token/CA, stall its response/body, or serve invalid JSON; Control API reports the corresponding code within its deadline, without retry or leaked upstream data |
| Authoring isolation | With daemon stopped but Postgres available, existing Control API draft/publication operations still work even though overall readiness is 503 |
| Independent graceful shutdown | Hold multiple admitted requests behind barriers, signal one process, release requests within the deadline, observe responses finish and exit 0; the other process and shared database remain usable |
| Forced shutdown | Leave a request/probe/resource closure blocked past the deadline; observe bounded nonzero exit, no double close on repeated signals, and the peer still available |
| Offline tooling | Generate both OpenAPI documents without daemon/database connectivity or production credentials; checked-in artifacts match served documents; private daemon security is documented only in its contract |
| No credential leakage | Inspect captured startup, auth, TLS, dependency, and shutdown diagnostics for fixture secrets and connection credentials; none appear |

Keep permanent regression tests for security bypasses, readiness transitions, deadline cancellation, and resource ownership. Do not add tests that only pin log prose, copy fields, or assert imports. Reuse the existing disposable Postgres helper; extend it narrowly for TLS evidence if necessary. Use a temporary real-process smoke driver for end-to-end scenarios and record its commands/results before deleting it. Do not build the Epic 6 fixture catalog or long-lived separate-network harness here.

For focused non-loopback evidence, run the same executables on two provisioned private hosts or isolated network namespaces/containers with independently provisioned config/TLS/token files and a third Postgres target. Observe authenticated HTTPS, each database connection, failure transitions, and independent shutdown. Record actual addresses and certificate SANs without secrets. If only loopback execution is available, record that limitation; remote-boundary acceptance remains open until non-loopback evidence exists. Epic 6 will make this environment reusable.

## Discoveries

- **2026-09-11 — Bun runtime evidence.** A disposable Bun 1.4.0 process served TLS using a generated certificate. Fetch with the trusted certificate and matching hostname returned 200. An untrusted certificate failed with `DEPTH_ZERO_SELF_SIGNED_CERT`; the trusted certificate at a mismatched hostname failed with `ERR_TLS_CERT_ALTNAME_INVALID`. A separate held HTTP request completed after `stop(false)` was requested, and the stop promise resolved only after release. The probe exited 0. This tests runtime primitives, not Rostrum's unimplemented boundary.
- **Shutdown documentation must follow behavior.** Existing `stop(true)` is forced closure; it is not a graceful drain. Bun's idle timeout is also not an overall request or shutdown deadline.
- **2026-09-11 — Drain escalation evidence.** A second Bun 1.4.0 probe used a one-second idle timeout and a held request. `server.timeout(request, 0)` kept it open beyond that timeout during `stop(false)`; a subsequent `stop(true)` terminated the client connection. Both stop promises settled after the held handler was released, and the probe exited 0. This supports request-specific idle suppression and connection escalation, not an assumption that forced closure settles arbitrary handler code.
- **Configuration errors can currently disappear.** Unknown YAML keys are omitted before schema checking, and an explicitly selected nonexistent config file is treated as optional. Security configuration must not preserve these behaviors.
- **Offline schema construction is coupled to runtime composition.** Existing OpenAPI generation builds the app and its lazy database service. Requiring runtime credentials without separating composition would break tooling unnecessarily.
- **Publication semantics remain unchanged.** The specification's publishing section contains shorthand `sha256(retrieved) == digest`, while its detailed digest section excludes metadata. Reuse the existing repository integrity check; do not implement a new raw-text hash in this Epic.
- **Pinned driver differences matter.** Source inspection of postgres.js 3.4.9 confirmed insecure SSL modes, explicit-option precedence, and first-call shutdown timeout ownership. The installed kysely-postgres-js 4.0.0 distinguishes postgres.js from Bun SQL; running postgres.js inside Bun does not enable abortable pool reservation. These are implementation constraints, not runtime database acceptance evidence.

Primary runtime references consulted: [Bun server lifecycle](https://bun.sh/docs/runtime/http/server#server-stop), [Bun server TLS](https://bun.sh/docs/runtime/http/tls), [Bun fetch TLS and cancellation](https://bun.sh/docs/runtime/networking/fetch), [postgres.js](https://github.com/porsager/postgres), [kysely-postgres-js](https://github.com/kysely-org/kysely-postgres-js), and [PostgreSQL certificate-verification rationale](https://www.postgresql.org/docs/current/libpq-ssl.html). Driver findings above were checked against the installed package source rather than inferred from libpq documentation.

## Decision log

| Date | Decision | Rationale / approval state |
| --- | --- | --- |
| 2026-09-11 | One plan covers this Epic | Directory placement, transport, pool ownership, and lifecycle must integrate into one independently verifiable boundary |
| 2026-09-11 | Propose direct TLS and a bearer token | Uses the installed runtime, avoids a mandatory proxy/PKI-client-certificate stack, and does not weaken remote authentication; security/human approval pending |
| 2026-09-11 | Use readiness as the first real service call | Exercises transport and independent dependencies without taking run execution from Epic 2 |
| 2026-09-11 | Preserve public liveness and authoring isolation | A daemon outage is not proof that the Control API process or its authoring capability is dead |
| 2026-09-11 | Do not add automatic retries | Epic 2 has no invocation idempotency; a transport helper must not later duplicate accepted runs |
| 2026-09-11 | Keep remote environment automation in Epic 6 | Focused real-process/security evidence belongs here; reusable conformance infrastructure does not |

## Outcome

Planning deliverable only. The repository and primary runtime documentation have been researched, and the Bun TLS/drain experiment passed. No service implementation, database migration, workflow behavior change, or Epic acceptance result is claimed. Security/lifecycle approval, implementation checkpoints, actual postgres.js TLS/probe evidence, and real two-service acceptance remain future work.

Independent security review found no remaining security-contract findings after authentication-before-drain and restricted secret provisioning were made explicit. Independent coverage review confirmed all five Epic criteria were represented and identified missing executable-level checkpoint commands and an idle-timeout conflict; both are addressed above. Its shutdown-escalation uncertainty was exercised by the second runtime probe. Markdown lint and relative-link checks passed during plan preparation; these documentation checks do not count as Epic acceptance.
