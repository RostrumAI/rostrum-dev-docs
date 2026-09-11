# Milestone 2 overview: Local workflow execution

Roadmap: [M2: Local workflow execution](../../strategy/product-roadmap.md#3-delivery-milestones)

## What this milestone accomplishes

M2 makes a published workflow executable. A caller selects one exact workflow
publication through the Control API, invokes it, disconnects, and later
retrieves the run's progress, final output, or failures. One daemon supports
independent concurrent runs, including repeated invocations of the same
publication, and executes every M2 control-flow construct: sequential steps,
conditional selection, parallel paths with joins, and bounded loops.

The milestone also puts the Control API and the daemon on a private,
authenticated network boundary over a shared Postgres database. The two
services are configured, started, and stopped independently, and they may run
on the same host or on different machines.

Execution state lives in daemon memory in M2. Durable runs, restart recovery,
retries, operator controls, and human decisions belong to
[M3](../m3/overview.md). That boundary is deliberate: M2 establishes correct
in-memory execution semantics, and M3 makes those semantics durable without
changing how a workflow executes.

## How the Epics get us there

| Epic | Contribution |
| --- | --- |
| [Epic 1: Establish the daemon network boundary](1-establish-daemon-network-boundary.md) | Runs the Control API and daemon as separately configured services over private authenticated HTTP, both using the shared database through `packages/database`. |
| [Epic 2: Execute sequential workflows](2-execute-sequential-workflows.md) | Establishes run identity, invocation validation, progress states, data flow between steps, and explicit result completion. |
| [Epic 3: Execute conditional workflows](3-execute-conditional-workflows.md) | Selects one path from declared conditions and separates unselected work from failed work. |
| [Epic 4: Execute parallel paths and joins](4-execute-parallel-paths-and-joins.md) | Runs independent paths within a run, joins them by declared dependencies, and shares worker capacity fairly across runs. |
| [Epic 5: Execute bounded loops](5-execute-bounded-loops.md) | Processes a bounded collection in order with author-selected iteration error handling. |
| [Epic 6: Complete M2 conformance](6-complete-m2-conformance.md) | Consolidates executable fixtures and one command that demonstrates every construct and the service boundary against real services. |

Epic 1 delivers the deployment boundary. Epics 2 through 5 deliver execution
semantics in dependency order, each extending the same engine while keeping the
specification, validation, and runtime consistent. Epic 6 verifies the whole
system rather than defining a different execution model.

## Implementation order

The declared dependency chain is:

1. Epic 1, the daemon network boundary.
2. Epic 2, sequential execution, which depends on Epic 1.
3. Epic 3, conditionals, which depends on Epic 2.
4. Epic 4, parallel paths and joins, which depends on Epic 3.
5. Epic 5, bounded loops, which depends on Epic 4.
6. Epic 6, conformance, which depends on Epic 5.

That chain orders integration, not authoring. Two workstreams can proceed at
the same time while remaining consistent with it:

- **Epic 1 and Epic 2.** The service boundary and the execution engine share
  only the daemon HTTP contract. Freezing that contract in advance lets both
  proceed, and lets Epic 2 be developed against a fake in-process transport.
- **Epic 6 infrastructure.** The fixture catalog format, the demonstration
  command, and the separate-network environment do not depend on engine
  internals. Earlier Epics supply the fixtures that the catalog consumes.

Within the execution Epics, the specification, validation, and pure semantics
of a later construct can be authored before its predecessor's runtime
integration, because they do not modify the engine's state machine. For
example, the condition value and operator rules of Epic 3 can be implemented
and tested with unit fixtures while Epic 2's runner is still being completed.
Only the engine transitions themselves are serial.

Before implementation starts, resolve the status of the
[M2 execution decision](../../decisions/m2/local-execution-semantics.md). Epics
2 through 5 implement the semantics it proposes, and it is currently input
rather than an approved contract. Any restriction it places on documents the
workflow specification accepts today must follow the specification's
[versioning rules](../../specifications/workflow-interface-v1.md#breaking-and-additive-changes).

## Milestone exit

The milestone is complete when a caller invokes an exact publication through
the Control API, disconnects, and later retrieves progress, output, or failures;
one daemon supports independent concurrent runs and every M2 control-flow
construct; and Epic 6 demonstrates all of it across separately deployable
services.
