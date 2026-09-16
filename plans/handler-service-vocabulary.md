# Rename the service framework vocabulary and split the application tiers

Epic: none. This work amends the framework contract delivered under [M2 Epic 1: Establish the daemon network boundary](../epics/m2/1-establish-daemon-network-boundary.md). The governing design record is [Restart-only server framework](../research/restart-only-server-framework.md).

Status: Proposed. The tier vocabulary, the `handlers/` folder name, and the intent to apply the rename across all code and documents are owner-approved (2026-09-15). The decisions marked below still need owner sign-off before dependent work begins.
Owner: Implementing agent.
Last researched: 2026-09-15.

## Purpose

Give the framework and both applications a vocabulary where each word means one thing, so a reader can tell a route declaration from the logic behind it from the transport that binds them.

| Word | Meaning it takes | Where it lives |
| --- | --- | --- |
| **service** | the running backend process — control-api, daemon | `@rostrum/server/lifecycle`: `OpenedService`, `ServiceRuntimeConfig`; `apis/control-api/src/control-api.ts`, `apis/daemon/src/daemon.ts` |
| **services/** | an application's business logic | `apis/*/src/services/<area>/` |
| **handler** | one declared operation: method, path, request schemas, OpenAPI metadata, documented responses, and the function it declares | `apis/*/src/handlers/<area>/<verb>.ts` |
| **http/** | transport wiring: the branded application, the static route table, the builder, the tag vocabulary | `apis/*/src/http/` |

Today `service` carries the framework's route-module meaning (`createServiceBuilder`, `ServiceBodyDecoder`, `apis/*/src/services/**`) and the process meaning (`OpenedService`) at once, and the Control API's workflow domain logic sits in a root folder (`src/workflows/`) whose name states no tier. That is the ambiguity this plan removes.

Observable outcomes:

- A new endpoint is added by creating `apis/control-api/src/handlers/<area>/<verb>.ts` and registering it in `apis/control-api/src/http/routes.ts`; nothing else moves.
- Business logic for that area lives in `apis/control-api/src/services/<area>/` and is reached through the handler's context, never by import.
- The review skill's route-module rules cover `handlers/**`, so a new handler is reviewed under the same rules it would have been reviewed under in `services/**`.
- No route, status code, error code, schema, operation id, or generated contract changes: both `openapi.json` artifacts stay byte-identical.

## Current repository state

`@rostrum/server` (the framework) owns the vocabulary:

- `src/service.ts` declares the whole route vocabulary: `createServiceBuilder`, `ServiceBuilder`, `ServiceDefinition`, `ServiceBinding`, `ServiceBinder`, `ServiceRequest`, `ServiceResponse`, `ServiceContext`, `ServiceHandler`, `ServiceResponseDefinition`, `ServiceOpenApiDefinition`, `ServiceRequestDefinition`, `SERVICE_METHODS`, `ServiceMethod`, and `BODY_METHODS`.
- `src/app.ts` owns `registerService`, `createServiceRegistrar`, and eleven `service conflict` startup error messages, most of which name the route as `<METHOD> <path>`.
- `src/request.ts` owns `ServiceBodyDecoder`, `ServiceBodyResult`, `serviceErrorBody`, and `decodeJsonBody`.
- `src/lifecycle.ts` owns `ServiceRuntimeConfig` and `OpenedService`, which mean the running process and are **not** part of this rename.
- Tests and fixtures: `service.test.ts`, `service.type.fixture.ts`, `app.test.ts`, `request.test.ts`.
- `package.json` publishes the subpath `./service`.

The Control API holds three tiers in one `src/`:

- Route modules: `src/services/system/{health,readiness}.ts`, `src/services/workflows/{create,create.schema,publish,retrieve-draft,retrieve-publication,retrieve-revision,rewind,save,save.schema,validate}.ts`.
- Workflow domain and boundary modules: `src/workflows/{service,schemas,errors,request-body,rule-sets}.ts` and `errors.test.ts`. `service.ts` is the only business logic; `schemas.ts`, `errors.ts`, and `request-body.ts` are HTTP-boundary modules (response shapes, status mapping, the `ServiceBodyDecoder` implementation); `rule-sets.ts` is process-wide wiring.
- Transport wiring at the root: `src/{app,routes,define,tags}.ts`, plus `src/schemas.ts` (app-wide error shape), `src/config.ts`, `src/control-api.ts` (process composition), `src/index.ts`, and `src/daemon/client.ts`.

The daemon holds route modules at `src/services/system/{health,readiness}.ts` and transport wiring at `src/{app,routes,tags}.ts`; it has no business-logic tier.

Both manifests pin an application entry point: `"exports": "./src/app.ts"`. `apis/*/src/scripts/generate-openapi.ts` import that module by relative path.

The governance text that must move with the code:

- `.github/skills/code-review/rules/repository-conventions.md`: the section-2 preamble ("A service module under `src/services/` …"), nine rules scoped to `apps/**/src/services/**` / `apis/**/src/services/**` (`REPO-SLICE-01`, `-02`, `REPO-SCHEMA-03`, `-05`, `REPO-TYPE-01`, `REPO-CONTRACT-03`, `-04`, `-05`, `-06`), and the `REPO-TEST-03` flag wording. Evidence citations are historical and stay as written.
- `scripts/review/lenses.ts`: the security lens activates on `(?:features|services)` under `apis/*/src/`; `scripts/review/lenses.test.ts` asserts that for `services/workflows/create.ts` and the retired `features/` layout.
- `README.md` (§Routes): "Each route is one service module under `apis/control-api/src/services/`" and the nearby "typed service builder, the registrar" sentence.
- `dev-docs/research/restart-only-server-framework.md`: the terminology line, the delivered-surface list, and the target-API examples.

No CI workflow, manifest, lockfile, `biome.json`, or script outside the two files above names a `src/services` path (`.github/workflows/ci.yml` runs workspace-level commands only).

## Scope

Included: the framework symbol rename; the file and folder moves in both applications; the review-skill rule text, rule scopes, lens activation, and the lens tests; the root `README.md`; the framework research record; a decision record for the vocabulary; the verification sweep.

Excluded:

- `ServiceRuntimeConfig` and `OpenedService` (the process meaning) and every call site that names them.
- Any behavior change: routes, status codes, error codes, schema shapes, operation ids, OpenAPI output, tags, or logging.
- `@rostrum/workflow`, `@rostrum/database`, and `packages/server`'s config, network, protocol, readiness, tokens, logger, and lifecycle modules.
- A business-logic tier for the daemon, which has no business logic to place.
- Historical records: `dev-docs/plans/m2-epic-1-daemon-network-boundary.md` and the review rules' evidence citations keep the paths they recorded, matching how the rules file already treats pre-move `apps/control-api/...` paths.

## Decisions

**D1 — Tier vocabulary.** `services/` is business logic, `handlers/` is one declared handler per module, `http/` is transport wiring. *Owner-approved.*

**D2 — The declared value is a handler.** Framework types take the `Handler` prefix; the function member stays `handler`; `ServiceHandler` (the function type) becomes plain `Handler`, because `HandlerHandler` is unusable. The registration file stays `src/http/routes.ts` (plural), not `route.ts`. *Owner-approved; the plural name deviates from the sketch and is called out here deliberately.*

**D3 — The framework module is `handler.ts`.** `packages/server/src/service.ts` becomes `handler.ts` and the published subpath `./service` becomes `./handler`. *Needs owner sign-off; the alternative is to keep the file name and rename only its declarations, which leaves the export subpath naming the old concept.*

**D4 — `FindingSchema` moves to the business-logic tier.** `src/workflows/schemas.ts` splits: `FindingSchema` (domain vocabulary from `@rostrum/workflow`) to `services/workflows/schemas.ts`; id patterns, path-parameter schemas, request and response shapes, and `revisionResponse` to `handlers/workflows/schemas.ts`. `src/schemas.ts` and `handlers/workflows/schemas.ts` then both import the domain schema, which follows `REPO-SCHEMA-01`'s "a domain-wide schema lives in the domain area". *Needs owner sign-off; the alternative is one `handlers/workflows/schemas.ts` that the app-wide `src/schemas.ts` imports from, which is fewer files but has the app root reach into a handler area.*

**D5 — The security lens keeps matching the retired layouts.** `scripts/review/lenses.ts` adds `handlers` to `(?:features|services)` rather than replacing it, so a historical diff still reviews the same way. Accepted consequence: business-logic files under the new `services/**` also activate the security lens. *Needs owner sign-off; the alternative is `(?:features|handlers)`, which under-triggers on unchanged historical diffs.*

**D6 — Historical paths are not rewritten.** Governance text (rules, `README.md`, the research record, the new decision record) is updated; delivered records and evidence citations are not.

## Progress

Plan pull request: [#17](https://github.com/RostrumAI/rostrum-dev-docs/pull/17).

- [ ] Checkpoint 1: framework vocabulary renamed, applications compile against it.
- [ ] Checkpoint 2: application tiers split.
- [ ] Checkpoint 3: review skill and documentation consistent with the delivered layout.
- [ ] Checkpoint 4: verification sweep and Epic-level evidence.

## Checkpoints

### Checkpoint 1: the framework speaks one vocabulary

Owner: Implementing agent. Reviewer: a fresh framework/API subagent; no human gate.

Rename in `packages/server/src/`: `service.ts` → `handler.ts`; `SERVICE_METHODS` → `HANDLER_METHODS`, `ServiceMethod` → `HandlerMethod`, `ServiceRequest` → `HandlerRequest`, `ServiceResponse` → `HandlerResponse`, `ServiceContext` → `HandlerContext`, `ServiceHandler` → `Handler`, `ServiceResponseDefinition` → `HandlerResponseDefinition`, `ServiceOpenApiDefinition` → `HandlerOpenApiDefinition`, `ServiceRequestDefinition` → `HandlerRequestDefinition`, `ServiceBinder` → `HandlerBinder`, `ServiceBinding` → `HandlerBinding`, `ServiceDefinition` → `HandlerDefinition`, `ServiceDefinitionInput` → `HandlerDefinitionInput`, `ServiceBuilder` → `HandlerBuilder`, `createServiceBuilder` → `createHandlerBuilder`; `app.ts`: `registerService` → `registerHandler`, `createServiceRegistrar` → `createHandlerRegistrar`, `service conflict …` → `handler conflict …`; `request.ts`: `ServiceBodyDecoder` → `HandlerBodyDecoder`, `ServiceBodyResult` → `HandlerBodyResult`, `serviceErrorBody` → `handlerErrorBody`. `BODY_METHODS`, `DecodedBody`, `decodeJsonBody`, `validatePathParameters`, and the lifecycle names are unchanged.

Update the call sites in the same commit so the tree compiles: `apis/control-api/src/define.ts` (`defineControlService` → `defineControlHandler`), `apis/control-api/src/routes.ts` and `apis/daemon/src/routes.ts` (registrar), every route module, and `apis/control-api/src/workflows/request-body.ts`. Rename `packages/server/src/service.test.ts` → `handler.test.ts` and `service.type.fixture.ts` → `handler.type.fixture.ts`, and update `packages/server/package.json`.

Acceptance: `bun run check`, `bun run lint`, `bun test`, `bun run --filter @rostrum/daemon smoke`, and `git diff --exit-code apis/control-api/openapi.json apis/daemon/openapi.json`. Use language-server renames and reference lookups for the symbol work; the file moves in this checkpoint are a plain `git mv`.

Recovery: one revertible commit; no data, contract, or configuration state changes.

### Checkpoint 2: the applications state their tiers

Owner: Implementing agent. Reviewer: a fresh repository/tooling subagent.

Control API moves: `src/{app,routes,define,tags}.ts` → `src/http/`; `src/services/{system,workflows}` → `src/handlers/{system,workflows}`; `src/workflows/service.ts` → `src/services/workflows/workflow-service.ts`; `src/workflows/rule-sets.ts` → `src/services/workflows/rule-sets.ts`; `src/workflows/{errors.ts,request-body.ts,errors.test.ts}` → `src/handlers/workflows/`; `src/workflows/schemas.ts` splits per D4. `src/config.ts`, `src/control-api.ts`, `src/index.ts`, `src/schemas.ts`, `src/daemon/`, `src/scripts/`, and `src/boundary.test.ts` stay put.

Daemon moves: `src/{app,routes,tags}.ts` → `src/http/`; `src/services/system/` → `src/handlers/system/`. `src/{config,daemon,auth,index}.ts`, `src/scripts/`, and `src/boundary.test.ts` stay put.

Both manifests' `exports` change to `./src/http/app.ts`; `apis/*/src/scripts/generate-openapi.ts` and any test importing the app by relative path follow. Comments and `@fileoverview` text that names a moved tier change with it; no path may be cited in a comment (`REPO-DOC-04`).

Acceptance: the Checkpoint 1 commands, plus `bun run --filter @rostrum/control-api smoke` and `bun run --filter @rostrum/control-api generate-openapi`; both contracts still byte-identical, which proves the moves changed no observed behavior.

### Checkpoint 3: the review skill and the documents agree

Owner: Implementing agent. Reviewer: a fresh subagent reading the rules, the lens code, and the delivered tree.

- `rules/repository-conventions.md`: rewrite the section-2 preamble, re-scope the nine rules to `handlers/**`, and update rule titles and flags (`REPO-SLICE-01` "one handler per module", `REPO-SLICE-02` "inject dependencies through the handler's context", `REPO-SLICE-04` "services and handlers", `REPO-TEST-03`'s "a new handler module"). Rule ids stay stable. State the retained process meaning of *service* where the preamble defines the tiers. Evidence citations are untouched.
- `scripts/review/lenses.ts` and `lenses.test.ts` per D5: the regex accepts `handlers`, the existing cases for `services/…` and `features/…` stay, and a case asserts a `handlers/…` path activates the security lens.
- `README.md` §Routes: the paragraph becomes handler-based, and the framework sentence names the handler builder and the registrar.
- `dev-docs/research/restart-only-server-framework.md`: the terminology line becomes "declared operations are **handlers**; an application's business logic lives under `src/services/`", the delivered-surface list and target-API examples use the new names, and the file records the change as a follow-up.
- New `dev-docs/decisions/handler-service-vocabulary.md`: the durable decision, the retained process meaning, and the tier table, so a later reader does not have to reconstruct it from the rules file.

Acceptance: `bun run lint`, `bun test scripts/review`, and the dev-docs repository's own Markdown and relative-link checks.

### Checkpoint 4: verification sweep

Owner: Implementing agent. Reviewer: independent subagent, then human owner.

Run the full gate set from a clean worktree, run the residual scans in [Verification](#verification), regenerate both contracts, and record exact commands and results in this plan. Confirm that a `git grep` for every retired identifier returns only historical citations.

## Implementation approach

Work in a worktree so `main` and the shared checkout stay untouched while the rename lands in reviewable commits:

```sh
git worktree add ../rostrum-handler-vocabulary -b refactor/handler-service-vocabulary
cd ../rostrum-handler-vocabulary
bun install
```

`bun install` re-links the workspace packages. `dev-docs/` is an ignored nested checkout and is absent from a new worktree: run `bun run docs:setup` there if the documentation checkpoints run in the worktree, or make those edits in the existing checkout. Documentation commits are made and pushed from inside the `dev-docs` checkout, on a branch stacked on `docs/restart-only-delivery`, because the research record this plan amends is delivered there and not yet on `main`.

Sequence: Checkpoint 1 renames symbols only. Checkpoint 2 moves files only, so a reviewer can read a pure-move diff. Checkpoint 3 carries the governance text, which cannot be true until Checkpoints 1 and 2 have landed. Each checkpoint is one pull request, stacked the way the #52–#56 sweep was.

Dependency direction after the split, which the moves must not violate: `http/` → `handlers/` → `services/` → `daemon/`. A handler reaches business logic only through `context`, never by importing a module from `src/services/`; the app root keeps `config.ts`, `control-api.ts` (which composes the database handle, the service instance, and readiness), `schemas.ts`, and `index.ts`.

Test files move with their subjects and keep their names, so `REPO-TEST-10` (colocated tests) and `REPO-TEST-03` (a new source file owes a test) stay satisfied. No source file is added or deleted by the moves, so the coverage rule has nothing new to reach.

## Verification

Run from the worktree root unless a command says otherwise.

| Check | Command | Expected |
| --- | --- | --- |
| Frozen install | `bun install --frozen-lockfile` | exit 0, no lockfile rewrite |
| Typecheck | `bun run check` | exit 0 for every workspace and `tsconfig.scripts.json` |
| Lint | `bun run lint` | clean |
| Tests | `bun test` | all pass; count unchanged from the pre-change baseline |
| Control API boot | `bun run --filter @rostrum/control-api smoke` | exit 0 |
| Daemon boot | `bun run --filter @rostrum/daemon smoke` | exit 0 |
| Contract parity | `bun run --filter @rostrum/control-api generate-openapi && bun run --filter @rostrum/daemon generate-openapi && git diff --exit-code apis/control-api/openapi.json apis/daemon/openapi.json` | no diff |
| Retired identifiers | `git grep -nE 'createServiceBuilder\|defineControlService\|createServiceRegistrar\|ServiceBodyDecoder\|ServiceBodyResult\|ServiceBuilder\|ServiceDefinition\|ServiceDefinitionInput\|ServiceBinding\|ServiceBinder\|ServiceHandler\|ServiceRequest\|ServiceResponse\|ServiceContext\|ServiceOpenApiDefinition\|ServiceRequestDefinition\|ServiceResponseDefinition\|SERVICE_METHODS\|serviceErrorBody\|registerService\|service conflict'` | only historical citations in rules evidence and delivered records |
| Retained process meaning | `git grep -n 'OpenedService\|ServiceRuntimeConfig'` | only `packages/server/src/lifecycle.ts`, `apis/control-api/src/control-api.ts`, `apis/daemon/src/daemon.ts` |
| Tier placement | `glob 'apis/*/src/{http,handlers,services}/**/*.ts'` | every route module under `handlers/`, every business-logic module under `services/`, transport wiring under `http/` |
| Lens selection | `bun test scripts/review` | passes, including the new `handlers/` case |
| Review dry run | `bun run review --since origin/main --dry-run-rules` | no findings |
| Documentation | `node scripts/check-links.mjs` in the `dev-docs` checkout, plus its Markdown check | passes |

The two-process run from M2 Epic 1 (Control API plus daemon against one disposable database, readiness aggregation, SIGTERM exit) is not repeated here unless a move changed a boot path; Checkpoints 1 and 2 keep both applications runnable, which the smokes prove.

## Discoveries

None yet.

## Decision log

- 2026-09-15 — Tier vocabulary, `handlers/` folder, and applying the rename across all code and documents approved in session.
- 2026-09-15 — `ServiceHandler` cannot take the `Handler` prefix; the function type becomes plain `Handler`.

## Outcome

Pending.
