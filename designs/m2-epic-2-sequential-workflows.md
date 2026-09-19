# Sequential workflow execution — technical design

- Epic: [M2 Epic 2: Execute sequential workflows](../epics/m2/2-execute-sequential-workflows.md)
- Owner: Stephen Pierre-Paul
- Status: Proposed design filed for review on 2026-09-19. Execution is not implemented; every mechanism below is a proposal until the [review gates](#review-gates) complete.
- Repository baseline: [`RostrumAI/rostrum`](https://github.com/RostrumAI/rostrum) `main` at [`16622bc`](https://github.com/RostrumAI/rostrum/commit/16622bc), inspected 2026-09-19, with no local changes to the files described here. Paths are relative to that repository unless they begin with `../`.
- Parent blueprint: not established. The [designs index](README.md) records that this design carries the M2 Epic 2 architecture direction alone until a blueprint is adopted; link this document from that blueprint and record the requirements it covers once it exists.
- Superseded attempt: `feat/m2-sequential-checkpoint-1` ([rostrum #64](https://github.com/RostrumAI/rostrum/pull/64)) implemented shared execution contracts, value guards, and preparation for an earlier engine proposal. It is closed without merging, nothing from it is in `main`, and this design builds those modules as new work. Review findings from it that still apply are recorded under [Execution preparation requirements](#execution-preparation-requirements).
- Next action: complete the contract, compatibility, and trust reviews, then start Checkpoint 1.

## Purpose

Rostrum can publish an immutable workflow, but nothing executes one. This design connects a stored publication to a daemon-owned execution engine: a caller invokes an exact publication through the Control API, the daemon accepts a run and executes it independently of that caller, and any client can later retrieve the run's progress, output, or failures.

Execution support and publication validity are separate checks because the Control API and the daemon are separate processes that can run different releases. The daemon must refuse behavior it cannot execute before any run exists, so a publication this release cannot run fails at invocation rather than mid-run. Once the daemon accepts a run, later publications, caller disconnects, and Control API restarts must not change it.

The engine stays inside the daemon: there is no second execution consumer that would justify a runtime package, and the engine is exercised directly in tests without starting a listener. Graph traversal and task execution remain separate so a later worker implementation can execute one task without taking ownership of a workflow, and each run owns its records rather than a shared current-step chain.

## Scope

This work delivers exact-publication invocation, sequential deterministic execution ending in `result`, bindings between steps, concurrent independent runs, inspection, and graceful process shutdown. It supplies an in-memory dispatch queue and distinct handling for unmet dependencies and overdue task work.

Each run may have at most one task executing at a time; several runs may have outstanding tasks together. The queue separates eligibility from execution without introducing a configurable daemon-wide capacity or fairness policy, which belongs to [Epic 4](../epics/m2/4-execute-parallel-paths-and-joins.md).

Conditionals, parallel paths within a run, joins, and loops remain unsupported at invocation. Their future node behavior must fit the visit model, but this work adds no empty conditional or loop classes. Distributed queues, remote workers, leases, persistence, restart recovery, invocation deduplication, retries, cancellation APIs, and side-effecting handlers stay outside this Epic.

Covered Epic acceptance criteria: the stable run ID with no run created for a refusal; execution that outlives its initiating client; independently identifiable overlapping runs; inspection that distinguishes queued, active, succeeded, and failed execution and explains waiting and stopping work; declared-sequence execution that consumes only validated data; and the terminal result with immutable outcomes. [M2 Epic 6](../epics/m2/6-complete-m2-conformance.md) later combines evidence across the M2 execution Epics; it is not a prerequisite for these checkpoints.

## Current repository baseline

The inspected revision provides authoring, validation, publishing, storage, and both service boundaries, and no execution code at all: no execution contracts, run state, engine, task executor, run service, run route, or run table.

| Existing behavior | Baseline evidence | Use in this design |
| --- | --- | --- |
| Document validation | `createWorkflowValidator` runs eight gated stages (`packages/workflow/src/validation/stages/`) and returns findings with stable codes, JSON Pointers, and source locations (`packages/workflow/src/findings.ts`). The v1 step-type registry requires `task.config.operation` to be a string and accepts other config members (`packages/workflow/src/rules/v1.ts`). | Preparation re-runs this validator as the daemon's own acceptance check, then adds the execution-support checks the registry cannot express. |
| Canonicalization and digest | `PublicationCanonicalizer.canonicalize` returns `{canonicalText, digest}`; the stored text is the full RFC 8785 document, and the digest covers the canonical form with the metadata members `name` and `description` removed (`packages/workflow/src/publish/publication-canonicalizer.ts`, `packages/workflow/src/rules/v1.ts`). | Unchanged. Execution preparation is a separate step; see [What preparation decides](#what-preparation-decides). |
| Stored publications | `WorkflowRepository.getPublication(workflowId, publicationNumber)` returns a `Publication` (`publicationNumber`, `revisionId`, `workflowFormatVersion`, `canonicalText`, `digest`, `createdAt`) or null, and throws `DigestVerificationError` when the stored text cannot be canonicalized, is not canonical, or does not match its digest (`packages/database/src/repositories/workflow-repository.ts:307`). | The daemon's only new database read. |
| Daemon process composition | `Daemon.open` owns one `DatabaseHandle` and one application; `DaemonContext` is `{config, services, abortSignal}` with `services.system` today (`apis/daemon/src/daemon.ts`). | Add `services.runs` beside `services.system`; the repository reuses the handle the process already owns. |
| Controllers, authentication, OpenAPI | `defineDaemonController` and `defineControlController` bind controllers that each `http/routes.ts` registers statically; the daemon authenticates requests with a bearer token (`apis/daemon/src/auth.ts`); each application generates a checked-in `openapi.json` through its `generate-openapi` script. | Run controllers follow the same pattern and add a `runs` tag in each application. |
| Control API daemon client | `clients/daemon.ts` implements only `checkDaemonReadiness`, using direct Node HTTP(S), the newest configured token, abort handling, and a 64 KiB response bound (`apis/control-api/src/clients/daemon.ts`). | Extended with invocation and retrieval calls that share one request helper. |
| Lifecycle | `packages/server/src/lifecycle.ts` exports `ServiceRuntimeConfig`, `OpenedService`, and `boot`; outstanding HTTP work is a private `Map<Request, AbortController>` inside `boot`. | Generalized into a work tracker whose registration capability the process factory passes to the service tier. |
| Request decoding | The framework's default decoder reads a body with `await request.text()` (`packages/server/src/request.ts`); the Control API's workflow routes add a strict decoder over `await request.arrayBuffer()` (`apis/control-api/src/controllers/workflows/request-body.ts`). Nothing bounds bytes or nesting depth, and the readiness client's 64 KiB cap is the only bounded read in the repository. | New bounded-read and depth-scan helpers; run routes use them before parsing. |
| Configuration | `defineConfig` definitions map environment names such as `PORT`, `DATABASE_URL`, `DEPENDENCY_TIMEOUT_MS`, and `SHUTDOWN_TIMEOUT_MS`; changes require a process restart, and SIGHUP only logs (`apis/daemon/src/config.ts`, `apis/control-api/src/config.ts`). | The run limits below are declared in the same shape and are equally restart-only. |

The daemon does not yet depend on `@rostrum/workflow` or `uuid`; Checkpoint 1 adds both because preparation reuses the shared validator and because run and work IDs are UUID v7. `uuid` is already a dependency of the Control API and of `packages/database`, which mint and validate identifiers with it.

## Decisions

The design selects the mechanisms below. They are proposals, not approved contracts; the [review gates](#review-gates) name the reviews that must complete before consumers depend on them.

- **Keep the engine in the daemon.** There is no second execution consumer that warrants a runtime package, and the engine is exercised directly in tests.
- **Give the engine sole ownership of run-state changes.** Node classes describe step behavior; the executor performs an operation and returns a result; only the engine commits state.
- **Share the execution vocabulary, not the invocation.** `@rostrum/workflow` gains an execution module holding what both services must state identically about a run: run and step status values, failure codes and the failure shape, run-rejection reasons, and the acceptance and observation payloads that carry them. Each application declares its own request bodies, error envelopes, headers, and status codes. The Control API's public caller contract and the daemon's authenticated internal contract are separately owned and separately deployed, so one shared invocation schema would couple them without benefit; the run-state vocabulary must agree, which is why it is shared.
- **Derive traversal from visits and declared graph relationships**, never from an array index or a current-step pointer.
- **Use one current record per visit**, replaced through controlled transitions. Terminal records are immutable. This is not an append-only event log; calling changing status records append-only would hide the actual mutation model.
- **Keep the Epic's `succeeded` spelling for successful steps**, alongside `pending`, `waiting`, `ready`, `running`, and `failed`. The Epic's run states are queued, running, succeeded, and failed; the daemon adds `waiting` rather than collapse a visited-but-blocked step into `pending`.
- **Report dead-run and timeout causes through `ExecutionFailure.code`**, alongside the run status and `stopping` flag, rather than a second, loosely related substatus field.
- **Return 202 after admission and 200 for a successful inspection**, including inspection of a failed run. Neither response waits for workflow completion.

### Review gates

| Decision requiring review | Proposed treatment | Work it gates |
| --- | --- | --- |
| Rejecting self-dependency at publication | The v1 graph rules say no step may transitively depend on itself, yet the shipped validator accepts a step that lists itself in `dependencies` — verified on 2026-09-19 by validating such a document with `createWorkflowValidator`, which returned no findings and `validForPublication: true`. Cycle detection runs over control edges only, and a step trivially dominates itself, so the dependency-reachability check passes it. Correct the graph stage, but obtain a specification-owner decision on compatibility first: the [v1 versioning rules](../specifications/workflow-interface-v1.md#breaking-and-additive-changes) forbid silently invalidating previously accepted documents. Execution preparation can refuse these documents immediately without changing publication validity. | Shipping a stricter publication validator. If this is not accepted as a correction to the existing acyclic rule, use a versioned rule-set change rather than mutate frozen v1. |
| Schema execution trust | Restrict the initial in-process implementation to an explicitly trusted deployment. Author-supplied value fragments can carry regular expressions and other constructs whose evaluation cost is not bounded by payload size, and a trusted author set alone does not make adversarial inputs safe. Byte, depth, and timer limits do not solve this. | Exposure to untrusted authors or inputs. Such exposure requires an approved bounded or isolated execution strategy before release, not a claim that the task timeout below is a sandbox. |
| Execution and API additions | Review `waiting`, located engine failures, task deadlines, the run-rejection member of the application error envelope, and the new `@rostrum/workflow` execution module together. | Freezing the execution contract and implementing its consumers. These additions must not be presented as already approved. |

## Implementation approach

### Components and ownership

The daemon run service handles admission and observation. It reads the publication, asks preparation to check it, obtains process-owned work registration, and gives the accepted definition and inputs to the engine. The engine owns the run registry and all transitions. This keeps HTTP, database access, and process resource ownership out of graph execution.

Create the following modules under `apis/daemon/src/services/runs/`:

| New file | Responsibility and callers |
| --- | --- |
| `run-service.ts` | `RunService.invokeWorkflow` prepares and admits an invocation; `getRun` returns an observation or not-found. Both applications' run controllers call these operations through `context.services.runs`. The service receives the workflow repository, the preparer, the engine, and a narrow work-registration capability. |
| `execution/publication-preparer.ts` | Reads the stored canonical text, re-runs the shared validator, checks execution support, and returns the prepared workflow or a typed refusal. Called before a run exists. |
| `execution/json-value.ts` | One guard for what JSON can represent (cycles, holes, accessors, non-finite numbers, exotic prototypes) with a depth bound, applied to values and schema fragments before anything is read, copied, or stored. |
| `execution/value-schema.ts` | Validates declared value fragments against offline JSON Schema 2020-12 resources and compiles them into the checks a run uses. |
| `execution/operation-contracts.ts` | The supported operations' configuration and output schemas, and the failure codes each can produce. |
| `execution/task-executor.ts` | The task boundary: `TaskWorkItem` (run id, work id, step id, workflow-format version, validated operation config, resolved inputs — serializable, with no database handle, request context, engine callback, or prepared definition in it) and `TaskWorkResult` (a complete output or a typed failure). Cancellation is an out-of-band signal, never part of the message. |
| `execution/local-task-executor.ts` | Implements that boundary over `operation-contracts.ts`. It receives no engine, database, or HTTP context. |
| `execution/bindings.ts` | Resolves prepared bindings against one run's accepted inputs and successful visits. Node execution preparation uses it; task handlers never resolve references. |
| `execution/run-state.ts` | Defines run and visit records and their permitted transitions. The engine is their only writer. Inputs, committed outputs, and failures belong here rather than to node instances or a separate mutable output store. |
| `execution/execution-node.ts` | Defines `ExecutionNode`, `TaskExecutionNode`, and `ResultExecutionNode`: they hold prepared definitions and return creation, execution, and completion decisions, and never own progress or look up a run globally. Keep the three small classes together until additional behavior justifies separate files. |
| `execution/workflow-engine.ts` | `WorkflowEngine` owns accepted runs, `advanceWorkflow(runId)`, the ready queue, task claims, completion matching, deadlines, and lifecycle release. The run service admits work; executor settlement schedules further advancement. |
| `execution/run-observation.ts` | Projects coherent public snapshots and accounts for their byte budget. `getRun` uses this projection; output commitment uses its budget calculation. |

`packages/workflow` gains one module, `src/execution.ts`, exported as `@rostrum/workflow/execution`. It holds the shared vocabulary and data shapes and no behavior. `packages/workflow/package.json` declares that subpath export, and `apis/daemon/package.json` adds `@rostrum/workflow` and `uuid` dependencies. Mint run and work IDs with `uuid`'s v7 implementation, following the Control API and `packages/database`; declare identifier fields in schemas with the workflow package's existing UUID v7 pattern rather than writing a second one.

The in-memory object holding a run has two parts. Its state contains the publication binding, owned inputs, visits, failures, and timestamps. Its runtime collaborators contain the prepared definition, work registration, outstanding executor promises, abort controllers, timers, and scheduled-turn flags. Only the first part is execution data: an abort controller or compiled validator must not leak into a task message or observation.

### What preparation decides

Publishing and executing answer different questions, and this design only adds the second. The publish-time contract is unchanged: the Control API validates a revision, canonicalizes it once (RFC 8785), stores the canonical text, and stores a SHA-256 digest computed over the canonical form with the metadata members `name` and `description` removed. Retrieval re-canonicalizes the stored text and re-checks the digest.

Execution preparation is the daemon-side decision this design introduces. It answers "can this release execute this stored publication, and what does the engine read at run time", and it runs before any run exists. It reads the stored canonical text and:

1. Strictly parses it and runs the shared v1 validator, so a daemon never executes content its own release's rules would reject.
2. Checks execution support for every declared step, not only the reachable sequence: the step type is one this release executes; a `task` step's `config` is exactly one supported operation declaration; a `result` step carries no configuration; `conditional` and `loop` are refused; a step has at most one distinct successor.
3. Validates declared value fragments (`inputs` and step `outputs`) against offline JSON Schema 2020-12 resources and compiles them into the checks the run will use.
4. Resolves every binding into a literal it owns or a reference it can resolve at run time.
5. Produces the **prepared workflow**: an immutable, process-local object holding the publication binding, the entry step, every declared step keyed by id, each step's successors and dependencies, its resolved bindings, its declared outputs, and the compiled checks.

The prepared workflow is not JSON. It holds maps and compiled validator instances, so it cannot be persisted, hashed, or sent between processes; only run state and the work/result messages are JSON data. The term describes this object specifically — deciding capability and compiling a definition — and is not the metadata removal and canonicalization that publishing already performs.

Refusals are typed, located, and happen before a run exists:

| Situation | Reason |
| --- | --- |
| Stored content fails parse or validation | `corrupt_publication` |
| Unsupported step type, configuration, control flow, binding, or schema | `unsupported_execution` |
| Missing, undeclared, or invalid invocation inputs | `invalid_inputs` |

A refusal reports bounded, sanitized failures with JSON Pointer locations, capped at 32 real failures. Retain offline JSON Schema 2020-12 validation, refusal of unsupported, external, and recursive references, and format-as-annotation behavior: compiling a schema successfully is not evidence that this release implements its meaning, which is why the trust gate above is a real deployment decision.

### Preparing and accepting an invocation

Invocation follows the existing tier boundary: Control API controller → Control API run service → authenticated daemon client → daemon controller → daemon run service. The Control API does not read the publication to decide whether it is executable and does not allocate a run ID.

The daemon performs these steps in order:

1. Retrieve the selected publication through `WorkflowRepository.getPublication`. A missing row becomes `publication_not_found`; `DigestVerificationError` becomes `corrupt_publication`. A database connection or query failure is a service-availability failure, not corrupt content.
2. Build the publication binding from the requested `workflowId` and the retrieved publication number, format version, digest, and canonical text. The repository's `Publication` type does not carry `workflowId`, and preparation must still verify that the document identity matches the binding.
3. Call the preparer. Refuse unknown operations and configuration, conditionals, loops, and more than one distinct successor as `unsupported_execution`; keep supported disconnected definitions inspectable. Refuse a self-dependency with a located failure before a run exists.
4. Validate invocation inputs and budget the initial observation, including future status and timestamp growth and failure space. Reuse the preparer's owned, frozen inputs rather than copy them again on admission.
5. Recheck request cancellation, the request deadline, and process admission after asynchronous publication retrieval. In one synchronous section, register independent run work, allocate the run ID, insert its state, and schedule its first advancement. If this section cannot finish, remove the unaccepted state and release the registration; dispatch nothing.
6. Return the acceptance containing `runId`, the exact publication binding, and `status: queued`. Delivering that response is independent of execution; a following GET may already see a terminal run.

Before step 5, cancellation prevents admission. After step 5, the run belongs to the daemon: the request signal is no longer its cancellation signal. Accepted execution and inspection need no more database reads, so a later database outage affects readiness and new invocations, not already accepted runs.

### Run context, visit identity, and states

A step definition belongs to the publication. A **visit** is one activation of that definition in one run. The run context is the engine-owned state supplied to node behavior, not the controller's request context. Nodes receive read access to inputs and committed visits; only the engine commits a returned decision.

For this Epic, each reached step has one root activation. Its run-local `nodeId` is the published `stepId`, and its `activation` is null. The complete lookup includes the run ID, so two runs of the same publication never share a visit; there is no need to hash a UUID merely to use it as a key.

Identity construction stays with node creation. A future loop must include the loop step and iteration in the activation identity, because two loops can use the same body definition. All predecessors requesting the same target activation must obtain the same identity, and the predecessor and arrival order must not be part of it. Attempts and `workId` are separate from visit identity. This is an extension constraint, not an instruction to implement loop scopes or attempts now.

A visit record contains its identity, step ID, activation, status, creation time, and state-specific fields. Running work has a work ID and start time. Success has a completion time and a wholly validated output. Failure has a completion time, a located failure, and a start time only if execution actually started. Use distinct record variants rather than unrelated optional fields.

| Step state | Meaning and transition |
| --- | --- |
| `pending` | No visit exists. Inspection derives this from the prepared definition; the engine does not pre-create every visit. |
| `waiting` | A visit exists, but a declared dependency has not succeeded. Inspection includes `waitingFor`, the unsatisfied dependency step IDs. |
| `ready` | Dependencies are satisfied and the visit is eligible for dispatch. A queued notification is not permission to bypass the claim check. |
| `running` | The engine has claimed the visit and recorded its work ownership before invoking the executor. |
| `succeeded` | The complete output passed validation and was committed. It may now supply bindings and permit continuation. |
| `failed` | The visit cannot succeed. A binding failure can enter this state before executor invocation; failed output is never published. |

`steps` remains in document order for display, not execution order. `currentSteps` uses that same stable order and lists only ready and running work. An unreached disconnected step remains pending even when the run succeeds.

Derive run status with failure precedence. Before the first advancement it is queued. Once advancement starts it is running. An unhandled failure stops new dispatch; while an executor is still outstanding the run is running with `stopping: true`, then becomes failed. Without a failure, successful result commitment makes it succeeded. Store transition timestamps when the event occurs, not on each GET. Terminal observations have no active work and cannot later change their outcome.

### Node behavior and graph traversal

`ExecutionNode.createVisit` supplies the target identity and initial waiting record. `prepareExecution` resolves and validates inputs and returns either task work, a local result candidate, or a located failure. `completeExecution` receives an accepted output and returns either successor activations or the final run result. The engine applies these decisions through the same transition path for every node.

`TaskExecutionNode` plans the prepared task's successors after successful commitment. `ResultExecutionNode` returns its resolved input object as the final result and creates no successor. Neither class dispatches work or writes records independently. Future conditional and loop behavior can change the activation decisions without introducing a second scheduler; those constructs are fields on workflow steps, not new v1 type names to invent here.

Control edges decide **which visits exist**. Dependencies decide **which existing visits may execute**. For example, if A leads to B and C and both lead to D, B's completion can create D's visit, but D stays waiting when its declared dependencies include unfinished C. C's completion finds that same visit rather than creating a second D, and opens the remaining gate.

That example explains the separation; it is not a supported Epic 2 invocation. `packages/workflow/src/fixtures/valid/fan-out-fan-in.json` is a pure fan-in fixture whose join has dependencies and no incoming control edge, and the graph-stage suite accepts that shape. Epic 4 must reconcile it and the dominator rules with executable parallel graphs under the versioning policy; removing the preparation refusal alone will not deliver joins.

`advanceWorkflow(runId)` is a synchronous transition pass. It never awaits a handler or runs one inline:

1. Stop immediately for a terminal run. For a stopping run, start no new work and finish failure only after outstanding work settles.
2. On the first turn, create the entry visit and record the run start time. After a successful completion, ensure the successor visits returned by the node. Repeated creation requests return the existing visit without resetting its state.
3. Recheck waiting visits against successful dependency records in this run, and promote satisfied visits to ready. A failed dependency never satisfies a gate.
4. Notify the in-memory dispatch queue about newly ready visits. Coalesce notifications by run and visit identity; the queue is an index of work, not the authoritative state.
5. Once all local transitions for this turn are accounted for, detect a run that has no possible continuation as described under failures below.

The queue consumer performs the claim separately. It reloads the visit, checks that the run can dispatch and has no running task, resolves inputs, and records `workId` and running state before calling the executor. Duplicate or stale queue entries do nothing: a ready visit cannot be dispatched twice, even when advancement is requested repeatedly before consumption.

Use scheduled event-loop turns for advancement and dispatch, with per-run coalescing flags. Do not recursively advance through immediately resolved promises or run an entire chain in one microtask loop. Each turn starts at most one task per run, then yields so HTTP requests and other runs can progress, and a held executor promise must not block the queue from starting a different run. No process-wide lock is required: state changes contain no `await`, and task work begins only after the claim has been recorded.

### Task execution, data flow, and completion

The executor receives a work item carrying the run, work, and step IDs, the workflow format version, the validated operation configuration, and the fully resolved input object. Its separate abort signal comes from daemon-owned execution, not the invoking request. It returns a success or failure result identified by run and work ID.

The local executor implements only these operations, using the schemas in `operation-contracts.ts`:

| Operation | Behavior | Expected failure |
| --- | --- | --- |
| `greet` | Accept a string `name` and return `greeting` containing `Hello, <name>!`. | Invalid inputs are refused before dispatch. |
| `add` | Add finite `left` and optional finite `right`; an omitted right operand means zero. Return `value`. | A non-finite result is `numeric_overflow`. |
| `divide` | Divide finite `dividend` by finite `divisor` and return `value`. | Either sign of zero is `division_by_zero`; a non-finite result is `numeric_overflow`. |

Use ordinary JSON-number arithmetic, without coercion or decimal-money guarantees. No operation does I/O. The executor translates unexpected throws and rejections into a sanitized `task_error`, and the engine also observes every executor promise rejection so an adapter defect cannot strand a run.

Bindings reuse prepared bindings rather than parse reference strings again. Literal values are already owned by the prepared definition; workflow inputs are owned by the run. Step-output references resolve only against succeeded visits and their committed output members. Use own-property access, not truthiness or prototype lookup, and treat a dotted input name as one key. An explicit unresolved reference fails even when the operation member would otherwise be optional; an omitted optional binding is different. Schema defaults supply no values.

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
- Pending, unreached definitions do not make an otherwise successful run dead, and a ready visit waiting for the queue consumer does not make a run dead either.

The shared failure vocabulary contains at least `self_dependency`, `unmet_dependencies`, `missing_result`, `task_timeout`, `execution_error`, `task_error`, `numeric_overflow`, `division_by_zero`, and `run_snapshot_limit`, using the existing code, path, message, and step-id shape. Preparation uses `self_dependency`; the other codes describe accepted-run failures. Dependency paths point into the publication; operation errors point into the operation input or output; timeout and engine-wide errors use the empty pointer when no narrower location applies. Messages remain bounded and sanitized.

For a task that starts but never settles, add daemon setting `runTaskTimeoutMs` / `RUN_TASK_TIMEOUT_MS`, proposed default 30,000 ms. Start its deadline when the task is claimed, not while it waits in the queue. The first accepted completion or timeout wins. A timeout records `task_timeout`, stops new dispatch, and aborts that task's child controller. While the executor promise remains unsettled, retain the running visit and show the run as stopping; on settlement, finish the visit with the timeout failure and discard any late output. The timeout must not falsely report that resources have been released.

This is cooperative interruption: a synchronous handler or schema evaluator that blocks the event loop also prevents the timer from firing, and an uncooperative asynchronous handler remains tracked until it settles or the process reaches its forced-shutdown deadline. Hard execution isolation and worker health checks are not delivered by this design, which is why the schema-trust review above is a real deployment gate.

### Execution preparation requirements

These requirements come from the review of the closed checkpoint-1 attempt and from the inspected baseline. They apply to the new preparation and guard modules; none of them describes code that exists in `main` today.

| File or boundary | Requirement and proof |
| --- | --- |
| Preparation accumulators and JSON guards | Accumulate arbitrary names in null-prototype objects or maps so inputs and schema properties named `__proto__`, `constructor`, or `prototype` retain their literal meaning and validate correctly. Prove it with a preparation case built from such names, not with a schema that merely accepts them. |
| Schema-position traversal | Cover every schema position, including `contentSchema`, when checking references and stripping format annotations. Do not traverse `const` or `enum` data as schemas, and never alter stored publication content. |
| Refusal reporting | Cap refusals at 32 real, located failures and drop any synthetic omission entry rather than misclassify omission as a document problem. Verify the bound and the actionable failures retained, not the omission wording. |
| Identifier declaration | Declare identifier fields with one UUID v7 pattern. Export the workflow package's existing pattern for the daemon's execution schemas instead of adding a second definition. |
| Publication validation | After the compatibility decision, reject a step listing itself in `dependencies`, including an unreachable step. Locate the offending array member, register the finding through the existing findings catalog, extend graph-stage coverage, and update the governing specification together. |

### Invocation, inspection, and HTTP integration

Add `controllers/runs/invoke.ts` and `controllers/runs/inspect.ts` in both applications, with route schemas and error mapping in each area's `schemas.ts` and `errors.ts`, following the existing controller pattern. Register them in `http/routes.ts`, add a `runs` tag to each application's tag vocabulary, and expose the injected run service through each process's service context. Controllers must not import repositories or construct services.

Both services expose `POST /api/runs` and `GET /api/runs/:runId`. Each application declares its own invocation request schema — exact workflow ID, positive publication number, optional object inputs, and no unknown envelope fields — because the two surfaces are separately owned; an absent input object means empty inputs. Return a relative `Location: /api/runs/<runId>` on acceptance and `Cache-Control: no-store` on every run response; the daemon already sets that header for every response, and the Control API's run controllers must add it. The daemon retains its existing bearer authentication.

Keep one application error envelope per application. The Control API extends its `ErrorResponseSchema` with an optional run-rejection member carrying the shared rejection reason and located failures, and the daemon gains an application schema module so its inline boundary error shape is declared once with the same member. Workflow findings keep their existing meaning and shape. Do not disguise execution failures as workflow validation findings or put workflow-specific schemas into the generic server package.

| Outcome | HTTP treatment |
| --- | --- |
| Accepted invocation | 202 with the acceptance payload and Location. |
| Known run, including a failed run | 200 with the run observation. |
| Malformed JSON, invalid envelope, or invalid path ID | 400 with the application error envelope; no run is created. |
| Invocation body over the configured limit | 413 during body consumption; no publication lookup. |
| Missing publication, or unknown or restart-lost run | 404; `publication_not_found` for invocation and `run_not_found` for inspection. |
| Unsupported execution, invalid workflow inputs, or an initial snapshot over budget | 422 with the matching rejection reason and located failures. |
| Corrupt stored publication | 500 with `corrupt_publication` and a sanitized rejection. Do not return stored content or the underlying exception. |
| Database unavailable or local admission closed | 503 with a service-availability or draining code, not a fabricated domain rejection. |
| Daemon connection, TLS, or authentication failure, or a malformed response | Control API 502, retaining distinct sanitized daemon failure codes. A valid upstream `service_draining` maps to 503. |
| Daemon request deadline | Control API 504 `daemon_timeout`; never retry POST automatically. |

A timeout or disconnect after daemon acceptance can hide the run ID from the caller. M2 cannot resolve that ambiguity: another POST creates another run, even with identical publication and inputs. Invocation idempotency remains with [M3 durable acceptance](../epics/m3/1-recover-durable-runs.md). Completion deduplication within a run does not change this limitation.

Extend `apis/control-api/src/clients/daemon.ts` with invocation and retrieval operations and a private common request function shared with readiness. Preserve direct Node HTTP/HTTPS transport, certificate checks, the newest configured bearer token, abort handling, and bounded response reads. Use the existing `dependencyTimeoutMs` budget for the complete request and body consumption. Validate response schemas and identities: an acceptance must match the requested workflow and publication, and an inspection must match the requested run. Forward valid observations without rebuilding execution state or exposing a daemon URL.

#### Bounded request decoding

Both applications' decoders currently buffer whole request bodies: the framework default reads text with no bound, and the Control API's workflow decoder uses `arrayBuffer()`. What run routes need is bounded consumption and run-specific error mapping, not a second workflow parser.

Add bounded body-reading and depth-scanning helpers in `packages/server/src/request.ts`, with no workflow dependency. Both applications use them before the existing strict parse and schema check on run routes: read at most the permitted bytes, reject invalid UTF-8 and duplicate keys through the existing parser, and check nesting before recursive parsing or schema evaluation. Give each application a decoder dispatcher that selects run decoding from the shared run body schema supplied by the registered controller and delegates other requests to its existing decoder, constructed with the configured run limits in the app factories so OpenAPI generation stays listener-free. Preserve authoring's byte-exact document extraction and existing error behavior.

### Observation limits and configuration

Wire settings through each application's existing configuration schema, defaults, environment mapping, and startup validation. Configuration changes require restart.

| Setting | Default and constraint | Consumer |
| --- | --- | --- |
| `runMaxRequestBytes` / `RUN_MAX_REQUEST_BYTES` | 1 MiB; positive safe integer, compatible with the listener body ceiling. | Both services' run body decoders. |
| `runMaxSnapshotBytes` / `RUN_MAX_SNAPSHOT_BYTES` | 8 MiB; must leave room for structural state and a 64 KiB diagnostic reserve. | Daemon admission and output commitment, and Control API inspection response reads. |
| `runMaxValueDepth` / `RUN_MAX_VALUE_DEPTH` | 128, configurable downward only. The root object or array counts as one level. | Both run input boundaries; daemon preparation and runtime value checks. |
| `runTaskTimeoutMs` / `RUN_TASK_TIMEOUT_MS` | 30,000 ms; positive safe integer within the runtime timer's supported range. | Daemon task claims only. It is independent of HTTP and shutdown deadlines. |

Preserve the readiness client's 64 KiB cap. Use the same cap for acceptance and error envelopes; successful observations use the snapshot setting instead. Reject invocation JSON deeper than 256 containers before recursive parsing, then apply the configured value depth before recursive validation. The scanner must account for quoted strings, escapes, and boundaries between streamed chunks.

`run-observation.ts` must budget the encoded UTF-8 snapshot, not JavaScript string length. Before admission, reserve the maximum output-free step and current-work representation, timestamp growth, and bounded diagnostics. Before each output commit, add that output's encoded cost; a result appears in both its step and the final run output and must be charged twice. Reject a candidate that would exceed the limit as `run_snapshot_limit`, keeping earlier outputs and enough space to explain the failure. Do not serialize the complete run after every dependency check or retain duplicate full snapshots merely to count bytes.

Bound diagnostics, including escaped pointer and name lengths, within the reserve. Never truncate an observation into invalid or misleading data: if a full failure location cannot fit, retain the step identity and a valid enclosing pointer rather than a clipped pointer. Both applications must use compatible limits; there is no negotiation in M2.

Retain completed runs until daemon exit without eviction. Per-run limits do not cap aggregate retained memory or schema evaluation time. Operators must understand those limits; this work does not quietly add retention or global capacity policy.

### Process lifetime and shutdown

Extend the existing lifecycle rather than add a daemon-only drain callback. Construct a generic work tracker inside `boot` before opening the application and pass a narrow registration capability as a second argument to the process factory. Update `Daemon.open`, `ControlApi.open`, direct callers in boundary tests, and lifecycle fixtures together. The process owns admission closure, abort-all, and resource closure; services receive only registration and completion capabilities.

Adapt the existing HTTP outstanding map to the tracker while retaining its handler and response-body semantics. A registration owns an abort controller and an idempotent release operation, and aborting a registration does not release it. A run gets a registration independent of its POST request, retained through queued turns, gaps between tasks, and executor settlement; its terminal snapshot can remain in memory after its registration is released.

On SIGTERM or SIGINT, close new HTTP and run admission synchronously and start the existing single shutdown deadline. Already accepted runs may dispatch their remaining steps during drain; their continuations are not new root work. Wait for HTTP work and run registrations, then close the database and other process resources using the remaining deadline. Failed but fully settled runs do not prevent a clean exit.

At the deadline, abort outstanding work, force-close connections, attempt bounded resource closure, and exit nonzero. Repeated signals do not reset the clock. A pending publication query remains tracked until it actually settles, even if its caller has timed out; its late completion must not admit a run. A clean drain and an abort request are not interchangeable evidence of completion.

Preserve the existing rule that new HTTP requests, including GET inspection, are refused while the process drains, and do not promise external inspection after admission has closed. SIGHUP continues to log that restart is required without reloading configuration. Restarting the Control API leaves daemon work alone; restarting the daemon loses every M2 run, even after a clean drain.

## Progress

- [x] Re-baseline this design against `rostrum` `main` and the closed checkpoint-1 attempt (2026-09-19).
- [ ] Complete the reviews in [Review gates](#review-gates) and record their outcomes here.
- [ ] Checkpoint 1: execution contracts and preparation.
- [ ] Checkpoint 2: direct daemon-local execution.
- [ ] Checkpoint 3: invocation and inspection through both services.
- [ ] Checkpoint 4: real-service, lifecycle, and operator evidence.

## Checkpoints

The implementing engineer owns each checkpoint and records its pull request and evidence here. Each checkpoint leaves a runnable repository. API and specification owners review public contracts and format compatibility; an execution and concurrency reviewer reviews state transitions, admission races, completion ownership, and shutdown.

### Checkpoint 1: Execution contracts and preparation

**Outcome and scope:** `@rostrum/workflow` exports the shared execution vocabulary, and the daemon can prepare a stored publication, refusing unsupported behavior and invalid inputs before any run exists. No run is created and no task executes yet.

**Dependencies and work:** nothing beyond `main`. Add the execution module and its subpath export to the workflow package; add preparation, operation contracts, bindings, and the JSON and value-schema guards to the daemon; add `@rostrum/workflow` and `uuid` to the daemon's dependencies; export the UUID v7 pattern for reuse. Record the execution-preparation rules that belong to the document contract in [workflow format v1](../specifications/workflow-interface-v1.md) with the specification owner rather than encoding them only in code. Behind the compatibility decision, extend the graph stage and update the specification; do not change which documents publish before that decision.

**Owner and review:** the implementing engineer. API and specification review for the shared vocabulary, refusal reasons, and specification text; the schema-trust decision above before any untrusted exposure.

**Verification:** focused workflow-package tests for the vocabulary and unchanged digest vectors; daemon tests for preparation refusals, prototype-sensitive names, schema-position traversal, refusal bounds, and JSON ownership; a direct preparation run of the worked example with no HTTP and no Postgres that resolves the example's bindings and refuses a string amount, a missing input, an undeclared input, and an unknown operation with distinct reasons and locations. `bun run check` and `bun test` pass.

**Recovery and handoff:** no production path consumes the vocabulary yet. Revert the workflow-package and daemon changes together so no consumer is left on a half-published contract.

### Checkpoint 2: A publication executes directly

**Outcome and scope:** the daemon executes an accepted prepared publication to its result, with run state, node behavior, bindings, local task execution, and the observation projection in place.

**Dependencies and work:** checkpoint 1. Build the engine, run state, node classes, and local executor; add a reusable `packages/workflow/src/fixtures/valid/sequential-calculation.json`; add `apis/daemon/src/scripts/smoke-execution.ts` with the daemon's `smoke:execution` script. The script uses real preparation, operations, bindings, traversal, and result commitment without HTTP or Postgres.

**Owner and review:** the implementing engineer. Obtain execution and concurrency review before connecting the engine to HTTP.

**Verification:** `bun run --filter @rostrum/daemon smoke:execution` produces the calculation result and a located division failure. Focused engine checks prove independent held runs, duplicate-safe claims and completions, dependency gating, dead-run detection, and timeout settlement.

**Recovery and handoff:** execution remains unexposed. Fix a failed check in the engine or contracts rather than bypassing it with a special-purpose smoke handler; do not add a production sleep or fail operation or a task-control endpoint.

### Checkpoint 3: Invocation owns work beyond the request

**Outcome and scope:** a caller publishes, invokes, receives 202, and retrieves the outcome through the Control API, including after disconnecting, and accepted work is tracked by process lifetime rather than by its request.

**Dependencies and work:** checkpoint 2. Add run services and controllers to both applications, the client calls, error envelopes, decoder dispatchers, configuration, and the lifecycle registration capability. Compose everything at startup, update existing factory callers, and regenerate both OpenAPI documents. Run acceptance must not ship before lifecycle tracking, or a disconnected request could leave untracked execution.

**Owner and review:** the implementing engineer, with review of the shared lifecycle signature and the public error mapping together.

**Verification:** controller, client, and lifecycle checks prove the HTTP outcome table, request limits, no admission after a timeout, independent work ownership, and continuations during drain. Regenerate both OpenAPI documents through the existing scripts, then run both existing service smoke commands.

**Recovery and handoff:** retain the checkpoint 2 prepare and execute path if HTTP integration needs revision. Remove run route registration as a complete cutover rather than expose endpoints whose accepted work is not tracked. No database migration or data rollback is involved.

### Checkpoint 4: Real services meet the Epic

**Outcome and scope:** the Epic's acceptance criteria hold across real service processes, and the lifecycle and operator limits are proven.

**Dependencies and work:** checkpoint 3. Add `scripts/smoke-sequential.ts` and the root command `bun run smoke:sequential`, using `@rostrum/database/testing`'s `startTestPostgres`, the existing migrations, the daemon's process harness, and a Control API process helper in `apis/control-api/src/scripts/process.ts` modeled on the daemon's. Update the process helpers' ambient environment filtering so `RUN_MAX_*` and `RUN_TASK_TIMEOUT_MS` cannot change a scenario accidentally. Update the root setup README and add the execution README with invocation, limits, the trusted-deployment restriction, and the M2 restart and idempotency limitations.

**Owner and review:** the implementing engineer; independent implementation review followed by the named human reviews.

**Verification:** the real-service scenarios under [Verification](#verification) pass against actual entry points, and controlled lifecycle fixtures prove held and uncooperative work without production test controls. Run `bun run check`, `bun run lint`, and `bun test` once against the integrated implementation. Add the new smoke command to `.github/workflows/ci.yml` after confirming its disposable database requirements there, and keep the existing daemon boundary smoke.

**Recovery and handoff:** recovery is a process restart with M2 state loss explicitly understood, not a promise of durable run recovery. Keep the old run IDs returning 404 after a restart, and record any remaining acceptance gap here.

## Verification

These are implementation acceptance procedures, not checks already performed by this design. Reuse the existing fixtures and helpers. Add tests for observable failures, boundaries, and races; do not add suites that assert class layout, queue internals, message wording, or copied fields.

### Worked execution

The reusable calculation fixture adds workflow inputs `amount` and `surcharge`, divides their sum by `people`, and returns `total` and `perPerson` through an explicit result step. All three workflow inputs are declared and required. Step bindings consume the original workflow inputs and the validated addition output; result bindings consume both successful task outputs.

With amount 90, surcharge 10, and people 4, the final result has total 100 and perPerson 25. With people zero, invocation succeeds but division fails: the addition output stays inspectable, the result step never executes, and there is no final output. A string amount, a missing declared input, or an undeclared input refuses before any run or task exists. Reordering the fixture's step array must not alter either outcome.

Also reuse `minimum.json` for an empty result and `sequential.json` for greeting. Do not invent a second greeting contract solely for the smoke command.

### Focused checks

| Location | Setup and observable result |
| --- | --- |
| New `packages/workflow/src/execution.test.ts` | Waiting observations identify unmet dependencies; stopping observations contain failures and outstanding work; a terminal failure cannot carry successful output or active work. Do not add tests that only pin enum lists or wording. |
| New daemon preparation, value-schema, and JSON-guard tests | Prototype-sensitive and dotted names retain values; `contentSchema` references and annotations follow schema rules; recursive or external schemas refuse; an omitted optional input differs from null or an unresolved explicit reference; the refusal count never exceeds 32 real failures. |
| New `execution/workflow-engine.test.ts` | Reverse declared step order, repeat advancement, queue delivery, and completion, and return an immediately resolved result. Each reached task executes once and each successor receives only committed output; wrong-run and stale results cannot corrupt another visit. |
| The same engine suite, with controlled records and executors | Exercise one created visit whose dependencies are not all successful, then satisfy them and observe one dispatch. No outstanding work plus unmet dependencies fails with a location; no continuation or result fails distinctly; a pending disconnected definition does not fail success. These internal cases do not enable parallel invocation. |
| The same engine suite, with controlled settlement and clock | Hold one run while a second completes or fails; inputs and outcomes stay isolated. A task deadline stops new work, remains stopping until actual settlement, and ignores late output. Terminal state does not change on repeated delivery or inspection. |
| New `execution/local-task-executor.test.ts` | Exercise zero and negative-zero division and arithmetic overflow; verify the specific domain failure rather than merely that a promise resolves. |
| New engine and observation checks | Supply malformed, partial, mutable, too-deep, and oversized executor output. No candidate output reaches a successor or the final result, and prior committed data remains available. Escaped and multibyte values, and duplicated result output, are charged correctly, and the failure snapshot still fits. |
| New run-service and controller or client tests beside those modules | Cover every HTTP outcome above; malformed, wrong-identity, and oversized upstream responses fail safely; POST is not retried; both services accept and refuse the same invocation envelopes; authoring's existing decoder and error shapes still work. Race cancellation and admission with a delayed publication lookup and verify no late run appears. |
| Existing `packages/server/src/lifecycle.test.ts`, `lifecycle.fixture.ts`, and restart tests | Hold an HTTP body, a queued run, and task work during drain. Clean exit waits for all ownership; accepted continuations still run; an uncooperative task forces a bounded nonzero exit; repeated signals close resources once; SIGHUP changes nothing. |

### Real-service scenarios

The `smoke:sequential` command publishes and invokes the calculation through the Control API, observes the accepted run ID, and later retrieves the exact result or division failure. It also covers these service-level requirements:

- Start overlapping invocations of one publication with different inputs. Each has its own ID and input-derived outcome; failure in one does not fail another.
- Disconnect after acceptance and reconnect from another client. Restart only the Control API and retrieve the same daemon-owned run. Repeated explicit POSTs create different runs; repeated GETs change nothing.
- Publish a newer publication after invocation. The accepted run continues to report its original publication number and digest and its corresponding result.
- Remove database access after acceptance. Existing run execution and GET remain available; readiness and new invocation report a dependency failure. Use a controlled test composition when a task must be held at this boundary rather than add a production delay operation.
- Configure matching non-default limits. Oversized streamed invocations fail before lookup; snapshots larger than the readiness cap still return intact when within the run limit; an output over budget produces an inspectable failure, not a truncated response.
- Shut down and restart the daemon. Old run IDs return 404. Use the lifecycle fixture for deterministic in-flight drain and forced-exit races; fast arithmetic alone cannot prove those races through timing luck.

After implementation, record command output, pull-request links, review outcomes, and any remaining acceptance gap here. A passing direct smoke does not stand in for the service scenarios, and a passing service smoke does not prove hard interruption of blocked JavaScript.

## Discoveries

- Publishable does not mean executable. Validation requires `task.config.operation` to be a string and allows other config members, accepts any config object on a `result` step, and never compiles declared value fragments, so an unknown operation name, an unsupported control flow, a malformed fragment, or more than one successor can publish today. Execution preparation must refuse these without changing publication validity.
- The shipped validator accepts a step listing itself in `dependencies` (verified by running `createWorkflowValidator` on such a document on 2026-09-19: no findings, `validForPublication: true`). Cycle detection covers control edges only, and a step trivially dominates itself.
- The graph suite already accepts pure fan-in joins whose dependencies are not dominators (`fan-out-fan-in.json`, "accepts pure fan-in joins whose dependencies are not dominators"), so enabling parallel execution in Epic 4 needs more than removing the preparation refusal.
- Both application decoders buffer request bodies without a byte or depth bound, and the readiness client's 64 KiB cap is the repository's only bounded read; run limits require actual bounded reads before parsing.
- The daemon already owns a database handle and a service tier, so the publication read adds no new process resource, but the daemon has no `@rostrum/workflow` dependency yet — preparation and the shared vocabulary are its first consumers.
- No run persistence exists anywhere: no run table, repository, or migration. M2 run state is in memory by construction, and Checkpoint 4 states that loss plainly rather than implying recovery.
- Prepared definitions are process-local. Maps and compiled validators cannot be persisted or sent as JSON merely because their source document is JSON.

## Decision log

- 2026-09-16: retain daemon-local execution, the controller and service split, and restart-only process configuration. (Carried over from the superseded M2 Epic 2 plan.)
- 2026-09-19: re-baseline this design on `rostrum` `main` after the checkpoint-1 branch and pull request were closed unmerged. The shared contracts and preparation it held become Checkpoint 1 work here, and its engine proposal stays replaced by the visit model in this document. Its applicable review findings are retained under [Execution preparation requirements](#execution-preparation-requirements).
- 2026-09-19: contract placement, after review — each application implements its own invocation, response envelopes, and error mapping, while `@rostrum/workflow` holds the execution vocabulary and the run-state payloads both services must agree on.
- 2026-09-19: define preparation explicitly rather than inherit it from the closed branch: publishing still owns metadata exclusion and canonicalization, and execution preparation is a separate daemon-side capability decision and compilation step.
- 2026-09-19: use one record per visit with controlled transitions, keep the Epic's status spelling, and report dead-run and timeout causes as failure codes rather than adding a substatus field.

Record approvals or changed contracts here before dependent implementation; review comments and proposed designs are not implementation evidence.

## Outcome

The design sets out how M2 Epic 2 becomes executable behavior on the inspected baseline: a shared execution vocabulary, daemon-side preparation that refuses what this release cannot run, a visit-based engine, invocation and inspection through both services, bounded requests and observations, and lifecycle tracking for accepted runs. Nothing in it is implemented yet. The next action is the review gates above, then Checkpoint 1; once the Epic is implemented and accepted, move lasting contracts into the specification and code and retire this design under the [delivery methodology](../epic-delivery-methodology.md).
