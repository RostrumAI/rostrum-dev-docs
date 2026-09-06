# E2.1: Make workflow interface v1 executable

Status: Planned

Roadmap milestone: [M2: Local workflow execution](../../strategy/product-roadmap.md#3-delivery-milestones)

Depends on: M1 workflow interface, validator, publication lifecycle, and immutable published versions

## Outcome

Every workflow interface v1 document accepted for execution has one unambiguous meaning shared by the workflow library, runtime, daemon, Control API, and conformance fixtures.

## Scope

- Replace unclear `rule set` terminology with names that identify the workflow interface definition, schema, validation pipeline, step registry, or digest metadata directly.
- Finalize exact-version invocation, public run states, internal step-instance states, data binding, structured failures, `currentSteps`, and stable failure ordering.
- Define the step-handler registry, required and optional inputs, configuration, exact outputs, and success and failure envelopes.
- Require explicit conditional destinations, unique priorities, explicit result completion, matching structured joins, bounded-loop failure policy, and ordered loop results.
- Update the workflow specification, TypeScript types, validation, examples, generated schemas, digest vectors, and execution fixtures through a clean cutover.

Use [E2-S1 local execution semantics](../../decisions/m2/e2-s1-local-execution-semantics.md) as the current proposal. Resolve its remaining approval before treating it as an implementation contract.

## Non-goals

- Starting the daemon or executing a workflow.
- Choosing the daemon transport.
- Persistence, retries, human decisions, scripts, tools, or model calls.
- Compatibility aliases for superseded workflow forms or code identifiers.

## Acceptance criteria

- One reviewed contract defines invocation, state, binding, handler, control-flow, result, and failure behavior.
- The workflow package accepts every executable fixture and rejects ambiguous or unsupported definitions with stable findings.
- Step declarations match registered configuration, input, and exact-output schemas.
- Conditional operators have explicit type rules and do not use JavaScript coercion.
- Parallel fixtures reject unmatched, crossing, conditional-containing, and early-terminal paths.
- Loop fixtures define both failure policies and ordered result entries.
- Concurrent fixtures assert causal constraints and stable terminal values rather than one completion order.
- Existing exact-version, validation, publication, and digest behavior continues without compatibility aliases.
