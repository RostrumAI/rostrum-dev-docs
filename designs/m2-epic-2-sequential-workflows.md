# Sequential workflow execution — technical design

- Epic: [M2 Epic 2: Execute sequential workflows](../epics/m2/2-execute-sequential-workflows.md)
- Owner: Stephen Pierre-Paul
- Status: Proposed design, revised for owner review on 2026-09-20. Execution is not implemented. The owner decisions below are recorded separately from the remaining design review.
- Repository baseline: [`RostrumAI/rostrum`](https://github.com/RostrumAI/rostrum) `main` at [`16622bc`](https://github.com/RostrumAI/rostrum/commit/16622bc), inspected 2026-09-19, with no local changes to the files described here. Paths are relative to that repository unless they begin with `../`.
- Parent blueprint: not established. Stephen Pierre-Paul owns adopting the blueprint and linking this design before implementation, as required by the [delivery methodology](../epic-delivery-methodology.md#resuming-work-from-prior-combined-plans). Review of this design may continue meanwhile.
- Superseded attempt: `feat/m2-sequential-checkpoint-1` ([rostrum #64](https://github.com/RostrumAI/rostrum/pull/64)) is closed without merging, and nothing from it is in `main`. This design does not reinstate its generic JSON guards or engine model. Applicable findings are retained under [Execution preparation requirements](#execution-preparation-requirements).
- Next action: continue the owner's design review. Implementation waits for the parent blueprint and the reviews identified in the checkpoints, not another decision on whether pre-production v1 may change.

## Purpose

Rostrum can publish an immutable workflow, but nothing executes one. This design connects a stored publication to a daemon-owned execution engine: a caller invokes an exact publication through the Control API, the daemon accepts a run and executes it independently of that caller, and any client can later retrieve the run's progress, output, or failures.

Execution support and publication validity are separate checks because the Control API and the daemon are separate processes that can run different releases. The daemon must refuse behavior it cannot execute before any run exists, so a publication this release cannot run fails at invocation rather than mid-run. Once the daemon accepts a run, later publications, caller disconnects, and Control API restarts must not change it.

The engine stays inside the daemon: there is no second execution consumer that would justify a runtime package, and the engine is exercised directly in tests without starting a listener. Graph traversal and task execution remain separate so a later worker implementation can execute one task without taking ownership of a workflow. Each run owns its step state rather than a shared current-step chain.

## Scope

This work delivers exact-publication invocation, sequential deterministic execution ending in `result`, bindings between steps, concurrent independent runs, inspection, and graceful process shutdown. It supplies an in-memory dispatch queue and distinct handling for unmet dependencies and overdue task work.

Each run may have at most one task executing at a time; several runs may have outstanding tasks together. The queue separates eligibility from execution without introducing a configurable daemon-wide capacity or fairness policy, which belongs to [Epic 4](../epics/m2/4-execute-parallel-paths-and-joins.md).

Conditionals, parallel paths within a run, joins, and loops remain unsupported at invocation. Their future node behavior must fit the visit model, but this work adds no empty conditional or loop classes. Distributed queues, remote workers, leases, persistence, restart recovery, invocation deduplication, retries, cancellation APIs, and side-effecting handlers stay outside this Epic.

Covered Epic acceptance criteria: the stable run ID with no run created for a refusal; execution that outlives its initiating client; independently identifiable overlapping runs; inspection that distinguishes queued, active, completed, and failed execution and explains waiting and stopping work; declared-sequence execution that consumes only validated data; and the terminal result with immutable outcomes. [M2 Epic 6](../epics/m2/6-complete-m2-conformance.md) later combines evidence across the M2 execution Epics; it is not a prerequisite for these checkpoints.

## Current repository baseline

The inspected revision provides authoring, validation, publishing, storage, and both service boundaries, and no execution code at all: no execution contracts, run state, engine, task executor, run service, run route, or run table.

| Existing behavior | Baseline evidence | Use in this design |
| --- | --- | --- |
| Document validation | `createWorkflowValidator` runs eight gated stages (`packages/workflow/src/validation/stages/`) and returns located findings (`packages/workflow/src/findings.ts`). When a task's `config` is present, the v1 registry requires its `operation` to be a string and accepts other config members (`packages/workflow/src/rules/v1.ts`). | Publication already runs this pipeline. Invocation does not run it again; preparation checks only what this daemon can execute and the supplied values. |
| Canonicalization and digest | `PublicationCanonicalizer.canonicalize` returns `{canonicalText, digest}`; the stored text is the full RFC 8785 document, and the digest covers the canonical form with the metadata members `name` and `description` removed (`packages/workflow/src/publish/publication-canonicalizer.ts`, `packages/workflow/src/rules/v1.ts`). | Unchanged. Execution preparation is a separate step; see [What preparation decides](#what-preparation-decides). |
| Stored publications | `WorkflowRepository.getPublication(workflowId, publicationNumber)` returns a `Publication` (`publicationNumber`, `revisionId`, `workflowFormatVersion`, `canonicalText`, `digest`, `createdAt`) or null, and throws `DigestVerificationError` when the stored text cannot be canonicalized, is not canonical, or does not match its digest (`packages/database/src/repositories/workflow-repository.ts:307`). | The daemon's only new database read. |
| Daemon process composition | `Daemon.open` owns one `DatabaseHandle` and one application; `DaemonContext` is `{config, services, abortSignal}` with `services.system` today (`apis/daemon/src/daemon.ts`). | Add `services.runs` beside `services.system`; the repository reuses the handle the process already owns. |
| Controllers, authentication, OpenAPI | `defineDaemonController` and `defineControlController` bind controllers that each `http/routes.ts` registers statically; the daemon authenticates requests with a bearer token (`apis/daemon/src/auth.ts`); each application generates a checked-in `openapi.json` through its `generate-openapi` script. | Run controllers follow the same pattern and add a `runs` tag in each application. |
| Control API daemon client | `clients/daemon.ts` implements only `checkDaemonReadiness`, using direct Node HTTP(S), the newest configured token, abort handling, and a 64 KiB response bound (`apis/control-api/src/clients/daemon.ts`). | Extended with invocation and retrieval calls that share one request helper. |
| Lifecycle | `packages/server/src/lifecycle.ts` exports `ServiceRuntimeConfig`, `OpenedService`, and `boot`; outstanding HTTP work is a private `Map<Request, AbortController>` inside `boot`. | Generalized into a work tracker whose registration capability the process factory passes to the service tier. |
| Request decoding | The framework decoder uses `JSON.parse` after `request.text()` (`packages/server/src/request.ts`); authoring uses `parseWorkflow` after `request.arrayBuffer()` to reject duplicate keys and preserve source text (`apis/control-api/src/controllers/workflows/request-body.ts`). Neither decoder sets a route-specific byte limit. | Keep those parsers. Run requests get a byte limit before buffering; no custom JSON parser or depth scanner. |
| Configuration | `defineConfig` definitions map environment names such as `PORT`, `DATABASE_URL`, `DEPENDENCY_TIMEOUT_MS`, and `SHUTDOWN_TIMEOUT_MS`; changes require a process restart, and SIGHUP only logs (`apis/daemon/src/config.ts`, `apis/control-api/src/config.ts`). | The run limits below are declared in the same shape and are equally restart-only. |

The daemon does not yet depend on `@rostrum/workflow` or `uuid`; Checkpoint 1 adds both to reuse the document schema and execution vocabulary and to mint UUID v7 run and work IDs. `uuid` is already a dependency of the Control API and of `packages/database`.

## Decisions

The owner has selected `completed` as the successful state name and authorized pre-production breaking changes, including the self-dependency correction in v1. Other mechanisms below remain proposals under review.

- **Keep the engine in the daemon.** There is no second execution consumer that warrants a runtime package, and the engine is exercised directly in tests.
- **Give the engine sole ownership of run-state changes.** Node classes describe step behavior; the executor performs an operation and returns a result; only the engine commits state.
- **Share the execution vocabulary, not the invocation.** `@rostrum/workflow` gains an execution module holding what both services must state identically about a run: run and step status values, failure codes and the failure shape, run-rejection reasons, and the acceptance and observation payloads that carry them. Each application declares its own request bodies, error envelopes, headers, and status codes. The Control API's public caller contract and the daemon's authenticated internal contract are separately owned and separately deployed, so one shared invocation schema would couple them without benefit; the run-state vocabulary must agree, which is why it is shared.
- **Derive traversal from visits and declared graph relationships**, never from an array index or a current-step pointer.
- **Keep one state object for each visit in its run's visit map.** A visit is a particular step reached in a particular run. Its map entry holds its latest status, timestamps, and output or failure; a transition replaces that entry rather than appending a history event. Only the engine writes it, and terminal entries do not change. There is no database row or event log in this Epic.
- **Use `completed` for successful runs and steps.** Step states are `pending`, `waiting`, `ready`, `running`, `completed`, and `failed`; run states are `queued`, `running`, `completed`, and `failed`. Completed means success, while terminal includes both completed and failed. The [Epic](../epics/m2/2-execute-sequential-workflows.md#understanding-execution-progress) uses the same terms.
- **Report dead-run and timeout causes through `ExecutionFailure.code`**, alongside the run status and `stopping` flag, rather than a second, loosely related substatus field.
- **Return 202 after admission and 200 for a successful inspection**, including inspection of a failed run. Neither response waits for workflow completion.

### Review status and prerequisites

[Pre-production compatibility](../decisions/pre-production-compatibility.md) records the owner's standing direction: propose needed breaking changes and update v1 in place before production rather than preserve unreleased behavior through shims. Correcting direct self-dependency is approved under that policy; it no longer needs a separate compatibility decision.

The rest of this document is for the owner's continuing review. The API reviewer checks that callers can distinguish refusal, acceptance, progress, and terminal outcomes. The execution reviewer checks visit ownership, duplicate dispatch, failure, and shutdown ordering. Checkpoints identify when each review is needed; no further choice of status terminology or pre-production compatibility policy is outstanding.

Implementation still requires an adopted parent blueprint and completion of those reviews. Stephen Pierre-Paul owns that handoff. The limits of in-process schema checking are explained under [Input and output schemas](#input-and-output-schemas); this design does not introduce a new deployment mode or claim to isolate hostile workloads.

## Implementation approach

### Core concepts and responsibilities

A **publication** is the immutable workflow definition already stored by Rostrum. A **run** is one invocation of that publication with a fixed set of inputs. Several runs can share a publication without sharing execution state.

A **visit** is one reached step within a run. The run context holds accepted inputs and a map of visit state objects: which steps were reached, their status, and their committed outputs or failures. A step with no visit is pending. This is ordinary in-memory execution state, not a database record or a saved history of every transition.

The **preparer** converts the publication into a definition the daemon can use: it checks supported operations and control flow, indexes steps, prepares bindings, and compiles the declared input and output checks. It does not repeat publication validation. The resulting **prepared workflow** contains no live run progress.

The **workflow engine** owns runs and changes their visit states. It decides which visits are ready and puts them on an in-memory dispatch queue. The queue identifies candidate work; the engine checks eligibility again before starting it.

An **execution node** describes how one kind of step creates a visit, prepares its work, and handles completion. `TaskExecutionNode` continues to successors; `ResultExecutionNode` produces the workflow's final output. Both implement `ExecutionNode`. They return decisions to the engine rather than changing run state themselves, so later conditional and loop behavior can use the same state owner.

A task's **operation** is the actual function it performs, such as greeting a name or adding two numbers. The **task executor** selects that function and calls it. The engine hands it a `TaskWorkItem`: the run, work, and step IDs, format version, operation configuration, and resolved input values. The executor returns a `TaskWorkResult`: the matching run and work IDs with either output values or a typed failure. These are data-only request and result objects, not another queue or service. Cancellation is a separate signal. Neither object contains a database handle, HTTP context, engine callback, or compiled workflow.

The daemon **run service** connects admission and observation to the engine: retrieve a publication, prepare it, register process-owned work, then admit the run. The Control API's separate run service forwards invocation and inspection to the daemon. Controllers call their own application's service. Inspection projects the daemon's current run state into a response; it never advances execution.

For example, after an addition task finishes, the executor returns its sum to the engine. The engine validates and commits that output, asks the task node which successors to visit, and schedules advancement. The successor can then resolve a binding to the sum. The executor never chooses that successor.

### Input and output schemas

The workflow format already lets an author describe accepted values with JSON Schema. In the existing `sequential.json` fixture, workflow `inputs.name` is `{"type":"string"}`, and the task's `outputs.greeting` has the same schema. These declarations say what values are allowed; they are not the values supplied to a run. Step `inputs`, by contrast, contain literal values or references that supply the operation's arguments.

The daemon checks invocation values against the workflow input schemas before accepting a run. It checks task arguments against the operation's own input schema before dispatch and checks returned values against both the operation's output schema and the workflow step's declared output schemas before allowing later steps to use them. A declaration such as `{"type":"number"}` must reject a string amount rather than coerce it.

Publishing currently validates the document's structure and references, not the contents of these embedded schemas or actual run values. Preparation therefore uses a JSON Schema library to compile the declared checks. JSON parsing continues to use the existing parsers.

Schema evaluation runs in the daemon process. A schema can contain a regular expression through `pattern`; an expensive match can block that process even when the input is small. A request-size limit limits bytes, not computation, and a timer cannot interrupt blocked JavaScript. Hard isolation for hostile schemas or inputs is outside this local-execution Epic. Before enabling that use, the product and security owners must define an isolated or bounded evaluator; successful local execution must not be presented as evidence that this risk is solved.

### What preparation decides

The publication lifecycle already validates a revision, canonicalizes it once (RFC 8785), and stores the canonical text and a SHA-256 digest computed over the canonical form with `name` and `description` excluded. Retrieval verifies canonical form and digest through `WorkflowRepository.getPublication`. Those storage and integrity checks remain unchanged.

Preparation answers a narrower question: can this daemon release execute that publication? It trusts the validation performed at publication and does not call `createWorkflowValidator` again. The processes can run different releases, so it still checks the daemon's supported format and capabilities:

1. Parse the integrity-checked canonical text with `JSON.parse` and check its format and document shape using the existing `WorkflowDocumentSchema`. This establishes what the daemon can read, without repeating graph, termination, or reference validation. Check that the document ID and format match the publication binding.
2. Check execution support for every declared step, not only the reachable sequence: a supported task operation and configuration, no configuration on a result step, no conditional or loop behavior, and at most one distinct successor. Refuse direct self-dependency, including in a publication created before the validator correction.
3. Compile the workflow input and step output schemas into checks for actual values. Refuse a schema this release cannot interpret rather than treating an ignored constraint as enforced.
4. Resolve every binding into a literal the prepared workflow owns or a reference it can resolve at run time.
5. Produce the **prepared workflow**: an immutable, process-local object holding the publication binding, the entry step, every declared step keyed by id, each step's successors and dependencies, its prepared bindings, its declared outputs, and the compiled checks.

The prepared workflow is not JSON. It holds maps and compiled validator instances, so it cannot be persisted, hashed, or sent between processes; only run state and the work/result messages are JSON data. The term describes this object specifically — deciding capability and compiling a definition — and is not the metadata removal and canonicalization that publishing already performs.

Refusals are typed, located, and happen before a run exists:

| Situation | Reason |
| --- | --- |
| Invalid stored JSON, digest/canonicalization failure, or a document identity inconsistent with its stored binding | `corrupt_publication` |
| Unsupported document version or shape, step type, configuration, control flow, binding, or schema | `unsupported_execution` |
| Missing, undeclared, or invalid invocation inputs | `invalid_inputs` |

A refusal reports sanitized failures with JSON Pointer locations, capped at 32 real failures. Publication findings remain the authoring validator's contract; these failures explain why this daemon cannot accept an invocation.

#### Compiling declared schemas

Keep TypeBox for schemas Rostrum defines in code. For author-declared schemas, add Ajv's JSON Schema 2020-12 compiler (`ajv/dist/2020`) in the daemon. Its [compile API](https://ajv.js.org/api.html#ajv-compile-schema-object-data-any-boolean-promise-any) checks that a declaration is a valid schema before generating its value check. This avoids implementing schema validation ourselves. The installed TypeBox compiler alone cannot provide that check: on 2026-09-20, an in-memory probe compiled `{"type":"not-a-json-schema-type"}` and accepted a string; an unresolved `$ref` also compiled instead of reporting a declaration error.

Use these [compiler options](https://ajv.js.org/options.html) and boundaries:

- Keep schema validation and unknown-keyword rejection enabled (`validateSchema` and `strictSchema`). Disable the optional strict-type and tuple-style restrictions (`strictTypes: false`, `strictTuples: false`) rather than add restrictions beyond the supported JSON Schema rules.
- Treat `format` as an annotation (`validateFormats: false`). Do not coerce values, insert defaults, or remove extra properties. Keep finite-number checking enabled.
- Compile synchronously with no remote loader and reject asynchronous validators. Local references are resolved by the library; a missing reference or an unsupported schema becomes a located `unsupported_execution` refusal. Do not add a schema walker to rewrite annotations or implement reference resolution.
- Scope the compiler to preparation, set `addUsedSchema: false`, and do not register author declarations for cross-schema or process-wide lookup. Keep the compiled checks with the prepared workflow, not in a global cache keyed by author-supplied IDs.

Map compile errors to the input or output declaration's document pointer. Map a value mismatch to the supplied value's pointer. An unexpected evaluator exception causes `unsupported_execution` before admission, or fails the affected visit as `execution_error` after admission. No raw exception or supplied data appears in the failure message. Compilation and evaluation remain subject to the in-process limits described above.

### Preparing and accepting an invocation

Invocation follows the existing tier boundary: Control API controller → Control API run service → authenticated daemon client → daemon controller → daemon run service. The Control API does not read the publication to decide whether it is executable and does not allocate a run ID.

The daemon performs these steps in order:

1. Retrieve the selected publication through `WorkflowRepository.getPublication`. A missing row becomes `publication_not_found`; `DigestVerificationError` becomes `corrupt_publication`. A database connection or query failure is a service-availability failure, not corrupt content.
2. Build the publication binding from the requested `workflowId` and the retrieved publication number, format version, digest, and canonical text. The repository's `Publication` type does not carry `workflowId`, and preparation must still verify that the document identity matches the binding.
3. Call the preparer. Refuse unknown operations and configuration, conditionals, loops, and more than one distinct successor as `unsupported_execution`; keep supported disconnected definitions inspectable. Refuse a self-dependency with a located failure before a run exists.
4. Validate invocation inputs and budget the initial observation, including future status and timestamp growth and failure space. Take one owned input snapshot for the run; do not repeatedly copy it between admission layers.
5. Recheck request cancellation, the request deadline, and process admission after asynchronous publication retrieval. In one synchronous section, register independent run work, allocate the run ID, insert its state, and schedule its first advancement. If this section cannot finish, remove the unaccepted state and release the registration; dispatch nothing.
6. Return the acceptance containing `runId`, the exact publication binding, and `status: queued`. Delivering that response is independent of execution; a following GET may already see a terminal run.

Before step 5, cancellation prevents admission. After step 5, the run belongs to the daemon: the request signal is no longer its cancellation signal. Accepted execution and inspection need no more database reads, so a later database outage affects readiness and new invocations, not already accepted runs.

### Run context, visit identity, and states

The engine owns a map of runs. Each run owns its inputs and a `Map<nodeId, VisitState>`. Nodes can read this run context but cannot update either map; their returned decisions tell the engine what transition to apply. A second map entry is a second reached visit, not another version of an earlier status.

For this Epic, each reached step has one root activation. Its run-local `nodeId` is the published `stepId`, and its `activation` is null. The complete lookup includes the run ID, so two runs of the same publication never share a visit; there is no need to hash a UUID merely to use it as a key.

Identity construction stays with node creation. A future loop must include the loop step and iteration in the activation identity, because two loops can use the same body definition. All predecessors requesting the same target activation must obtain the same identity, and the predecessor and arrival order must not be part of it. Attempts and `workId` are separate from visit identity. This is an extension constraint, not an instruction to implement loop scopes or attempts now.

Each `VisitState` is a plain object with identity, step ID, activation, status, creation time, and state-specific fields. The engine replaces a waiting object with a ready object under the same map key, then with running and terminal variants as work progresses. Running state has a work ID and start time. Completed state has a completion time and validated output. Failed state has a completion time, a located failure, and a start time only if execution started. Previous variants are not retained; there is no append-only history. Distinct variants prevent output from appearing on failed or unfinished work.

| Step state | Meaning and transition |
| --- | --- |
| `pending` | No visit exists. Inspection derives this from the prepared definition; the engine does not pre-create every visit. |
| `waiting` | A visit exists, but a declared dependency has not completed. Inspection includes `waitingFor`, the unsatisfied dependency step IDs. |
| `ready` | Dependencies are satisfied and the visit is eligible for dispatch. A queued notification is not permission to bypass the claim check. |
| `running` | The engine has claimed the visit and recorded its work ownership before invoking the executor. |
| `completed` | The complete output passed validation and was committed. It may now supply bindings and permit continuation. |
| `failed` | The visit cannot succeed. A binding failure can enter this state before executor invocation; failed output is never published. |

`steps` remains in document order for display, not execution order. `currentSteps` uses that same stable order and lists only ready and running work. An unreached disconnected step remains pending even when the run completes.

Derive run status with failure precedence. Before the first advancement it is queued. Once advancement starts it is running. An unhandled failure stops new dispatch; while an executor is still outstanding the run is running with `stopping: true`, then becomes failed. Without a failure, successful result commitment makes it completed. Store transition timestamps when the event occurs, not on each GET. Terminal observations have no active work and cannot later change their outcome.

### Node behavior and graph traversal

`ExecutionNode.createVisit` supplies the target identity and initial waiting state. `prepareExecution` resolves and validates inputs and returns either task work, a local result candidate, or a located failure. `completeExecution` receives an accepted output and returns either successor activations or the final run result. The engine applies these decisions through the same transition path for every node.

`TaskExecutionNode` plans the prepared task's successors after successful commitment. `ResultExecutionNode` returns its resolved input object as the final result and creates no successor. Neither class dispatches work or writes visit state independently. Future conditional and loop behavior can change the activation decisions without introducing a second scheduler; those constructs are fields on workflow steps, not new v1 type names to invent here.

Control edges decide **which visits exist**. Dependencies decide **which existing visits may execute**. For example, if A leads to B and C and both lead to D, B's completion can create D's visit, but D stays waiting when its declared dependencies include unfinished C. C's completion finds that same visit rather than creating a second D, and opens the remaining gate.

That example explains the separation; it is not a supported Epic 2 invocation. `packages/workflow/src/fixtures/valid/fan-out-fan-in.json` is a pure fan-in fixture whose join has dependencies and no incoming control edge, and the graph-stage suite accepts that shape. Epic 4 must reconcile it and the dominator rules with executable parallel graphs under the versioning policy; removing the preparation refusal alone will not deliver joins.

`advanceWorkflow(runId)` is a synchronous transition pass. It never awaits a handler or runs one inline:

1. Stop immediately for a terminal run. For a stopping run, start no new work and finish failure only after outstanding work settles.
2. On the first turn, create the entry visit and record the run start time. After a successful completion, ensure the successor visits returned by the node. Repeated creation requests return the existing visit without resetting its state.
3. Recheck waiting visits against completed dependencies in this run, and promote satisfied visits to ready. A failed dependency never satisfies a gate.
4. Notify the in-memory dispatch queue about newly ready visits. Coalesce notifications by run and visit identity; the queue is an index of work, not the authoritative state.
5. Once all local transitions for this turn are accounted for, detect a run that has no possible continuation as described under failures below.

The queue consumer performs the claim separately. It reloads the visit, checks that the run can dispatch and has no running task, resolves inputs, and records `workId` and running state before calling the executor. Duplicate or stale queue entries do nothing: a ready visit cannot be dispatched twice, even when advancement is requested repeatedly before consumption.

Use scheduled event-loop turns for advancement and dispatch, with per-run coalescing flags. Do not recursively advance through immediately resolved promises or run an entire chain in one microtask loop. Each turn starts at most one task per run, then yields so HTTP requests and other runs can progress, and a held executor promise must not block the queue from starting a different run. No process-wide lock is required: state changes contain no `await`, and task work begins only after the claim has been recorded.

### Task execution, data flow, and completion

The executor receives a work item carrying the run, work, and step IDs, the workflow format version, the validated operation configuration, and the fully resolved input object. Its separate abort signal comes from daemon-owned execution, not the invoking request. It returns a success or failure result identified by run and work ID.

Each operation has its own module containing its configuration, input and output schemas, expected failures, and implementation. A small static registry makes those definitions available to the preparer and local executor. The executor selects and calls an operation; it does not accumulate every operation's logic in one file. This Epic provides:

| Operation | Behavior | Expected failure |
| --- | --- | --- |
| `greet` | Accept a string `name` and return `greeting` containing `Hello, <name>!`. | Invalid inputs are refused before dispatch. |
| `add` | Add finite `left` and optional finite `right`; an omitted right operand means zero. Return `value`. | A non-finite result is `numeric_overflow`. |
| `divide` | Divide finite `dividend` by finite `divisor` and return `value`. | Either sign of zero is `division_by_zero`; a non-finite result is `numeric_overflow`. |

Use ordinary JSON-number arithmetic, without coercion or decimal-money guarantees. No operation does I/O. The executor translates unexpected throws and rejections into a sanitized `task_error`, and the engine also observes every executor promise rejection so an adapter defect cannot strand a run.

Bindings reuse prepared bindings rather than parse reference strings again. Literal values are already owned by the prepared definition; workflow inputs are owned by the run. Step-output references resolve only against completed visits and their committed output members. Use own-property access, not truthiness or prototype lookup, and treat a dotted input name as one key. An explicit unresolved reference fails even when the operation member would otherwise be optional; an omitted optional binding is different. Schema defaults supply no values.

Completion returns to the engine, not to a node that looks up global state:

1. Match both run ID and work ID against the dispatched work and its still-running visit. Unknown, wrong-run, stale, and duplicate deliveries cannot commit or release successors. If the promise for a known dispatch returns mismatched identity, fail that dispatch as `execution_error` rather than leave it running indefinitely.
2. For a task failure, attach the known step ID and commit the sanitized failure. For a success candidate, validate the complete operation output and every declared output member. The built-in operations return flat objects containing strings or finite numbers; their concrete output schemas reject other values. They are not an arbitrary plugin boundary needing a second generic JSON validator.
3. Charge the observation budget before retaining candidate data. Once all checks pass, make one owned immutable output and commit it with successful visit state in the same synchronous transition. Invalid, partial, oversized, or subsequently mutated handler output must never become input to another node.
4. Ask the node for its continuation and schedule advancement. Repeated delivery cannot repeat this step because the work is already settled. Clear the work's timer and abort listener and release its outstanding-execution ownership on actual promise settlement.

The result node uses the same binding, declared-output, and budget checks but is not sent to the task executor. Its values come from parsed inputs, publication literals, or validated task outputs. Its resolved input object is the final output exactly, including an empty object. Commit its completed visit and the terminal result together. There is no successful final output on any failure path.

### Failures, stopped progress, and overdue work

Every unhandled failure closes dispatch for that run immediately. Work already executing may settle, but its completion cannot start a successor or override a recorded failure. Other runs remain independent. During stopping, `currentSteps` contains only work still executing, not abandoned ready notifications. Keep earlier successful outputs available for inspection.

A graph that cannot advance is different from a slow operation. After successor creation and dependency promotion, a nonterminal run with no ready visit and no outstanding execution has no future event that could help it:

- If waiting visits remain, fail with `unmet_dependencies`, naming the affected step and locating an unsatisfied dependency in the published document. No polling timer or health check is needed to discover this state.
- If there are no waiting visits and no successful result, fail with `missing_result`. This catches a lost continuation or invalid prepared state rather than treating an empty queue as success.
- Pending, unreached definitions do not make an otherwise successful run dead, and a ready visit waiting for the queue consumer does not make a run dead either.

The new shared `ExecutionFailure` shape contains a code, message, JSON Pointer path, and step ID when a step is responsible. Codes include `self_dependency`, `unmet_dependencies`, `missing_result`, `task_timeout`, `execution_error`, `task_error`, `numeric_overflow`, `division_by_zero`, and `run_snapshot_limit`. Preparation uses `self_dependency`; the others describe accepted-run failures. Dependency paths point into the publication; operation errors point into the operation input or output; timeout and engine-wide errors use the empty pointer when no narrower location applies. Messages remain bounded and sanitized.

For a task that starts but never settles, add daemon setting `runTaskTimeoutMs` / `RUN_TASK_TIMEOUT_MS`, proposed default 30,000 ms. Start its deadline when the task is claimed, not while it waits in the queue. The first accepted completion or timeout wins. A timeout records `task_timeout`, stops new dispatch, and aborts that task's child controller. While the executor promise remains unsettled, retain the running visit and show the run as stopping; on settlement, finish the visit with the timeout failure and discard any late output. The timeout must not falsely report that resources have been released.

Interruption is cooperative: the abort signal asks a handler to stop but does not terminate its JavaScript. An unsettled handler stays tracked until settlement or forced process shutdown. Synchronous work also blocks the timer itself; this timeout is not a sandbox. Worker isolation and health checks remain outside this Epic.

### Execution preparation requirements

Preparation reuses parsed JSON and maintained schema validators. It adds no `json-value.ts` guard for arbitrary JavaScript objects, schema-rewriting pass, or custom JSON tokenizer. HTTP inputs have already been parsed, publication literals come from canonical JSON, and the built-in task outputs have concrete schemas. A future plugin or remote executor must establish its own input boundary rather than silently inherit an unrestricted object contract.

| Boundary | Requirement and proof |
| --- | --- |
| Binding maps | Preserve names such as `__proto__`, `constructor`, and dotted input names using maps or own-property definitions and lookups. Prove that a binding retains the supplied value; do not add a generic object-introspection framework. |
| Refusal reporting | Cap refusals at 32 real, located failures and drop any synthetic omission entry rather than misclassify omission as a document problem. Verify the bound and the actionable failures retained, not the omission wording. |
| Identifier declaration | Declare identifier fields with one UUID v7 pattern. Export the workflow package's existing pattern for the daemon's execution schemas instead of adding a second definition. |
| Publication validation | Correct direct self-dependency in v1, including an unreachable step, under the approved [pre-production policy](../decisions/pre-production-compatibility.md). Locate the offending array member, register the finding through the existing findings catalog, and extend graph-stage coverage. The specification already states the corrected rule; the code is still to be changed. |

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

#### Request size and JSON parsing

Keep a byte limit on invocation bodies because both applications otherwise buffer the entire body before deciding whether to accept it. A client can omit `Content-Length` and keep streaming; checking the parsed object afterward would be too late to limit that allocation. Count received bytes and stop with 413 before publication lookup when the configured limit is exceeded. This is a transport limit, not a JSON grammar check.

Add one bounded byte-reader in `packages/server/src/request.ts`, using the standard request body stream and releasing its reader on success, cancellation, or failure. It does not inspect braces, strings, escapes, or nesting. Both run decoders then pass those bytes to the existing `parseWorkflow` parser for strict JSON decoding and check the resulting invocation envelope with TypeBox. The parser name reflects its current use, but no workflow validation stages run during parsing.

Each application selects run decoding using its own registered request schema and delegates other requests to its existing decoder. Construct that dispatcher with configured limits in the app factory so OpenAPI generation remains listener-free. Preserve authoring's byte-exact document extraction and error behavior. No custom depth scanner or `RUN_MAX_VALUE_DEPTH` setting is introduced; byte limits are not a guarantee against expensive parsing or schema evaluation.

### Observation limits and configuration

Wire settings through each application's existing configuration schema, defaults, environment mapping, and startup validation. Configuration changes require restart.

| Setting | Default and constraint | Consumer |
| --- | --- | --- |
| `runMaxRequestBytes` / `RUN_MAX_REQUEST_BYTES` | 1 MiB; positive safe integer, compatible with the listener body ceiling. | Both services' run body decoders. |
| `runMaxSnapshotBytes` / `RUN_MAX_SNAPSHOT_BYTES` | 8 MiB; must leave room for structural state and a 64 KiB diagnostic reserve. | Daemon admission and output commitment, and Control API inspection response reads. |
| `runTaskTimeoutMs` / `RUN_TASK_TIMEOUT_MS` | 30,000 ms; positive safe integer within the runtime timer's supported range. | Daemon task claims only. It is independent of HTTP and shutdown deadlines. |

Preserve the readiness client's 64 KiB cap. Use the same cap for acceptance and error envelopes; successful observations use the snapshot setting instead.

`run-observation.ts` must budget the encoded UTF-8 snapshot, not JavaScript string length. Before admission, reserve the maximum output-free step and current-work representation, timestamp growth, and bounded diagnostics. Before each output commit, add that output's encoded cost; a result appears in both its step and the final run output and must be charged twice. Reject a candidate that would exceed the limit as `run_snapshot_limit`, keeping earlier outputs and enough space to explain the failure. Do not serialize the complete run after every dependency check or retain duplicate full snapshots merely to count bytes.

Bound diagnostics, including escaped pointer and name lengths, within the reserve. Never truncate an observation into invalid or misleading data: if a full failure location cannot fit, retain the step identity and a valid enclosing pointer rather than a clipped pointer. Both applications must use compatible limits; there is no negotiation in M2.

Retain terminal runs until daemon exit without eviction. Per-run limits do not cap aggregate retained memory or schema evaluation time. Operators must understand those limits; this work does not quietly add retention or global capacity policy.

### Process lifetime and shutdown

Extend the existing lifecycle rather than add a daemon-only drain callback. Construct a generic work tracker inside `boot` before opening the application and pass a narrow registration capability as a second argument to the process factory. Update `Daemon.open`, `ControlApi.open`, direct callers in boundary tests, and lifecycle fixtures together. The process owns admission closure, abort-all, and resource closure; services receive only registration and completion capabilities.

Adapt the existing HTTP outstanding map to the tracker while retaining its handler and response-body semantics. A registration owns an abort controller and an idempotent release operation, and aborting a registration does not release it. A run gets a registration independent of its POST request, retained through queued turns, gaps between tasks, and executor settlement; its terminal snapshot can remain in memory after its registration is released.

On SIGTERM or SIGINT, close new HTTP and run admission synchronously and start the existing single shutdown deadline. Already accepted runs may dispatch their remaining steps during drain; their continuations are not new root work. Wait for HTTP work and run registrations, then close the database and other process resources using the remaining deadline. Failed but fully settled runs do not prevent a clean exit.

At the deadline, abort outstanding work, force-close connections, attempt bounded resource closure, and exit nonzero. Repeated signals do not reset the clock. A pending publication query remains tracked until it actually settles, even if its caller has timed out; its late completion must not admit a run. A clean drain and an abort request are not interchangeable evidence of completion.

Preserve the existing rule that new HTTP requests, including GET inspection, are refused while the process drains, and do not promise external inspection after admission has closed. SIGHUP continues to log that restart is required without reloading configuration. Restarting the Control API leaves daemon work alone; restarting the daemon loses every M2 run, even after a clean drain.

## Implementation placement

The concepts and interactions above determine the file boundaries. These are new daemon modules under `apis/daemon/src/services/runs/`; none exists on the inspected baseline.

| New file | Responsibility and callers |
| --- | --- |
| `run-service.ts` | `RunService.invokeWorkflow` retrieves, prepares, and admits a run; `getRun` returns its observation or not-found. Daemon run controllers call it. Startup injects the repository, preparer, engine, and process work registration. |
| `execution/publication-preparer.ts` | Performs the capability checks and constructs the prepared workflow before admission. Reuses document schemas and reference helpers from `@rostrum/workflow`; it does not call the publication validator. |
| `execution/input-output-schemas.ts` | Compiles author-declared schemas with the library described under preparation and maps its errors to located execution failures. No parser, JSON guard, or schema-rewriting framework. |
| `execution/operations/greet.ts`, `add.ts`, `divide.ts` | One operation per module, keeping its configuration, input/output schemas, implementation, and expected failures together. |
| `execution/operations/registry.ts` | Declares the common operation-definition interface and registers the three definitions in one static map. Preparation and the local executor consume that map; there is no dynamic plugin loader. |
| `execution/task-executor.ts` | Declares `TaskWorkItem`, `TaskWorkResult`, and the executor interface. It contains no operation implementations. |
| `execution/local-task-executor.ts` | Selects the registered operation, invokes it, and returns its identified result or sanitized failure. Receives no engine, database, or HTTP context. |
| `execution/bindings.ts` | Resolves prepared bindings against accepted inputs and completed visits. Task implementations receive resolved values, never references. |
| `execution/run-state.ts` | Defines run state, `VisitState` variants, and permitted transitions. Only the engine writes them. |
| `execution/execution-node.ts` | Contains `ExecutionNode`, `TaskExecutionNode`, and `ResultExecutionNode`. Keep these small classes together; split a later node kind when its behavior warrants a separate file. |
| `execution/workflow-engine.ts` | Owns accepted runs, advancement, ready notifications, claims, completion matching, deadlines, and lifecycle release. |
| `execution/run-observation.ts` | Produces coherent inspection snapshots and accounts for their encoded byte cost at admission and output commitment. |

The Control API gets its own `services/runs/run-service.ts`, which calls the authenticated daemon client rather than constructing an engine or querying publications. The HTTP and lifecycle sections above identify the controller, client, configuration, and process-factory changes in both applications.

`packages/workflow/src/execution.ts`, exported through a new `@rostrum/workflow/execution` subpath, holds shared statuses, failure and rejection vocabulary, and acceptance/observation schemas. It contains no invocation request schema or engine behavior. Export the existing UUID v7 pattern from `packages/workflow/src/schema.ts` for these declarations. Update `packages/workflow/package.json`, `apis/daemon/package.json`, and the lockfile together; the daemon adds `@rostrum/workflow`, `uuid`, and `ajv`.

Separate serializable run data from runtime collaborators in the engine. Prepared definitions, executor promises, abort controllers, timers, work registrations, and scheduled-turn flags never enter task messages or observations. The process constructs dependencies at startup; no mutable module-level service instances are introduced.

## Progress

- [x] Re-baseline this design against `rostrum` `main` and the closed checkpoint-1 attempt (2026-09-19).
- [ ] Adopt and link the parent blueprint, then complete the reviews in [Review status and prerequisites](#review-status-and-prerequisites). Stephen Pierre-Paul owns the handoff.
- [x] Address the owner's review comments through 2026-09-19, including the permanent compatibility decision and `completed` terminology (2026-09-20). The owner's review is still in progress.
- [ ] Checkpoint 1: execution contracts and preparation.
- [ ] Checkpoint 2: direct daemon-local execution.
- [ ] Checkpoint 3: invocation and inspection through both services.
- [ ] Checkpoint 4: real-service, lifecycle, and operator evidence.

## Checkpoints

The implementing engineer owns each checkpoint and records its pull request and evidence here. Each checkpoint leaves a runnable repository. API and specification owners review public contracts and format compatibility; an execution and concurrency reviewer reviews state transitions, admission races, completion ownership, and shutdown.

### Checkpoint 1: Execution contracts and preparation

**Outcome and scope:** `@rostrum/workflow` exports the shared execution vocabulary, and the daemon can prepare a stored publication, refusing unsupported behavior and invalid inputs before any run exists. No run is created and no task executes yet.

**Dependencies and work:** the reviewed parent blueprint and design; no implementation prerequisite beyond `main`. Add the shared execution schemas and subpath, daemon preparation, per-operation definitions, bindings, and schema compilation; add the dependencies listed under [Implementation placement](#implementation-placement); export the existing UUID v7 pattern. Correct self-dependency in the graph stage under the approved pre-production decision. Keep execution-capability checks distinct from publication validation, and document their durable contract in [workflow format v1](../specifications/workflow-interface-v1.md).

**Owner and review:** the implementing engineer. API and specification reviewers check refusal reasons and locations, shared observation schemas, and the v1 correction. This review does not reopen the owner's `completed` or pre-production compatibility decisions.

**Verification:** retain digest-vector coverage; add graph-stage coverage for reachable and unreachable self-dependency; exercise preparation refusals, literal-key bindings, declared-schema checking, and refusal bounds. A direct preparation run of the worked example, with no HTTP or Postgres, resolves its bindings and refuses a string amount, missing or undeclared input, and unknown operation with distinct reasons and locations. `bun run check` and `bun test` pass. No schema-enum snapshot or JSON-guard suite is needed.

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

**Dependencies and work:** checkpoint 3. Add `scripts/smoke-sequential.ts` and the root command `bun run smoke:sequential`, using `@rostrum/database/testing`'s `startTestPostgres`, existing migrations, the daemon's process harness, and a Control API process helper in `apis/control-api/src/scripts/process.ts` modeled on the daemon's. Filter the new `RUN_MAX_*` and `RUN_TASK_TIMEOUT_MS` environment settings in those helpers. Update the root setup README with invocation, memory and request limits, cooperative timeout behavior, the lack of isolation for hostile schemas or inputs, and the M2 restart and idempotency limitations.

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
| New daemon preparation and input/output-schema tests | A number declaration rejects a string without coercion; malformed schemas and unresolved external references refuse before admission; valid local references work; format annotations do not reject values; literal prototype-sensitive and dotted names retain values; omitted optional input differs from null and an unresolved explicit binding; refusals never exceed 32 real failures. |
| New `execution/workflow-engine.test.ts` | Reverse declared step order, repeat advancement, queue delivery, and completion, and return an immediately resolved result. Each reached task executes once and each successor receives only committed output; wrong-run and stale results cannot corrupt another visit. |
| The same engine suite, with controlled visit states and executors | Exercise one created visit whose dependencies are not all completed, then satisfy them and observe one dispatch. No outstanding work plus unmet dependencies fails with a location; no continuation or result fails distinctly; a pending disconnected definition does not fail success. These internal cases do not enable parallel invocation. |
| The same engine suite, with controlled settlement and clock | Hold one run while a second completes or fails; inputs and outcomes stay isolated. A task deadline stops new work, remains stopping until actual settlement, and ignores late output. Terminal state does not change on repeated delivery or inspection. |
| New tests beside the operation modules | Exercise zero and negative-zero division and arithmetic overflow through the local executor; verify the specific domain failure rather than merely that a promise resolves. |
| New engine and observation checks | Supply an operation output with a wrong type, missing required member, or non-finite number; no invalid output reaches a successor. Mutating a returned object cannot change committed output. An oversized output fails while prior data remains inspectable; escaped and multibyte values and the result's two appearances are charged correctly. |
| New run-service and controller or client tests beside those modules | Cover every HTTP outcome above; malformed, wrong-identity, and oversized upstream responses fail safely; POST is not retried; both services accept and refuse the same invocation envelopes; authoring's existing decoder and error shapes still work. Race cancellation and admission with a delayed publication lookup and verify no late run appears. |
| Existing `packages/server/src/lifecycle.test.ts`, `lifecycle.fixture.ts`, and restart tests | Hold an HTTP body, a queued run, and task work during drain. Clean exit waits for all ownership; accepted continuations still run; an uncooperative task forces a bounded nonzero exit; repeated signals close resources once; SIGHUP changes nothing. |

### Real-service scenarios

After `bun install` in the `rostrum` checkout and implementation of the scripts, run `bun run --filter @rostrum/daemon smoke:execution` for the no-HTTP calculation, then `bun run smoke:sequential` for the service scenarios. These are commands to introduce in Checkpoints 2 and 4, not commands available on the current baseline.

The service script owns its environment: create a disposable database with `startTestPostgres`, apply the existing migrations, and start the real application entry points with temporary loopback-only configurations and tokens. If `DATABASE_URL` is supplied, use the helper's temporary-database behavior rather than write to an existing application database. In a `finally` block, stop both child services, stop or remove the disposable database through the helper, and remove temporary configuration and token files. The implementing engineer records the command's observed outputs and exit status.

The `smoke:sequential` command publishes and invokes the calculation through the Control API, observes the accepted run ID, and later retrieves the exact result or division failure. It also covers these service-level requirements:

- Start overlapping invocations of one publication with different inputs. Each has its own ID and input-derived outcome; failure in one does not fail another.
- Disconnect after acceptance and reconnect from another client. Restart only the Control API and retrieve the same daemon-owned run. Repeated explicit POSTs create different runs; repeated GETs change nothing.
- Publish a newer publication after invocation. The accepted run continues to report its original publication number and digest and its corresponding result.
- Remove database access after acceptance. Existing run execution and GET remain available; readiness and new invocation report a dependency failure. Use a controlled test composition when a task must be held at this boundary rather than add a production delay operation.
- Configure matching non-default limits. Oversized streamed invocations fail before lookup; snapshots larger than the readiness cap still return intact when within the run limit; an output over budget produces an inspectable failure, not a truncated response.
- Shut down and restart the daemon. Old run IDs return 404. Use the lifecycle fixture for deterministic in-flight drain and forced-exit races; fast arithmetic alone cannot prove those races through timing luck.

After implementation, record command output, pull-request links, review outcomes, and any remaining acceptance gap here. A passing direct smoke does not stand in for the service scenarios, and a passing service smoke does not prove hard interruption of blocked JavaScript.

## Discoveries

- Publishable does not mean executable. The current validator permits unknown operation names and accepts arbitrary JSON in workflow input and step output schema declarations. Invocation needs capability and value checks, not a second run of the publication pipeline. Correcting publication self-dependency is a separate, approved v1 change.
- The shipped validator accepts a step listing itself in `dependencies` (verified by running `createWorkflowValidator` on such a document on 2026-09-19: no findings, `validForPublication: true`). Cycle detection covers control edges only, and a step trivially dominates itself.
- The graph suite already accepts pure fan-in joins whose dependencies are not dominators (`fan-out-fan-in.json`, "accepts pure fan-in joins whose dependencies are not dominators"), so enabling parallel execution in Epic 4 needs more than removing the preparation refusal.
- The application decoders have no route-specific byte limit. The readiness client's 64 KiB response cap supplies an existing bounded-consumption pattern. Invocation body limits address buffering, not JSON syntax, nesting, or computation cost.
- The daemon already owns a database handle and a service tier, so the publication read adds no new process resource, but the daemon has no `@rostrum/workflow` dependency yet — preparation and the shared vocabulary are its first consumers.
- No run persistence exists anywhere: no run table, repository, or migration. M2 run state is in memory by construction, and Checkpoint 4 states that loss plainly rather than implying recovery.
- Prepared definitions are process-local. Maps and compiled validators cannot be persisted or sent as JSON merely because their source document is JSON.

## Decision log

- 2026-09-16: retain daemon-local execution, the controller and service split, and restart-only process configuration. (Carried over from the superseded M2 Epic 2 plan.)
- 2026-09-19: re-baseline this design on `rostrum` `main` after the checkpoint-1 branch and pull request were closed unmerged. The shared contracts and preparation it held become Checkpoint 1 work here, and its engine proposal stays replaced by the visit model in this document. Its applicable review findings are retained under [Execution preparation requirements](#execution-preparation-requirements).
- 2026-09-19: contract placement, after review — each application implements its own invocation, response envelopes, and error mapping, while `@rostrum/workflow` holds the execution vocabulary and the run-state payloads both services must agree on.
- 2026-09-19: define preparation explicitly rather than inherit it from the closed branch: publishing still owns metadata exclusion and canonicalization, and execution preparation is a separate daemon-side capability decision and compilation step.
- 2026-09-20: apply the owner's [completed-state direction](https://github.com/RostrumAI/rostrum-dev-docs/pull/21#discussion_r4055080365) to this design and its Epic. A visit has one latest state object, not a stored transition history; dead-run and timeout causes remain explicit failure codes.
- 2026-09-20: record the owner's [pre-production compatibility policy](../decisions/pre-production-compatibility.md) and amend the v1 specification. Self-dependency is approved for an in-place correction; implementation remains outstanding.
- 2026-09-20: narrow preparation to daemon capabilities and actual values, retain existing JSON parsers, remove generic object guards and depth scanning, and introduce concepts before file placement. Keep operation implementations and schemas in separate per-operation modules.

Record approvals or changed contracts here before dependent implementation; review comments and proposed designs are not implementation evidence.

## Outcome

The comment-response revision is complete for continued review. Implementation handoff remains blocked: Stephen Pierre-Paul owns adopting the parent blueprint and finishing the design review before the implementing engineer starts Checkpoint 1. The status and pre-production policy changes are approved owner decisions; the execution design is otherwise proposed and unimplemented. After implementation and acceptance, move lasting contracts into the specification and code and retire this design under the [delivery methodology](../epic-delivery-methodology.md).
