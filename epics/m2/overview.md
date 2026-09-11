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

### Before implementation starts

Epics 2 through 5 implement the semantics proposed by the
[M2 execution decision](../../decisions/m2/local-execution-semantics.md), which
is input rather than an approved contract. Resolve its status first. Any
restriction it places on documents the workflow format specification accepts
today must follow that specification's
[versioning rules](../../specifications/workflow-interface-v1.md#breaking-and-additive-changes).

### Dependency chain

| Epic | Depends on |
| --- | --- |
| 1. Daemon network boundary | — |
| 2. Sequential execution | Epic 1 |
| 3. Conditionals | Epic 2 |
| 4. Parallel paths and joins | Epic 3 |
| 5. Bounded loops | Epic 4 |
| 6. Conformance | Epic 5 |

These dependencies order integration, not authoring. Epics 2 through 5 extend
one engine state machine, so their engine transitions are serial. Specification
rules, validation, and pure semantics do not touch that state machine and can be
written ahead of the Epic that integrates them. For example, Epic 3's condition
value and operator rules can be implemented and tested with unit fixtures while
Epic 2's runner is still being completed.

### Parallel workstreams

| Workstream | Requires | Does not touch |
| --- | --- | --- |
| Epic 1 service boundary | The frozen daemon HTTP contract | Engine internals |
| Epic 2 execution engine | The frozen daemon HTTP contract | Service configuration |
| Epic 6 conformance infrastructure | The frozen fixture catalog format | Engine internals |
| A later Epic's specification rules, validation, and pure semantics | Its predecessor's contract | The engine state machine |

The daemon HTTP contract is the only seam between Epics 1 and 2; freezing it
before either starts lets both proceed, and lets Epic 2 run against a fake
in-process transport. Epic 6 builds the fixture catalog, the demonstration
command, and the separate-network environment, while earlier Epics supply the
fixtures it consumes.

## Milestone exit

The milestone is complete when a caller invokes an exact publication through
the Control API, disconnects, and later retrieves progress, output, or failures;
one daemon supports independent concurrent runs and every M2 control-flow
construct; and Epic 6 demonstrates all of it across separately deployable
services.
