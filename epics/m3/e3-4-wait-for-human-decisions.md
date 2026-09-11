# E3.4: Wait for human decisions

Status: Planned

Roadmap milestone: [M3: Durable runs and human control](../../strategy/product-roadmap.md#3-delivery-milestones)

Depends on: [E3.1](e3-1-recover-durable-runs.md) and [E3.3](e3-3-pause-resume-and-cancel-runs.md)

## Outcome

A workflow can pause at a general human-decision step, preserve the request across client and daemon interruptions, and continue only after one valid response. The step can represent approval, rejection, selection, correction, or structured input without making approval policy part of the execution engine.

A decision wait is workflow state, not a blocked handler. It consumes no handler capacity and does not require a caller connection to remain open.

## Scope

### Declaring and creating a request

- Define a step contract with named outcomes, explicit continuation targets, and an optional schema for structured response data. Validate that the declaration is complete, reachable, and compatible with the workflow's existing graph and binding rules.
- Let a workflow provide the information a person needs to decide, while keeping that presentation data separate from the response used by downstream steps. Do not turn a free-form chat transcript into the decision contract.
- Create one durable decision request when the step is reached. The request identifies its run, step, exact publication, and creation event, and exposes its current disposition through the Control API.
- Commit the request and waiting run state atomically with the transition that entered the wait. Restart must not create a second request or advance the workflow without a response.

### Submitting and applying a decision

- Accept one response that names a declared outcome and, when configured, supplies a schema-valid response payload. The daemon applies the response to execution; the Control API records the submission but does not choose a branch or advance the graph itself.
- Follow only the selected continuation. The selected outcome and validated response become available to downstream bindings after the transition commits. An unselected continuation never executes or supplies values.
- Record the authenticated caller identity when one is available and preserve the submission, outcome, validation result, and applied transition for inspection. This records who submitted a response without introducing approver authorization.
- Define duplicate, invalid, late, and conflicting submissions. Repeating the same submission identity returns its prior result; a second different response cannot replace an applied decision.
- Keep a waiting run waiting across daemon restart, Control API restart, and client disconnect. An operator resume command cannot answer, bypass, or select a decision request. Cancellation follows the operator-control rules and prevents continuation.

### Interaction with execution

- A decision step does not retain an active handler, reserve worker capacity, or create a retry attempt while it waits. A failed request creation or response application follows durable failure rules rather than silently choosing a default.
- Preserve M2 conditional and join semantics around a decision. A selected path must reach its declared result or successor; a decision cannot complete a workflow implicitly or satisfy a join for an unselected path.
- Make the decision request and applied response part of the run's inspectable history. The request remains linked to the step attempt or execution boundary that created it, even after the run continues or reaches a terminal state.

## Decisions and implementation ownership

Resolve the step name and document shape, outcome-to-target representation, response schema rules, request contents, identity and idempotency scope, caller identity representation, and exact results for duplicate, invalid, late, and conflicting submissions. Decide how a response is validated against the publication selected by the run and how schema or publication changes cannot alter an existing request.

Resolve how the durable store atomically records request creation, response submission, selected continuation, and downstream bindings. The design must work while the daemon is unavailable and must not require a notification service, user directory, approver policy, or live subscription. Those capabilities belong to later governance and integration work.

[E3.1](e3-1-recover-durable-runs.md) owns checkpoint and storage behavior. [E3.3](e3-3-pause-resume-and-cancel-runs.md) owns cancellation and the rule that operator resume cannot bypass this wait. [E3.5](e3-5-inspect-run-timelines.md) and [E3.6](e3-6-retrieve-run-artifacts.md) own general observation and evidence retrieval. Extend the workflow specification and Control API together under its versioning rules. Detailed schemas, endpoint bodies, and executable examples belong in implementation plans.

## Non-goals

- User, team, group, or approver authorization; notifications; escalation; scheduled expiry; or a native mobile client.
- Open-ended conversation, model calls, external side effects, or arbitrary approval policy evaluation.
- Multiple responses, decision replacement, or resuming a wait by changing run state directly.

## Acceptance criteria

- A valid workflow enters exactly one durable decision wait with named outcomes and the optional response schema. The run remains waiting after daemon and client restart, with no active handler and no duplicate request.
- One valid response is accepted once, selects only its declared continuation, and makes its validated payload available downstream after commit. The selected path reaches the normal explicit result behavior.
- Invalid outcome names or response payloads do not advance execution. Duplicate, late, and conflicting submissions return the documented stable result and cannot replace an applied decision.
- Operator resume cannot answer or bypass a decision wait. Cancellation prevents the selected continuation and preserves the request and submission history.
- Decision requests, responses, selected outcomes, and failures remain inspectable after the run completes, while authorization and notification remain outside this Epic.
