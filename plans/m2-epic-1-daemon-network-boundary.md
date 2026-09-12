# Implement the daemon network boundary

Epic: [M2 Epic 1: Establish the daemon network boundary](../epics/m2/1-establish-daemon-network-boundary.md)

Status: Proposed implementation plan; implementation has not started.
Owner: Implementing agent. Review requirements and the autonomous directory-move exception are defined below.
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

Relevant source entry points: [Control API composition](https://github.com/RostrumAI/rostrum/blob/main/apis/control-api/src/app.ts), [configuration](https://github.com/RostrumAI/rostrum/blob/main/apis/control-api/src/env.ts), [database factory](https://github.com/RostrumAI/rostrum/blob/main/packages/database/src/client.ts), and [disposable Postgres helper](https://github.com/RostrumAI/rostrum/blob/main/packages/database/src/testing/postgres.ts). These links were updated when checkpoint 1 moved the backend service under `apis/`.

## Scope

Include:

- The `apps/control-api` to `apis/control-api` cutover and a new `apis/daemon` executable workspace.
- Private daemon health/readiness endpoints, service authentication, direct or reverse-proxy HTTPS, validated configuration, and a real Control API daemon client.
- Independent database ownership, secure remote connection options, bounded dependency probes, and clear operation ownership.
- Independent startup, file-based token/configuration reload through SIGHUP, request draining, bounded shutdown, diagnostics, and focused behavior verification.
- Essential setup documentation and generated API contracts that match the delivered behavior.

Exclude workflow execution, run creation/retrieval handlers, run storage, subscriptions, scheduling, invocation retries/idempotency, multi-daemon routing, and caller identity/governance. Do not add placeholder run routes, a fake execution command, or an empty run registry. [Epic 6](../epics/m2/6-complete-m2-conformance.md) owns the reusable separate-network environment and combined M2 demonstration; this plan does not build them.

## Decisions

The Epic establishes separate services, private authenticated HTTP, shared database access, one daemon per deployment, and the directory cutover. [PR #9 review](https://github.com/RostrumAI/rostrum-dev-docs/pull/9) selects the transport, token, package-name, and review rules below. Detailed reload and lifecycle mechanics remain subject to implementation review.

1. **HTTPS to the daemon, with direct or proxy termination.** The Control API initiates the service connection; the daemon does not call the Control API. The Control API requires an HTTPS `DAEMON_URL` unless the explicit local exception applies. The daemon serves a certificate/key pair itself or uses `BEHIND_REVERSE_PROXY=true` to serve HTTP behind a TLS-terminating proxy. Proxy mode never permits the Control API to use a remote HTTP daemon URL. Extra trust roots use the runtime's `NODE_EXTRA_CA_CERTS`, not application-specific CA settings.
2. **Explicit local-only plaintext exception.** When `ALLOW_INSECURE_LOCAL=true`, validate at startup that the Control API's daemon URL contains a literal `127.0.0.0/8` or `::1` address, even if the URL is HTTPS. Retain the development/test restriction. This flag also permits a loopback-only daemon HTTP listener without a certificate. Without either the local exception or proxy mode, missing/unusable daemon TLS material is a startup error. Proxy mode is a separate production-capable option whose plaintext backend hop must remain on the same host.
3. **Required destination and rotating token sets.** Require an explicit `DAEMON_URL` and one configured token source at boot: `DAEMON_TOKEN_FILE` or `DAEMON_TOKEN`. A token file contains one token per line; the environment variable contains comma-separated tokens. Both services load the ordered set, the daemon accepts every token in it, and the Control API sends only the newest (last) token. Tokens are hexadecimal encodings of at least 32 cryptographically random bytes; startup validates hexadecimal syntax and length, not randomness. Both services reload file-based tokens and application configuration on SIGHUP.
4. **Readiness aggregates; it does not stop unrelated work.** Control API readiness depends on its database and the authenticated daemon readiness response. Daemon readiness depends on its own database. A daemon outage does not stop Control API authoring operations that can still use their database.
5. **Fail configuration as early as possible.** Validate configuration, token presence/format, transport combinations, and required files before opening database connections, loading routes, or listening. A known-invalid setting exits nonzero immediately, with no retries, startup grace period, or unrelated initialization first. A listener bind error closes only resources already acquired and exits nonzero. Dependency failures return their first known failure without waiting out the timeout; an unavailable dependency leaves the process live but unready, preserving independent startup rather than introducing a restart loop.
6. **One owner per pool.** Each service owns its database handle; workflow handlers borrow it. A configuration reload may briefly retain an old handle for already admitted requests while preparing its replacement, but neither service closes the other's resources. Schema migration stays an explicit operator command. Services do not share mutable objects, watch application files for commands, or poll database records for coordination. Explicit SIGHUP reloads read only that process's operator-provisioned configuration and secret files.
7. **Bounded shutdown, no recovery promise.** Stop admission, finish outstanding requests and accepted work within one deadline, then force termination if necessary. M2 in-memory state disappears when the daemon exits, even after a graceful drain. This does not introduce a public cancellation state or M3 recovery.
8. **Shared server package.** Use `packages/server` with workspace name `@rostrum/server` for the protocol schemas and mechanics both services actually use: configuration parsing/reload, loopback classification, TLS listener options, logging, feature loading, and lifecycle handling. Move reusable code into it; do not copy a second loader or introduce a generic RPC/plugin framework. Keep database driver code in `packages/database`, daemon authentication in the daemon, and outbound daemon calls in the Control API.

The review comments select the direction in decisions 1–3 and the package name in decision 8; do not require the owner to approve those choices again. Security and backend reviewers must check the detailed implementation against them, and unresolved readiness/shutdown choices still require human review. Checkpoint 1 may be accepted autonomously under its conditions; it has no human-review gate.

Every agent-driven review uses a newly spawned subagent with no implementation-session context, authoring history, or implementer's rationale. Supply the governing documents, review requirements, and target branch/diff; the reviewer builds its own understanding from those artifacts. Do not reuse an implementing/research agent as its own reviewer or pass an implementation transcript as review context.

## Progress

- [x] Read governing documents and map the existing service, database, workspace, and test seams.
- [x] Research Bun transport APIs and exercise TLS verification and graceful HTTP draining on Bun 1.4.0.
- [x] Write this proposed plan; no runtime implementation or Epic acceptance is claimed.
- [ ] Review the remaining readiness, reload, and shutdown mechanics against the owner's transport and token decisions.
- [x] Complete checkpoint 1: runnable backend directory cutover (commit `ce935de`).
- [ ] Complete checkpoint 2: independently runnable secure daemon and database boundary.
- [ ] Complete checkpoint 3: Control API integration and bounded lifecycle.
- [ ] Complete checkpoint 4: focused acceptance evidence and operator handoff.

Record implementation pull requests and checkpoint evidence here as work proceeds.

### Checkpoint 1 evidence (2026-09-11)

Branch `feat/m2-epic-1-backend-cutover`, commit `ce935de` against `main`: 40 files — 33 renames, 6 modified, 1 added, no deletions.

- `bun install` then `bun install --frozen-lockfile`: both exit 0, and `git status` shows no lockfile rewrite, so the committed lockfile is consistent.
- `bun run --filter @rostrum/control-api typecheck`: exit 0.
- `bun test`: 375 pass, 0 fail across 29 files. The pre-move baseline on `main` was also 375 pass, 0 fail, so no assertion, fixture, or expectation changed.
- `bun run --filter @rostrum/control-api smoke`: exit 0; the served document equals the checked-in contract.
- `bun run check`: `@rostrum/workflow`, `@rostrum/database`, and `@rostrum/control-api` all exit 0. `bun run lint`: 204 files clean.
- Moved-tree integrity: all 33 tracked files preserved. Only `src/scripts/generate-openapi.ts` (doc comment) and `src/scripts/smoke.ts` (drift message) differ from `main`, each by an equal-length `apps/control-api` → `apis/control-api` substitution, so behavior inside the moved tree is unchanged. `apis/control-api/openapi.json` is byte-identical (SHA-256 `55f38c11…`).
- Live executable: `bun run apis/control-api/src/index.ts` served `GET /api/system/health` as `200 {"status":"ok"}` on an ephemeral port, served an OpenAPI document identical to the checked-in copy, answered 404 and 405 through the unchanged error envelope, logged `shutdown started` on SIGTERM, and exited 0.
- Workspace linkage survives the move: `apis/control-api/node_modules/@rostrum/{database,workflow}` still resolve to `packages/`, because both locations sit two levels below the root.

Remaining `apps/control-api` strings are deliberate non-changes: historical PR-comment citations in `.github/skills/code-review/rules/repository-conventions.md`, the historical finding example in `.github/skills/code-review/reviewer-contract.md`, and review-pipeline test fixtures in `scripts/review/*.test.ts`, which this checkpoint prohibits altering. One live reference did move alongside its `biome.json` duplicate: the generated-artifact skip list in `.github/skills/code-review/lenses/04-typescript-style.md`.

Two pre-existing conditions surfaced, neither caused by this cutover and neither in checkpoint 1 scope: the committed `bun.lock` omitted the `trustedDependencies` block that root `package.json` declares, which the sanctioned `bun install` then syncs; and root `README.md` documents a `shutdown complete` line the process never logs. Checkpoint 4 owns the shutdown documentation, and checkpoint 3 owns lifecycle behavior.

Independent review: a freshly spawned repository/tooling reviewer with no implementation-session context (`CutoverReviewer`) re-ran every acceptance command itself, byte-compared the moved tree against `main`, and confirmed the package name, route contract, and contract artifact are unchanged. It also verified that no re-export, symlink, or compatibility workspace remains under `apps/`, and that the CI command set is green. Verdict: approve, confidence 0.95, no findings. It additionally flagged scope prose in `.github/skills/code-review/rules/repository-conventions.md` that still described `apis/**` as a planned home; that prose is corrected in `ff67803`, leaving the reviewed cutover commit `ce935de` unmodified.

## Checkpoints

### Checkpoint 1: Backend workspaces run from apis

Owner: Implementing agent. Reviewer: a fresh, independent repository/tooling subagent; no human reviewer is required for this checkpoint.

Move `apps/control-api` to `apis/control-api`. Keep its package name and public route contract. Add `apis/*` to root workspaces while retaining `apps/*`. Update `bun.lock`, the generated OpenAPI exclusion in `biome.json`, source/script path references, root setup/layout documentation, and the workspace READMEs. `apps/` describes user-facing applications only. Inspect existing CI/deployment references; package-name CI filters and the two-level `tsconfig.json` relative path do not need gratuitous changes.

Before implementation edits, run `git branch --show-current` in the implementation repository and create a feature branch if it is `main`. Use language-server file renames/references where available, then move the remaining assets. Do not leave re-exports, symlinks, or compatibility workspaces under `apps/`.

Acceptance commands: `bun install`, `bun install --frozen-lockfile`, `bun run --filter @rostrum/control-api typecheck`, `bun test`, and `bun run --filter @rostrum/control-api smoke`. Existing tests must pass without changes other than relocated paths/imports; do not change assertions, fixtures, or expected behavior to make the move pass. Search tracked implementation/setup/configuration files for remaining `apps/control-api` references; expect none. Existing health and generated OpenAPI behavior must remain unchanged.

The independent subagent may approve this directory-only cutover autonomously when those conditions hold. Escalate any required non-path test/behavior change or consumer of the old physical path outside the inspected tree rather than folding it into the rename. Recovery/handoff: record the move commit and successful existing-test/smoke evidence. Revert the coherent move commit if necessary, not selected lockfile/path edits.

### Checkpoint 2: A secure daemon starts independently

Owner: Implementing agent. Reviewers: security specialist and database maintainer.

Extract the shared mechanics without changing existing public error or route behavior. Create `apis/daemon` with `dev`, `start`, `typecheck`, `generate-openapi`, `smoke`, and focused test commands. Its smoke checks authenticated liveness and served/generated OpenAPI parity with temporary local credentials; it does not require Postgres readiness. Implement fail-fast configuration validation, direct/proxy transport modes, ordered token sources, SIGHUP reload, daemon health/readiness, a private generated OpenAPI document, and independent database ownership. Extend the shared database connection factory and migrate all its callers in the same checkpoint.

Acceptance: a real daemon returns authenticated health/readiness; it accepts every configured token, and missing/wrong credentials return 401. Unavailable Postgres produces liveness 200 and readiness 503. Invalid configuration fails before service resources are acquired. Direct TLS and HTTPS through a local reverse proxy work with platform trust; wrong CA/name fails. Invalid local-exception and proxy-backend configurations are rejected. File-token rotation takes effect on SIGHUP without restarting the process; a failed reload leaves the last valid configuration and token set active. Existing Control API commands remain runnable until its integration checkpoint.

Commands introduced by this checkpoint: `bun run --filter @rostrum/daemon generate-openapi`, `bun run --filter @rostrum/daemon smoke`, `bun test apis/daemon/src/boundary.test.ts`, and `bun test packages/database/src/client.test.ts`. The daemon smoke must spawn the actual `src/index.ts` executable with temporary configuration, observe its listening log/port, call its authenticated endpoints, send SIGTERM, and assert bounded exit; constructing `DaemonApp` and serving it in the smoke process is insufficient. The boundary tests must also spawn this entry point for invalid-config, database-unavailable, and TLS startup cases. Run the existing database repository/migration tests after changing the factory. These files and commands are planned, not present today.

Escalate if the pinned runtime/driver cannot enforce platform CA and hostname verification, bounded probe cancellation, or the documented reload behavior; do not weaken verification or silently reduce SIGHUP support. Recovery/handoff: record the agreed config/protocol schemas, actual direct/proxy TLS and token-reload evidence, and all migrated factory callers. No database schema change is intended, so reverting service code must not require data rollback.

### Checkpoint 3: The Control API observes the daemon and both drain independently

Owner: Implementing agent. Reviewers: backend/concurrency reviewer and security specialist.

Pass resolved configuration and service-owned dependencies into `ControlApiApp`; add its daemon client and readiness feature. Separate route construction from resource acquisition so OpenAPI generation is offline. Integrate SIGHUP and the shared shutdown sequence into both entry points. Preserve authoring operations during daemon outages and existing public liveness behavior.

Acceptance: Control API readiness reflects both independently checked dependencies. It sends only the newest token, adopts file-based token/configuration changes on SIGHUP, and does not retry older tokens after rejection. Complete the overlap-and-retire rotation sequence without dropping accepted requests. Wrong credentials, TLS failure, timeout, invalid upstream JSON, daemon unready state, and refusal remain distinguishable without exposing secrets. Stop either process while requests are outstanding; requests within the deadline finish, overdue work is terminated, and the peer's process and database pool remain usable.

Commands: regenerate both OpenAPI artifacts; run `bun test apis/control-api/src/daemon/client.test.ts packages/server/src/lifecycle.test.ts packages/server/src/reload.test.ts`, then existing Control API smoke and focused daemon tests. Exercise actual executables, SIGHUP, and shutdown signal handlers; in-process application tests alone do not prove independent lifecycle.

Escalate if shutdown would imply a new run state, cancel another process's work, or require durable state. Recovery/handoff: record the protocol/config version delivered, graceful and forced exit evidence, and known M2 state-loss behavior. Roll back coordinated code/config changes together; never enable insecure remote transport to restore connectivity.

### Checkpoint 4: Epic acceptance is demonstrated and documented

Owner: Implementing agent. Reviewers: independent implementation reviewer, then human owner.

Run the focused acceptance matrix against real services and disposable Postgres. Check existing workflow authoring/publication behavior after the move and pool-ownership change. Capture exact commands, configuration names, statuses, exit codes, and sanitized evidence in this plan. Do not claim separate-host proof from two loopback ports.

After the behavior passes, update essential operator setup, direct/proxy HTTPS examples, `NODE_EXTRA_CA_CERTS`, migration ownership, ordered token rotation and SIGHUP instructions, readiness interpretation, and shutdown/state-loss documentation. Keep development design in `dev-docs`; keep executable schemas, generated API contracts, tests, and essential startup instructions with implementation. Remove temporary smoke scripts, credentials, and certificates. Commit/push development documentation inside its independent checkout.

Final commands: `bun install --frozen-lockfile`, `bun run check`, `bun run lint`, `bun test`, and both services' smoke/contract checks. Run the documentation repository's Markdown and relative-link checks. Perform fresh-subagent review against the Epic, owner review comments, and this plan before human review of the completed Epic; this does not add a human gate to checkpoint 1.

Escalate any unproved acceptance criterion rather than marking the Epic complete. Recovery/handoff: include pull requests, remaining operational prerequisites, and the Epic 2 seam. On completion, retain durable contracts in code/API docs, setup documentation, and a decision record only where useful across Epics; then retire this plan under the documentation lifecycle.

## Implementation approach

### Files and dependency direction

- `apis/control-api`: retain workflow feature modules and their public schemas. Change `env.ts`, `index.ts`, `app.ts`, `services.ts`, `workflows/service.ts`, and `workflows/database.ts` for resolved configuration, reload, and borrowed database ownership. Add `src/daemon/client.ts` and `src/features/system/readiness.ts`. It is a TLS client on the daemon link, not a certificate-presenting peer.
- `apis/daemon`: add its own `env.ts`, `index.ts`, `app.ts`, dependency container, token authentication, direct/proxy listener configuration, and `src/features/system/{health,readiness}.ts`. It owns no workflow executor or run map in this Epic.
- `packages/server` (`@rostrum/server`): move/generalize the existing feature loader's service type, configuration reader, JSON logger, and common HTTP mechanics only as needed by the two consumers; add the shared token-source parser and SIGHUP lifecycle. Leave workflow-specific `parameterGuard` and its `invalid_workflow_input` response with the Control API. Export TypeBox daemon health/readiness/error schemas and inferred types. Do not import either service or acquire resources at module load. Keep publication findings/schema ownership unchanged; boundary errors have an empty `findings` array compatible with the public envelope.
- `packages/database`: own connection options, driver handles, readiness queries, timeout/cancellation, and pool closure. Use runtime default CA trust rather than an application CA-file option. Update `src/client.ts`, exports, migration CLI, disposable-database helper, and current consumers together. Resolve exported-symbol references before changing signatures. Do not add migrations or run tables.
- Root/workspace tooling: update workspace and generated-file paths; add the daemon to appropriate checks without broadening the Postgres-only development Compose file into the Epic 6 environment.

No compatibility exports remain at moved implementation paths. Share source code and schema definitions, not process instances. A local certificate or token file is operator-provisioned configuration, not a coordination channel; each remote machine has its own copy.

### Configuration contract

Keep environment-over-YAML-over-default precedence and camelCase YAML keys, with the token-source selection rule below. `CONTROL_API_CONFIG` and `DAEMON_CONFIG` select each process's file. An absent default `config.yaml` is allowed; an explicitly selected missing file is an error. Validate file keys before merging. Boolean environment values accept only `true` or `false`; integer values reject fractions, overflow, and coercion surprises. Fail immediately on known invalid fields, naming the field and reason but never a secret value or full database URL. Resolve relative file paths against the process working directory and recommend absolute paths for service managers. SIGHUP rereads the selected YAML and referenced application-owned token/certificate files using the same startup validation; environment values retain precedence.

| Environment / YAML key | Consumer | Rule |
| --- | --- | --- |
| `HOST` / `host` | Both | Default `127.0.0.1`; a daemon plaintext listener is loopback-only in local-exception or proxy mode |
| `PORT` / `port` | Both | Control API default 3000; daemon default 3001; 0 allowed for ephemeral test listeners |
| `NODE_ENV` / `nodeEnv` | Both and migration CLI | Retain development/test/production values and current development default; the CLI reads `NODE_ENV` |
| `LOG_LEVEL` / `logLevel` | Both | Retain LogTape levels and environment-dependent default |
| `DATABASE_URL` / `databaseUrl` | Both | Required in executable service configuration; same database target, potentially different credentials |
| `DATABASE_TLS_MODE` / `databaseTlsMode` | Both and migration CLI | `verify-full` by default; `disable` allowed only with the local exception and a literal loopback target |
| `TLS_CERT_FILE` / `tlsCertFile` | Daemon | PEM server certificate chain, paired with key for direct TLS; not loaded/served in proxy mode |
| `TLS_KEY_FILE` / `tlsKeyFile` | Daemon | Matching private key; validate before opening service resources |
| `BEHIND_REVERSE_PROXY` / `behindReverseProxy` | Daemon | Default false; true selects an HTTP loopback listener behind a same-host HTTPS proxy instead of daemon-hosted TLS |
| `ALLOW_INSECURE_LOCAL` / `allowInsecureLocal` | Both and migration CLI | Default false; development/test only. If enabled, require a literal loopback daemon URL on the Control API and loopback daemon bind; never bypass token authentication |
| `DAEMON_URL` / `daemonUrl` | Control API | Required origin URL; HTTPS unless the local exception permits HTTP. Reject userinfo, non-root paths, query, fragment, unsupported schemes, and a non-loopback target when the local flag is enabled |
| `NODE_EXTRA_CA_CERTS` (runtime environment only) | Both and migration CLI | Runtime-supplied PEM bundle for additional trust roots; set before process launch. No `DAEMON_CA_FILE` or `DATABASE_CA_FILE` option |
| `DAEMON_TOKEN_FILE` / `daemonTokenFile` | Both | One token per line, oldest to newest; reread on SIGHUP |
| `DAEMON_TOKEN` (environment only) | Both | Comma-separated tokens, oldest to newest; alternative to a file, not an additional source |
| `DEPENDENCY_TIMEOUT_MS` / `dependencyTimeoutMs` | Both | Default 2000; positive integer, maximum 30000; bounds readiness, including queue/connect/query/body consumption |
| `SHUTDOWN_TIMEOUT_MS` / `shutdownTimeoutMs` | Both | Default 30000; positive integer, maximum 300000; one total drain-and-close deadline |

Per-process `HOST`/`PORT` variables remain sufficient for independent configuration; do not introduce duplicate prefixed aliases. Update local instructions to supply an explicit database URL, the local-exception flag, and one token source. Development HTTPS uses the runtime's additional CA trust when needed, never `rejectUnauthorized: false`.

The migration CLI consumes the database, local-exception, and environment settings from environment variables; it does not gain a second service-config file selector. Preserve explicit migration targeting and document the required TLS settings alongside `db:migrate`.

TLS certificate settings belong to the daemon listener. The Control API verifies the daemon certificate but presents no client certificate. This Epic does not add certificate/key loading to the Control API's caller-facing listener; remote caller-facing HTTPS remains a deployment-edge responsibility and is separate from the daemon link.

A direct remote deployment provides a private daemon address, a matching certificate/key pair, and token configuration on each service. A proxy deployment provides the certificate to the reverse proxy instead, sets `BEHIND_REVERSE_PROXY=true` on the daemon, and keeps the Control API's `DAEMON_URL` HTTPS. Network controls restrict access to the proxy and daemon; the flag alone neither authenticates a proxy nor proves an encrypted backend hop.

Provision file-based tokens and private keys for the service account only (mode `0600`, or equivalent permissions), outside the checkout. Inject environment tokens through the process supervisor or secret store, not command-line arguments or shell tracing. Neither logs nor diagnostics may include token values, authorization headers, or full configuration dumps. Do not mount a common writable configuration directory between services.

### Token sources, ordering, and rotation

Select one source as a unit. An environment `DAEMON_TOKEN` or `DAEMON_TOKEN_FILE` overrides YAML `daemonTokenFile`; configuring both environment selectors is an error. Without either environment selector, use YAML `daemonTokenFile`. Missing, unreadable, empty, or invalid selected sources fail startup; never fall back to a different source after validation fails. Inline YAML token values are not supported.

For files, parse LF or CRLF-separated entries; for the environment, split on commas. Permit surrounding whitespace and a final file newline; reject empty entries within a list and any invalid token. Require at least one token. Each token must encode at least 32 bytes as an even number of hexadecimal characters (at least 64 characters). Operators generate tokens with a cryptographically secure random generator; syntax validation cannot prove entropy. Normalize hexadecimal case and reject duplicate token values.

Ordering is explicit: first is oldest, last is newest. The daemon accepts all configured values. The Control API selects the last value for every newly issued request, never sends the list, and never falls back or retries using an older token after a 401. Token-only SIGHUP reload swaps the validated set atomically without closing listeners, database handles, or already admitted requests; subsequent requests, including keep-alive requests, use the new set.

Rotate in this order: append the new token to the daemon's file and SIGHUP the daemon; append it to the Control API's file and SIGHUP the Control API; verify the new token works; then remove the retired token from the daemon and reload again. During overlap, the daemon accepts old and new tokens. Revocation affects new authentication decisions, not commands already accepted. Environment-sourced tokens support the same ordering, but changing the process environment requires a restart; SIGHUP does not reread a parent's environment or Bun's startup `.env` files.

### Authentication and transport rules

Use `Authorization: Bearer <token>`. Validate tokens at the configured-source boundary and validate the incoming token's syntax before comparison. Compare fixed-length digests of decoded token bytes using constant-time comparison against the accepted set. Reject missing, malformed, combined/duplicated authorization headers, or unknown tokens with 401 and `WWW-Authenticate: Bearer`. A comma-separated token list is valid configuration, not a valid HTTP credential. Authenticate before the draining gate, route matching, dependency probes, or request-body parsing, including during shutdown. Authenticated unknown routes return 404; unsupported methods return 405 with `Allow`.

The Control API client uses a fixed configured origin and operation paths, `redirect: "error"`, normal certificate-chain and hostname verification, a bounded response reader, and an abort deadline. Do not set a per-client `ca` option: that would replace runtime trust rather than use `NODE_EXTRA_CA_CERTS`. Disable ambient forward-proxy routing so a loopback exception cannot leak a token through `HTTP_PROXY`/`HTTPS_PROXY`. This does not disable the explicit reverse proxy addressed by `DAEMON_URL`. Never forward caller authorization headers or automatically retry daemon calls. Reject a process-global certificate-verification bypass such as `NODE_TLS_REJECT_UNAUTHORIZED=0`.

The daemon chooses transport before any listener opens:

| `BEHIND_REVERSE_PROXY` | Direct certificate/key | Local exception | Daemon listener |
| --- | --- | --- | --- |
| false | Valid pair | Either | HTTPS; if the local flag is enabled, bind loopback |
| false | Absent | Enabled, development/test, loopback bind | HTTP for local development |
| false | Absent or unusable | Otherwise | Fail startup |
| true | Not used | Not required | HTTP on literal loopback behind a same-host HTTPS proxy |

A partial/invalid explicitly configured pair is an error in direct mode, not a reason to fall back to HTTP. In proxy mode the daemon does not read or serve the certificate files; the proxy owns issuance and renewal. The client does not use `BEHIND_REVERSE_PROXY` to bypass HTTPS or certificate checks.

Use an IP parser for `127.0.0.0/8` and `::1`, not string prefixes, DNS resolution, or forwarding headers. Reject DNS-name, wildcard, LAN, and IPv4-mapped exceptions. Validate the daemon URL at startup and on reload whenever the local flag is enabled, even for an HTTPS URL. The local flag does not weaken remote Postgres protection.

Proxy mode's plaintext backend hop is same-host loopback and cannot be exposed directly to remote callers. A proxy on another machine cannot forward plaintext across that link under the Epic's cross-host encryption rule; use daemon-hosted TLS for that topology. Do not infer a secure backend hop from RFC1918 addresses, `Forwarded`, or `X-Forwarded-Proto`. The proxy must preserve the bearer header, enforce an HTTPS frontend, and prevent direct remote access to the daemon.

`NODE_EXTRA_CA_CERTS` is the sole additional-trust mechanism for daemon and database clients. Set it before launching Bun; omit per-connection CA overrides and keep certificate/hostname verification enabled. Runtime trust is startup-scoped: changes to this environment variable or its CA bundle require restarting the affected process. It is not a YAML key or an application-managed SIGHUP reload target.

### SIGHUP configuration reload

Both services retain the selected config-file path and startup environment layer. On SIGHUP, reread the YAML and selected token file, load any direct-mode certificate/key material, and validate a complete candidate with the startup rules. Environment-sourced values still override file values. No file watchers, implicit environment refresh, process restart, or run-state reset are involved.

1. Serialize reloads and coalesce repeated SIGHUPs; SIGTERM/SIGINT takes priority and prevents a later reload from reopening a draining service.
2. Parse and validate the entire candidate before changing live state. Invalid/missing files, token errors, or unsafe transport combinations reject the reload promptly with a sanitized field/reason; retain the last valid configuration and token set. Boot has no last valid state, so the same errors are fatal there.
3. Apply token-only, logging, daemon-client destination, and timeout changes by swapping a validated configuration snapshot. Each admitted request retains the snapshot it started with. A rejected candidate cannot partially change tokens, log level, or security policy.
4. Reload file-configured listener, direct TLS material, and database settings as well; do not silently limit SIGHUP to tokens. Construct replacement local resources before cutover where possible. A database replacement uses the same explicit transport options and readiness behavior as startup. Retain old handles for already admitted requests and close only those retired resources after a bounded drain.
5. Listener/TLS changes require a controlled listener replacement rather than assuming `Bun.Server.reload()` changes certificates, host, or port. For an unchanged bind address, briefly stop admission and drain outstanding HTTP requests under the old shutdown deadline, then rebind with the candidate. Keep service-owned execution state in the same process. For a different bind address, prepare the replacement before releasing the old listener. If replacement fails, restore the old listener/configuration; if restoration itself fails, exit nonzero rather than claim a working or secure listener.
6. Log reload success only after the complete cutover. Record a rejected reload or listener-replacement failure without exposing token values. Certificate/listener changes may briefly interrupt acceptance; token-only rotation must not. Preserve accepted daemon work across a reload; Epic 2 adds the corresponding multi-run test once an executor exists.

The only restart-only inputs here are the process environment/Bun runtime settings, including `NODE_EXTRA_CA_CERTS`; all supported application YAML fields and file-based token/direct-certificate contents participate in the reload contract. Operators remain responsible for keeping both services pointed at the same database when changing deployment settings.

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

A readiness check has one overall deadline. Control API database and daemon probes run concurrently. Return 503 as soon as either reports a failure and cancel unfinished sibling work; do not wait for another dependency's timeout to confirm the service is already unready. A `not_ready` body includes completed checks and at least the observed failed check; omit unfinished checks rather than imply success. A `ready` body requires every dependency check to have succeeded. Reject unexpected upstream statuses, non-JSON/oversized bodies (64 KiB for probe responses), invalid schema, and inconsistent status/body combinations. Cancel timed-out work; merely racing a promise while its socket/query keeps running is insufficient.

This freezes the Epic 1 transport seam: origin, `/api` routing, authentication, error envelope, dependency behavior, and lifecycle ownership. Epic 2 adds invocation and live snapshot operations through the same daemon/client boundary. It must freeze its run request/response schemas before engine integration, using exact publication selection (`workflowId`, `publicationNumber`) and daemon-owned run identity/state. Do not publish speculative run schemas here or implement success-shaped placeholders. The M2 overview's parallel-engine workstream can begin only once those additional Epic 2 schemas are agreed; Epic 1 alone does not claim to have frozen them.

### Database ownership and readiness

The Control API owns draft/revision/publication writes and caller-facing workflow reads. The daemon has its own shared-package connection; Epic 2 uses it to read and verify exact publications. This Epic proves daemon schema access without introducing an execution query or write. Separate database credentials are supported; least-privilege grants are an operator responsibility, not a new identity system.

Replace the URL-only database factory with an explicit connection-options contract and a service-owned handle containing the typed Kysely database, a bounded readiness probe, and idempotent `close({ timeoutMs })`. Retain the underlying postgres.js pool inside the handle, not in feature handlers. Set `application_name` to `control-api` or `daemon` for connection diagnostics; retain the current maximum of ten pooled connections per service and document the combined connection budget. Migrate repository tests, the migration runner, disposable-database helper, and Control API wrapper together; remove any wrapper made redundant by the new ownership model.

A probe verifies connectivity and that required workflow tables/columns can be read, even on an empty database. `SELECT 1` alone must not declare a database ready when its migrations are absent. Use a static bounded read over required tables/columns that returns no application rows; no recurring application-record polling, full-table scans, migration-on-start, or run-state schema. Use the underlying postgres.js pending query and its cancellation operation for this package-owned probe, including cancellation while queued. Coalesce concurrent callers into one outstanding probe and clear it only after settlement so repeated readiness requests cannot accumulate abandoned queries.

Do not assume `Kysely.execute({ signal })` bounds pool acquisition with this driver. In the installed dialect, abortable `reserve({ signal })` is selected for **Bun SQL instances**, not merely for a process running under Bun. Rostrum supplies postgres.js, whose reserve path lacks that signal. Prove both queued-query cancellation and an active, lock-blocked probe with the pinned driver before accepting this design; if it cannot settle safely, resolve the acquisition/cancellation mechanism in this checkpoint rather than adding an uncancelled promise race.

Configure remote TLS with explicit certificate-chain and hostname verification. In postgres.js 3.4.9, `require`, `allow`, and `prefer` disable certificate verification; `prefer` can fall back to plaintext. Reject these modes rather than treating their names as libpq guarantees. Set `rejectUnauthorized: true` without a `ca` override so the runtime's default trust plus `NODE_EXTRA_CA_CERTS` applies. This driver does not load arbitrary `sslrootcert` file paths from the URL; reject that competing configuration path. Preserve hostname/IP-SAN verification against the configured target, including IP-literal tests.

Reject URL parameters that conflict with the explicit transport policy or redirect the host/socket target. Pin security-sensitive effective options rather than inheriting `PG*` environment fallbacks. Omit unset optional driver properties: an explicit `undefined` takes precedence over URL/default values in this driver. Disposable tests must request their loopback plaintext exception explicitly; when the helper changes only the disposable database name, preserve effective TLS settings and the child process's `NODE_EXTRA_CA_CERTS`. Existing embedded/Compose servers have TLS disabled, so a positive database-TLS test needs a disposable TLS server.

Connection and query timeouts, including time waiting for a pool slot, fit within the dependency deadline for probes. Initiate pool shutdown with `postgres.end({ timeout: remainingSeconds })` before calling Kysely destruction: the dialect otherwise calls unbounded `end()`, and a later bounded `end()` returns the already-started promise rather than shortening it. Closing a handle releases only its pool; it does not stop Postgres, drop databases, run migrations, or close another handle. Only the existing disposable-test owner may delete its own temporary database.

### Startup, diagnostics, and shutdown

Process sequence: read/validate configuration and token source immediately; validate direct/proxy/local transport rules and required local files; initialize logging; construct dependencies and routes; bind the listener; perform initial readiness checks concurrently within one dependency deadline. Do not create pools, load feature modules, bind a port, retry a known failure, or wait through a grace period before reporting invalid configuration. Validate direct TLS key/certificate compatibility before resource acquisition. On a bind failure, unwind acquired resources and exit nonzero. Report the first dependency failure as soon as it is known rather than waiting for the deadline. Log `listening` separately from readiness. Later probes can recover readiness without restart. Offline schema generation reads route metadata without runtime credentials, pools, or probes.

Use the existing JSON log format and service categories. Log startup validation failures, dependency classes, timeouts, listener errors, SIGHUP success/rejection, and shutdown results. Retain access logging without request/response bodies, authorization headers, raw token lists, full database URLs, TLS keys, environment/configuration dumps, or unsanitized driver exceptions. Responses contain stable codes, not internal addresses or exception strings. This is focused diagnostics, not a new telemetry subsystem.

Keep Bun's normal 10-second idle timeout outside shutdown. The lifecycle wrapper tracks admitted requests until their response completes or is aborted, not just until a handler returns a `Response`. At the start of drain, call `server.timeout(request, 0)` for those still outstanding before `server.stop(false)`: the shutdown deadline now bounds them instead of an earlier socket-idle deadline. Remove tracked requests on settlement. This avoids dropping a healthy draining request at Bun's shorter idle timeout without disabling normal idle-connection protection. Verify a held request and a response still being consumed beyond the normal idle timeout; both must remain governed by the drain deadline.

On SIGTERM or SIGINT, enter `draining` exactly once:

1. Close admission immediately. Requests that still reach the handler pass daemon authentication first, where required, then receive `service_draining`; already admitted requests retain access to their dependencies.
2. Disable the normal idle timer for tracked outstanding requests as described above, call `server.stop(false)`, and await active HTTP responses within the remaining deadline. Do not close the database first. Stop initiating readiness probes during drain; finish or abort existing probes within the same bound.
3. Wait for service-owned accepted work, when Epic 2 introduces it, independently of the HTTP connection that accepted it. Already accepted queued/running runs may advance to completion; do not serialize runs or couple them to the caller's socket. Do not add a dummy work registry in Epic 1.
4. Close only this process's pool and other owned resources, then flush logs. Exit 0 after a completed drain.
5. At deadline, abort outstanding local operations, force-close connections with `server.stop(true)`, bound pool termination by the same deadline, log forced shutdown, and exit nonzero. Do not await stop/cleanup promises indefinitely after force-closing: a hard process-exit deadline remains authoritative even if a handler never settles. Repeated signals must not close resources twice or extend the deadline.

Stopping the Control API does not issue a daemon shutdown/cancel command. Stopping the daemon makes Control API readiness fail but leaves authoring and Postgres independently manageable. Daemon exit loses all M2 run state; no accepted work survives restart by contract. SIGHUP is not shutdown and must not discard that in-memory state. Epic 2 must add multi-run drain, forced-stop, and reload tests when actual work exists. In this Epic, lifecycle tests use controlled outstanding requests and resource barriers, not fake production workflow endpoints.

## Verification

All implementation commands below are future acceptance work unless recorded under Discoveries or Outcome. Use disposable resources, readiness barriers, and explicit deadlines rather than fixed sleeps. Never point mutation tests at a developer application database.

| Epic criterion / risk | Scenario and expected observation |
| --- | --- |
| Directory cutover | Frozen install, existing tests without assertion/fixture changes, OpenAPI smoke, and tracked-reference search pass with only path/import updates and no `apps/control-api` alias; a fresh subagent can approve autonomously |
| Independent listeners/processes | Start both entry points with different addresses/ports and unrelated working directories; Control API readiness calls the daemon over the selected HTTPS transport, not an imported app |
| Shared database, separate pools | Create a disposable database through `@rostrum/database/testing`, migrate explicitly, start both services, and confirm both schema probes succeed; closing one service's handle leaves the other's reads working |
| Database ownership | Create/publish through Control API, verify retrieval through a separately constructed shared-package handle, and confirm both service probes remain healthy; do not add daemon publication endpoints merely for this check |
| Authentication | File and environment token sets both work; daemon accepts old/new during overlap, Control API sends only the last token, retired tokens fail after reload, and unknown/malformed/combined credentials return 401 before dependency probes |
| Token-source validation | Missing/empty sources, conflicting environment selectors, invalid hex, odd-length/short values, and empty list entries fail boot; environment source selection overrides YAML as documented; a longer-than-32-byte valid token is accepted |
| Encrypted transport | Direct daemon TLS and HTTPS through a same-host reverse proxy work. With `NODE_EXTRA_CA_CERTS`, trusted certs succeed and wrong/untrusted/expired certs fail. No per-client CA override. `pg_stat_ssl` confirms encrypted connections from both database pools |
| Local exception containment | With the local flag enabled, reject a non-loopback daemon URL even when it is HTTPS. Reject production local-exception use, DNS/wildcard/LAN exceptions, exposed proxy-backend listeners, and remote plaintext database targets; forwarding headers and ambient forward proxies cannot bypass these rules |
| Invalid settings / fail fast | Bad field types, unknown YAML keys, missing explicit files or token source, invalid direct TLS material, conflicting database SSL options, and unsafe daemon URLs fail before service resource acquisition; a bind error unwinds promptly; known dependency failures return without waiting out the timeout |
| Liveness versus readiness | With Postgres unavailable, each process still returns health 200 and readiness 503; restoring it returns readiness to 200 without restart. An unmigrated database remains unready. If one Control API dependency fails while the other stalls, return the known failure immediately, omit/cancel the unfinished check, and do not wait for its timeout |
| Daemon dependency failures | Stop daemon, send its newest unknown token, use untrusted platform CA material, stall its response/body, or return invalid JSON; Control API reports the correct code within its deadline, with no retry/fallback to older tokens or leaked upstream data |
| Authoring isolation | With daemon stopped but Postgres available, existing Control API draft/publication operations still work even though overall readiness is 503 |
| Independent graceful shutdown | Hold multiple admitted requests behind barriers, signal one process, release requests within the deadline, observe responses finish and exit 0; the other process and shared database remain usable |
| Forced shutdown | Leave a request/probe/resource closure blocked past the deadline; observe bounded nonzero exit, no double close on repeated signals, and the peer still available |
| Offline tooling | Generate both OpenAPI documents without daemon/database connectivity or production credentials; checked-in artifacts match served documents; private daemon security is documented only in its contract |
| No credential leakage | Inspect captured startup, auth, TLS, dependency, and shutdown diagnostics for fixture secrets and connection credentials; none appear |
| SIGHUP token rotation | Append a new daemon token, reload daemon, then reload the Control API with that token last; new requests use it while admitted requests finish. Remove the old token and reload daemon; it is rejected on subsequent keep-alive requests without a process restart |
| SIGHUP configuration cutover | Change YAML client URL/logging/timeouts and separately listener/TLS/database settings; each valid candidate takes effect as documented. Invalid or unreadable candidates retain the complete old configuration/token set, without partial updates. Test same-address rebind, bind failure/restoration, repeated SIGHUP, and shutdown taking priority |
| Runtime trust boundary | Fresh processes inherit `NODE_EXTRA_CA_CERTS` for both fetch and database TLS; no claim that SIGHUP reloads runtime CA trust or startup environment values |

Keep permanent regression tests for security bypasses, token-source precedence and rotation, reload atomicity, readiness transitions, deadline cancellation, and resource ownership. Do not add tests that only pin log prose, copy fields, or assert imports. Reuse disposable Postgres support and add only narrow TLS needs. Use a temporary real-process smoke driver and same-host TLS proxy for focused acceptance, recording commands/results before cleanup; do not build the Epic 6 fixture catalog or reusable separate-network harness. Every agent reviewer starts fresh without implementation-session context, as specified under Decisions.

For focused non-loopback evidence, run the same executables on two provisioned private hosts or isolated network namespaces/containers with independently provisioned config/TLS/token files and a third Postgres target. Observe authenticated HTTPS, each database connection, failure transitions, and independent shutdown. Record actual addresses and certificate SANs without secrets. If only loopback execution is available, record that limitation; remote-boundary acceptance remains open until non-loopback evidence exists. Epic 6 will make this environment reusable.

## Discoveries

- **2026-09-11 — Bun runtime evidence.** A disposable Bun 1.4.0 process served TLS using a generated certificate. Fetch with the trusted certificate and matching hostname returned 200. An untrusted certificate failed with `DEPTH_ZERO_SELF_SIGNED_CERT`; the trusted certificate at a mismatched hostname failed with `ERR_TLS_CERT_ALTNAME_INVALID`. A separate held HTTP request completed after `stop(false)` was requested, and the stop promise resolved only after release. The probe exited 0. This tests runtime primitives, not Rostrum's unimplemented boundary.
- **Shutdown documentation must follow behavior.** Existing `stop(true)` is forced closure; it is not a graceful drain. Bun's idle timeout is also not an overall request or shutdown deadline. Observed during checkpoint 1: the entry point logs `shutdown started` on SIGTERM and exits 0, but never logs the `shutdown complete` line the root README documents.
- **2026-09-11 — Committed lockfile was already out of sync.** Root `package.json` declares a `trustedDependencies` list that the committed `bun.lock` omitted. The first sanctioned `bun install` during checkpoint 1 rewrote the lockfile to include it alongside the required workspace-path change. This is pre-existing drift, not a consequence of the directory move.
- **2026-09-11 — Drain escalation evidence.** A second Bun 1.4.0 probe used a one-second idle timeout and a held request. `server.timeout(request, 0)` kept it open beyond that timeout during `stop(false)`; a subsequent `stop(true)` terminated the client connection. Both stop promises settled after the held handler was released, and the probe exited 0. This supports request-specific idle suppression and connection escalation, not an assumption that forced closure settles arbitrary handler code.
- **Configuration errors can currently disappear.** Unknown YAML keys are omitted before schema checking, and an explicitly selected nonexistent config file is treated as optional. Security configuration must not preserve these behaviors.
- **Offline schema construction is coupled to runtime composition.** Existing OpenAPI generation builds the app and its lazy database service. Requiring runtime credentials without separating composition would break tooling unnecessarily.
- **Publication semantics remain unchanged.** The specification's publishing section contains shorthand `sha256(retrieved) == digest`, while its detailed digest section excludes metadata. Reuse the existing repository integrity check; do not implement a new raw-text hash in this Epic.
- **Pinned driver differences matter.** Source inspection of postgres.js 3.4.9 confirmed insecure SSL modes, explicit-option precedence, and first-call shutdown timeout ownership. The installed kysely-postgres-js 4.0.0 distinguishes postgres.js from Bun SQL; running postgres.js inside Bun does not enable abortable pool reservation. These are implementation constraints, not runtime database acceptance evidence.
- **PR #9 review — Platform trust evidence.** A disposable Bun 1.4.0 TLS server and fresh client processes exercised `NODE_EXTRA_CA_CERTS` without per-client CA options. Both `fetch` and `node:tls` accepted the trusted certificate, rejected the same certificate without extra trust (`DEPTH_ZERO_SELF_SIGNED_CERT`), and rejected a hostname mismatch even with trust (`ERR_TLS_CERT_ALTNAME_INVALID`). The probe exited 0. This confirms the runtime mechanism, not the future Rostrum or Postgres integration.
- **PR #9 review — Reload limitation.** Installed Bun server types describe `Server.reload()` as handler replacement and explicitly say host/port changes have no effect. File-based application configuration reload therefore needs explicit resource replacement; it must not be described as a single native reload call. Runtime CA/environment changes remain process-restart operations.

Primary runtime references consulted: [Bun server lifecycle](https://bun.sh/docs/runtime/http/server#server-stop), [Bun server TLS](https://bun.sh/docs/runtime/http/tls), [Bun fetch TLS and cancellation](https://bun.sh/docs/runtime/networking/fetch), [Node extra CA startup semantics](https://nodejs.org/api/cli.html#node_extra_ca_certsfile), [postgres.js](https://github.com/porsager/postgres), [kysely-postgres-js](https://github.com/kysely-org/kysely-postgres-js), and [PostgreSQL certificate-verification rationale](https://www.postgresql.org/docs/current/libpq-ssl.html). Bun extra-CA support was exercised directly; driver findings were checked against installed source rather than inferred from libpq documentation.

## Decision log

| Date | Decision | Rationale / approval state |
| --- | --- | --- |
| 2026-09-11 | One plan covers this Epic | Directory placement, transport, pool ownership, and lifecycle must integrate into one independently verifiable boundary |
| PR #9 review | Direct or reverse-proxy HTTPS; runtime additional CA trust | [Owner's transport decision](https://github.com/RostrumAI/rostrum-dev-docs/pull/9#discussion_r3994469437); proxy mode does not relax the Control API's HTTPS requirement |
| 2026-09-11 | Use readiness as the first real service call | Exercises transport and independent dependencies without taking run execution from Epic 2 |
| 2026-09-11 | Preserve public liveness and authoring isolation | A daemon outage is not proof that the Control API process or its authoring capability is dead |
| 2026-09-11 | Do not add automatic retries | Epic 2 has no invocation idempotency; a transport helper must not later duplicate accepted runs |
| 2026-09-11 | Keep remote environment automation in Epic 6 | Focused real-process/security evidence belongs here; reusable conformance infrastructure does not |
| PR #9 review | File/environment token lists, newest-token selection, and SIGHUP | [Owner's token decision](https://github.com/RostrumAI/rostrum-dev-docs/pull/9#discussion_r3994518190); ordering, source precedence, and reload failure behavior are explicit above |
| PR #9 review | Fail invalid configuration before resource acquisition | [Owner's fail-fast reminder](https://github.com/RostrumAI/rostrum-dev-docs/pull/9#discussion_r3994519967); no retries or grace period for a known failure |
| PR #9 review | Name the shared package `server` | [Owner's package-name decision](https://github.com/RostrumAI/rostrum-dev-docs/pull/9#discussion_r3994531445); all proposed paths/import names use `packages/server` / `@rostrum/server` |
| PR #9 review | Autonomous path-only cutover and fresh-subagent reviews | [Owner's review decision](https://github.com/RostrumAI/rostrum-dev-docs/pull/9#discussion_r3994534174); existing tests retain behavior, and agent reviewers receive no implementation-session context |

## Outcome

Planning deliverable only. The repository and primary runtime documentation have been researched; Bun TLS/drain and platform-CA experiments passed. The owner's five PR review comments are incorporated into the transport, token/reload, fail-fast, package-name, and review contracts. No runtime implementation, database migration, workflow behavior change, or Epic acceptance is claimed. Remaining detailed lifecycle review, implementation checkpoints, actual postgres.js TLS/probe evidence, and real two-service acceptance are future work.

The initial plan underwent independent security and coverage review; its authentication-before-drain, executable-checkpoint, and idle-timeout findings were addressed. Two newly spawned subagents independently reviewed the PR revisions against the owner's comments: the security review reported no remaining findings, and the coverage review confirmed all five comments and all Epic acceptance criteria are represented. Documentation Markdown lint and relative-link checks passed across 26 Markdown files. These checks and runtime primitive experiments do not count as Epic acceptance.
