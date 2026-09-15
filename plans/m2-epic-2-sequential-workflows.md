# Implement sequential workflow execution

Epic: [M2 Epic 2: Execute sequential workflows](../epics/m2/2-execute-sequential-workflows.md)

Status: Proposed implementation plan; execution implementation has not started.
Owner: Implementing agent. Public contracts, compatibility, and lifecycle changes require the reviews below.
Last researched: 2026-09-14, against implementation commit [`c6bbcea`](https://github.com/RostrumAI/rostrum/commit/c6bbcea028769490266aee206eb9e65a6971acfe).

## Purpose

Make an immutable workflow publication executable through the Control API. A caller receives a run ID without waiting for completion, disconnects, and later retrieves that run's step outcomes, final result, or failures. Several invocations of the same publication can be active independently.

The first complete example adds a surcharge to an amount, divides the total between people, and returns both values through an explicit `result` step. Division by zero fails that run without affecting another invocation. The same document and expected outcome must work directly through the runtime and through both services.

Governing context: [product strategy](../strategy/product-strategy.md#48-control-api-and-service-boundary), [roadmap](../strategy/product-roadmap.md#3-delivery-milestones), [M2 overview](../epics/m2/overview.md), [workflow format v1](../specifications/workflow-interface-v1.md), [delivery methodology](../epic-delivery-methodology.md), and [plan format](../epic-implementation-plan-format.md). The [Epic 1 handoff](m2-epic-1-daemon-network-boundary.md#http-contract-and-epic-2-seam) establishes transport and resource ownership, not run schemas. No separate durable decision record governs this work at the research revision.

## Current repository state

These observations describe the implementation revision above, not Epic 1's historical pre-relocation table.

| Area | Observed implementation | Consequence |
| --- | --- | --- |
| Services | `apis/control-api` and `apis/daemon` run independently through `packages/server`; the daemon serves health and readiness only | Extend the shipped boundary; do not rebuild service configuration or move workspaces again |
| HTTP features | `route`, `schema`, and `createHandler` modules are discovered under each service's `src/features`; both generate OpenAPI | Add real run features through this loader and regenerate both contracts |
| Daemon client | `apis/control-api/src/daemon/client.ts` uses direct Node HTTP/HTTPS requests, newest-token authentication, no redirects, and a 64 KiB readiness-body limit | Reuse the transport pattern, but distinguish run bodies and domain failures from readiness responses |
| Publication read | `WorkflowRepository.getPublication(workflowId, publicationNumber)` returns the exact publication after checking canonical text and recomputed digest | Reuse it; integrity verification is not a second implementation of format validation |
| Workflow validation | `createWorkflowValidator()`, `WorkflowGraph`, `isReferenceObject`, `STEP_REF_PATTERN`, findings, and JSON Pointer escaping are already shared | Reuse the frozen rules and reference interpretation; add execution preparation separately |
| Step catalog | v1 registers `task` and `result`. A present task config requires a string `operation`, but an absent config and unknown operation names remain publishable | The daemon must reject unsupported execution before allocating a run; do not tighten v1 publication validation |
| Value schemas | Workflow input and step output declarations are currently opaque values in `schema.ts`; there is no runtime fragment validation | Validate the schemas themselves, then validate invocation values and completed outputs |
| Schema evaluator | Locked `typebox@1.3.14` already compiles native JSON Schema; `typebox/compile` is the existing convention | Use it rather than adding Ajv. Successful compilation alone does not prove that a fragment is a valid schema |
| References | Stage 7 interprets whole binding values, not recursively nested literal contents. Names after `inputs.` and after a step ID are flat keys, including dots | A runtime must not introduce object-path traversal or recursive interpolation |
| Execution | No handler registry, run model, engine, or run store exists | Add a small pure execution package and one daemon-owned manager |
| Reload lifetime | `runService` replaces configuration-owned `Dependencies` on database-identity changes and closes retired dependencies | A run manager inside that ownership boundary would be discarded by SIGHUP; execution must have process lifetime |
| Shutdown | `ServiceDependencies` exposes only `close`; shared shutdown waits for HTTP, not detached accepted work | Introduce an explicit accepted-work drain hook under the existing shutdown deadline |
| Signals | Daemon services receive the lifecycle signal; the Control API entry point currently drops it | Carry request/deadline signals to outbound calls, never into accepted run lifetime |
| Fixtures | Publishable documents live under `packages/workflow/src/fixtures`; valid fixtures have an exact digest-vector ledger | Keep format fixtures intact. Put executable scenarios beside the runtime; fix stale specification fixture links when updating that specification |

Source entry points: [workflow exports](https://github.com/RostrumAI/rostrum/blob/c6bbcea/packages/workflow/src/index.ts), [v1 registry](https://github.com/RostrumAI/rostrum/blob/c6bbcea/packages/workflow/src/rules/v1.ts), [reference validation](https://github.com/RostrumAI/rostrum/blob/c6bbcea/packages/workflow/src/validation/stages/references-stage.ts), [publication retrieval](https://github.com/RostrumAI/rostrum/blob/c6bbcea/packages/database/src/repositories/workflow-repository.ts), [daemon composition](https://github.com/RostrumAI/rostrum/blob/c6bbcea/apis/daemon/src/services.ts), [client transport](https://github.com/RostrumAI/rostrum/blob/c6bbcea/apis/control-api/src/daemon/client.ts), and [service lifecycle](https://github.com/RostrumAI/rostrum/blob/c6bbcea/packages/server/src/lifecycle.ts).

## Scope

Include publication-bound admission, deterministic task handlers, sequential execution, independent concurrent runs, complete in-memory observation, validated data handoff, explicit result completion, and real Control API/daemon integration. Extend reload and shutdown only as required to preserve accepted work and the Epic 1 lifetime contract.

Exclude conditional execution, parallel paths within a run, joins, loops, configurable worker capacity and fairness, persistent run records, recovery, invocation idempotency, retries, subscriptions, waits, cancellation, side effects, scripts, model calls, and a general operation/plugin framework. [Epic 4](../epics/m2/4-execute-parallel-paths-and-joins.md) owns shared worker capacity and fairness. [M3](../epics/m3/overview.md) owns durability and human control. Do not create run tables or a second top-level workflow output schema.

## Decisions

The Epic and Epic 1 already decide publication selection, daemon ownership, private authenticated transport, independent runs, and in-memory-only retention. Do not reopen those choices. The following new contracts are proposals for review in this plan's PR; implementation checkpoint 1 records their approval or amendments before dependent work begins.

1. **One pure runtime, one daemon manager.** Add `packages/runtime` (`@rostrum/runtime`) for execution preparation, handlers, binding, and per-run transitions. The daemon supplies verified publications and owns run IDs, the run map, admission, and process lifetime. The Control API translates commands and observations; it never advances a workflow.
2. **Freeze the run seam first.** Use `POST /api/runs` and `GET /api/runs/:runId` on both services. The private daemon routes require the existing bearer authentication. The public request names `workflowId`, `publicationNumber`, and `inputs`; no workflow document, digest selector, latest-publication alias, or runtime-version selector is accepted.
3. **Separate publication validity from execution support.** Keep the v1 document schema, registry, findings, and digest rules unchanged. Invocation preparation rejects unsupported constructs, operation configurations, or schema capabilities without making those publications invalid. A future change to accepted documents or already-established execution meaning must follow the specification's versioning rules.
4. **Start with three deterministic operations.** Support `greet`, `add`, and `divide` under `task.config.operation`. They cover the existing greeting example, an optional handler input, inter-step data flow, and a natural execution failure. Handlers return data or a typed failure; they cannot choose successors or declare workflow success.
5. **Make presence rules explicit without new workflow syntax.** Every name in the workflow's `inputs` map is required at invocation, and undeclared invocation names are rejected. Every name in a step's `outputs` map must be present in its successful output. Optional handler inputs are expressed by the handler contract, not a fabricated `optional` keyword in an author's JSON Schema. Nested object properties use normal JSON Schema `required` rules. These previously unstated execution rules require specification-owner approval.
6. **Preserve literal/reference boundaries.** Only an entire step-input binding with the exact reference-object shape resolves. Nested reference-shaped objects inside literals, or inside values returned by a reference, remain data. Flat names containing dots remain flat names. Clarify the specification's use of “always interpreted as a reference” to apply to binding positions, consistently with its validator.
7. **Accept independently of execution and client lifetime.** Admission is a synchronous commit after asynchronous preparation. It installs the run before acknowledging it and schedules execution independently. A disconnect or upstream timeout after that commit does not cancel the run; a lost acceptance response is ambiguous because idempotency and run listing are not in this Epic.
8. **Bound a complete observation and its data inputs.** Use a 1 MiB invocation-body limit, an 8 MiB complete run-snapshot limit, and a maximum of 128 object/array nesting levels for runtime values and author schema fragments. Cyclic schema-reference closures are unsupported by this first engine. These are release-level execution limits, not additions to v1 publication validation. Completed runs have no automatic expiry or eviction in M2. Aggregate retained memory still grows with the number of accepted runs; this is a documented local-M2 operating limitation, not a durability or retention service.

Required approval: the human owner and backend reviewer approve the run/error schemas, presence and result rules, operation names, and observation limits; the specification maintainer reviews compatibility and reference semantics; the concurrency/security reviewers approve process lifetime and transport integration. Unresolved changes to those contracts block their dependent checkpoint, not unrelated research. Do not call proposed choices implemented or approved merely because they appear here.

## Progress

- [x] Read governing documents and map current workflow, database, HTTP, and lifecycle seams.
- [x] Exercise the existing validator with the proposed workflow and compatibility edge cases; exercise the pinned schema evaluator.
- [x] Write this proposed plan. Planning evidence is recorded under Discoveries, not counted as Epic acceptance.
- [ ] Record contract approvals and complete checkpoint 1.
- [ ] Complete checkpoint 2: directly executable sequential runtime.
- [ ] Complete checkpoint 3: invocation and observation through both services.
- [ ] Complete checkpoint 4: independence, lifecycle, failure, and operator handoff evidence.

Record implementation PRs, changed decisions, exact verification commands, and remaining gaps here as work proceeds. Keep one owner for the engine transition code even when pure semantics and transport adapters are developed concurrently.

## Checkpoints

### Checkpoint 1: Execution and observation contracts are implementable

Owner: implementing agent. Reviewers: specification maintainer and backend/API reviewer; human owner approves the new contracts listed above.

Update the workflow specification's execution clarifications without changing its accepted-document rules. Add the runtime workspace, executable run/step/failure schemas, the closed operation definitions, and a publication-preparation API that checks execution support and compiles value schemas. Move shared finding/identifier wire schemas out of the Control API into the shared server package, updating every importer; do not leave compatibility re-exports. Add the offline JSON Schema meta-schema resources and provenance described below. No production run endpoint ships before it can execute a real run.

Acceptance: the worked document and existing minimum/greeting documents remain publishable; preparing a supported publication produces an immutable execution plan. Missing task config, unknown operations, unsupported control flow, malformed schema fragments, unresolved/cyclic schema resources, and excessive nesting are rejected before any run exists. Existing v1 documents and digest vectors do not change. Focused schema examples prove required/optional presence, `null`, no coercion, and 2020-12 array/object keywords. A string that fails an annotated `format: "email"` must still pass its string schema, while literal `format` members inside `const`/`enum` remain unchanged. Check the depth boundary and an evaluator throw explicitly.

Commands: `bun install --frozen-lockfile`, `bun run --filter @rostrum/runtime typecheck`, `bun test packages/runtime/src/prepare.test.ts packages/runtime/src/values.test.ts`, and existing workflow validator/digest checks. New runtime paths and commands in this plan are targets to implement, not commands available at the research revision.

Escalate any proposed tightening of `V1_RULE_SET`, change to an existing digest, unsupported required schema vocabulary, or need for a new workflow field. Recovery/handoff: record the approved DTOs, preparation result/error contract, operation schemas, supported schema capabilities, and compatibility evidence. This checkpoint has no listener, database migration, or placeholder execution route.

### Checkpoint 2: The same publication runs directly to a result

Owner: runtime implementer. Reviewer: fresh independent state-machine/data-flow reviewer.

Implement the binding resolver, output-validation boundary, per-run state machine, and built-in handlers. Add a direct-execution smoke command for the worked scenario and minimum/greeting examples. Use test-only injected handlers to hold work or return invalid output; do not add a production `sleep`, `hold`, or `fail` operation. Keep engine state out of the handler interface.

Acceptance: `{amount: 90, surcharge: 10, people: 4}` produces `{perPerson: 25, total: 100}`. Reordering the document's `steps` array changes neither execution nor result. Dividing by zero fails the divide step, leaves the result step unexecuted, and publishes no final output. Missing/invalid handler inputs and malformed handler outputs never reach dependent work. A single result-only document succeeds with `{}`. A held run does not block another invocation of the same prepared publication; each input and terminal outcome remains independent.

Commands: `bun test packages/runtime/src/bindings.test.ts packages/runtime/src/engine.test.ts`, then the proposed `bun run --filter @rostrum/runtime smoke`. Assert observable state and outputs, not exact microtask counts, implementation wiring, or error wording.

Escalate if the implementation needs workflow-array order, one global serial promise chain, handler-selected routing, or a second reference grammar. Recovery/handoff: record the compiled-plan/engine interface, state transition evidence, fixture documents, and direct-run results. The workspace remains directly runnable without either service or Postgres.

### Checkpoint 3: A caller can invoke and inspect a real run

Owner: daemon/Control API integrator. Reviewers: backend/API, database, and lifecycle reviewers.

Add both services' run feature slices and the daemon manager. Wire verified publication reads, request validation, upstream response validation, run-state schemas, and the process-lifetime drain hook. Resolve exported-symbol references before changing shared APIs. Regenerate both OpenAPI artifacts and retain offline generation and authenticated daemon contract parity.

Acceptance: create and publish through the existing Control API workflow endpoints, invoke the exact returned publication, receive 202, and retrieve the eventual 200 snapshot. An invalid invocation returns its documented non-2xx response, creates no run, and calls no handler. Integrity failures remain distinct from caller errors. Accepted runs use no further database reads and remain observable during a later database outage. The Control API does not read publications a second time to decide execution support.

Commands: `bun test apis/daemon/src/runs/manager.test.ts apis/daemon/src/features/runs apis/control-api/src/features/runs apis/control-api/src/daemon/client.test.ts`, both `generate-openapi` commands, and both existing service `smoke` commands. Add the proposed root `bun run smoke:sequential` command backed by `scripts/smoke-sequential.ts`; its first complete path must start the actual service entry points and use disposable Postgres.

Escalate if a transport timeout is presented as definitive rejection, a normal 404/422 becomes `daemon_invalid_response`, a run is tied to a request signal or retired database generation, or the implementation needs a runs table. Recovery/handoff: record schema/status examples, the exact admission point, process ownership, OpenAPI parity, and the real-service command. Revert coordinated runtime and API code together if necessary; no data rollback is required.

### Checkpoint 4: Independence and lifecycle are demonstrated

Owner: implementing agent. Reviewers: fresh independent acceptance reviewer and concurrency/security reviewer, then the human owner.

Complete the verification matrix below, including overlapping runs, a lost client connection, Control API restart, daemon reload with database dependency replacement, and graceful/forced daemon shutdown. Use deterministic barriers for transitions and real processes for lifecycle claims. No arbitrary sleeps may serve as proof of ordering. Check the observation-size boundary above the readiness cap.

Commands: `bun run smoke:sequential`; focused lifecycle tests in `packages/server/src/lifecycle.test.ts`, `packages/server/src/reload.test.ts`, and proposed `apis/daemon/src/runs/lifecycle.test.ts`; then run `bun run check`, `bun run lint`, `bun test`, and both service smoke commands once against the integrated branch. A loopback exercise is not separate-host evidence; Epic 6 owns that combined environment.

After those scenarios pass, update essential operator setup and generated API descriptions, record the focused evidence in this plan, and remove temporary scripts, credentials, certificates, and disposable resources. No cleanup may touch an existing developer database. Publish the executable scenario inputs/outcomes for Epic 6 without first creating its generic catalog framework. Run fresh-agent review before human acceptance.

Escalate every unproved Epic acceptance criterion. Recovery/handoff: include PRs, exact commands and results, known M2 state-loss and memory behavior, and the extension seam for Epics 3–5. Move durable contracts into the specification and code, then retire this plan under the documentation lifecycle only after the Epic is complete.

## Implementation approach

### Package boundaries and files

| Owner | Planned changes |
| --- | --- |
| `packages/runtime` | Add `src/contracts.ts` for domain schemas/types; `prepare.ts` for capability checks and immutable plans; `values.ts` plus bundled meta-schemas for value-schema checking; `operations.ts` for the three built-ins; `bindings.ts`; `engine.ts`; focused tests, fixtures, and `src/scripts/smoke.ts`. Export domain contracts separately so HTTP consumers do not construct an engine |
| `packages/workflow` | Reuse validator, graph, reference predicate/pattern, JSON parser, findings, and pointer escaping. If extracting a shared reference parser from stage 7, migrate its caller and preserve every existing accepted spelling; do not change frozen validation behavior |
| `packages/database` | Retain `WorkflowRepository.getPublication` and its integrity algorithm. No schema migration, run table, polling, or per-run database handle |
| `packages/server` | Add shared run HTTP schemas and move existing finding/identifier schema definitions here from the Control API. Keep readiness `BoundaryErrorSchema.findings` empty. Add the narrow accepted-work lifecycle hook; extend the existing transport helpers only where both call paths use them |
| `apis/daemon` | Add `src/runs/manager.ts`, `service.ts`, and `errors.ts`; add `src/features/runs/invoke.ts` and `retrieve.ts`; wire the shared parameter guard in `app.ts`; inject manager and publication reader through `services.ts` and process composition |
| `apis/control-api` | Add `src/features/runs/invoke.ts` and `retrieve.ts`; extend `src/daemon/client.ts` with typed invoke/get operations; carry request signal/configuration through `Services`; add `src/scripts/process.ts` to spawn the actual entry point for focused smoke/lifecycle checks; move only genuinely shared parsing/schema code rather than importing daemon implementation |
| Workspace/tooling | Add `@rostrum/runtime` and direct dependencies where imported, regenerate `bun.lock`, add runtime typecheck/smoke and root `smoke:sequential`, regenerate `apis/{daemon,control-api}/openapi.json` |

Dependency direction: runtime imports workflow and TypeBox, never database, server, Hono, or either API. Server's run protocol module imports runtime contracts. The daemon imports runtime, database, and server; the Control API consumes shared protocol/domain types, not engine instances. Do not place a live registry, database connection, or run map in a shared module singleton.

Before implementation edits, run `git branch --show-current` in the implementation repository and switch from `main` to a feature branch if necessary. Use language-server references before exported changes or moves. Preserve the repository's feature-module, TypeBox, error-envelope, TSDoc, and step-comment conventions.

### Invocation preparation and the admission point

Prepare each invocation in this order:

1. Authenticate on the private daemon boundary; apply the existing draining gate before reading a body. Parse bounded UTF-8 JSON with the shared strict parser and validate the request envelope. The Control API validates the envelope too; the daemon is authoritative.
2. Read exactly `(workflowId, publicationNumber)` through a repository borrowed from the admitted request's database generation. A missing row is 404. A digest or canonical-form failure is a storage-integrity error, never a caller's invalid workflow. Do not hash the full stored text directly: the existing digest excludes metadata.
3. Parse the verified canonical text once for execution. Verify the embedded workflow ID and declared format agree with the addressed publication metadata, and select the exact known format rule set before revalidation; an unsupported format is a 422 capability rejection. Then call `validateDocument` on that parsed value. Do not borrow the Control API's process singleton or silently fall back. Integrity verification proves bytes, not valid graph semantics.
4. Check execution capabilities and compile the schemas, bindings, and sequential chain. The initial implementation need not add a cross-run compilation cache; retain one prepared immutable plan per accepted run and do not repeat preparation per step. Any later cache must include publication identity, digest, format, and operation-registry identity, not just workflow ID.
5. Validate invocation inputs against their declarations. Prepare the initial observation budget. All failure paths so far return an error without inserting a run or calling a handler.
6. Recheck daemon admission and the request's pre-admission abort/deadline state after the asynchronous work. In one synchronous section, mint a UUID v7 run ID, capture owned inputs, install the queued run, and enqueue its first advancement. There is no `await` between this final gate and insertion. Return the captured acceptance response, not a later mutable snapshot.

A request admitted before shutdown but still reading a publication has not yet created accepted work. Closing manager admission prevents its later continuation from inserting a run. Abort/deadline handling must observe and settle any outstanding publication read within the existing database-generation lifetime; do not claim that racing a promise cancels a queued SQL query. If the current repository query cannot be cancelled, keep that request's ownership until the read settles or the process deadline forces exit, and refuse late admission.

The engine never waits for the initiating response to be consumed. After insertion, it has its own lifetime and no caller signal. Retrying POST creates another invocation; neither service automatically retries it. GET is observation, not a trigger to resume execution.

### Sequential capability checks

Build a step-ID map and follow `firstNode` through distinct `successors` targets. Array order is not execution order. The executable path has at most one successor at each step and ends at one `result` with no successor. Empty `successors` is terminal; repeated edges to the same target do not create multiple executions.

Reject conditional declarations/routing, loops, more than one distinct successor, a nonterminal result, and a dependency on work outside the earlier prefix of that chain as `workflow_execution_unsupported`. Several dependencies on earlier chain steps are still sequential and are supported. Dependencies constrain readiness; they do not independently activate an otherwise unreached step. In particular, do not turn a graph accepted by the validator's ordering-edge analysis into an improvised execution order.

Disconnected steps may remain pending and never execute. Check every declared step's type, operation/configuration, and value schemas before admission, including disconnected steps; unsupported declared behavior is not silently ignored. Keep disconnected supported steps in inspection. Reject rather than hang if a supposedly supported reached step cannot make progress.

These checks describe this daemon release's executable subset, not a new publication rule. Existing conditional, parallel, loop, permissive-config, and malformed-fragment documents retain their current publication findings and digests. Later Epics expand execution support under their own contracts.

### Value-schema validation and bindings

Use the existing `typebox/compile` compiler and `Check`/`Errors` convention, not its value-conversion or default-insertion APIs. Compile once during preparation. A value must already be finite, acyclic JSON; `undefined`, non-finite numbers, functions, symbols, class instances, and cyclic objects cannot be successful handler data. Do not rely on `JSON.stringify` silently dropping or converting invalid values.

Check depth iteratively before invoking recursive value validation or cloning: an object/array root has depth 1, and a nested container adds 1. More than 128 levels in invocation `inputs` returns 422 `invocation_inputs_invalid`; an author fragment over that depth is 422 `workflow_execution_unsupported`; excessive handler-output depth fails the step as `step_output_invalid`. A lightweight structural-depth check on raw invocation JSON must reject nesting above 256 as 400 `invalid_request` before the existing recursive parser runs, respecting quoted strings and escapes; it is a safety guard, not a replacement JSON parser. Apply the value/fragment guards to direct runtime calls as well as HTTP calls.

A schema fragment is an object or boolean JSON Schema 2020-12 resource. Before compiling it, validate it against a checked-in, offline copy of the [2020-12 meta-schema](https://json-schema.org/draft/2020-12/schema) and its referenced vocabulary meta-schemas. Retain their source URLs and license/provenance beside these executable resources. Do not fetch schemas during admission or execution. The pinned compiler accepts an invalid `type` keyword without throwing; a successful `Compile` call is therefore insufficient preflight.

Bundle the vocabulary resources under the meta-schema's `$defs`, preserving each resource's `$id` and relative references. The planning experiment verified this arrangement with the pinned compiler; passing the remote resources only as its context map did not resolve those references. Keep the bundled artifact deterministic and review its source resources rather than replacing meta-validation with hand-written keyword checks.

Each declaration is its own resource: local `$defs`, JSON Pointer references, and anchors resolve within that fragment, not against another input/output or the whole workflow. Refuse unknown dialects, unsupported required vocabularies, unresolved references, references requiring an external resource, and invalid regular expressions before admission. Resolve author reference edges and reject any cyclic reference closure, including guarded recursion, as unsupported execution in this first release; do not send `{ "$ref": "#" }` into the evaluator. This capability restriction does not apply to the trusted bundled meta-schema and does not change publication validity. Support for recursive author schemas requires its own proven evaluator contract, not an implicit promise in this plan.

Recognize the standard 2020-12 validation/applicator/unevaluated keywords; do not implement a hand-written subset of schema validation. Treat `default`, `format` under the format-annotation vocabulary, and content annotations as annotations. The pinned compiler asserts formats, so an execution-only schema view that removes format assertions at schema positions is required. Preserve stored bytes, literal `const`/`enum` values, and process-global TypeBox format registrations. An explicitly required unsupported assertion vocabulary is rejected, not ignored.

Catch compiler and evaluator exceptions, including from diagnostic generation. Before admission, return `workflow_execution_unsupported` with a bounded `execution.schema_evaluation_failed` finding. After admission, fail the affected step as `schema_evaluation_failed`, with no candidate output committed. The engine's advancement boundary must also settle an unexpected non-handler exception as sanitized `execution_failed`, release its scheduled-work ownership, and finish the run's failure transition; it must never leave an accepted run stuck because only handler promises had rejection handling.

Presence and value checks are separate:

- Invocation `inputs` defaults to `{}` only when the envelope field is absent. Every declared workflow input must be an own property and pass its fragment; undeclared names are an invocation error. A schema `default` does not fill a missing input. `null` is a present value, accepted only by its schema.
- Resolve each whole binding as either a literal or one reference using the existing reference grammar. `inputs.a.b` reads the flat input key `a.b`; `step.<id>.a.b` reads that flat declared output name. No recursive interpolation, property-path fallback, expression evaluation, or coercion occurs.
- Use own-property checks and safe dictionaries so names such as `__proto__` cannot mutate prototypes or read inherited values. Preserve names accepted today rather than banning them to avoid correct lookup.
- An omitted optional handler input stays absent and may use the handler's documented default. An explicitly supplied reference must resolve even when its destination input is optional; never turn failure to resolve into omission or a default.
- Validate the fully resolved input object against the operation's input contract immediately before dispatch. Missing required bindings, unknown handler input names, and invalid values fail that step without invoking its handler. They are not mistaken for invalid invocation-envelope data.
- Validate a handler's entire output against its operation output contract and every author-declared output fragment before publishing any of it. Every declared name is required. Extra fields forbidden by the operation schema fail validation. Operation-defined fields may exist without an author declaration; they remain visible in the successful step outcome but cannot be referenced unless declared. Do not erase valid operation fields to manufacture an author-shaped output.

Capture one owned immutable invocation-input value. Construct new resolved input maps, sharing already immutable literal/output values rather than repeatedly deep-copying a whole run. Detach and freeze handler results before commitment so a handler retaining a reference cannot mutate a successful output later. Observation must not return writable aliases into live state.

### Handler contract and initial operations

An operation definition contains a stable name, closed config/input/output schemas, and `execute(inputs)`, which returns an output object or a promise for it. Treat the result as unvalidated `unknown` at the execution boundary. Expected domain errors use a typed handler error with an allowlisted code; unexpected throws/rejections become a sanitized `handler_failed` failure. The engine catches both synchronous and asynchronous failures and releases only that run's work.

Handlers receive resolved inputs only. They have no run map, repository, HTTP context, routing callback, completion callback, or request abort signal. The initial handlers use no I/O, clock, randomness, scripts, or mutable process-global state. Configuration for each is exactly `{ "operation": "<name>" }`; other config fields are unsupported execution configuration, even though v1 may publish them.

| Operation | Inputs | Successful output | Defined failure |
| --- | --- | --- | --- |
| `greet` | Required `name: string` | `{ "greeting": "Hello, <name>!" }`, preserving the name verbatim | Input type failure before the handler |
| `add` | Required finite `left: number`; optional finite `right: number`, default 0 when absent | `{ "value": left + right }` | `numeric_overflow` if the result is non-finite |
| `divide` | Required finite `dividend: number`, `divisor: number` | `{ "value": dividend / divisor }` | `division_by_zero` for either sign of zero; `numeric_overflow` for a non-finite result |

Numeric behavior is IEEE-754 arithmetic over JSON numbers, not decimal money arithmetic. Do not add rounding, parsing of numeric strings, or precision promises. All operation input/output objects reject unknown fields. The runtime's operation map is immutable; replacing an operation under the same supported format cannot silently change existing semantics.

`result` is engine-controlled, not a task operation. Its config must be absent or empty. Resolve its inputs and use that exact object as the final result, including `{}`. If a result step declares output fragments, validate the same resolved object against those declarations before committing; do not introduce another output object or top-level result schema. A result's resolved data and the terminal run transition commit together.

### Run and step transitions

Keep each engine instance private to one run. The manager stores instances by run ID, never by publication ID. A shared immutable prepared plan or handler definition may be reused; inputs, step states, output maps, failure arrays, and completion promises may not.

| Transition | Required action |
| --- | --- |
| Admission → `queued` | Install identity, publication binding, inputs, all pending step states, and the first eligible step as ready |
| `queued` → `running` | Start the first engine advancement and set the run start time once |
| `pending` → `ready` | The step is selected by the sequential chain and every required predecessor has succeeded |
| `ready` → `running` | Bind and validate inputs, then invoke its handler once; binding/input errors instead move it to failed without a handler call |
| `running` → `succeeded` | Validate and commit the complete owned output before making the successor ready |
| Nonterminal step → `failed` | Record its structured failure, stop dispatch for that run, and remove undispatched ready entries |
| Internal stopping → run `failed` | Wait for already running work to settle, then set the terminal timestamp; never release successors from a late success |
| Terminal `result` succeeds → run `succeeded` | Atomically commit its resolved object as final output and clear active work |

`currentSteps` is derived from ready/running states, not separately maintained as the last executed step. Completed runs have an empty list even when disconnected or failure-blocked steps remain pending. A ready step withdrawn by failure returns to pending: it was never executed and must not be invented as another failed step.

Use a small asynchronous advancement pump with at most one scheduled or running advance per run. Enqueue the next advance on a later event-loop turn, not an unbounded recursive call or a global promise chain. This allows HTTP observations and other runs to make progress even when built-ins finish synchronously. E2 allows one running handler per run and no configurable daemon-wide worker limit; do not promise Epic 4's fairness bound or implement its scheduler early. `ready` already means eligible but not dispatched, so later capacity control has a compatible observation state.

Internally distinguish normal execution from stopping after failure. Public status remains `running` with `stopping: true`, observed failures, and any unfinished running work until drain completes. In a purely sequential run, the failing handler has normally already settled and no other handler is running, so stopping can be instantaneous and need not be observable by polling. Do not add a delay or parallel test-only production behavior to make this phase visible. Epic 4 exercises overlapping-handler drain semantics when it introduces them.

Terminal state is absorbing. Do not update outputs, timestamps, or failures after terminal commitment. Repeated inspection is read-only; duplicate advancement or handler settlement must not execute a step twice or change a terminal outcome. A run with an unhandled failure has no final `output`, even if earlier steps succeeded.

### HTTP request, response, and error contract

Both services' new run routes must use the existing JSON error envelope and set `Cache-Control: no-store` on success and failure responses. The daemon already applies that header app-wide; add it explicitly to the Control API's run feature boundary rather than assuming public workflow routes provide it. Private daemon authentication, TLS configuration, token rotation, method handling, and OpenAPI privacy remain unchanged.

Invocation request:

```json
{
  "workflowId": "0192b0a0-7e1d-7000-8000-000000000100",
  "publicationNumber": 1,
  "inputs": { "amount": 90, "surcharge": 10, "people": 4 }
}
```

For these new run routes, both `workflowId` and `runId` use the lowercase UUID v7 schema matching server-assigned document identities. Reject uppercase spellings and other UUID versions as 400 `invalid_request` for the POST or `invalid_parameter` for the GET; do not reuse the broader historical authoring-route UUID pattern or report a spelling difference as storage corruption. Keep existing authoring route behavior unchanged. `publicationNumber` is a JSON integer from 1 through 2,147,483,647, matching the current Postgres publication-number column; it is not a string or an inferred latest value. `inputs` is a JSON object, optional only as shorthand for `{}`. Reject unknown envelope fields. Validate the same schemas at both service boundaries.

Return 202 and `Location: /api/runs/<runId>` only after insertion. The acceptance body is small and fixed:

```json
{
  "runId": "0192b0a0-7e1d-7000-8000-000000000200",
  "workflowId": "0192b0a0-7e1d-7000-8000-000000000100",
  "publicationNumber": 1,
  "workflowFormatVersion": "v1",
  "publicationDigest": "7ede18509e9ced0959fc4a5df238700a609c0b4c4935e3fed9ba3294c00c18c7",
  "status": "queued"
}
```

That status records acceptance, not a promise that a subsequent GET still sees queued. The Control API constructs its own public relative Location; it does not expose a private daemon address.

`GET /api/runs/:runId` returns 200 with a `RunSnapshot`:

| Field | Contract |
| --- | --- |
| `runId`, `workflowId`, `publicationNumber`, `workflowFormatVersion`, `publicationDigest` | Same immutable binding as acceptance |
| `status` | `queued`, `running`, `succeeded`, or `failed` |
| `stopping` | Boolean; true only while public status is running and failure drain is in progress |
| `createdAt`, `startedAt`, `finishedAt` | UTC ISO-8601 timestamps; creation always present, start only after advancement starts, finish only when terminal |
| `steps` | Every declared step's `stepId`, `status`, and optional `startedAt`/`finishedAt` UTC ISO-8601 timestamps; `output` only for a succeeded step. Includes completed and never-eligible steps |
| `currentSteps` | Entries `{stepId, status}` for ready/running work only; empty when terminal |
| `failures` | Structured failures actually observed in this run, including during stopping; empty on success |
| `output` | Present only on succeeded runs and exactly the result's resolved input object; absent, not `null`, otherwise |

Step status is `pending`, `ready`, `running`, `succeeded`, or `failed`. Step input/binding failures can have a finish time without a handler start time. Sort `steps` and `currentSteps` by step ID for stable display. Sort failures by step ID, publication pointer, data pointer, then code. Ordering is presentation, not a promise of cross-run execution order. No iteration, attempt, skipped-path, event-cursor, or cancellation placeholders are included.

A run failure contains `stepId`, stable `code`, safe `message`, `path`, and optional `dataPath`. `path` is an RFC 6901 pointer into the selected canonical publication; `dataPath` points into resolved input or handler output for a value error. The enclosing failure code identifies which value object it describes. Handler domain errors point at the step's operation config. Input/output schema failures point at their declaration/binding, with the data pointer locating the offending value. Do not report draft line numbers for canonical content. Use codes, not message text, as the contract; never return raw thrown exceptions, database addresses, stack traces, or input values in diagnostic messages.

Run failure codes: `binding_unavailable`, `step_input_invalid`, `handler_failed`, `step_output_invalid`, `schema_evaluation_failed`, `execution_failed`, `division_by_zero`, `numeric_overflow`, `run_snapshot_limit`, and `execution_stalled`. Record one primary cause for a failed step, not every schema-library diagnostic. A handler that never ran cannot contribute a handler failure.

| Condition | Daemon/public status and code |
| --- | --- |
| Malformed body, excessive raw JSON nesting, wrong envelope/parameter shape, or repository `InvalidWorkflowInputError` | 400 `invalid_request` or the existing parameter guard's `invalid_parameter`; no run or handler start |
| Invocation body exceeds limit | 413 `request_too_large` |
| No exact publication | 404 `publication_not_found` |
| Unknown/lost in-memory run ID | 404 `run_not_found`; cannot distinguish never-existing from lost-on-restart |
| Unsupported format, construct, operation, config, or schema resource | 422 `workflow_execution_unsupported`, with a primary finding locating the unsupported declaration |
| Invalid invocation values, including the 128-level value-depth limit | 422 `invocation_inputs_invalid`, with a primary finding rooted at request `/inputs` |
| Verified bytes fail format/identity checks or integrity verification fails | 500 `publication_integrity_error`; sanitized, not a 422 author error |
| Publication database unavailable or read deadline exceeded | 503 `database_unavailable` or `database_timeout`; no run is admitted |
| Daemon closing admission | Existing private 503 `service_draining`; public 503 `daemon_not_ready` |
| Authenticated accepted invocation | 202 acceptance body, even if a later GET already reports a failed run |
| Handler or binding failure after acceptance | 200 failed snapshot on GET, not a retrospectively failed POST |

Invocation findings reuse the existing `Finding` shape and `blocking: true` means this invocation cannot be accepted. Do not add them to stored publication findings. Boundary authentication/readiness failures still use `findings: []`; do not weaken `BoundaryErrorSchema` or treat it as the schema for a 422 domain response. The shared run-domain error schema permits findings and has no authoring-only `currentRevision` field. Moving the existing finding schema must preserve authoring responses exactly.

An invocation rejection returns one primary finding, selected by JSON Pointer then code, rather than an exhaustive list. Bound its message to 512 encoded JSON bytes, each pointer to 8 KiB, and allowlisted diagnostic details to 8 KiB; never copy a whole schema, raw value, exception, or unbounded name list into `details`. If a precise pointer exceeds the bound, use its nearest complete containing pointer that fits, retaining the step ID when applicable; do not cut a JSON Pointer token in half. Apply the same message/pointer limits to run failures, omitting an oversized optional `dataPath`. These containing locations still identify the affected step or input collection and cause. The entire envelope must fit 64 KiB even when a request produces thousands of invalid values; test that it remains a 422 rather than becoming a client-side 502.

For the Control API's daemon client, map connection/TLS/authorization failures to 503 with existing `daemon_unavailable`, `daemon_tls_error`, or `daemon_unauthorized` codes; use 504 `daemon_timeout` and 502 `daemon_invalid_response` for their distinct causes. Forward only recognized, schema-valid domain status/body combinations. Validate returned publication identity against the POST and returned run ID against the GET before presenting an upstream response as the requested run. No redirects, ambient proxy routing, raw error forwarding, or automatic retries are allowed. Distinguish an interrupted caller from an upstream rejection in internal diagnostics; neither proves that an already-sent invocation was not accepted.

Bound each outbound operation, including response-body consumption, by the admitted configuration's `dependencyTimeoutMs`. Combine that deadline with the caller-disconnect and service-shutdown signals for the HTTP operation only. The daemon separately applies its configured dependency deadline to publication preparation; neither timeout is a workflow execution deadline.

### Observation budget and retention

The readiness client's 64 KiB limit stays readiness-specific. A run client reads at most 8 MiB of a successful snapshot and cancels an oversized upstream response; acceptance and error bodies have a 64 KiB limit. The daemon must make every accepted run retrievable within the snapshot limit, rather than accepting work and later returning an unreadable oversized success.

Before admission, budget the all-steps observation structure, maximum state/timestamp expansion, and 64 KiB reserved for sanitized terminal failure diagnostics. Reject a publication whose output-free observation cannot fit as unsupported execution. Before committing each successful step, charge its validated output's encoded JSON size against the remaining budget; charge the final result again where the snapshot serializes it both as step output and run output. If commitment would exceed the budget, fail that step with `run_snapshot_limit`, publish none of that candidate output, and retain earlier successful outcomes. Bound diagnostic messages/counts within the reserved space, without omitting the primary failure or affected step.

Keep encoded-size accounting with the snapshot serializer and verify it against actual UTF-8 serialization, including escaping and multibyte strings. Cache sizes of immutable output values; do not repeatedly serialize the entire run on every transition. This is a complete-observation limit, not arbitrary truncation or a new output schema. The manager retains all accepted runs and completed outcomes until process exit; no TTL, eviction, list API, or run deletion is introduced.

### Reload, disconnect, and shutdown ownership

Create the manager once in daemon process composition after configuration validation. Pass it to each application/dependency generation as a borrowed process-lifetime service. Do not put its shutdown inside `Dependencies.close`, and do not recreate it when a database URL, dependency timeout, token, or listener changes. Preparation borrows the current generation's database; an accepted run holds only its publication plan and inputs, never that pool.

Extend `RunServiceOptions` with a narrow optional accepted-work drain callback, for example `drainAcceptedWork(signal): Promise<void>`. Invoke it at process shutdown only, not during reload retirement. Its synchronous first action closes manager admission; its promise settles when accepted queued/running runs have completed. The signal is the process's forced-shutdown deadline, not a client signal. The Control API has no daemon-work callback and must not send a shutdown/cancel command when it exits.

On SIGTERM/SIGINT, synchronously close HTTP and manager admission, establish one absolute shutdown deadline, and await both HTTP drain and accepted-work drain within that deadline. Accepted queued runs may still start and finish; ordinary service drain is not run failure/stopping. Only then close remaining service-owned database resources. At the original deadline, abort local outstanding operations, force-close local connections, and exit nonzero without extending the deadline for another pool-close or work-wait interval. Repeated signals do not restart the clock. Extending this seam must also correct any current close path that can outlive that single deadline; do not inherit a second full timeout for accepted work.

SIGHUP retains the manager and all run IDs/outcomes even when it replaces database dependencies or the listener. A rejected reload changes neither run state nor active configuration. During a later database outage, existing runs and GET snapshots still work while readiness reports the database failure; new invocation preparation may fail. Pointing the Control API at a different daemon still does not migrate M2 state or provide failover.

Daemon exit loses all M2 state, including after successful drain. After restart, a previously accepted ID returns `run_not_found`. A forced exit is not a durable failed/cancelled outcome. Report only externally observed state; do not claim a caller can inspect an in-memory final snapshot after its owning process has exited.

## Verification

### Worked executable workflow

This document passes the existing v1 validator. Its UUIDs are fixed test fixture identities, not a new public ID-minting mechanism. A real-service script creates the draft through the existing API and uses the returned server-assigned workflow ID and publication number; it does not depend on the fixture ID being honored by draft creation.

```json
{
  "workflowFormatVersion": "v1",
  "id": "0192b0a0-7e1d-7000-8000-000000000100",
  "name": "Compute per-person amount",
  "firstNode": "0192b0a0-7e1d-7000-8000-000000000101",
  "inputs": {
    "amount": { "type": "number" },
    "surcharge": { "type": "number" },
    "people": { "type": "number" }
  },
  "steps": [
    {
      "id": "0192b0a0-7e1d-7000-8000-000000000101",
      "type": "task",
      "config": { "operation": "add" },
      "inputs": {
        "left": { "ref": "inputs.amount" },
        "right": { "ref": "inputs.surcharge" }
      },
      "outputs": { "value": { "type": "number" } },
      "successors": ["0192b0a0-7e1d-7000-8000-000000000102"]
    },
    {
      "id": "0192b0a0-7e1d-7000-8000-000000000102",
      "type": "task",
      "config": { "operation": "divide" },
      "inputs": {
        "dividend": { "ref": "step.0192b0a0-7e1d-7000-8000-000000000101.value" },
        "divisor": { "ref": "inputs.people" }
      },
      "outputs": { "value": { "type": "number" } },
      "successors": ["0192b0a0-7e1d-7000-8000-000000000103"]
    },
    {
      "id": "0192b0a0-7e1d-7000-8000-000000000103",
      "type": "result",
      "inputs": {
        "perPerson": { "ref": "step.0192b0a0-7e1d-7000-8000-000000000102.value" },
        "total": { "ref": "step.0192b0a0-7e1d-7000-8000-000000000101.value" }
      }
    }
  ]
}
```

| Invocation | Expected observation |
| --- | --- |
| `{ "amount": 90, "surcharge": 10, "people": 4 }` | Succeeded, output `{ "perPerson": 25, "total": 100 }`, all three steps succeeded, no active work |
| `{ "amount": 20, "surcharge": 4, "people": 3 }` | Independent run ID, output `{ "perPerson": 8, "total": 24 }` |
| `{ "amount": 90, "surcharge": 10, "people": 0 }` | POST accepted; eventual failed run, divide step `division_by_zero`, add output retained, result pending, no final output |
| `{ "amount": "90", "surcharge": 10, "people": 4 }` | 422 `invocation_inputs_invalid`, no run, no handler call |
| Missing `people` | Same pre-admission rejection, with a missing-input finding |

Keep `minimum.json` and the existing `sequential.json` greeting document as executable success cases too. Add a result-literal case containing nested `{ "ref": "inputs.notDeclared" }`; that nested object must remain literal data. Add an optional-add-input variant by removing the `right` binding and its now-unused workflow input declaration, not by silently defaulting a required invocation input.

### Acceptance and risk matrix

| Criterion or risk | Proof and expected result | Owning layer |
| --- | --- | --- |
| Exact publication binding | Accept publication 1, change draft and publish 2 while its handler is held; release 1 and observe only its original result/digest | Runtime + real database/services |
| Invalid requests create nothing | Missing publication, malformed request, unsupported construct/config/schema, corrupt publication, and bad invocation inputs produce the documented errors with no inserted run and no handler starts | Preparation + daemon |
| Client independence | Hold an accepted run, disconnect the initiating client after recording 202, observe it from a new client, release it, and retrieve success | Actual service processes with controlled runtime harness |
| Concurrent same-publication runs | A held A remains running while B reaches a terminal result from different inputs; a third failing invocation does not alter A or B | Runtime + daemon/Control API |
| No globally serial execution | Observe both independent held handlers started before releasing either; do not use elapsed time as evidence | Injected-handler runtime/process harness |
| Progress and terminal retention | Observe queued acceptance, ready/pending work, a held running step, retained succeeded/failed outcomes, and empty terminal `currentSteps`; repeated reads leave terminal state unchanged | Runtime + snapshot API |
| Data readiness and once-only execution | Permute the step array, duplicate a successor edge, and declare dependencies on earlier prefix nodes; outputs and invocation counts remain correct | Runtime |
| Binding/consumer failure | Supply a missing required handler binding or a literal of the wrong type; the affected handler never starts and no dependent executes | Runtime |
| Complete output validation | Inject an output with one valid and one invalid/missing declared field, then a non-JSON output; no part becomes downstream data or a successful result | Runtime boundary |
| Literal and presence semantics | Distinguish omission from `null`, explicit missing reference from optional input omission, dotted flat keys from object paths, and nested reference-shaped literal data from bindings | Pure value/binding checks |
| Explicit completion | Result-only `{}` succeeds; invalid result declarations or unavailable result data fail without final output | Preparation + runtime |
| Caller/upstream ambiguity | Interrupt an outbound POST around the admission barrier; count accepted daemon runs separately from responses, prove no automatic retry and no cancellation after commit | Client + daemon transport harness |
| Transport contracts | Valid 404/422 passes through; bad status/schema, mismatched run identity, TLS/auth failure, timeout, redirect, and oversized response are classified correctly | Control API daemon client |
| Observable large run | Return a snapshot larger than 64 KiB but within 8 MiB successfully; cross the commit budget and get an inspectable `run_snapshot_limit` failure rather than truncation or 502 | Runtime + real HTTP |
| Reload and dependency ownership | Hold two accepted runs; SIGHUP changes `dependencyTimeoutMs` to force a database-generation replacement, then change listener settings; same IDs and outputs remain observable. Invalid reload retains old state | Actual daemon entry point |
| Independent Control API shutdown | Stop/restart only the Control API during a held run; daemon progress continues and the new Control API retrieves its result | Actual service processes |
| Graceful daemon shutdown | With queued and running accepted work, close admission, release handlers within the deadline, observe completion through the controlled runtime boundary and daemon exit 0 | Actual daemon lifecycle harness |
| Forced daemon shutdown | Keep a handler unresolved, observe bounded nonzero exit, restart daemon, and get 404 for the old ID; do not invent a persisted terminal snapshot | Actual daemon lifecycle harness |
| Database outage after acceptance | Stop only the disposable database or its access path; accepted run completes and GET works while readiness fails and new admission fails | Actual services/disposable database |

The pure runtime tests use deferred-promise barriers and recording handlers behind the same handler interface. For held real-process cases, create a test-only entry module that supplies controlled handlers to the real daemon composition/lifecycle and communicates releases through test IPC; it must use the same HTTP routes, manager, and engine as production. No production environment flag or HTTP control endpoint can install those handlers. Run the built-in worked example through the actual unmodified `apis/daemon/src/index.ts` as separate production-wiring proof. A controlled harness is lifecycle evidence, not proof that a production `hold` operation exists.

The focused `smoke:sequential` script uses `startTestPostgres()`, the existing daemon process helper, and a new Control API process helper modeled on it. The latter must launch `apis/control-api/src/index.ts`, isolate configuration/token files and environment, observe listening/readiness, and perform bounded child teardown; the current in-process Control API smoke is not that proof. The script creates a draft with `{ "document": <workflow> }`, publishes it, posts to `/api/runs`, and polls GET with one overall deadline until terminal. It compares exact output/error codes and step states, not human-readable messages or wall-clock timestamps. Always terminate its own children and dispose only its own database in `finally`. Use local authenticated transport for this focused proof; do not claim the separate-network/TLS coverage Epic 6 consolidates.

Do not duplicate the workflow catalog in four suites. Store runtime examples with documents, invocation inputs, and expected semantic outcomes; let focused API checks consume them. Keep format-invalid fixtures in the existing workflow package with their required finding/digest manifests. New permanent tests must defend plausible failures at the boundaries above; smoke commands supply routine feature proof without tests that merely assert exports, schema wiring, or copied fields.

## Discoveries

Planning evidence, 2026-09-14:

- A throwaway Bun script using the existing `createWorkflowValidator().validateDocument` accepted the worked workflow and a shuffled-step variant with zero findings. Its fixed-ID publication digest is `7ede18509e9ced0959fc4a5df238700a609c0b4c4935e3fed9ba3294c00c18c7`. A server-assigned workflow ID changes that digest; the real-service scenario must use the publication response, not this fixed vector.
- The same validator accepted variants with missing task config, a malformed input fragment `{ "type": "not-a-json-schema-type" }`, and a nested reference-shaped literal with an undeclared input. This confirms why invocation preflight and literal semantics cannot be implemented by tightening the frozen publication rules.
- The pinned TypeBox compiler accepted both a number and a string against the malformed `type` fragment. A 2020-12 tuple schema correctly returned `[true, false, false]` for a valid tuple, wrong element type, and excess item. A numeric schema returned `[true, false, false, false]` for `1`, `"1"`, `null`, and `Infinity`. These experiments motivate schema meta-validation and non-coercing value checks; they do not prove full runtime or meta-schema conformance.
- A second throwaway experiment bundled the official 2020-12 vocabulary meta-schemas under `$defs`, preserving their resource identities. The pinned compiler accepted boolean, numeric, and tuple schemas and rejected invalid `type`, invalid `required`, and a nested invalid schema. A local `$defs` reference accepted `1` and rejected `"1"`. Supplying the resources only as a compiler context map instead failed to resolve the meta-schema references. This proves the proposed bundling seam for those cases, not full schema conformance.
- A review-driven evaluator probe confirmed that `Compile({ "$ref": "#" }).Check(1)` throws `RangeError` and `Compile({ "type": "string", "format": "email" }).Check("not-an-email")` returns false. The plan therefore makes author-reference cycle rejection, depth guards, evaluator-error mapping, and format-annotation projection explicit rather than relying on successful compilation or the evaluator's defaults.
- The current lifecycle's dependency-retirement hook cannot own in-memory runs, and its HTTP-only drain cannot wait for detached accepted work. The process-lifetime callback and single-deadline checks are required integration work, not claims that Epic 1 already implements those run semantics.
- The specification's fixture links use `packages/workflow/tests/fixtures`; implementation uses `packages/workflow/src/fixtures`. Correct those links with the specification update; do not relocate fixtures to match stale prose.

No execution engine, invocation route, successful run, reload-with-runs scenario, or Epic acceptance has been demonstrated during this planning task.

Two fresh independent agents reviewed semantics and integration. The plan was amended for bounded rejection diagnostics, explicit public no-store headers, named step timestamps, the missing Control API child-process helper, schema evaluation failures/depth, canonical invocation IDs, and mandatory format-annotation handling. These are planning corrections; the new runtime guards and service behaviors still require implementation evidence.

## Decision log

| Date | Proposed decision | Reason |
| --- | --- | --- |
| 2026-09-14 | Separate execution preflight from frozen v1 publication validation | Current publishable documents include configurations and fragments this first engine cannot execute |
| 2026-09-14 | Reuse TypeBox and add offline meta-schema checking | One evaluator convention; compilation alone demonstrably accepts malformed schemas |
| 2026-09-14 | Resolve whole bindings and flat reference names only | Matches the existing validator and avoids changing literal data into executable references |
| 2026-09-14 | Separate process-lifetime run ownership from reloadable resources | SIGHUP must not erase runs or close a pool that accepted work still needs |
| 2026-09-14 | Freeze a small operation set and complete snapshot/error contract before integration | Engine and transport can be developed independently without inventing different execution meanings |

## Outcome

Planning deliverable only: implementation sequence, proposed contracts, executable workflow inputs/expected outcomes, review gates, and focused verification procedures. Implementation checkpoints remain open. Record approvals and implementation PRs in Progress; replace this section with observed behavior and acceptance evidence only after the work runs end to end.
