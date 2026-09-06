# E2.5: Execute parallel paths and joins

Status: Planned

Roadmap milestone: [M2: Local workflow execution](../../strategy/product-roadmap.md#3-delivery-milestones)

Depends on: [E2.4](e2-4-execute-conditional-workflows.md)

## Outcome

The daemon executes bounded parallel paths and matching joins without allowing capacity or completion order to change the joined result or ordered failures.

## Scope

- Add a daemon-wide handler limit and a waiting state for eligible work without capacity.
- Make every root of a parallel split eligible during the same scheduling turn.
- Execute sequential work and properly nested parallel work within each path.
- Release a matching join only after every declared path succeeds.
- Schedule fairly across active runs.
- Stop new work after the first unhandled failure, drain handlers already running, and retain every observed failure in stable order.
- Exercise parallel behavior through the runtime, daemon, Control API, conformance suite, and real-process scenario.

## Non-goals

- Crossing paths, early joins, or conditional routing inside an open parallel section.
- Distributed scheduling, multiple daemons, persistence, retries, or side-effecting handlers.

## Acceptance criteria

- All roots of a split become waiting together, subject to capacity.
- A join starts only after one declared exit from every path commits success.
- Capacity one and higher capacities produce the same joined output.
- Reversed legal completion orders produce the same joined output and ordered failures.
- No new handler starts after an unhandled failure, and active handlers finish.
- Multiple active runs follow the documented non-starvation rule.
- Tests use deterministic control points and causal assertions instead of timing sleeps or a fabricated total order.
