# E2.4: Execute parallel paths and joins

Status: Planned

Roadmap milestone: [M2: Local workflow execution](../../strategy/product-roadmap.md#3-delivery-milestones)

Depends on: [E2.3](e2-3-execute-conditional-workflows.md)

## Outcome

A workflow can perform independent work in parallel and combine its successful outputs before continuing. Operators can limit simultaneous work without changing a successful workflow's result or allowing one busy run to starve other runs.

Concurrent runs and parallel paths are different capabilities. E2.2 allows several independent runs, including runs of the same publication. This Epic allows multiple paths within each run and shares available worker capacity across all runs.

## Scope

### Parallel work and joins

- Let a step split execution into independent paths. Each path can contain sequential work or a nested split that rejoins before the outer path completes.
- Require one matching join for each split. A join waits for successful completion of every declared path and combines outputs by their workflow references, not by completion order.
- Prevent paths from crossing, merging early, ending before their join, or selecting a conditional path while a parallel section is open. A join may continue the workflow or produce its final result; conditional routing after it belongs to a separate step.
- Keep successful joined outputs unchanged when worker capacity or legal completion order changes. A join must never run with missing or invalid path outputs.

### Capacity and visibility

- Apply a configurable limit to running handlers across the daemon. A limit of one serializes handler execution but still allows multiple accepted runs and ready paths.
- Show callers the difference between work ready to execute and work currently running. Active-work entries identify the run and step, with an iteration index when E2.5 adds loops. Their display order does not promise a global execution order.
- Give each eligible run a bounded opportunity to use capacity as workers become available. A wide or continuously busy run must not occupy every opportunity ahead of another eligible run. The implementation plan defines the scheduling rule and its bound; no progress is promised while every worker remains occupied indefinitely.
- Ensure that a waiting join or parent does not consume the capacity its child work needs. Nested work must remain executable even with one worker.

### Failures

When an unhandled error stops a run, start no new work and let already running handlers finish. This is draining, not cancellation or retry. A success received during draining cannot release new dependent work or complete a join with a failed path.

Report every failure actually observed in a consistent order. Different capacities can change which handlers start before a failure stops dispatch, so they need not produce identical failure sets. Do not invent a failure for work that never ran.

E2.5 adds workflow-configured capture of iteration errors. Parallel work inside a failed iteration must finish draining before that policy decides whether the loop may continue. An error captured by the loop is not automatically a failed run; a join still cannot treat the failed iteration's partial outputs as success. E2.5 owns that combined implementation and verification.

## Specification and implementation ownership

The [E2-S1 proposal](../../decisions/m2/e2-s1-local-execution-semantics.md) supplies the proposed parallel execution model. Keep the [workflow specification](../../specifications/workflow-interface-v1.md), graph validation, and runtime consistent, applying the governing versioning rules to new restrictions on accepted graphs.

The implementation plan supplies executable workflows, handler choices, scheduling details, and controlled concurrency checks. E2.6 owns the shared example catalog and real-service test environment; neither is a prerequisite for this Epic's focused verification.

## Non-goals

- Crossing paths, early joins, or conditional routing inside an open parallel section.
- Multiple daemons, distributed scheduling, persistence, retries, cancellation, or side-effecting handlers.
- General recovery policies for individual steps or parallel sections.

## Acceptance criteria

- Sequential and nested parallel paths reach their matching joins correctly. Invalid crossings, missing path exits, and early terminals are rejected.
- The same successful workflow produces the same joined output at capacity one and higher capacities, regardless of legal completion order.
- Active-work visibility distinguishes ready and running steps and reflects the daemon-wide limit. Waiting parents do not block their children from using capacity.
- An eligible run receives capacity within the documented scheduling bound even while another run has more work ready.
- A failed run starts no new handlers, waits for active handlers to finish, and reports its observed failures consistently without running a partial success join.
- Failure reporting preserves the affected work and observed errors needed by E2.5's iteration policy without assuming that every error must end the whole run.
