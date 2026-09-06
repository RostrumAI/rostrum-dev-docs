# E2-S1 decision: Local execution semantics and runtime state

| Tracking | Value |
| --- | --- |
| Status | Proposed — awaiting approval |
| Source | [E2-S1 task at the migration revision](https://github.com/RostrumAI/rostrum/blob/4da89f6316abd44f6ef499a27b87c60aca35e610/docs/tasks/epic-02/e2-s1-define-local-execution-semantics.md) |
| Research | [E2-S1 research at the migration revision](https://github.com/RostrumAI/rostrum/blob/4da89f6316abd44f6ef499a27b87c60aca35e610/docs/research/e2-s1-local-execution-semantics-options.md) |
| Proof | [E2-S1 proof at the migration revision](https://github.com/RostrumAI/rostrum/blob/4da89f6316abd44f6ef499a27b87c60aca35e610/docs/results/epic-02/e2-s1-proof-of-concept.md) |
| Last updated | 2026-08-27 |

## Decision

When Rostrum executes a workflow locally, the local daemon runs an immutable, compiled execution plan using an in-memory state reducer. Callers monitor execution progress through read-only views in the Control API.

The runtime enforces these execution rules:

1. **Exact invocation inputs:** To start a run, the caller must request an exact published workflow version and supply every required input defined in `workflow.inputs`. The engine rejects requests that miss required inputs or include undeclared inputs before creating a run.
2. **Explicit result steps for workflow completion:** A workflow finishes successfully only when execution reaches an explicit `result` step. Step handlers and conditional branches cannot finish a workflow implicitly. The `result` step takes the outputs produced by earlier steps and defines the final payload returned to the caller.
3. **Engine-evaluated conditionals:** The execution engine evaluates conditional rules and selects which branch to execute based on step outputs. Step handlers only execute their own unit of work and return data; handlers never make routing decisions or return branch names.
4. **Fan-out paths with a required join:** When a workflow splits into parallel paths, every path must reach one matching fan-in step. A path may contain a sequence of steps or a nested fan-out that rejoins before the outer fan-in. While a fan-out remains open, its paths cannot cross, end early, or contain a conditional. The matching fan-in can end the workflow as a `result` step or continue to another step. A conditional after the join must be a separate successor step.
5. **Sequential bounded loops:** Loops process items in an array one at a time in collection order ($0, 1, \dots, n-1$). Iteration 1 starts only after iteration 0 finishes and commits its outcome. Successful iterations produce ordered result entries. The workflow configures whether an iteration error stops the loop or is captured so later iterations can run. Captured errors must preserve their iteration position. E2-03 defines the configuration field, the allowed policies, and the result entry schema.
6. **Strict step input and output contracts:** Every step type in the registry defines its required inputs, optional inputs, and an exact schema for its outputs. The engine validates outputs at runtime and rejects missing fields, extra fields, or unexpected data types.
7. **Active step visibility (`currentSteps`):** The Control API exposes currently active work as a `currentSteps` list. Each entry shows the step ID, whether the step is waiting for an available worker (`ready`) or currently executing (`running`), and the loop iteration index if applicable.
8. **Complete failure reporting:** The engine does not pick a single primary failure when unhandled errors occur. When a step failure is not captured by a loop policy, the engine stops dispatching new steps, allows currently running steps to finish, and returns an array of all observed run failures sorted consistently by step ID, iteration, error code, and document path.
9. **Efficient step readiness tracking:** A step becomes ready after every declared dependency commits a successful outcome. The engine implements this rule with a remaining-dependency counter instead of rescanning the dependency array after each completion. It decrements the counter once for each committed dependency success and makes the step ready at zero.
10. **Compatibility with durable execution (Epic 03):** All in-memory execution states and transitions are designed to map directly to transactional database checkpoints in Epic 03 for crash recovery without changing workflow execution behavior. Invocation idempotency is assigned to Epic 03.

## Context

Epic 01 defines the shape and validation of a workflow document, but it does not specify how a workflow executes. E2-S1 defines the execution semantics for in-memory execution in the local daemon before E2-07 through E2-09 implement the executor and E2-10 adds the Control API run operations.

The execution model must satisfy four requirements:

1. **Daemon-owned execution:** The local daemon advances workflow execution independently of caller connections. Callers can disconnect immediately after starting a run without interrupting execution.
2. **Deterministic execution:** Given the same inputs, workflow definition, and step handler outputs, execution order, branch selection, and final outputs are identical every time.
3. **Complete observability:** The Control API can project active and ready step instances (`currentSteps`) and all observed failures without hiding errors behind an arbitrary primary failure.
4. **Epic 03 compatibility:** In-memory state and transitions map directly to durable checkpoints and crash recovery without changing successful execution semantics.

Comparative research across workflow engines remains in the [E2-S1 research at the migration revision](https://github.com/RostrumAI/rostrum/blob/4da89f6316abd44f6ef499a27b87c60aca35e610/docs/research/e2-s1-local-execution-semantics-options.md).

## Why these choices

The decision fixes a three-part architecture for local execution: an immutable compiled execution plan, a per-run transition reducer, and a read-only Control API projection. Publishing a workflow compiles it once into an execution plan that contains everything static about the graph: dependency counts, successor lists, conditional branch rules, and dependency links. Invoking a workflow creates the run's transition reducer, the only mutable state in local execution. The reducer advances step instances through their lifecycle, commits outputs as handlers finish, and runs inside the daemon independently of caller connections. Callers observe this activity only through the `currentSteps` and failure projections.

This separation maps directly onto the four requirements in Context. The compiled plan fixes branch rules, priorities, and dependencies before execution, so the same inputs and committed outputs select the same path. Each run owns its reducer state, so concurrent runs do not share mutable data and caller disconnects do not interrupt daemon-owned execution. The Control API reads the run state without changing it. Each reducer boundary can become an Epic 03 transactional checkpoint without changing successful execution behavior.

The following table summarizes each specific choice by aspect.

| Aspect | Choice | Reason |
| --- | --- | --- |
| Architecture | Immutable compiled plan with per-run transition reducer | Compiles static dependencies and fan-out structure once, isolates mutable state to individual runs, and keeps graph execution fast and bounded. |
| Invocation validation | Synchronous validation of workflow inputs and registered handlers | Rejects invalid requests immediately before allocating run resources, preventing runtime crashes from missing inputs or unsupported steps. |
| Conditionals | Engine-evaluated by priority with mandatory `default` and explicit `next` targets | Makes branch selection total: every valid evaluation selects one successor instead of stalling or introducing a separate no-match failure. |
| Parallel paths | Fan-out paths with one required join | Lets each path run a sequence or a properly nested fan-out while preventing crossing paths, early termination, and ambiguous workflow results. |
| Post-join routing (Q18) | Fan-in step cannot own a conditional; routing uses a separate successor step | Keeps the join boundary explicit and makes the rule that an open fan-out cannot contain a conditional simple to validate. |
| Loops | Sequential bounded iterations with workflow-configured error tolerance | Preserves collection order while letting the workflow choose whether an iteration error stops the loop or becomes part of its ordered output. E2-03 defines the policy and output schema. |
| Completion | Explicit `result` step required on every reachable path | Makes the final output payload explicit, testable, and schema-verifiable. |
| Step contracts | Explicit schemas for required inputs, optional inputs, and exact outputs | Catches data mapping errors early and prevents undeclared or malformed data from moving downstream. |
| Run monitoring | `currentSteps` array showing ready and running step instances | Gives callers clear visibility into active work during parallel execution across worker pools. |
| Failure handling | Fail-fast dispatch for unhandled errors, with active handler drain and sorted failure lists | Halts new work after the first unhandled error, lets in-flight tasks finish cleanly, and reports all observed run failures in a predictable order. |

## State machines and lifecycle

```text
Run Lifecycle:

   [Invocation] ──(Valid)──> QUEUED ──(Start)──> RUNNING ──(Result Step Committed)──> SUCCEEDED
        │                                          │
    (Invalid)                                  (Uncaptured Failure)
        │                                          │
        ▼                                          ▼
   [Rejected: No Run]                           STOPPING (Drain Active)
                                                   │
                                            (All Active Drained)
                                                   │
                                                   ▼
                                                FAILED
```

```text
Step Instance Lifecycle:

   PENDING ──(Activated & Remaining Dependencies = 0)──> READY ──(Worker Available)──> RUNNING ──(Valid Output)──> SUCCEEDED
                                                                                          │
                                                                                   (Handler/Output Error)
                                                                                          │
                                                                                          ▼
                                                                                       FAILED
```

### Run state transitions

The run state transitions define the top-level execution lifecycle for a workflow run.

| Current state | Event / Trigger | Guard | Next state | Effect / Output |
| --- | --- | --- | --- | --- |
| `[None]` | Invocation request | The exact published workflow version exists, input keys match `workflow.inputs` exactly, and all required step handlers are registered | `queued` | Allocates a run ID, initializes execution tracking and remaining-dependency counters, and enqueues the `firstNode` step. |
| `[None]` | Invocation request | Unknown workflow version, missing input, undeclared input, or unregistered step type | `[Rejected]` | Rejects the request with a structured error. No run is created. |
| `queued` | Scheduler start turn | The run has not started yet | `running` | Activates the `firstNode` step, moves the step instance to `ready`, and updates `currentSteps`. |
| `running` | Dispatch step | A worker slot is available and a step instance is in the `ready` state | `running` | Moves the step instance to `running`, starts the step handler, and updates `currentSteps`. |
| `running` | Step handler success | Handler output matches the exact step output schema and the step routes to a successor step | `running` | Commits step outputs, evaluates successors or conditionals, activates reached steps, decrements remaining-dependency counters, and updates `currentSteps`. |
| `running` | Step handler success | The completed step is an explicit `result` step that binds the final workflow output | `succeeded` | Commits the final workflow output, clears `currentSteps` to `[]`, sets `failures` to `[]`, and marks the run immutable. |
| `running` | Unhandled failure observed | A handler, output validation, input binding, or condition evaluation fails and no active loop policy captures the error | `stopping` | Records the failure in the run's failure set, stops dispatching new steps, and allows in-flight handlers to finish. |
| `stopping` | Active handler completion | One or more active handlers are still running | `stopping` | Records any additional observed failures in the failure set and decrements the active handler count. |
| `stopping` | Last active handler completion | All active handlers have finished (active count reaches 0) | `failed` | Sorts the collected failures into the final `failures` array, clears `currentSteps` to `[]`, and marks the run immutable. |

### Step instance transitions

The step instance transitions define the lifecycle of each step executed within a run.

| Current state | Event / Trigger | Guard | Next state | Effect / Output |
| --- | --- | --- | --- | --- |
| `pending` | Predecessor step completes or `firstNode` initializes | The step is reached by an active execution path | `pending` | Marks the step as activated and initializes its remaining-dependency counter. |
| `pending` | Dependency succeeds | The step is activated and its remaining-dependency count reaches 0 | `ready` | Adds the step to the ready queue; the step appears as `{ stepId, state: "ready" }` in `currentSteps`. |
| `ready` | Worker slot allocated | The run is in the `running` state (not `stopping`) | `running` | The worker begins executing the step handler; the step appears as `{ stepId, state: "running" }` in `currentSteps`. |
| `running` | Handler returns successfully | The returned output matches the step's exact output schema | `succeeded` | Commits the step outputs and removes the step from `currentSteps`. |
| `running` | Handler returns error or throws exception | The error matches a structured failure or an unhandled exception occurs | `failed` | Removes the step from `currentSteps` and passes the error to the enclosing loop policy, if present. An uncaptured error is added to the run's failure set and moves the run to `stopping`. |
| `running` | Output validation fails | The returned output misses declared fields, includes undeclared fields, or has incorrect data types | `failed` | Removes the step from `currentSteps` and passes the error to the enclosing loop policy, if present. An uncaptured error is added to the run's failure set and moves the run to `stopping`. |
| `pending` | Workflow reaches a terminal state | The step was bypassed because an alternative conditional branch was chosen | `notSelected` | The step never runs and remains recorded as unselected for audit logs. |

## Invocation acceptance and rejection

The engine validates invocation requests synchronously before creating a run.

| Condition | Verification rule | Response / Outcome |
| --- | --- | --- |
| Workflow version | Must match an exact, immutable published workflow version | If not found, rejects with `run.invocation.workflow-not-found` (HTTP 404). |
| Missing input | Every input defined in `workflow.inputs` must be provided | If any are missing, rejects with `run.input.missing` (HTTP 400). |
| Undeclared input | Invocation inputs must not contain extra fields outside `workflow.inputs` | If extra fields are present, rejects with `run.input.unknown` (HTTP 400). |
| Input data types | Invocation input values must match their declared JSON Schema types | If any types mismatch, rejects with `run.input.type` (HTTP 400). |
| Step handler availability | Every step type used in the workflow must be registered in the daemon for the declared interface version | If any handler is missing, rejects with `run.step.unsupported` (HTTP 400). |
| Valid request | Passes all checks above | Accepts request with HTTP 201; returns `{ runId, status: "queued", currentSteps: [], failures: [] }`. |

## Handler contracts and output validation

A step handler runs as a self-contained, isolated function that receives resolved inputs and returns outputs.

### Input binding rules

1. **Required inputs:** The workflow step definition must define a binding for every required input expected by the handler schema. If a binding references a missing workflow input or an uncommitted step output, the run fails immediately with `run.binding.unresolved-reference`.
2. **Optional inputs:** If a step definition omits an optional input, the engine does not pass that input to the handler (or passes `undefined`). If the step definition explicitly provides a binding for an optional input, that reference must resolve successfully; if it cannot resolve, the run fails with `run.binding.unresolved-reference`.
3. **Static type checking:** During workflow publication, static validation checks that references connect matching producer and consumer data types.

### Output schema enforcement

1. A step handler must return an explicit success object `{ type: "success", outputs: Record<string, JSONValue> }` or failure object `{ type: "failure", error: StructuredError }`.
2. Steps that produce no output values must return `{ type: "success", outputs: {} }`.
3. The engine validates the returned `outputs` against the step's exact output schema:
   * Every declared output field must be present.
   * No undeclared output fields may be included (extra properties are forbidden).
   * Every value must match its declared JSON Schema type.
   * All values must be valid, serializable JSON.
4. Any mismatch between returned outputs and the declared schema fails the step with `run.output.missing`, `run.output.unknown`, or `run.output.type`.

## Control flow semantics

### 1. Sequential execution

Steps connected in a straight line advance sequentially. When step $A$ finishes, it commits its outputs and decrements step $B$'s remaining-dependency count from one to zero, making step $B$ `ready`.

The dependency array defines the readiness rule; the countdown is its runtime index. The two approaches are equivalent only when "response" means one committed `succeeded` outcome from each dependency. A failure response does not satisfy a dependency. The counter starts at `dependencies.length` and decrements exactly once for each dependency that commits success. Checking for zero avoids scanning the array after every completion without changing when the step becomes ready.

### 2. Conditionals

* The engine evaluates conditional rules using outputs committed by earlier steps.
* The engine checks branch rules in ascending priority order (priority 1 before priority 2). The first branch whose condition evaluates to `true` is selected.
* If no branch evaluates to `true`, the engine selects the mandatory `default` branch.
* The `default` rule makes branch selection total. Without it, a valid input could match no branch, forcing the engine either to fail at runtime or to leave the conditional without a successor. Publication requires `default` so every successful evaluation selects exactly one `next` step.
* Branch priorities must be unique across the conditional (enforced during publication).
* Every branch and default rule must specify an explicit `next` step. Conditionals cannot finish a workflow directly.
* Selecting a branch marks the target step as activated. Unselected branches remain `notSelected`.

### 3. Parallel paths (fan-out and fan-in)

* **Required join:** A fan-out step $D$ connects to multiple path roots ($E, F$). Every path must reach one matching fan-in step $G$ before the workflow can continue or finish.
* **Path contents:** Each path may contain any valid sequence of steps except a conditional or `result` step. A path may open another fan-out if that nested fan-out rejoins before the path reaches $G$.
* **Synchronized join:** The fan-in step $G$ lists one exit step from each path in its `dependencies`. Step $G$ becomes `ready` only after every listed exit succeeds and its remaining-dependency counter reaches zero.
* **Path boundaries:** Paths cannot cross or merge before $G$. They cannot end while the fan-out remains open.
* **Join behavior:** Step $G$ may be a normal task or the selected path's `result` step. A normal task can continue sequentially after the join. If the workflow needs a conditional, $G$ must route to a separate successor step that owns it.
* **Independent dispatch:** All path roots enter the `ready` state in the same turn. The dispatcher executes them across available worker slots. Variations in worker speed or task completion order do not affect the joined outputs or the final result.

### 4. Sequential bounded loops

* A loop step iterates through items in a collection one at a time ($0, 1, \dots, n-1$).
* The engine checks the item count against `maxIterations` before starting iteration 0. If `collection.length > maxIterations`, the loop fails immediately with `run.loop.bound-exceeded`.
* Iteration $k+1$ starts only after iteration $k$ finishes and commits its outcome. Only one iteration runs at a time.
* Each successful iteration contributes one ordered entry to the loop's `results` array.
* The workflow declares how the loop handles iteration errors. A fail-fast policy stops later iterations. An error-tolerant policy captures eligible errors at their iteration positions in `results` and continues.
* E2-03 defines the policy field and values, the default policy, which error classes a loop may capture, the success-or-error result entry schema, downstream binding rules, and whether captured errors also appear in the run-level `failures` array.

### 5. Explicit result steps

* A workflow completes successfully only when execution reaches a dedicated `result` step.
* The `result` step maps values from earlier steps to the workflow's public output schema.
* Workflows cannot terminate implicitly on standard task steps or open branch exits.

## Failure model and multi-failure sorting

1. **No primary failure:** The engine does not pick a single primary failure when multiple errors occur.
2. **Fail-fast with active drain:** When the engine encounters the first unhandled failure:
   * The run state transitions to `stopping`.
   * The dispatcher stops scheduling new `ready` step instances.
   * In-flight handlers currently executing on workers continue until they finish or time out.
   * Any additional unhandled failures returned by in-flight handlers are collected into the run's failure set.

   An iteration error captured by a loop's configured policy is not automatically an unhandled run failure. E2-03 defines which errors a loop can capture and how captured errors affect `results` and run-level `failures`.
3. **Deterministic failure sorting:** When all active handlers finish, the collected failures are converted into an array sorted deterministically by:
   * `stepId` (alphabetical ascending);
   * `iteration` (numerical ascending, if present);
   * `code` (alphabetical ascending);
   * `path` (alphabetical ascending).
4. **Failure schema:** Each failure item in the `failures` array conforms to:

   ```json
   {
     "code": "run.step.failed",
     "message": "Step 'fetch' failed with HTTP 500.",
     "phase": "handler",
     "stepId": "fetch",
     "iteration": 0,
     "path": "/steps/fetch",
     "details": {
       "status": 500
     }
   }
   ```

## Control API projection

The Control API provides a read-only projection of the in-memory execution state:

```json
{
  "runId": "01918a32-7f2c-7b90-9c21-4f2834b6e100",
  "workflowId": "01918a30-2b11-7a00-88f1-102938475600",
  "workflowVersion": "1.0.0",
  "status": "running",
  "currentSteps": [
    {
      "stepId": "branch-a",
      "state": "running"
    },
    {
      "stepId": "branch-b",
      "state": "ready"
    }
  ],
  "output": null,
  "failures": []
}
```

* When `status` is `"queued"`, `currentSteps` is `[]`, `output` is `null`, and `failures` is `[]`.
* When `status` is `"running"`, `currentSteps` lists all active step instances in the `ready` and `running` states.
* When `status` is `"succeeded"`, `currentSteps` is `[]`, `output` contains the final workflow result, and `failures` is `[]`.
* When `status` is `"failed"`, `currentSteps` is `[]`, `output` is `null`, and `failures` contains the complete ordered array of all observed errors.

## Scale and complexity model

1. **Immutable plan compilation:** Published workflows are compiled once into execution plans indexed by step position, containing static dependency counts, successor lists, and dependency links. Compilation takes $O(V + E)$ time and memory for $V$ steps and $E$ connections.
2. **Compact per-run state:** Mutable state for a run consists of bitsets and counters for activation status, remaining dependency counts, a FIFO ready queue, and committed output storage.
3. **Predictable execution cost:** For a run with $V$ steps and $E$ connections:
   * Checking step activation runs in exactly $V$ operations.
   * Updating dependency counters runs in exactly $E$ decrement operations.
   * Total graph scheduling work runs in $O(V + E)$ operations without rescanning the graph.
4. **Synthetic verification:** Large synthetic graph proofs in `tmp/e2-s1-poc` demonstrated:
   * 10,000-task linear chain: exactly 10,001 readiness checks and 10,000 successor edge traversals.
   * 5,000-way parallel join: exactly 10,003 readiness checks, 5,000 dependency decrements, and 10,001 successor edge traversals.

## Required Epic 02 workflow-contract updates

These execution semantics replace several provisional rules in the current workflow interface. Epic 02 owns the specification, schema, validator, and fixture changes required to apply them:

| Area | Current workflow rule | E2-S1 execution rule | Epic 02 update |
| --- | --- | --- | --- |
| Conditionals | Branches without `next` could finish a workflow implicitly | Every branch and default rule must specify an explicit `next` step | Update workflow schema and validator to require `next` on all branch rules. |
| Conditional priorities | Priorities were numeric without uniqueness enforcement | Branch priorities must be unique | Update validator to reject duplicate branch priorities. |
| Parallel paths | Unstructured graph connections were permitted | Fan-out paths must reach one matching fan-in before continuing or finishing | Update the validator to require a matching join, allow sequential steps and properly nested fan-outs within each path, and reject conditionals, early terminals, crossing paths, and conditionals on fan-in steps. |
| Loops | Loop execution and result shapes were left open | Iterations are sequential and bounded; the workflow configures iteration error tolerance | Specify the loop policy and ordered success-or-error result entry schema in E2-03 before implementation. |
| Terminal results | Implicit termination was allowed | Explicit `result` step required on every reachable path | Update validator to require an explicit `result` step. |

## Epic 03 persistence and idempotency handoff

1. **Transactional checkpoints:** In Epic 03, the transition reducer boundaries defined here map directly to transactional database checkpoints. Committing step outputs, decrementing dependency counters, and updating `currentSteps` occur atomically.
2. **Crash recovery:** If the daemon restarts while step instances are `running`, recovery resets those step instances to `ready`. Step outputs commit only after handler completion is successfully persisted.
3. **Invocation idempotency:** Assigned to E3-S1. E3-S1 will define idempotency key formats, atomic request registration, duplicate response replays, and conflict errors for mismatched invocation parameters.

## Example execution traces

### Scenario 1: Sequential success

```text
Workflow: Start -> Transform -> Result

1. [Invocation] Accepted with inputs { "name": "Ada" }. Run 0191... created (QUEUED).
2. [Transition] RUNNING. Step 'start' enters READY then RUNNING.
3. [Handler] Step 'start' returns { type: "success", outputs: { "greeting": "Hello, Ada" } }.
4. [Transition] 'start' SUCCEEDED. Outputs committed. Step 'transform' activated; remaining dependencies = 0 -> READY.
5. [Handler] Step 'transform' runs with inputs { "text": "Hello, Ada" }, returns { type: "success", outputs: { "upper": "HELLO, ADA" } }.
6. [Transition] 'transform' SUCCEEDED. Outputs committed. Step 'result' activated; remaining dependencies = 0 -> READY.
7. [Result] Step 'result' binds { "message": "HELLO, ADA" } to workflow output.
8. [Transition] Run SUCCEEDED. Output: { "message": "HELLO, ADA" }, currentSteps: [], failures: [].
```

### Scenario 2: Conditional execution (both branches)

```text
Workflow: Check -> Conditional [True -> PathA -> ResultA, False -> PathB -> ResultB]

Run 1 (True path):
1. 'check' produces { "isValid": true }.
2. Engine evaluates conditional: Branch 1 (priority 1: isValid == true) matches.
3. 'pathA' activated -> READY -> RUNNING -> SUCCEEDED. 'pathB' marked notSelected.
4. 'resultA' binds { "status": "approved" }.
5. Run SUCCEEDED with { "status": "approved" }.

Run 2 (False path):
1. 'check' produces { "isValid": false }.
2. Engine evaluates conditional: Branch 1 does not match; default branch selected.
3. 'pathB' activated -> READY -> RUNNING -> SUCCEEDED. 'pathA' marked notSelected.
4. 'resultB' binds { "status": "rejected" }.
5. Run SUCCEEDED with { "status": "rejected" }.
```

### Scenario 3: Fan-out and fan-in

```text
Workflow: Split -> (BranchA, BranchB) -> Join -> Result

1. 'split' succeeds. Successors 'branchA' and 'branchB' activated.
2. Both 'branchA' (dependencies = 0) and 'branchB' (dependencies = 0) enter READY.
3. currentSteps: [{ stepId: "branchA", state: "ready" }, { stepId: "branchB", state: "ready" }].
4. Worker pool dispatches 'branchA' (RUNNING) and 'branchB' (RUNNING).
5. 'branchA' finishes, outputs committed. 'join' remaining dependencies decremented (2 -> 1).
6. 'branchB' finishes, outputs committed. 'join' remaining dependencies decremented (1 -> 0).
7. 'join' enters READY -> RUNNING -> SUCCEEDED.
8. 'result' binds joined outputs.
9. Run SUCCEEDED.
```

### Scenario 4: Sequential loop success

```text
Workflow: LoopStep (items: [10, 20, 30], maxIterations: 5) -> Result

1. Preflight check: collection length 3 <= maxIterations 5.
2. Iteration 0:
   - Variable item = 10.
   - Body executes -> outputs { "doubled": 20 }.
   - Iteration 0 committed.
3. Iteration 1:
   - Variable item = 20.
   - Body executes -> outputs { "doubled": 40 }.
   - Iteration 1 committed.
4. Iteration 2:
   - Variable item = 30.
   - Body executes -> outputs { "doubled": 60 }.
   - Iteration 2 committed.
5. LoopStep commits output { "results": [{ "doubled": 20 }, { "doubled": 40 }, { "doubled": 60 }] }.
6. 'result' step maps results.
7. Run SUCCEEDED.
```

### Scenario 5: Concurrent handler failures with active drain

```text
Workflow: Split -> (BranchA, BranchB) -> Join -> Result

1. 'branchA' and 'branchB' are RUNNING concurrently on workers.
2. 'branchA' fails with HTTP 500 at T=10ms.
3. Run transitions to STOPPING. Ready queue is cleared (no new dispatches).
4. 'branchB' is still RUNNING; allowed to drain.
5. 'branchB' fails with Connection Timeout at T=25ms.
6. Last active worker finishes (active count = 0).
7. Failures collected: [Failure(branchA), Failure(branchB)].
8. Failures sorted deterministically by stepId.
9. Run transitions to FAILED with failures:
   [
     { "code": "run.step.failed", "stepId": "branchA", "message": "HTTP 500" },
     { "code": "run.step.failed", "stepId": "branchB", "message": "Connection Timeout" }
   ],
   currentSteps: [], output: null.
```

### Scenario 6: Invocation rejection

```text
Request: POST /runs { "workflowId": "0191...", "inputs": { "extraField": "bad" } }

1. Validator inspects workflow definition. Declared inputs: { "userId": "string" }.
2. Undeclared input 'extraField' detected.
3. Request rejected synchronously with HTTP 400:
   {
     "code": "run.input.unknown",
     "message": "Undeclared invocation input 'extraField'.",
     "phase": "invocation"
   }.
4. No run ID created. No in-memory records allocated.
```

### Scenario 7: Output schema validation failure

```text
Workflow: StepA -> Result

1. StepA handler returns { type: "success", outputs: { "score": "high" } }.
2. Exact output schema for StepA expects { "score": "number" }.
3. Runtime validator detects type mismatch.
4. StepA marked FAILED. Run transitions to STOPPING -> FAILED.
5. Failures array:
   [
     {
       "code": "run.output.type",
       "stepId": "StepA",
       "phase": "output",
       "message": "Step 'StepA' produced the wrong type for output 'score'.",
       "details": { "expectedType": "number", "receivedType": "string" }
     }
   ].
```
