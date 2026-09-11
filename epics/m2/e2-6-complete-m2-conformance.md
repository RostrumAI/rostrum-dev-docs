# E2.6: Complete M2 conformance

Status: Planned

Roadmap milestone: [M2: Local workflow execution](../../strategy/product-roadmap.md#3-delivery-milestones)

Depends on: [E2.5](e2-5-execute-bounded-loops.md)

## Outcome

A contributor can demonstrate M2 with one command using real services and a shared database. The same workflow has the same execution meaning when run directly by the runtime or invoked through the daemon and Control API.

## Scope

- Define the M2 testing strategy and ownership of checks across the workflow package, runtime, daemon API, and Control API. Earlier Epics retain their focused verification; this Epic consolidates reusable examples, test infrastructure, and full-system evidence.
- Build a shared catalog from the executable workflows and expected outcomes produced by the E2.2 through E2.5 implementation plans. These conformance fixtures check that each layer follows the workflow specification instead of giving the same workflow a different meaning.
- Cover sequential execution, conditional selection, parallel paths and joins, bounded loops, and the interactions between them. Include rejected requests, unavailable input data, invalid outputs, routing and join failures, and both loop error policies.
- Exercise each example at the layers that implement its behavior. Validation checks whether a document is acceptable; execution checks what an accepted run does. Transport-specific responses may differ without changing the underlying result or failure.
- Prove the E2.1 service boundary with the Control API and daemon on separate network addresses, each independently accessing the same Postgres database. Include authentication, encrypted cross-host communication, configuration errors, readiness, unavailable services, timeouts, and independent shutdown.
- Demonstrate that accepted work continues after its initiating client disconnects. A new client must be able to retrieve the same run's progress and terminal outcome.
- Include overlapping invocations of the same publication with different inputs. Verify that run identities, state, results, and failures remain independent under shared worker capacity.
- Provide one local command and a tested guide for running the demonstration, understanding its results, and diagnosing failures. The command must clean up its own resources on success or failure without touching an existing developer database.

## What each layer proves

| Layer | Evidence |
| --- | --- |
| Workflow package | Documents with invalid configuration, references, or graph structure are rejected according to the specification. The validator is not expected to execute workflows. |
| Runtime | Accepted workflows follow the required data, routing, scheduling, result, and failure rules. |
| Daemon HTTP API | The daemon accepts or rejects commands correctly, owns execution, and makes run state available through its private API. |
| Control API | Callers can select a publication, invoke it, and inspect its progress and outcome without the Control API executing the graph. |
| Real services and database | Configured network communication, shared storage access, concurrent runs, client disconnect, and process lifecycle work together. |

## Implementation ownership

The implementation plan defines the catalog format, coverage matrix, concurrent-work controls, environment setup, command, and failure diagnostics. It supplies a combined workflow that exercises all M2 constructs, including a parallel failure captured by a loop policy. Detailed graphs, handler choices, inputs, and expected payloads belong with that executable plan and its implementation.

Concurrency evidence must establish dependencies and capacity limits without assuming a fixed global completion order or relying on timing sleeps. Failure comparisons use the errors actually observed; a handler that never started cannot contribute a failure. Any disagreement between layers must be fixed in the owning specification or implementation, not hidden by different expectations in each test adapter.

## Non-goals

- New workflow constructs or a second execution model in the tests.
- Run persistence, restart recovery, retries, human decisions, scripts, tools, models, or production deployment.
- Repeating the full example catalog in separate layer-specific suites.

## Acceptance criteria

- The shared catalog covers every M2 construct and failure class, with expected outcomes and clear reasons for which layers exercise each example.
- Validation follows the specification, and the runtime and APIs agree on execution outcomes while preserving legitimate transport differences.
- One command demonstrates separate-network authenticated services, shared-database access, the E2.1 failure cases, and clean shutdown and cleanup.
- A combined workflow proves that sequential work, conditionals, parallel joins, and bounded loops compose, including permitted capture of a parallel iteration failure.
- Concurrent invocations remain independent. Accepted work survives client disconnect, and another client retrieves the original run's progress and final result or failures.
- Concurrent checks prove ordering constraints and bounded capacity without timing assumptions. The guide states what the command proves and how to interpret a failure.
