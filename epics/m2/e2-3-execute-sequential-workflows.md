# E2.3: Execute sequential workflows

Status: Planned

Roadmap milestone: [M2: Local workflow execution](../../strategy/product-roadmap.md#3-delivery-milestones)

Depends on: [E2.1](e2-1-make-workflow-interface-v1-executable.md), [E2.2](e2-2-establish-local-daemon-boundary.md)

## Outcome

A caller starts an exact published sequential workflow through the Control API, disconnects, and later retrieves its current state or declared result after the daemon executes it.

## Scope

- Verify the published workflow version, digest, interface version, invocation inputs, and registered handlers before run creation.
- Create the in-memory execution engine and stable run identity.
- Track queued, waiting, running, succeeded, and failed step instances.
- Resolve workflow inputs and committed step outputs before handler invocation.
- Invoke handlers through the E2.1 contract and commit only validated outputs.
- Follow sequential connections and bind success only at an explicit `result` step.
- Expose run creation and retrieval through the Control API while keeping graph logic in the daemon.
- Run sequential and rejection fixtures against the runtime, daemon transport, and Control API.

## Non-goals

- Conditional routing, parallel paths, joins, or loops.
- Durable state, restart recovery, retries, waits, cancellation, or side effects.

## Acceptance criteria

- Invalid workflow identity, input, interface support, digest, or handler availability rejects invocation without a run ID.
- A valid request returns `HTTP 201`, a stable run ID, and a queued representation.
- The client can disconnect immediately after acceptance without stopping the run.
- Sequential steps execute once and in order, and outputs become visible only after validation and commit.
- Retrieval returns the documented queued, running, succeeded, or failed representation and ordered `currentSteps`.
- Only an explicit `result` step completes a run successfully.
- The same fixtures return the same public state, output, and failures at every applicable layer.
- One real-process scenario proves the complete sequential path without timing-based sleeps.
