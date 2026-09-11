# Milestone 3 overview: Durable runs and human control

Roadmap: [M3: Durable runs and human control](../../strategy/product-roadmap.md#3-delivery-milestones)

## What this milestone accomplishes

M3 makes a run survive the processes that started it. It replaces M2's
in-memory run state with a durable record, so an accepted run continues after a
daemon or Control API restart, and a reconnecting caller can inspect committed
progress, attempts, events, and artifacts whether or not the daemon is running.

The milestone adds the control and evidence capabilities a durable run needs:

- bounded retries of explicitly eligible step failures;
- durable pause, resume, and cancellation commands;
- a workflow step that waits for one validated human decision;
- a cursor-based, read-only run timeline;
- small immutable artifacts with size and digest verification.

Durability changes how execution is recorded, not what a workflow means. A
recovered run follows the same conditional, parallel, join, loop, and failure
rules as before recovery, and M2 behavior is unchanged when no M3 capability is
used. M3 keeps one daemon per deployment and does not promise exactly-once
external effects.

## How the Epics get us there

| Epic | Contribution |
| --- | --- |
| [Epic 1: Recover durable runs](1-recover-durable-runs.md) | Selects the durable store and commits run identity, inputs, checkpoints, attempts, and terminal outcomes so that every supported run can recover. |
| [Epic 2: Retry bounded failures](2-retry-bounded-failures.md) | Retries eligible failures within a declared limit, keeping every attempt inspectable and durable across restart. |
| [Epic 3: Pause, resume, and cancel runs](3-pause-resume-and-cancel-runs.md) | Applies durable, idempotent operator commands at documented recoverable boundaries. |
| [Epic 4: Wait for human decisions](4-wait-for-human-decisions.md) | Pauses a run at a decision step without holding handler capacity, and continues only on one valid response. |
| [Epic 5: Inspect run timelines](5-inspect-run-timelines.md) | Exposes committed per-run events as an immutable, ordered, cursor-paginated projection. |
| [Epic 6: Retrieve run artifacts](6-retrieve-run-artifacts.md) | Stores bounded immutable evidence with producer, size, and digest metadata. |
| [Epic 7: Complete M3 conformance](7-complete-m3-conformance.md) | Composes the durable lifecycle into one isolated real-service demonstration. |

Epic 1 delivers the durable source of truth. Epics 2 through 6 extend the same
checkpoint, attempt, command, and event contracts, and each owns focused
verification of its addition. Epic 7 consolidates their evidence.

## Implementation order

### Dependency chain

| Epic | Depends on |
| --- | --- |
| 1. Recover durable runs | — |
| 2. Retry bounded failures | Epic 1 |
| 3. Pause, resume, and cancel runs | Epics 1, 2 |
| 4. Wait for human decisions | Epics 1, 3 |
| 5. Inspect run timelines | Epic 1 |
| 6. Retrieve run artifacts | Epics 1, 5 |
| 7. Conformance | Epics 1 through 6 |

Epic 1 establishes the durable source of truth and comes first. It owns the
storage decision and the record schema, and every other Epic extends those
records, so settle the schema before the chains below separate.

### Parallel workstreams

| Workstream | Requires | Does not touch |
| --- | --- | --- |
| Lifecycle control: retries, then commands, then decisions (Epics 2, 3, 4) | Epic 1's durable records and checkpoint atomicity | The event store and the artifact boundary |
| Observation and evidence: timeline, then artifacts (Epics 5, 6) | Epic 1's durable records and the Epic 5 event contract | Retry, command, and decision transitions |

The two chains are independent after Epic 1. The lifecycle chain is serial
within itself: commands own their precedence against retry readiness, and
decisions build on operator controls. The observation chain can be built
alongside it, with exposing the lifecycle transitions as timeline events as the
integration step. Epic 7 follows both chains and composes them into one
real-service demonstration.

## Milestone exit

The milestone is complete when a run survives daemon restart and client
reconnect, exposes committed progress, attempts, events, and artifacts, retries
bounded failures, pauses or cancels at recoverable boundaries, and waits for
one validated human decision before continuing its selected path, and Epic 7
demonstrates all of it with one isolated command.
