# E2.6: Execute bounded loops

Status: Planned

Roadmap milestone: [M2: Local workflow execution](../../strategy/product-roadmap.md#3-delivery-milestones)

Depends on: [E2.5](e2-5-execute-parallel-paths-and-joins.md)

## Outcome

The daemon executes every workflow interface v1 control-flow construct and returns ordered loop results or failures through the Control API.

## Scope

- Resolve each loop collection and require an array.
- Enforce `maxIterations` before iteration zero starts.
- Run one iteration at a time in collection order with a distinct identity for each body step and iteration.
- Expose the loop variable within the active iteration.
- Execute complete loop bodies, including structured parallel work.
- Produce one ordered result entry per iteration.
- Implement fail-fast and error-tolerant policies, including stable ordering for multiple failures within one iteration.
- Extend conformance and real-process scenarios to every workflow interface v1 construct and publish the tested local execution guide.

## Non-goals

- Unbounded or nested loops.
- Concurrent loop iterations.
- Durable state, retries, human decisions, scripts, tools, models, or production deployment.

## Acceptance criteria

- Empty collections succeed with an empty ordered result.
- Non-array and over-bound collections fail before any iteration starts.
- Iteration `n + 1` starts only after iteration `n` commits its result.
- Successful and error-tolerant iterations occupy the correct result positions.
- Fail-fast loops start no later iteration after an unhandled failure.
- Parallel work inside an iteration follows E2.5 join and failure rules.
- `currentSteps` includes iteration identity for active body steps.
- One command starts the Control API and daemon separately, covers every v1 control-flow construct and failure class, proves client disconnection, and stops both processes cleanly.
- The same fixture catalog passes at every applicable layer without timing-dependent polling.
