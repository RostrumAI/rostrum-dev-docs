# E2.4: Execute parallel paths and joins

Status: Planned

Roadmap milestone: [M2: Local workflow execution](../../strategy/product-roadmap.md#3-delivery-milestones)

Depends on: [E2.3](e2-3-execute-conditional-workflows.md)

## Outcome

The daemon executes independent paths within a worker limit and combines their successful outputs at a matching join. For fixed inputs and handler outputs, worker capacity and completion order do not change the joined value. Failures are sorted consistently when reported, but different capacities can change which handlers start and therefore which failures occur.

## Scope and technical requirements

### Paths and matching joins

A split is a step with multiple `successors`. A path starts at one of those successors and contains the work between that root and the matching join. The join declares one exit step from each path in its `dependencies` and waits for all those exits to succeed. A handler returning an error does not satisfy a dependency.

- Every split has one matching join. Paths cannot cross, merge before that join, or terminate early. A conditional cannot occur while a parallel section remains open.
- A path can contain sequential steps or another split. The inner split must reach its own join before its path reaches the outer join.
- A join binds outputs by their declared step references, not by completion order. It runs once after every required output has passed validation and been recorded in the daemon's in-memory run state.
- A join can continue to a successor or be the workflow's terminal `result` step. Conditional routing after a join belongs on a separate successor step. Within an E2.5 loop body, a terminal join supplies the iteration's result rather than ending the run.

### Capacity and active work

- Set a positive daemon-wide limit on simultaneously running handlers across all runs. A limit of one serializes handler execution without changing graph dependencies or successful joined values. Nested paths share this limit; a parent waiting for its children must not occupy a handler slot that those children need.
- All roots become eligible when their split succeeds. Starting one root does not depend on a sibling finishing. Work that has satisfied its dependencies but has no worker slot remains `ready`; work whose handler has started is `running`.
- Expose these states in `currentSteps`, the run's list of ready and running step instances. Identity is the run ID plus step ID, extended with an iteration index inside an E2.5 loop. Nested parallel paths do not create duplicate instances of the same step within that scope.
- Define a stable display order for active entries using step ID and then iteration index. Display order is not a promise about handler start or completion order.
- Schedule fairly between runs that have ready work. With a fixed set of eligible runs and handlers that finish, each run must receive a worker opportunity before another receives a second opportunity in that scheduling round. A newly ready run must join the next round at the latest. This rule does not preempt a running handler or promise progress while all workers remain occupied indefinitely.

### Errors and draining

An error belongs first to the execution scope where it occurs. Outside a loop that can capture it, an unhandled error stops the run: stop starting new handlers, let already running handlers settle, and report all observed unhandled failures. Draining means waiting for those handlers to return success or failure; it does not cancel or retry them. Successful completions during drain cannot start successor work.

E2.5 adds workflow-configured capture at the iteration boundary. When an error occurs inside an iteration, stop new work in that iteration and settle its active handlers before deciding its outcome. Do not execute a success join with missing inputs, even if another path succeeds during drain. If the loop policy permits capture of the observed errors, record an error result at that iteration's position and allow the next iteration. Otherwise propagate the unhandled failure to the run and drain any other active run work. A handler error is therefore not automatically a run failure.

Retain every failure actually observed in the affected scope and sort by step ID, iteration index when present, error code, and document path. Do not invent errors for work that never started or require identical failure sets when capacity changes which work starts. E2.5 owns eligible error classes and captured-result schemas; this Epic does not add a general step or parallel error policy.

### Future specification changes

[E2-S1](../../decisions/m2/e2-s1-local-execution-semantics.md) is a proposal, not an implemented or approved replacement for the [current workflow specification](../../specifications/workflow-interface-v1.md). This Epic must update the specification, TypeScript types, executable schemas, graph validator, and runtime together for:

- `successors` and graph topology: all roots become ready together, but handler starts obey capacity; require matching joins, disjoint paths, and properly nested splits.
- `dependencies`: require successful outputs before a join starts and define reachability for parallel path exits without allowing dependencies on mutually exclusive conditional branches.
- Path termination: prohibit early results and conditionals inside an open split; define terminal joins at workflow and loop-body scope.
- Execution and inspection contracts: define the worker limit, fair scheduling rule, active-instance identity/order, scoped drain, and stable ordering of observed failures.

Resolve changes against the specification's versioning rules before shipping them. This Epic does not silently reinterpret existing published documents.

## Validation workflows

These named examples are reusable workflow fixtures: workflow definitions, invocation inputs, and expected outcomes. Step names below are readable labels; executable examples use valid step IDs. E2.6 owns their shared catalog, layer coverage, and real-process harness. This Epic owns the following focused behavior checks. Use controllable handler completion points to observe dependencies and active work rather than timing sleeps or an invented global execution order.

Reuse E2.2's handler registry and E2.3's numeric operations, adding only the deterministic arithmetic and sum operations needed by these examples. Specify their numeric input bindings, configuration, and exact output fields alongside each executable workflow. Split/setup steps use the same registered handler contract; they do not introduce a second kind of task execution. Loop-specific cases below are delivered and verified in E2.5, not prerequisites for completing E2.4.

### Parallel arithmetic: two paths and one join

Input: `{ "x": 10 }`.

Graph: `split -> [addTwo -> triple, subtractOne] -> sum -> result`. The left path computes `(10 + 2) * 3 = 36`; the right path computes `10 - 1 = 9`. `sum` depends on `triple` and `subtractOne` and returns `{ "total": 45 }`.

1. Run with worker limits one and two. Hold a running handler and inspect `currentSteps` to distinguish waiting roots from running work and confirm the limit.
2. At limit two, complete the right path before the left, then reverse the order in a separate run. `sum` must not start while either exit is unfinished.
3. Both runs return `{ "total": 45 }`, with no active steps or failures after success.

### Nested arithmetic: an inner join stays inside its path

Input: `{ "x": 10 }`.

Graph: `outerSplit -> [innerSplit -> [addTwo, double] -> innerSum, subtractOne] -> outerSum -> result`. The inner paths produce `12` and `20`; `innerSum` produces `32`. The other outer path produces `9`, so the final output is `{ "total": 41 }`.

Run at limits one and three and vary completion order. The inner join waits for both inner exits, the outer join waits for `innerSum` and `subtractOne`, and neither run stalls because a waiting parent holds a worker slot. Validation variants that cross an inner path into the outer sibling, omit an exit dependency, end a path before its join, or place a conditional inside the split must fail publication with findings at the offending graph fields.

### Failed path: no partial success join

Use Parallel arithmetic with two workers. Start `addTwo` and `subtractOne`; hold both handlers, then make `addTwo` return a structured failure. Let `subtractOne` settle successfully. `triple`, `sum`, and `result` must never start. The run ends failed with `output: null`, no active steps, and the observed failure for `addTwo`.

Repeat with both active handlers failing and release their failures in each order. The final list contains both failures in step-ID order. At capacity one, if the first dispatched handler fails before its sibling starts, report only that observed failure. E2.5 reuses this parallel failure inside its capturing loop scenario: the failed iteration drains and has no success join, but a permitted capture allows the next iteration.

### Fair worker access: a wide run cannot starve a small run

Use a limit of one. Run A has four parallel handlers, each returning `1`, followed by a sum of `4`. While its first handler is held, admit run B, whose single arithmetic handler computes `2 + 3 = 5`. Release handlers one at a time and record which run receives each worker opportunity. B must receive an opportunity by the next scheduling round and cannot wait behind every remaining A handler. Both runs finish with their expected values; the combined active-handler count never exceeds one.

## Non-goals

- Crossing paths, early joins, or conditional routing inside an open parallel section.
- Distributed scheduling, multiple daemons, persistence, retries, cancellation, or side-effecting handlers.
- General error recovery policies for individual steps or parallel sections.
- A new fixture catalog, multi-layer test project, or process harness; E2.6 owns those.

## Acceptance criteria

- The specification, workflow types, schemas, validator, and runtime agree on the permitted split/join structures. Valid nested examples execute; invalid crossings, missing exits, and early terminals fail publication.
- Parallel arithmetic returns `45` and Nested arithmetic returns `41` at the stated capacities and legal completion orders. No join runs with incomplete or invalid inputs.
- Ready/running visibility identifies each active instance correctly, follows the display order, and reflects the daemon-wide worker limit.
- Fair worker access satisfies the stated scheduling-round rule without preemption.
- A failed scope starts no new handlers, settles active handlers, and retains all failures actually observed in stable order. Capacity-dependent failure membership is not treated as nondeterminism.
- Run-level failure handling preserves the scope and complete observed errors needed by E2.5's iteration policy. E2.5 owns the implementation and combined validation of iteration capture; it must not reinterpret a captured iteration error as an unhandled run failure.
