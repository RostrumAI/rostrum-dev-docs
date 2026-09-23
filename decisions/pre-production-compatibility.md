# Pre-production compatibility

Status: Accepted by Stephen Pierre-Paul on 2026-09-19.

Updated: 2026-09-22

Applies to: Rostrum product behavior and contracts before the first production deployment, including APIs, workflow formats, and internal interfaces.

## Decision

Before Rostrum reaches production, contributors should actively propose better designs even when they break existing behavior. Preserve a useful contract, not an unreleased mistake. Prefer clean cutovers: migrate known callers, tests, and documentation together, and do not add shims solely to preserve unreleased behavior. An existing version, including workflow format `v1`, may change in place; a breaking change does not by itself require a new version.

Stephen Pierre-Paul established this direction in [PR #21 review comment](https://github.com/RostrumAI/rostrum-dev-docs/pull/21#discussion_r4055082910):

> Go ahead and mutate v1 - we haven't even gotten a workflow running yet, we can worry about breaking stuff once we're in production. I also want you to note this decision permanently - do not be afraid of suggesting breaking changes until we are deployed in a production environment.

This is a product-wide compatibility policy, not an exception only for the self-dependency correction. Changes still belong in the governing specification or decision before dependent implementation proceeds, as required by the [delivery methodology](../epic-delivery-methodology.md#review-and-handoff).

## Boundaries and consequences

The exception permits contract changes, not unrelated data deletion or retroactive rewriting of immutable publications. Published content, identity, and stored digests remain immutable. A started run retains its publication and the execution rules bound at start; a later contract change cannot alter that run. Pre-production changes may affect new invocations of existing publications, so an author may need to revise the draft and publish a new publication without changing `workflowFormatVersion`.

For [workflow format v1](../specifications/workflow-interface-v1.md#graph-topology), rejecting direct self-dependency is approved in place: a step must not list its own ID in its `dependencies`. Publication validation must report a blocking finding rather than publish a step that would wait for itself. This is an accepted contract correction, not a claim that the validator has been changed or verified. M2 Epic 2 owns its implementation and evidence.

Also for v1, a blocking static input/output compatibility check is approved in place (2026-09-22): publication rejects invalid declared schemas and bindings whose producer and consumer types can never agree. On 2026-09-23 this was extended: publication also rejects unknown operations, invalid task configuration, missing or undeclared arguments and outputs, and any binding whose producer can't be proven to fit its consumer, as described in [Input and output compatibility](../specifications/workflow-interface-v1.md#input-and-output-compatibility). Existing publications keep their content; new invocations of one that fails the check are refused. M2 Epic 2 owns its implementation and evidence.

## End of the exception

The first production deployment ends this exception. Stephen Pierre-Paul, as product owner, must record the transition and the production contract baseline in this decision before that release. From that deployment onward, the normal compatibility regime applies: breaking changes follow the affected contract's versioning, migration, and deprecation rules rather than this pre-production allowance. For workflows, those rules are defined in [Format versioning and evolution](../specifications/workflow-interface-v1.md#format-versioning-and-evolution).
