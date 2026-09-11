# Epic 2: Retry bounded failures

Status: Planned

Roadmap milestone: [M3: Durable runs and human control](../../strategy/product-roadmap.md#3-delivery-milestones)

Depends on: [Epic 1](1-recover-durable-runs.md)

## Outcome

A workflow can retry an eligible step failure within an explicit limit. Callers can inspect every attempt, understand why another attempt is pending, and distinguish eventual success from exhausted retries. Restarting the daemon does not reset the retry policy or lose a pending retry.

## Scope

- Let authors declare bounded retry behavior for supported steps. Specify which failures are eligible, how many attempts are allowed, and when another attempt becomes ready. Workflows without retry configuration retain their existing failure behavior.
- Give every retry a new attempt identity while retaining the same run and step instance. Keep prior inputs, outcomes, and failure reasons available for inspection; retrying does not overwrite history.
- Persist retry eligibility, consumed attempts, and any delay before another attempt. Waiting for retry readiness releases worker capacity and survives daemon restart without starting early or creating duplicate attempts.
- Retry only the affected work. Successful predecessors, sibling paths, and completed loop iterations do not execute again merely because a step retries. Dependents and success joins remain blocked until the required step produces a validated, committed success.
- Resolve retry behavior together with M2's failure handling. An eligible failure awaiting retry is not yet an unhandled run failure. Once no retry remains, apply the owning scope's failure policy, including permitted loop error capture; do not silently add general continue-on-error behavior.
- Keep recovered interruption distinct from an ordinary retryable failure. Specify how interrupted attempts and attempts restarted after operator pause count toward limits, so repeated restart or resume cannot create an unbounded automatic retry cycle.
- Show callers the failed attempts, remaining retry disposition, and eventual outcome. A run can succeed after a successful retry without presenting earlier attempt failures as unhandled terminal failures.

## Decisions and implementation ownership

Resolve policy placement, validation, failure classification, attempt limits and defaults, and the minimum scheduling behavior required for bounded retries. A delayed retry does not require a general timer node or a catalog of backoff strategies. Define which execution errors cannot sensibly be retried, including invalid data or graph evaluation, rather than treating every error as transient.

Specify precedence between retries and loop error capture, and between pending retries and run failure. [Epic 3](3-pause-resume-and-cancel-runs.md) owns command precedence and adds the corresponding retry/control recovery behavior; no retry may bypass an effective pause or cancellation.

Extend the [workflow specification](../../specifications/workflow-interface-v1.md#breaking-and-additive-changes), validation, runtime, durable records, and APIs together. Follow the governing compatibility rules instead of changing the failure behavior of existing publications implicitly. Record retry transitions and their events consistently with Epic 1. Implementation plans define policy fields, error codes, scheduling details, and executable checks. This Epic owns focused retry verification; [Epic 7](7-complete-m3-conformance.md) consolidates the full-system evidence.

## Non-goals

- Reopening terminal runs, manual reruns, rewinding successful work, or whole-workflow retries.
- Unbounded retries, compensation, rollback, fallback handlers, or side-effect delivery guarantees.
- General timers, workflow timeouts, token or financial budgets, or distributed retry workers.

## Acceptance criteria

- An eligible failure can retry and succeed within its declared limit, with each failed and successful attempt independently inspectable.
- Exhaustion prevents another automatic attempt and follows the configured failure scope. Ineligible failures and omitted retry policies do not acquire undocumented retries.
- Restart before retry readiness or around attempt creation neither loses the pending retry nor resets its limit. Interruption accounting follows the defined rules.
- Retrying a step does not repeat committed predecessors or sibling work, release an incomplete join, or advance a loop before its current iteration settles.
- Retry exhaustion inside a loop follows the loop's error policy: permitted capture preserves the iteration position, while an uncaptured error stops the run. Prior failed attempts remain inspectable in either case.
- Waiting retries consume no handler capacity, and eligible retries share capacity with other runs under M2's scheduling rules.
