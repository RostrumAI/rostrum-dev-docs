# E2.4: Execute parallel paths and joins

Status: Planned

Roadmap milestone: [M2: Local workflow execution](../../strategy/product-roadmap.md#3-delivery-milestones)

Depends on: [E2.3](e2-3-execute-conditional-workflows.md)

## Outcome

The daemon runs bounded parallel paths and matching joins without letting worker capacity or completion order change the joined result or ordered failures.

## Scope

- Resolve the valid split, path, and join structures before updating the workflow specification, TypeScript types, validator, schemas, and fixtures.
- Add a daemon-wide handler limit and a waiting state for work that is ready but lacks capacity.
- Make every root of a parallel split ready during the same scheduling turn.
- Execute sequential work and properly nested parallel work within each path.
- Release a matching join only after every declared path succeeds.
- Schedule fairly across active runs.
- Stop new work after the first unhandled failure, drain handlers already running, and retain every observed failure in stable order.
- Exercise parallel behavior through the runtime, daemon HTTP API, Control API, conformance fixtures, and real processes.

## Non-goals

- Crossing paths, early joins, or conditional routing inside an open parallel section.
- Distributed scheduling, multiple daemons, persistence, retries, or side-effecting handlers.

## Acceptance criteria

- One reviewed parallel contract is implemented by the workflow package and daemon.
- All roots of a split become ready together, subject to worker capacity.
- A join starts only after one declared exit from every path commits success.
- Capacity one and higher capacities produce the same joined output.
- Reversed legal completion orders produce the same joined output and ordered failures.
- No new handler starts after an unhandled failure, and active handlers finish.
- Multiple active runs follow the documented non-starvation rule.
- Tests use deterministic control points and causal assertions instead of timing sleeps or a fabricated total order.
