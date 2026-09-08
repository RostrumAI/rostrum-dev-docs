# E2.5: Execute bounded loops

Status: Planned

Roadmap milestone: [M2: Local workflow execution](../../strategy/product-roadmap.md#3-delivery-milestones)

Depends on: [E2.4](e2-4-execute-parallel-paths-and-joins.md)

## Outcome

The daemon runs bounded loops in collection order and returns an ordered result or failure for each iteration.

## Scope

- Resolve loop configuration, bounds, result entries, and failure policies before updating the workflow specification, TypeScript types, validator, schemas, and fixtures.
- Require the loop collection to resolve to an array.
- Enforce `maxIterations` before the first iteration starts.
- Run one iteration at a time in collection order with a distinct identity for each body step and iteration.
- Expose the loop variable within the active iteration.
- Execute complete loop bodies, including structured parallel work.
- Produce one ordered result entry per iteration.
- Implement fail-fast and error-tolerant policies, including stable ordering for multiple failures within one iteration.
- Exercise loop behavior through the runtime, daemon HTTP API, Control API, conformance fixtures, and real processes.

## Non-goals

- Unbounded or nested loops.
- Concurrent loop iterations.
- Persistence, retries, human decisions, scripts, tools, models, or production deployment.

## Acceptance criteria

- One reviewed loop contract is implemented by the workflow package and daemon.
- Empty collections succeed with an empty ordered result.
- Non-array and over-bound collections fail before any iteration starts.
- Iteration `n + 1` starts only after iteration `n` commits its result.
- Successful and error-tolerant iterations occupy the correct result positions.
- Fail-fast loops start no later iteration after an unhandled failure.
- Parallel work inside an iteration follows E2.4 join and failure rules.
- `currentSteps` includes iteration identity for active body steps.
- Applicable fixtures return the same public result at the runtime, daemon HTTP API, and Control API layers.
