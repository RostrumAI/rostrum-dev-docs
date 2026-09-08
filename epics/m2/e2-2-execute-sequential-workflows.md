# E2.2: Execute sequential workflows

Status: Planned

Roadmap milestone: [M2: Local workflow execution](../../strategy/product-roadmap.md#3-delivery-milestones)

Depends on: [E2.1](e2-1-establish-daemon-network-boundary.md), [Workflow interface v1](../../specifications/workflow-interface-v1.md), its validator, publication lifecycle, and immutable published versions

## Outcome

A caller starts a sequential workflow through the Control API, disconnects, and later retrieves its state, result, or failures after the daemon executes it.

## Scope

- Define invocation validation, public run states, internal step states, `currentSteps`, structured failures, and stable failure ordering.
- Define the step-handler registry, required and optional inputs, configuration, exact outputs, and success and failure envelopes.
- Update the workflow specification, TypeScript types, validation, schemas, and fixtures with those rules.
- Verify the workflow version, digest, invocation inputs, and registered handlers before creating a run.
- Create the in-memory execution engine and a stable run identity.
- Resolve workflow inputs and committed step outputs before calling a handler.
- Validate handler outputs before committing them.
- Follow sequential connections and complete a run only through the result rule chosen in this Epic.
- Add run creation and retrieval to the Control API and daemon HTTP API while keeping graph execution in the daemon.
- Exercise acceptance and rejection through the workflow package, runtime, daemon, and Control API.

Use [E2-S1 local execution semantics](../../decisions/m2/e2-s1-local-execution-semantics.md) as the current proposal. Resolve its run and handler decisions during this Epic before implementing them.

## Non-goals

- Conditional routing, parallel paths, joins, or loops.
- Persistence, restart recovery, retries, waits, cancellation, or side-effecting handlers.
- Compatibility aliases for superseded workflow forms or code identifiers.

## Acceptance criteria

- One reviewed contract defines sequential invocation, state, binding, handlers, results, and failures.
- Invalid workflow identity, input, interface support, digest, or handler availability rejects the request without creating a run.
- A valid request creates a queued run with a stable run ID.
- The client can disconnect after acceptance without stopping the run.
- Sequential steps execute once and in order. Outputs become visible only after validation and commit.
- Retrieval returns the documented queued, running, succeeded, or failed representation and ordered `currentSteps`.
- A run succeeds only through the result rule chosen in this Epic.
- The same fixtures return the same public state, output, and failures through the workflow package, runtime, daemon HTTP API, and Control API where the behavior applies.
- One real-process scenario proves the complete sequential path without timing sleeps.
