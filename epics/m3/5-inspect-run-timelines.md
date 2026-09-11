# Epic 5: Inspect run timelines

Status: Planned

Roadmap milestone: [M3: Durable runs and human control](../../strategy/product-roadmap.md#3-delivery-milestones)

Depends on: [Epic 1](1-recover-durable-runs.md)

## Outcome

A caller can reconstruct a run's committed history after disconnecting or while the daemon is unavailable. The Control API exposes an immutable, ordered timeline that explains execution progress, attempts, recovery, controls, decisions, failures, and terminal outcomes without requiring live event delivery.

The timeline is a projection of committed execution records. It is not a second execution log and cannot cause a run transition.

## Scope

- Record the events required to explain each committed run transition, including durable acceptance, step and attempt changes, checkpoints, recovery, retry disposition, control commands, decision requests and responses, artifacts, failures, and terminal outcomes.
- Give each run an immutable sequence that callers can use for ordered retrieval. Define the ordering when several events are committed together and ensure a failed transaction leaves no visible partial event set.
- Provide cursor-based pagination with an opaque cursor. A caller can save a cursor, disconnect, and retrieve later events without gaps or duplicates. Repeating a page is safe and terminal history remains stable.
- Expose enough structured information to correlate an event with its run, exact publication, step, loop iteration, attempt, command, decision request, and artifact when applicable. Keep message text supplementary to stable event codes and fields.
- Let callers read the last committed timeline and run projection while the daemon is stopped. Reading events never claims that uncommitted work ran and never changes an execution state.
- Preserve event history for completed, failed, paused, waiting, and canceled runs for the local retention period selected by the storage design. Do not silently remove records needed to explain a run within that period.
- Keep event ordering per run. A global ordering across runs is not needed for M3 and must not become a hidden scheduler contract.

## Decisions and implementation ownership

Resolve the event taxonomy, immutable fields, per-run sequencing, transaction relationship to checkpoints, cursor encoding and invalidation behavior, page limits, and the retention boundary needed for local inspection. Decide whether events are stored in the same Postgres-backed run store or a separate local component only if that choice preserves atomicity and keeps the Control API's source of truth clear. Redis streams, a log broker, or a live subscription system are not requirements for this milestone.

Define the behavior for unreadable event records, a malformed cursor, an event page whose storage disappears, and a partially committed artifact reference. Event retrieval must fail explicitly rather than reorder or invent history. Specify how sensitive invocation data and response payloads are represented; do not copy unrestricted source-system content into the timeline by default.

[Epic 1](1-recover-durable-runs.md) owns checkpoint atomicity and storage selection. [Epic 2](2-retry-bounded-failures.md), [Epic 3](3-pause-resume-and-cancel-runs.md), and [Epic 4](4-wait-for-human-decisions.md) own the transitions whose events this Epic exposes. [Epic 6](6-retrieve-run-artifacts.md) owns artifact content integrity. Detailed event schemas, API pagination, and executable replay scenarios belong in implementation plans.

## Non-goals

- Live subscriptions, websocket delivery, notifications, global audit search, metrics, traces, or a separate telemetry platform.
- Editing, deleting, reordering, or replaying execution from timeline records.
- Storing external context bodies or secrets as ordinary event payloads.

## Acceptance criteria

- Every committed transition required by M3 has one or more immutable structured events linked to the affected run and records. No state change is visible without its required event, and no event claims an uncommitted state.
- Events within a run have stable increasing sequence values, deterministic ordering for one transaction, and immutable content. Terminal history does not change after completion.
- Cursor pagination returns the complete ordered history across multiple pages. A saved cursor resumes after the last returned event without gaps or duplicates; invalid cursors have a stable error.
- Callers can inspect attempts, recovery, retry decisions, controls, human decisions, failures, and terminal results using the same run identity while the daemon is unavailable.
- Timeline reads do not execute work, apply commands, submit decisions, or alter the run projection. Concurrent runs retain separate sequences and histories.
