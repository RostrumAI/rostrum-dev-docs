# E2.3: Execute conditional workflows

Status: Planned

Roadmap milestone: [M2: Local workflow execution](../../strategy/product-roadmap.md#3-delivery-milestones)

Depends on: [E2.2](e2-2-execute-sequential-workflows.md)

## Outcome

The daemon evaluates workflow conditions consistently, runs one selected path, and records which work was not selected.

## Scope

- Resolve conditional operators, type rules, priority ordering, branch destinations, and workflow completion behavior.
- Update the workflow specification, TypeScript types, validator, schemas, and fixtures with the agreed conditional contract.
- Evaluate declared conditions in the daemon without JavaScript coercion.
- Activate one branch destination and prevent handlers on other paths from running.
- Record unselected step instances separately from failures.
- Bind committed values into conditions and results.
- Exercise both branch outcomes and conditional failures through the runtime, daemon HTTP API, Control API, conformance fixtures, and real processes.

## Non-goals

- Handler-selected branch names.
- Parallel paths, joins, loops, persistence, retries, or human decisions.

## Acceptance criteria

- One reviewed conditional contract is implemented by the workflow package and daemon.
- Conditions use the documented operators, types, and priority ordering without JavaScript coercion.
- Each run selects one branch.
- Both branch outcomes pass through the real Control API and daemon.
- Unselected paths never run and remain distinguishable from failed work.
- Binding, evaluation, and routing failures use stable codes and cannot later become success.
- Applicable fixtures return the same public result at the runtime, daemon HTTP API, and Control API layers.
