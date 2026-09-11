# Epic 3: Pause, resume, and cancel runs

Status: Planned

Roadmap milestone: [M3: Durable runs and human control](../../strategy/product-roadmap.md#3-delivery-milestones)

Depends on: [Epic 1](1-recover-durable-runs.md) and [Epic 2](2-retry-bounded-failures.md)

## Outcome

A caller can request that a run pause, resume, or cancel through the Control API. The request is durable and idempotent, and the caller can distinguish accepted intent from the daemon applying the resulting transition. Active work reaches a documented recoverable boundary before the run pauses or cancels.

Operator controls apply to one run. They do not stop another invocation of the same publication or change the workflow definition.

## Scope

### Durable commands

- Append pause, resume, and cancellation requests without having the Control API mutate execution state. Each request has a stable identity, caller information when available, creation sequence, and disposition.
- Return the durable request identity and current disposition. A successful command request does not claim that the daemon has already stopped work; the run projection changes only when the daemon applies the command.
- Make repeated submission of the same command identity return its original disposition. Define the result of a new command that conflicts with a prior command or the current run state.
- Let the daemon process commands in a defined order before starting recovered work or a pending retry. A cancellation or effective pause must not be bypassed by a race with dispatch.

### Pause and resume

- Pause a queued or running run at a safe, documented boundary. A paused run starts no new step or retry while the pause is effective, and it does not hold handler capacity while waiting.
- Give an active handler a cooperative interruption signal. The handler must reach the supported interruption point before the daemon records the paused transition. If the handler cannot acknowledge interruption within the defined boundary, the run remains observable as active or enters an explicit failure state; it must not be reported as paused while work can still start.
- Record an interrupted attempt when pause stops active work. Resume creates a new attempt where the contract requires one and never turns an interrupted attempt into a successful outcome.
- Allow resume only from an operator-paused run. Resume does not answer a human-decision wait, release a failed join, or reopen a terminal run.

### Cancellation

- Let cancellation prevent future steps and retries. Active work follows the defined cooperative boundary before the run enters its terminal canceled state; the implementation must state how forced process termination is represented if the boundary cannot be reached.
- Preserve committed outputs, attempts, commands, and events for inspection. Cancellation cannot produce a successful final output or make an incomplete join or iteration appear complete.
- Make cancellation terminal and idempotent. A later resume, retry request, or duplicate cancellation cannot restart a canceled run.

### Inspection and failure handling

- Expose pending, applied, rejected, and superseded command dispositions, along with the run state that resulted from an applied command.
- Distinguish an operator pause from a workflow wait for a human decision. Both release active capacity, but only the decision request can select a workflow continuation.
- Keep M2 drain behavior for handlers already running when a command arrives. A successful result received after the command's effective boundary cannot release new work if the run is pausing or canceling.
- Keep concurrent runs independent and preserve retry limits, loop iteration state, conditional selection, and parallel join requirements across pause, resume, cancellation, and restart.

## Decisions and implementation ownership

Resolve command identity and scope, ordering, duplicate behavior, caller identity, state transitions, and precedence among pause, resume, cancellation, retry readiness, and execution outcomes. Define the safe interruption contract for the deterministic reference handler, including acknowledgment, timeout, and the representation of an interruption that cannot be reached. Decide whether local execution needs a forceful fallback and what evidence it leaves.

The implementation must choose the smallest control mechanism compatible with the durable store and one-daemon deployment. Do not add a distributed command bus, leader election, or general task cancellation framework. Define whether command records live in the same authoritative store as run checkpoints and how the daemon observes them without creating a second source of truth.

[Epic 1](1-recover-durable-runs.md) owns durable recovery and shared storage. [Epic 2](2-retry-bounded-failures.md) owns retry policy; this Epic owns their race and precedence. [Epic 4](4-wait-for-human-decisions.md) owns workflow decision waits. Extend the Control API only after these command semantics are defined. Detailed command shapes, interruption interfaces, and scenarios belong in implementation plans.

## Non-goals

- Forcefully suspending arbitrary code at an unknown instruction, undoing external side effects, or guaranteeing exactly-once cancellation.
- Pausing another run, the daemon process, a publication, or a whole deployment.
- Human approver policy, notifications, scheduled commands, or a general event subscription.

## Acceptance criteria

- A caller can submit each command, receive a durable request identity, repeat it safely, and observe whether the daemon has applied it. The Control API never reports a requested transition as complete before the execution record commits.
- Pause prevents new work, interrupts the reference handler at its documented boundary, records the interrupted attempt, releases capacity, and leaves the run resumable. A restart preserves the pause.
- Resume starts only the work allowed by the paused run's checkpoint, creates the documented replacement attempt, and cannot answer or bypass a human-decision wait.
- Cancellation prevents later steps and retries, preserves committed history, reaches the documented terminal state after active work settles, and remains terminal after restart.
- Conflicting, late, duplicate, and state-inapplicable commands have stable outcomes. Command and retry races follow one documented precedence rule.
- Controls do not repeat committed work, release incomplete joins, leak loop-local data, alter another run, or change M2 successful execution semantics.
