# Sequential workflow execution — technical design

Epic: [M2 Epic 2: Execute sequential workflows](../epics/m2/2-execute-sequential-workflows.md)

Status: Proposed design. Publication preparation and shared contracts exist on `feat/m2-sequential-checkpoint-1` in [PR #64](https://github.com/RostrumAI/rostrum/pull/64); execution is not implemented. Repository inspected on 2026-09-19. The implementation and review work below remains outstanding.

## Purpose

Rostrum can publish an immutable workflow and check whether this daemon release supports it. We need to connect that preparation to an execution engine: accept an invocation, run its steps independently of the caller, and make its progress, output, and failures available through the Control API.

Publication validity and execution support remain separate checks because the Control API and daemon can run different releases. The daemon must reject behavior it cannot execute before creating a run. Once it accepts a run, later publications, caller disconnects, and Control API restarts must not change that run.

This design expands the sequential-execution blueprint into implementation work. It keeps the blueprint's separation between graph traversal and task execution, uses node classes for step-specific behavior, and gives each run its own visit records. It does not introduce distributed execution merely to preserve that future boundary.

## Current repository state

| Existing component | What we can reuse | Work still needed |
| --- | --- | --- |
| `packages/database/src/repositories/workflow-repository.ts` | `WorkflowRepository.getPublication` retrieves an exact publication and verifies its canonical content and digest. | Construct the repository in the daemon and assemble the execution publication binding. No database migration is needed. |
| `packages/workflow/src/execution.ts` | Invocation, acceptance, observation, rejection, and failure schemas, exported through `@rostrum/workflow/execution`. | Add the waiting-state distinction and engine failure codes described below; remove the duplicated identifier pattern. |
| `apis/daemon/src/services/runs/execution/workflow-preparer.ts` | `WorkflowPreparer.prepare` returns a prepared graph and owned invocation inputs, or a typed refusal. | Address the preparation review findings and reject self-dependencies before admission. |
| The adjacent `json-value.ts`, `value-schema.ts`, and `operation-contracts.ts` | JSON ownership/depth checks, compiled author schemas, and contracts for `greet`, `add`, and `divide`. | Repair the schema-boundary defects and implement the operations. Their handlers do not exist yet. |
| The adjacent `task-executor.ts` | `TaskExecutor.execute(work, signal)` and the JSON-only `TaskWorkItem` / `TaskWorkResult` boundary. | Implement a local executor and daemon-owned dispatch/completion handling. |
| Both applications' controllers, services, and `http/` modules | Explicit route registration, dependency injection, authentication on the daemon, and generated OpenAPI. | Add run services, invocation/inspection controllers, and the Control API's run client calls. |
| `packages/server/src/lifecycle.ts` | HTTP admission, response-body tracking, request cancellation, and one bounded shutdown deadline. | Extend outstanding-work tracking to accepted runs that outlive their HTTP requests. |

There is no run registry, traversal engine, node implementation, local task executor, or `/api/runs` endpoint to migrate. The redesign replaces the earlier engine proposal, not an existing engine in this checkout. Retain the useful checkpoint-1 modules rather than discarding PR #64 wholesale.

A prepared workflow is process-local: it contains maps and compiled validator instances. It is not a serializable checkpoint. Only execution data and the work/result messages are JSON data; persistence will require additional M3 work.

## Scope

This work delivers exact-publication invocation, sequential deterministic execution ending in `result`, bindings between steps, concurrent independent runs, inspection, and graceful process shutdown. It also supplies an in-memory dispatch queue and distinct handling for unmet dependencies and overdue task work.

Each run may have at most one task executing at a time. Several runs may have outstanding tasks together. The queue separates eligibility from execution; it does not introduce a configurable daemon-wide capacity or fairness policy, which belongs to [Epic 4](../epics/m2/4-execute-parallel-paths-and-joins.md).

Conditionals, parallel paths within a run, joins, and loops remain unsupported at invocation. Their future node behavior must fit the visit model, but this work does not add empty conditional or loop classes. Distributed queues, remote workers, leases, persistence, restart recovery, invocation deduplication, retries, cancellation APIs, and side-effecting handlers remain outside this Epic.

## Decisions

The design selects the mechanisms below. They are proposed contracts, not claims that implementation or human review is complete.

- Keep the engine in the daemon. There is no second consumer that warrants a runtime package.
- Give the engine sole ownership of run-state changes. Node classes describe step behavior; the executor performs an operation and returns a result.
- Derive traversal from visits and declared graph relationships, never from an array index or a current-step pointer.
- Use one current record per visit, replaced through controlled transitions. Terminal records are immutable. This is not an append-only event log; calling changing status records append-only would hide the actual mutation model.
- Keep the shared `succeeded` spelling for successful steps. It means the blueprint's completed state. Add `waiting` rather than collapse a visited-but-blocked step into `pending`.
- Report dead-run and timeout causes through `ExecutionFailure.code`, alongside the existing run status and `stopping` flag. Do not add a second, loosely related substatus field.
- Return 202 after admission and 200 for a successful inspection, including inspection of a failed workflow. Neither response waits for workflow completion.

Three reviews gate dependent work:

| Decision requiring review | Proposed treatment | Work it gates |
| --- | --- | --- |
| Rejecting self-dependency at publication | Fix the graph stage, but obtain a specification-owner decision on compatibility first. The implementation currently accepts these documents, while the [v1 versioning rules](../specifications/workflow-interface-v1.md#breaking-and-additive-changes) forbid silently invalidating previously accepted documents. Execution preparation can refuse them immediately without changing publication validity. | Shipping a stricter publication validator. If this is not accepted as a correction to the existing acyclic rule, use a versioned rule-set change rather than mutate frozen v1. |
| Schema execution trust | Restrict the initial in-process implementation to an explicitly trusted deployment. Author-supplied regular expressions can consume unbounded CPU on invocation data; trusted authors alone do not make adversarial inputs safe. Byte, depth, and timer limits do not solve this. | Exposure to untrusted authors or inputs. Such exposure requires an approved bounded/isolation strategy before release, not a claim that the timeout below is a sandbox. |
| Execution/API additions | Review `waiting`, located engine failures, task deadlines, and the run-rejection field in the application error envelope together. | Freezing the public execution contract and implementing its consumers. These additions must not be presented as already approved by checkpoint 1. |

## Implementation approach

### Components and ownership

The daemon run service handles admission and observation. It reads the publication, asks the preparer to check it, obtains process-owned work registration, and gives the accepted definition and inputs to the engine. The engine owns the run registry and all transitions. This keeps HTTP, database access, and process resource ownership out of graph execution.

Create the following modules under `apis/daemon/src/services/runs/`. Paths in this document are relative to the implementation repository unless stated otherwise.

| New file | Responsibility and callers |
| --- | --- |
| `run-service.ts` | `RunService.invokeWorkflow` prepares and admits an invocation; `getRun` returns an observation or not-found. Controllers call these operations through `context.services.runs`. The service receives `db.workflows`, the preparer, engine, and a narrow work-registration capability. |
| `execution/workflow-engine.ts` | `WorkflowEngine` owns accepted runs, `advanceWorkflow(runId)`, the ready queue, task claims, completion matching, deadlines, and lifecycle release. The run service admits work; executor settlement schedules further advancement. |
| `execution/run-state.ts` | Defines run and visit records and their permitted transitions. The engine is their only writer. Inputs, committed outputs, and failures belong here rather than to node instances or a separate mutable output store. |
| `execution/execution-node.ts` | Defines `ExecutionNode`, `TaskExecutionNode`, and `ResultExecutionNode`. They hold prepared definitions and return creation, execution, and completion decisions; they never own progress or look up a run globally. Keep the three small classes together until additional behavior justifies separate files. |
| `execution/bindings.ts` | Resolves prepared bindings against one run's accepted inputs and successful visits. Node execution preparation uses it; task handlers do not resolve references. |
| `execution/local-task-executor.ts` | Implements `TaskExecutor` and the three deterministic operations using `operation-contracts.ts`. It receives no engine, database, or HTTP context. |
| `execution/run-observation.ts` | Projects coherent public snapshots and accounts for their byte budget. `getRun` uses this projection; output commitment uses its budget calculation. |

Keep `WorkflowPreparer`, the JSON helpers, compiled checks, and operation schemas in their existing files. Keep `TaskWorkItem` and `TaskWorkResult` unchanged. Add `uuid` to the daemon's declared dependencies for UUID v7 run/work IDs, following the existing Control API dependency rather than adding a second ID implementation.

The in-memory object holding a run has two parts. Its state contains the publication binding, owned inputs, visits, failures, and timestamps. Its runtime collaborators contain the prepared definition, work registration, outstanding executor promises, abort controllers, timers, and scheduled-turn flags. Only the first part is execution data. An abort controller or compiled validator must not leak into a task message or observation.

### Preparing and accepting an invocation

Invocation follows the existing tier boundary: Control API controller → Control API run service → authenticated daemon client → daemon controller → daemon run service. The Control API does not read the publication to decide whether it is executable and does not allocate a run ID.

The daemon performs these steps in order:

1. Retrieve the selected publication through `WorkflowRepository.getPublication`. A missing row becomes `publication_not_found`; `DigestVerificationError` becomes `corrupt_publication`. A database connection/query failure is a service-availability failure, not corrupt content.
2. Build `PublicationContent` using the requested `workflowId` and the retrieved publication number, format version, digest, and canonical text. The repository's `Publication` type does not contain `workflowId`; the preparer must still verify that the document identity matches the binding.
3. Call `WorkflowPreparer.prepare`. Check every declared step, not just the reachable sequence. Preserve the current refusal of unknown operations/configuration, conditionals, loops, and more than one distinct successor. Preserve all supported disconnected definitions for inspection. Reject self-dependencies as `unsupported_execution` with a located `self_dependency` failure before a run exists.
4. Validate invocation inputs and budget the initial observation, including future status/timestamp growth and failure space. Reuse the preparer's owned, frozen inputs rather than copy them again on admission.
5. Recheck request cancellation, the request deadline, and process admission after asynchronous publication retrieval. In one synchronous section, register independent run work, allocate the run ID, insert its state, and schedule its first advancement. If this section cannot finish, remove the unaccepted state and release the registration; dispatch nothing.
6. Return the acceptance containing `runId`, the exact publication binding, and `status: queued`. Delivery of that response is independent of execution. A following GET may already see a terminal run.

Before step 5, cancellation prevents admission. After step 5, the run belongs to the daemon: the request signal is no longer its cancellation signal. Accepted execution and inspection need no more database reads. A later database outage affects readiness and new invocations, not already accepted runs.

### Run context, visit identity, and states

A step definition belongs to the publication. A **visit** is one activation of that step in one run. The run context is the engine-owned state supplied to node behavior, not the controller's request context. Nodes receive read access to inputs and committed visits; only the engine commits a returned decision.

For this Epic, each reached step has one root activation. Its run-local `nodeId` is the published `stepId`, and its `activation` is null. The complete lookup includes the run ID, so two runs of the same publication never share a visit. There is no need to hash a UUID merely to use it as a key.

Keep identity construction with node creation. A future loop must include the loop step and iteration in the activation identity, because two loops can use the same body definition. All predecessors requesting the same target activation must obtain the same identity; the predecessor and arrival order must not be part of it. Attempts and `workId` are separate from visit identity. This is an extension constraint, not an instruction to implement loop scopes or attempts now.

A visit record contains its identity, step ID, activation, status, creation time, and state-specific fields. Running work has a work ID and start time. Success has a completion time and a wholly validated output. Failure has a completion time, a located failure, and a start time only if execution actually started. Use distinct record variants rather than unrelated optional fields.

| Step state | Meaning and transition |
| --- | --- |
| `pending` | No visit exists. Inspection derives this from the prepared definition; the engine does not pre-create every visit. |
| `waiting` | A visit exists, but a declared dependency has not succeeded. Inspection includes `waitingFor`, the unsatisfied dependency step IDs. |
| `ready` | Dependencies are satisfied and the visit is eligible for dispatch. A queued notification is not permission to bypass the claim check. |
| `running` | The engine has claimed the visit and recorded its work ownership before invoking the executor. |
| `succeeded` | The complete output passed validation and was committed. It may now supply bindings and permit continuation. |
| `failed` | The visit cannot succeed. A binding failure can enter this state before executor invocation; failed output is never published. |

Add the waiting variant to `StepObservationSchema`; leave `CurrentStepSchema` limited to ready and running work. `steps` remains in document order for display, not execution order. `currentSteps` uses that same stable order. An unreached disconnected step remains pending even when the run succeeds.

Derive run status with failure precedence. Before the first advancement it is queued. Once advancement starts it is running. An unhandled failure stops new dispatch; while an executor is still outstanding the run is running with `stopping: true`, then becomes failed. Without a failure, successful result commitment makes it succeeded. Store transition timestamps when the event occurs, not on each GET. Terminal observations have no active work and cannot later change their outcome.

### Node behavior and graph traversal

`ExecutionNode.createVisit` supplies the target identity and initial waiting record. `prepareExecution` resolves and validates inputs and returns either task work, a local result candidate, or a located failure. `completeExecution` receives an accepted output and returns either successor activations or the final run result. The engine applies these decisions through the same transition path for every node.

`TaskExecutionNode` plans the prepared task's successors after successful commitment. `ResultExecutionNode` returns its resolved input object as the final result and creates no successor. Neither class dispatches work or writes records independently. Future conditional/loop behavior can change the activation decisions without introducing a second scheduler; those constructs are fields on workflow steps, not new v1 type names to invent here.

Control edges decide **which visits exist**. Dependencies decide **which existing visits may execute**. For example, if A leads to B and C and both lead to D, B's completion can create D's visit, but D stays waiting when its declared dependencies include unfinished C. C's completion finds that same visit rather than creating a second D, and opens the remaining gate.

That example explains the separation; it is not a supported Epic 2 invocation. Current graph validation also has a pure fan-in fixture with dependency-only joins and no incoming control edge. Epic 4 must reconcile that accepted shape and the dominator rules with executable parallel graphs under the versioning policy. Removing the preparation refusal alone will not deliver joins.

`advanceWorkflow(runId)` is a synchronous transition pass. It never awaits a handler or runs one inline:

1. Stop immediately for a terminal run. For a stopping run, start no new work and finish failure only after outstanding work settles.
2. On the first turn, create the entry visit and record the run start time. After a successful completion, ensure the successor visits returned by the node. Repeated creation requests return the existing visit without resetting its state.
3. Recheck waiting visits against successful dependency records in this run. Promote satisfied visits to ready. A failed dependency never satisfies a gate.
4. Notify the in-memory dispatch queue about newly ready visits. Coalesce notifications by run and visit identity; the queue is an index of work, not the authoritative state.
5. Once all local transitions for this turn are accounted for, detect a run that has no possible continuation as described under failures below.

The queue consumer performs the claim separately. It reloads the visit, checks that the run can dispatch and has no running task, resolves inputs, and records `workId` and running state before calling `TaskExecutor.execute`. Duplicate/stale queue entries do nothing. A ready visit cannot be dispatched twice, even if advancement is requested repeatedly before consumption.

Use scheduled event-loop turns for advancement and dispatch, with per-run coalescing flags. Do not recursively advance through immediately resolved promises or run an entire chain in one microtask loop. Each turn starts at most one task per run, then yields so HTTP requests and other runs can progress. A held executor promise must not block the queue from starting a different run. No process-wide lock is required: state changes contain no `await`, and task work begins only after the claim has been recorded.

### Task execution, data flow, and completion

The executor receives the existing work item: run/work/step IDs, workflow format version, validated operation config, and the fully resolved input object. Its separate abort signal comes from daemon-owned execution, not the invoking request. It returns the existing success or failure result identified by run ID and work ID.

The local executor implements only these operations, using the schemas already in `operation-contracts.ts`:

| Operation | Behavior | Expected failure |
| --- | --- | --- |
| `greet` | Accept a string `name` and return `greeting` containing `Hello, <name>!`. | Invalid inputs are refused before dispatch. |
| `add` | Add finite `left` and optional finite `right`; an omitted right operand means zero. Return `value`. | A non-finite result is `numeric_overflow`. |
| `divide` | Divide finite `dividend` by finite `divisor` and return `value`. | Either sign of zero is `division_by_zero`; a non-finite result is `numeric_overflow`. |

Use ordinary JSON-number arithmetic, without coercion or decimal-money guarantees. No operation does I/O. The executor translates unexpected throws/rejections into sanitized `task_error`; the engine also observes every executor promise rejection so an adapter defect cannot strand a run.

Bindings reuse `PreparedBinding` rather than parse reference strings again. Literal values are already owned by the prepared definition; workflow inputs are owned by the run. Step-output references resolve only against succeeded visits and their committed output members. Use own-property access, not truthiness or prototype lookup. A dotted input name is one key. An explicit unresolved reference fails even when the operation member would otherwise be optional; an omitted optional binding is different. Schema defaults supply no values.

Completion returns to the engine, not to a node that looks up global state:

1. Match both run ID and work ID against the dispatched work and its still-running visit. Unknown, wrong-run, stale, and duplicate deliveries cannot commit or release successors. If the promise for a known dispatch returns mismatched identity, fail that dispatch as `execution_error` rather than leave it running indefinitely.
2. For a task failure, attach the known step ID and commit the sanitized failure. For a success candidate, check bounded JSON shape before copying or recursive schema evaluation, then validate the whole operation output and every declared output member.
3. Charge the observation budget before retaining candidate data. Once all checks pass, make one owned immutable output and commit it with successful visit state in the same synchronous transition. Invalid, partial, oversized, or subsequently mutated handler output must never become input to another node.
4. Ask the node for its continuation and schedule advancement. Repeated delivery cannot repeat this step because the work is already settled. Clear the work's timer and abort listener and release its outstanding-execution ownership on actual promise settlement.

The result node uses the same binding, declared-output, JSON, and budget checks but is not sent to the task executor. Its resolved input object is the final output exactly, including an empty object. Commit its successful visit and the terminal result together. There is no successful final output on any failure path.

### Failures, stopped progress, and overdue work

Every unhandled failure closes dispatch for that run immediately. Work already executing may settle, but its completion cannot start a successor or override a recorded failure. Other runs remain independent. During stopping, `currentSteps` contains only work still executing, not abandoned ready notifications. Keep earlier successful outputs available for inspection.

A graph that cannot advance is different from a slow operation. After successor creation and dependency promotion, a nonterminal run with no ready visit and no outstanding execution has no future event that could help it:

- If waiting visits remain, fail with `unmet_dependencies`, naming the affected step and locating an unsatisfied dependency in the published document. No polling timer or health check is needed to discover this state.
- If there are no waiting visits and no successful result, fail with `missing_result`. This catches a lost continuation or invalid prepared state rather than treating an empty queue as success.
- Pending, unreached definitions do not make an otherwise successful run dead. A ready visit waiting for the queue consumer does not make a run dead either.

Add `self_dependency`, `unmet_dependencies`, `missing_result`, `task_timeout`, and `execution_error` to the shared failure vocabulary. Preparation uses `self_dependency`; the other codes describe accepted-run failures. Use the existing code/path/message/stepId shape. Dependency paths point into the publication; operation errors point into the operation input/output; timeout and engine-wide errors use the empty pointer when no narrower location applies. Messages remain bounded and sanitized.

For a task that starts but never settles, add daemon setting `runTaskTimeoutMs` / `RUN_TASK_TIMEOUT_MS`, proposed default 30,000 ms. Start its deadline when the task is claimed, not while it waits in the queue. The first accepted completion or timeout wins. A timeout records `task_timeout`, stops new dispatch, and aborts that task's child controller. While the executor promise remains unsettled, retain the running visit and show the run as stopping; on settlement, finish the visit with the timeout failure and discard any late output. The timeout must not falsely report that resources have been released.

This is cooperative interruption. A synchronous handler or schema evaluator that blocks the event loop also prevents the timer from firing. An uncooperative asynchronous handler remains tracked until it settles or the process reaches its forced-shutdown deadline. Hard execution isolation and worker health checks are not delivered by this design; the schema-trust review above is therefore a real deployment gate.

### Preparation corrections carried forward from PR #64

These findings remain relevant even though the proposed engine changed. Address them before connecting preparation to production invocation:

| File or boundary | Required correction and proof |
| --- | --- |
| `workflow-preparer.ts` and `value-schema.ts` | Replace plain-object accumulators for arbitrary names with null-prototype objects or maps. Inputs and schema properties named `__proto__`, `constructor`, or `prototype` must retain their literal meaning and validate correctly. Reuse `json-value.ts` ownership helpers where applicable. |
| `value-schema.ts` | Include `contentSchema` in schema-position traversal so reference checks and format-annotation handling cover it. Do not traverse `const`/`enum` data as schemas or alter canonical publication content. |
| `workflow-preparer.ts` | Cap refusals at 32 real, located failures. Drop the extra synthetic omission failure rather than misclassify omission as `invalid_document`. Remove the test that pins omission wording; verify the bound and the actionable failures retained. |
| `packages/workflow/src/schema.ts` and `execution.ts` | Move the shared UUID v7 pattern/schema to `packages/workflow/src/identifiers.ts` and consume it from both modules. Preserve accepted identifiers and digest vectors; do not relax the pattern or change authoring-route behavior. |
| `packages/workflow/src/validation/stages/graph-stage.ts` | After the compatibility decision, reject a step listing itself in `dependencies`, including an unreachable step. Locate the offending array member and register the finding through the existing findings catalog. Extend graph-stage/validator coverage and update the governing specification together. |

Retain offline JSON Schema 2020-12 validation, refusal of unsupported/external/recursive references, and format-as-annotation behavior. Compiling a schema successfully is not sufficient evidence that this release implements its meaning. The regular-expression risk requires the trust decision above, not another ineffective size check.

### Invocation, inspection, and HTTP integration

Add `controllers/runs/invoke.ts` and `controllers/runs/inspect.ts` in both applications. Put their shared route schemas and error mapping in the same area's `schemas.ts` and `errors.ts`, following the existing controller pattern. Register them in `http/routes.ts`, add a run tag in `http/tags.ts`, and expose the injected run service through each process's service context. Controllers must not import repositories or construct services.

Both services expose `POST /api/runs` and `GET /api/runs/:runId`. Reuse `RunInvocationSchema`: exact workflow ID, positive publication number, optional object inputs, and no unknown envelope fields. An absent input object means empty inputs. Return a relative `Location: /api/runs/<runId>` on acceptance and `Cache-Control: no-store` on every run response. The daemon retains its existing bearer authentication.

Keep one application error envelope. Extend the Control API's `src/schemas.ts` and add the daemon's application-level `src/schemas.ts` so a run refusal uses `code`, `message`, empty `findings`, and an optional `runRejection` containing the existing `RunInvocationRejection`. Workflow findings keep their existing meaning and shape. Do not disguise execution failures as workflow validation findings or put workflow-specific schemas into `packages/server/src/protocol.ts`.

| Outcome | HTTP treatment |
| --- | --- |
| Accepted invocation | 202 with `RunAcceptance` and Location. |
| Known run, including a failed run | 200 with `RunObservation`. |
| Malformed JSON, invalid envelope or path ID | 400 with the application error envelope; no run is created. |
| Invocation body over the configured limit | 413 during body consumption; no publication lookup. |
| Missing publication or unknown/restart-lost run | 404; use `publication_not_found` for invocation and `run_not_found` for inspection. |
| Unsupported execution, invalid workflow inputs, or an initial snapshot over budget | 422 with the matching `runRejection` reason and located failures. |
| Corrupt stored publication | 500 with `corrupt_publication` and a sanitized run rejection. Do not return stored content or the underlying exception. |
| Database unavailable or local admission closed | 503 with a service-availability/draining code, not a fabricated domain rejection. |
| Daemon connection/TLS/authentication failure or malformed response | Control API 502, retaining distinct sanitized daemon failure codes. A valid upstream `service_draining` maps to 503. |
| Daemon request deadline | Control API 504 `daemon_timeout`; never retry POST automatically. |

A timeout or disconnect after daemon acceptance can hide the run ID from the caller. M2 cannot resolve that ambiguity: another POST creates another run, even with identical publication and inputs. Invocation idempotency remains with [M3 durable acceptance](../epics/m3/1-recover-durable-runs.md). Completion deduplication within a run does not change this limitation.

Extend `apis/control-api/src/clients/daemon.ts` with invocation and retrieval operations and a private common request function used by readiness and the new calls. Preserve direct Node HTTP/HTTPS transport, certificate checks, the newest configured bearer token, abort handling, and bounded response reads. Use the existing `dependencyTimeoutMs` budget for the complete request and body consumption. Validate response schemas and identities: acceptance must match the requested workflow/publication, and inspection must match the requested run. Forward valid observations without rebuilding execution state or exposing a daemon URL.

#### Bounded request decoding

The framework currently provides one body decoder per application. The Control API's decoder strictly parses JSON and checks the controller-supplied schema; despite its workflow-specific name, parsing is not a workflow-document shape check. What is missing for run routes is bounded consumption and run-specific error mapping, not a second workflow parser.

Add an application-level decoder dispatcher in each `http/request-body.ts`. Select run decoding from the shared invocation body schema supplied by the registered controller; delegate other requests to the existing decoder. Construct these dispatchers with the configured run limits in the app factories, keeping OpenAPI generation listener-free. Preserve authoring's byte-exact document extraction and existing error behavior.

Add reusable bounded body-reading/depth-scanning helpers in `packages/server/src/request.ts`, with no workflow dependency. Both applications use them before calling the existing strict parser and `RunInvocationSchema` validation. Read at most the permitted bytes, reject invalid UTF-8 and duplicate keys through the existing parser, and check nesting before recursive parsing or schema evaluation. This does not require a per-controller decoder framework redesign.

### Observation limits and configuration

Wire settings through each application's existing schema, defaults, environment mapping, and startup validation. Configuration changes require restart.

| Setting | Default and constraint | Consumer |
| --- | --- | --- |
| `runMaxRequestBytes` / `RUN_MAX_REQUEST_BYTES` | 1 MiB; positive safe integer, compatible with the listener body ceiling. | Both services' run body decoders. |
| `runMaxSnapshotBytes` / `RUN_MAX_SNAPSHOT_BYTES` | 8 MiB; must leave room for structural state and a 64 KiB diagnostic reserve. | Daemon admission/output commitment and Control API inspection response reads. |
| `runMaxValueDepth` / `RUN_MAX_VALUE_DEPTH` | 128, configurable downward only. Root object/array counts as one level. | Both run input boundaries; daemon preparation and runtime value checks. |
| `runTaskTimeoutMs` / `RUN_TASK_TIMEOUT_MS` | 30,000 ms; positive safe integer within the runtime timer's supported range. | Daemon task claims only. It is independent of HTTP and shutdown deadlines. |

Preserve the readiness client's 64 KiB cap. Use the same cap for acceptance/error envelopes; successful observations use the snapshot setting instead. Reject invocation JSON deeper than 256 containers before recursive parsing, then apply the configured value depth before recursive validation. The scanner must account for quoted strings, escapes, and boundaries between streamed chunks.

`run-observation.ts` must budget the encoded UTF-8 snapshot, not JavaScript string length. Before admission, reserve the maximum output-free step/current-work representation, timestamp growth, and bounded diagnostics. Before each output commit, add that output's encoded cost; a result appears in both its step and the final run output and must be charged twice. Reject a candidate that would exceed the limit as `run_snapshot_limit`, keeping earlier outputs and enough space to explain the failure. Do not serialize the complete run after every dependency check or retain duplicate full snapshots merely to count bytes.

Bound diagnostics, including escaped pointer/name lengths, within the reserve. Never truncate an observation into invalid or misleading data. If a full failure location cannot fit, retain the step identity and a valid enclosing pointer rather than a clipped pointer. Both applications must use compatible limits; there is no negotiation in M2.

Retain completed runs until daemon exit without eviction. Per-run limits do not cap aggregate retained memory or schema evaluation time. Operators must understand those limits; this work does not quietly add retention or global capacity policy.

### Process lifetime and shutdown

Extend the existing lifecycle rather than add a daemon-only drain callback. Construct a generic work tracker inside `boot` before opening the application and pass a narrow registration capability as a second argument to the process factory. Update `Daemon.open`, `ControlApi.open`, direct callers in boundary tests, and lifecycle fixtures together. The process owns admission closure, abort-all, and resource closure; services receive only registration and completion capabilities.

Adapt the existing HTTP outstanding map to the tracker while retaining its handler/response-body semantics. A registration owns an abort controller and an idempotent release operation. Aborting a registration does not release it. A run gets a registration independent of its POST request, retained through queued turns, gaps between tasks, and executor settlement. Its terminal snapshot can remain in memory after its registration is released.

On SIGTERM or SIGINT, close new HTTP and run admission synchronously and start the existing single shutdown deadline. Already accepted runs may dispatch their remaining steps during drain; their continuations are not new root work. Wait for HTTP work and run registrations, then close the database and other process resources using the remaining deadline. Failed but fully settled runs do not prevent a clean exit.

At the deadline, abort outstanding work, force-close connections, attempt bounded resource closure, and exit nonzero. Repeated signals do not reset the clock. A pending publication query remains tracked until it actually settles, even if its caller has timed out; its late completion must not admit a run. A clean drain and an abort request are not interchangeable evidence of completion.

Preserve the existing rule that new HTTP requests, including GET inspection, are refused while the process drains. Do not promise external inspection after admission has closed. SIGHUP continues to log that restart is required without reloading configuration. Restarting the Control API leaves daemon work alone; restarting the daemon loses every M2 run, even after a clean drain.

## Progress

- [x] Inspect the checkpoint-1 implementation and map the blueprint to concrete execution and service changes.
- [ ] Obtain the contract, compatibility, and trust decisions above and correct checkpoint-1 defects.
- [ ] Build visit state, node behavior, local task execution, and direct execution verification.
- [ ] Integrate run admission/inspection, bounded transport, configuration, and generalized lifecycle tracking.
- [ ] Demonstrate the end-to-end behavior and record implementation/review evidence.

## Checkpoints

The implementing engineer owns each checkpoint and records its PR and evidence here. Each checkpoint leaves a runnable repository. API/specification owners review public contracts and format compatibility; an execution/concurrency reviewer reviews state transitions, admission races, completion ownership, and shutdown.

### Checkpoint 1: Preparation is safe to connect

Correct the preparation/schema defects, consolidate identifier validation, and add the proposed execution status/failure contracts. Keep publication validation changes behind the compatibility decision. Retain PR #64's preparation work; supersede its engine proposal in the PR description rather than claim an engine has been removed.

Acceptance: focused checks in `packages/workflow/src/execution.test.ts`, daemon preparation/schema/JSON tests, and approved graph-validation coverage demonstrate the specified refusals, literal-key handling, schema-position traversal, and unchanged publication digest vectors. The API/specification and trust reviews are recorded. Escalate any stricter v1 publication rule or proposed new supported schema capability before implementation depends on it.

Recovery: no production run path is connected. Revert the contract/preparation changes together if review finds a compatibility problem; do not leave consumers on different schemas.

### Checkpoint 2: A publication executes directly

Build the daemon-local modules, add a reusable `packages/workflow/src/fixtures/valid/sequential-calculation.json`, and add `apis/daemon/src/scripts/smoke-execution.ts` with the daemon package script `smoke:execution`. The script uses real preparation, operations, bindings, traversal, and result commitment without HTTP or Postgres.

Acceptance: `bun run --filter @rostrum/daemon smoke:execution` produces the calculation result below and a located division failure. Focused engine checks prove independent held runs, duplicate-safe claims/completions, dependency gating, dead-run detection, and timeout settlement. Obtain execution/concurrency review before connecting the engine to HTTP.

Recovery: execution remains unexposed. A failed check is fixed in the engine or contracts, not bypassed with a special-purpose smoke handler. No production sleep/fail operation or task-control endpoint is added.

### Checkpoint 3: Invocation owns work beyond the request

Add run services/controllers, the client calls, error envelopes, decoder dispatchers, configuration, and the lifecycle registration capability. Compose everything at startup, update existing factory callers, and regenerate both OpenAPI documents. Run acceptance must not ship before lifecycle tracking: otherwise a disconnected request could leave untracked execution.

Acceptance: controller/client and lifecycle checks prove the HTTP outcome table, request limits, no post-timeout admission, independent work ownership, and continuations during drain. Use both existing `generate-openapi` scripts, then both existing service smoke commands. Review the shared lifecycle signature and public error mapping together.

Recovery: retain the prepare/execute path from checkpoint 2 if HTTP integration needs revision. Remove run route registration as a complete cutover rather than expose endpoints whose accepted work is not tracked. No database migration or data rollback is involved.

### Checkpoint 4: Real services meet the Epic

Add `scripts/smoke-sequential.ts` and root command `bun run smoke:sequential`. Use `@rostrum/database/testing`'s `startTestPostgres`, existing migrations, and `DaemonProcess`; add a Control API process helper in `apis/control-api/src/scripts/process.ts` following the daemon helper. The command owns and disposes only its temporary database, configuration, and processes. Update process-helper environment filtering so ambient `RUN_MAX_*` and `RUN_TASK_TIMEOUT_MS` cannot change a scenario accidentally.

Acceptance: the service scenarios below pass against actual entry points, and controlled lifecycle fixtures prove held/uncooperative-work cases without production test controls. Run `bun run check`, `bun run lint`, and `bun test` once against the integrated implementation. Add the new smoke command to `.github/workflows/ci.yml` after confirming its disposable database requirements there; keep the existing daemon boundary smoke.

Update the root setup README and execution README with invocation, limits, trusted-deployment restrictions, and M2 restart/idempotency limitations. Obtain independent implementation review followed by the named human reviews. Recovery is a process restart with M2 state loss explicitly understood, not a promise of durable run recovery.

## Verification

These are implementation acceptance procedures, not checks already performed by this design rewrite. Reuse the existing fixtures and helpers. Add tests for observable failures, boundaries, and races; do not add suites that assert class layout, queue internals, message wording, or copied fields.

### Worked execution

The reusable calculation fixture adds workflow inputs `amount` and `surcharge`, divides the sum by `people`, and returns `total` and `perPerson` through an explicit result step. All three workflow inputs are declared and required. Step bindings consume the original workflow inputs and the validated addition output; result bindings consume both successful task outputs.

With amount 90, surcharge 10, and people 4, the final result has total 100 and perPerson 25. With people zero, invocation succeeds but division fails: the addition output stays inspectable, the result step never executes, and there is no final output. A string amount, missing declared input, or undeclared input refuses before any run or task exists. Reordering the fixture's step array must not alter either outcome.

Also reuse `minimum.json` for an empty result and `sequential.json` for greeting. Do not invent a second greeting contract solely for the smoke command.

### Focused checks

| Location | Setup and observable result |
| --- | --- |
| Existing preparation, value-schema, and JSON tests | Prototype-sensitive/dotted names retain values; `contentSchema` references and annotations follow schema rules; recursive/external schemas refuse; omitted optional input differs from null or an unresolved explicit reference; refusal count never exceeds 32 real failures. Preserve digest vectors. |
| `packages/workflow/src/execution.test.ts` | Waiting observations identify unmet dependencies; stopping observations contain failures and outstanding work; terminal failure cannot carry successful output or active work. Remove any affected tests that only pin enum lists or wording instead of a consumer contract. |
| New `execution/workflow-engine.test.ts` | Reverse declared step order, repeat advancement/queue delivery/completion, and return an immediately resolved result. Each reached task executes once and each successor receives only committed output; wrong-run/stale results cannot corrupt another visit. |
| The same engine suite, with controlled records/executors | Exercise one created visit whose dependencies are not all successful, then satisfy them and observe one dispatch. No outstanding work plus unmet dependencies fails with a location; no continuation/result fails distinctly; a pending disconnected definition does not fail success. These internal cases do not enable parallel invocation. |
| The same engine suite, with controlled settlement and clock | Hold one run while a second completes or fails. Inputs and outcomes stay isolated. A task deadline stops new work, remains stopping until actual settlement, and ignores late output. Terminal state does not change on repeated delivery or inspection. |
| New `execution/local-task-executor.test.ts` | Exercise zero and negative-zero division and arithmetic overflow; verify the specific domain failure rather than merely asserting that a promise resolves. |
| New engine/observation checks | Supply malformed, partial, mutable, too-deep, and oversized executor output. No candidate output reaches a successor or final result; prior committed data remains available. Escaped/multibyte values and duplicated result output are charged correctly, and the failure snapshot still fits. |
| New run-service and controller/client tests beside those modules | Cover every HTTP outcome above; malformed/wrong-identity/oversized upstream responses fail safely; POST is not retried; authoring's existing decoder and error shapes still work. Race cancellation/admission with a delayed publication lookup and verify no late run appears. |
| Existing `packages/server/src/lifecycle.test.ts`, `lifecycle.fixture.ts`, and `restart.test.ts` | Hold an HTTP body, a queued run, and task work during drain. Clean exit waits for all ownership; accepted continuations still run; an uncooperative task forces bounded nonzero exit; repeated signals close resources once; SIGHUP changes nothing. |

### Real-service scenarios

The `smoke:sequential` command publishes and invokes the calculation through the Control API, observes the accepted run ID, and later retrieves the exact result or division failure. It also covers these service-level requirements:

- Start overlapping invocations of one publication with different inputs. Each has its own ID and input-derived outcome; failure in one does not fail another.
- Disconnect after acceptance and reconnect from another client. Restart only the Control API and retrieve the same daemon-owned run. Repeated explicit POSTs create different runs; repeated GETs change nothing.
- Publish a newer publication after invocation. The accepted run continues to report its original publication number/digest and corresponding result.
- Remove database access after acceptance. Existing run execution and GET remain available; readiness and new invocation report dependency failure. Use a controlled test composition when a task must be held at this boundary rather than add a production delay operation.
- Configure matching non-default limits. Oversized streamed invocations fail before lookup; snapshots larger than the readiness cap still return intact when within the run limit; an output over budget produces an inspectable failure, not a truncated response.
- Shut down and restart the daemon. Old run IDs return 404. Use the lifecycle fixture for deterministic in-flight drain/forced-exit races; fast arithmetic alone cannot prove those races through timing luck.

After implementation, record command output, PR links, review outcomes, and any remaining acceptance gap here. A passing direct smoke does not stand in for the service scenarios, and a passing service smoke does not prove hard interruption of blocked JavaScript.

## Discoveries

- Checkpoint 1 already provides graph-preserving preparation and the work/result boundary; production callers and execution behavior are the missing pieces.
- The existing public step contract has no waiting state and no stopped-progress failure code. The blueprint therefore requires deliberate contract changes, not only new engine internals.
- Prepared maps and compiled validators cannot be persisted or sent as JSON merely because their source document is JSON.
- The current graph validator accepts self-dependency. Its correction needs both execution refusal and an explicit publication-compatibility decision.
- The current fan-in fixture and graph-stage tests include dependency-only joins. They are not proof that explicit-control-edge joins can be enabled without further specification/validation work.
- Both application decoders buffer their request bodies today. Run limits require actual bounded reads before parsing, not a length check after buffering.

## Decision log

- 2026-09-16: retain daemon-local execution, the controller/service split, and restart-only process configuration.
- 2026-09-17: checkpoint 1 added shared execution contracts, preparation, value guards, and the task boundary in PR #64. Its recorded verification was 505 passing tests, type checking, and lint with pre-existing warnings; that is historical checkpoint evidence, not verification of this design or an implemented engine. Human contract acceptance remained outstanding.
- 2026-09-19: expand the visit-based blueprint into this technical design. Retain preparation and task messages; select controlled current-record transitions, stateless node behavior, separate queue claims, explicit waiting/dead-run behavior, and cooperative task deadlines. Replace earlier claims that records were append-only or that a prepared graph was serializable. Mark compatibility and trust choices as implementation gates rather than settled facts.

## Outcome

The technical design is ready for review. The remaining work is the checkpoint-1 corrections, daemon execution engine, service/lifecycle integration, and the specified acceptance demonstrations. No runtime implementation or new runtime verification is claimed by this document revision. Once the Epic is implemented and accepted, move lasting contracts into the specification/code and retire this plan under the [delivery methodology](../epic-delivery-methodology.md).
