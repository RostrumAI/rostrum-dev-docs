# Epic 5: Execute bounded loops

Status: Planned

Roadmap milestone: [M2: Local workflow execution](../../strategy/product-roadmap.md#3-delivery-milestones)

Depends on: [Epic 4](4-execute-parallel-paths-and-joins.md)

## Outcome

A workflow processes a bounded collection in order and returns an outcome for each completed iteration. The author chooses whether an iteration error stops the run or is captured so later items can still be processed.

## Scope

### Ordered execution and results

- Resolve the loop collection after the loop step's own setup work succeeds. Require an array and check its size against the declared iteration bound before any body work starts. Keep the existing platform maximum; an empty array completes without executing the body.
- Process one item at a time in collection order. Make the current item available only within its iteration and prevent one iteration's local outputs from leaking into another.
- Execute complete loop bodies, including sequential work, conditional paths where permitted, and structured parallel work. Each selected body path produces one iteration outcome; a parallel body must join before producing a successful outcome.
- Record the completed iteration's outcome before starting the next one. Successful values and captured errors retain their original collection positions, even when work inside an iteration finishes in a different order.
- Make the ordered result collection available to later steps after the loop completes. A failed loop must not expose a partial collection as successful output.
- Identify the active iteration and its ready or running steps in run inspection. Completed iteration outcomes remain inspectable while the in-memory run exists.
- Share worker capacity with other runs and paths. A loop within a parallel path must complete before the outer join, and waiting for body work must not reserve the capacity that work needs.

### Configurable error handling

The author can select fail-fast or error-tolerant behavior. Fail-fast prevents later iterations after a failure and produces no successful loop result. Error tolerance captures eligible failures at the failed iteration's position and continues with the next item; it does not retry failed work or resume unfinished steps within that iteration.

Specify the default policy and which errors each policy can capture. Distinguish handler failures, invalid inputs or outputs, and condition-evaluation failures. The implementation must apply the policy to the complete observed failure set: it may continue only if every error in the failed iteration can be captured.

A loop's setup failure, an unresolved or invalid collection, and an exceeded bound occur before an iteration exists. They cannot be presented as captured iteration results. Errors elsewhere in the run remain outside that loop's policy.

If parallel work fails inside an iteration, stop new work in that iteration and wait for its active handlers to finish before deciding the outcome. A successful sibling cannot make a partial join succeed. Other work outside the iteration may continue while a permitted capture is resolved; an unhandled failure stops new work across the run.

Captured errors belong to iteration results, not the run's unhandled-failure list. A run can succeed after permitted captures if its remaining work reaches a valid final result. A later unhandled failure still fails the run without reclassifying earlier captures. Process failure and restart recovery remain outside M2.

## Specification and implementation ownership

The [workflow specification](../../specifications/workflow-interface-v1.md) defines bounded collections but does not yet define loop error-policy configuration or success/error result entries. [M2 execution decision](../../decisions/m2/local-execution-semantics.md) proposes the execution model. This Epic settles those rules and keeps authoring validation, execution, and inspection consistent under the governing versioning rules.

The implementation plan supplies policy field names and values, exact result schemas, error-code eligibility, handler choices, executable workflows, and verification procedures. Epic 6 consolidates those examples into the shared catalog rather than requiring a separate catalog here.

## Non-goals

- Unbounded or nested loops, or simultaneous iterations of the same loop within a run. Independent runs of the same workflow may each have an active iteration.
- Retries, cancellation, generic step or parallel-path recovery policies, or daemon restart recovery.
- Durable run history, human decisions, scripts, tools, models, or production deployment.

## Acceptance criteria

- Empty collections succeed; invalid or over-bound collections fail before body execution. Invalid bounds, nested loops, and out-of-scope data references are rejected.
- Iterations execute in collection order, with no overlap within the same loop invocation. Inspection identifies the active iteration and preserves completed outcomes without leaking local data between iterations.
- Fail-fast stops later iterations. Error tolerance preserves eligible errors at their original positions and continues, with predictable behavior when the policy is omitted.
- Setup errors, ineligible iteration errors, and later unhandled errors fail the run. Permitted captures alone do not fail it or enter its unhandled-failure list.
- Parallel body work finishes draining before the next iteration starts. Multiple observed failures remain available in consistent order, and a join never runs on incomplete inputs.
- Loops within parallel paths complete before the outer join and remain executable at capacity one. Successful results retain collection order at higher capacities.
