# E2.4: Execute conditional workflows

Status: Planned

Roadmap milestone: [M2: Local workflow execution](../../strategy/product-roadmap.md#3-delivery-milestones)

Depends on: [E2.3](e2-3-execute-sequential-workflows.md)

## Outcome

The daemon evaluates workflow conditions consistently, executes exactly one selected path, and exposes unselected work without treating it as failure.

## Scope

- Evaluate declared conditional expressions in the daemon using the E2.1 type and priority rules.
- Activate one explicit destination or explicit workflow-ending branch.
- Mark unselected step instances distinctly and prevent their handlers from running.
- Bind committed values into conditions and terminal results.
- Extend runtime, daemon, Control API, conformance, and real-process scenarios for both branch outcomes and conditional failures.

## Non-goals

- Handler-selected branch names.
- Parallel paths, joins, loops, persistence, retries, or human decisions.

## Acceptance criteria

- Conditions use documented operators, types, and priority ordering without JavaScript coercion.
- Each test run selects exactly one destination.
- Both branch outcomes pass through the real Control API and daemon boundary.
- Unselected paths never run and remain distinguishable from failed work.
- A selected ending branch or explicit `result` step produces the documented output.
- Binding, evaluation, and routing failures use stable codes and cannot later become success.
- Applicable fixtures return the same public result at the runtime, transport, and Control API layers.
