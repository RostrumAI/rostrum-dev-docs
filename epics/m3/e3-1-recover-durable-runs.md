# E3.1: Recover durable runs

Status: Planned

Roadmap milestone: [M3: Durable runs and human control](../../strategy/product-roadmap.md#3-delivery-milestones)

Depends on: [M2 conformance](../m2/e2-6-complete-m2-conformance.md) and the execution, handler, publication, and service contracts delivered by M2

## Outcome

An accepted run survives daemon and Control API restarts. A caller can reconnect to the same run, inspect its committed progress while the daemon is unavailable, and see execution continue after recovery without losing completed work.

M3 retains one daemon per deployment and independent concurrent runs, including repeated invocations of the same publication. Durability applies to every supported M2 control-flow construct, not just sequential workflows.

## Scope

### Durable acceptance and progress

- Preserve each accepted run's identity, exact publication, invocation inputs, execution progress, and terminal output or failures. Later publications cannot change a recovering run.
- Commit the initial run record before acknowledging durable acceptance. Invalid invocations still create no run. If the caller loses the acceptance response, it can repeat the invocation with the same idempotency key and recover the original run rather than create another one.
- Reject reuse of an idempotency key with a different publication or inputs. Concurrent identical requests share one accepted run; independent invocations remain possible with distinct keys or under the defined behavior when a key is omitted.
- Record each handler invocation as a distinct attempt. An attempt is one execution of a step instance, identified within its run and loop iteration where applicable. Preserve completed and interrupted attempts so a caller can distinguish repeated execution from repeated observation.
- Commit progress at recoverable boundaries. A checkpoint is the durable record from which execution can safely continue. Outputs become downstream inputs only after validation and durable commit; the associated execution changes and required events must agree after restart.
- Keep terminal results and failures immutable. Inspection through the Control API returns the last committed progress, attempts, and outcomes even while the daemon is stopped, without presenting stored progress as evidence that work is currently executing.

### Restart recovery

- Recover every supported nonterminal run from its last committed checkpoint. Restore selected paths, completed parallel work and pending joins, loop position, and ordered iteration outcomes, including captured errors.
- Do not execute work again once its successful outcome is committed. An attempt interrupted before its outcome commits remains distinguishable from success and may require a new attempt. Recovery must not release a join twice, repeat a completed iteration, or select a different path from unchanged committed data.
- Preserve M2 failure handling during recovery. A run or iteration already stopping after an error cannot restart ordinary dispatch; missing results cannot become a successful join or loop output.
- Retain independent run state and M2's shared capacity and fairness behavior after restart. Recovery does not give one run ownership of all workers.
- Report unavailable storage, unreadable checkpoints, and unsupported stored execution clearly. Do not acknowledge durability or continue from guessed state when the required records cannot be read or committed.

Recovery can execute an interrupted handler more than once. M3 handlers remain deterministic and have no external side effects; the platform may persist their results and evidence. M4 must resolve safe repetition and interruption of side-effecting tools and scripts before adding those handlers. Durable state is not an exactly-once execution guarantee.

## Decisions and implementation ownership

This Epic owns choosing and implementing run persistence. Compare the existing Postgres database with any proposed additional store, such as Redis, against durable acceptance, checkpoint consistency, recovery, concurrent runs, and inspection during daemon downtime. Select the smallest self-hostable design that meets those requirements; neither an extra service nor a replaceable multi-backend framework is required. The existing shared Postgres publication store remains a dependency, not a decision about where every run record must live.

Resolve checkpoint boundaries, interrupted-attempt treatment, invocation-key scope and lifetime, response replay, and behavior when a commit's result is uncertain. Define the supported restart and storage-failure model, storage setup and migration, and service read/write responsibilities. The daemon alone advances execution; the Control API reads committed execution records. Any required change to M2's private-HTTP coordination boundary must be explicit rather than introduced through implicit database polling.

The [M2 execution proposal](../../decisions/m2/e2-s1-local-execution-semantics.md#m3-persistence-and-idempotency-handoff) supplies persistence ideas, not an approved storage or recovery design. Resolve those choices against the delivered M2 implementation. Record durable rules in the appropriate specification or decision and keep storage, runtime, and API behavior consistent.

This Epic records the execution events needed to explain its checkpoints and recovery. [E3.5](e3-5-inspect-run-timelines.md) adds the caller's timeline and cursor contract. [E3.2](e3-2-retry-bounded-failures.md) through [E3.4](e3-4-wait-for-human-decisions.md) extend checkpoints and recovery for retries, controls, and decisions; each owns verification of its additions. Detailed record shapes, algorithms, interruption controls, and executable scenarios belong in implementation plans.

## Non-goals

- Multiple daemons, distributed scheduling, leases, leader election, automatic failover, or recovery onto another execution target.
- New graph constructs, automatic retries of completed failures, operator controls, or human decisions in this Epic.
- Exactly-once external effects, arbitrary instruction-level resumption, disaster recovery, or Cloud operations.
- A live event subscription, artifact store, general retention service, or migration of M2's lost in-memory runs.

## Acceptance criteria

- An acknowledged invocation and its committed outcomes remain readable after both services stop and restart. Repeating an invocation after losing its response returns the original run; conflicting reuse is rejected without starting work.
- Recovery continues supported sequential, conditional, parallel, and loop execution without repeating committed work, losing captured iteration outcomes, or changing the selected publication and inputs.
- An interrupted attempt is visible as interrupted before any replacement executes. Uncommitted output never satisfies a dependency or produces success.
- Recovery preserves failure-draining rules, terminal immutability, and independence between concurrent invocations under shared capacity.
- The Control API returns committed progress while the daemon is unavailable and does not advance execution itself. Callers can distinguish that progress from confirmed live execution.
- Storage failure or unusable recovery state produces an explicit failure to accept or advance the affected work rather than a false durability acknowledgement or fabricated continuation.
