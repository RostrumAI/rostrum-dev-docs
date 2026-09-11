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

The declared dependency chain is:

1. Epic 1, durable runs and recovery. Every other Epic extends the records it defines.
2. Epic 2, retries, which depend on durable attempts and checkpoints.
3. Epic 3, pause, resume, and cancellation, which depend on Epics 1 and 2 and own their precedence against retry readiness.
4. Epic 4, human decisions, which depend on Epics 1 and 3.
5. Epic 5, run timelines, which depend on Epic 1.
6. Epic 6, run artifacts, which depend on Epics 1 and 5.
7. Epic 7, conformance, which depends on Epics 1 through 6.

Epic 1 is the shared foundation and comes first. After it, two chains can
proceed at the same time:

- **Lifecycle control.** Epics 2, 3, and 4: retries, then operator commands,
  then decision waits. Each depends on the previous one, so this chain is
  serial.
- **Observation and evidence.** Epics 5 and 6: the timeline, then artifacts.
  The timeline's event store, ordering, and pagination contract can be built
  alongside Epics 2 through 4. Exposing their transitions as events is the
  integration step.

Both chains extend the durable records Epic 1 defines and must preserve its
checkpoint atomicity, so the record schema is the shared interface to settle
before the chains separate. Epic 7 follows both chains.

## Milestone exit

The milestone is complete when a run survives daemon restart and client
reconnect, exposes committed progress, attempts, events, and artifacts, retries
bounded failures, pauses or cancels at recoverable boundaries, and waits for
one validated human decision before continuing its selected path, and Epic 7
demonstrates all of it with one isolated command.
