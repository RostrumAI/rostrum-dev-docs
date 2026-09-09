# E2.3: Execute conditional workflows

Status: Planned

Roadmap milestone: [M2: Local workflow execution](../../strategy/product-roadmap.md#3-delivery-milestones)

Depends on: [E2.2](e2-2-execute-sequential-workflows.md)

## Outcome

A workflow chooses one path from its declared conditions. Callers can see which path was selected, which work was not selected, and why execution failed if a condition could not be evaluated.

## Scope

- Evaluate conditions using validated outputs from completed steps, including the step that owns the conditional. Handlers return data; the daemon chooses the path.
- Define the meaning of equality, ordering, membership, containment, and truth tests for supported values, including missing data and `null`. Conditions must not inherit implicit host-language conversions: comparing a number with a numeric-looking string must follow an explicit rule rather than silently converting the string.
- Define how combined conditions evaluate and when an invalid value causes an error. A condition that is false and one that cannot be evaluated are different outcomes.
- Select the first matching branch in ascending numeric priority, or the declared default if none matches. Define the treatment of duplicate priorities. Branch-array order must not override the chosen priority rule.
- Execute only the selected path. Its outputs become available only after the selected steps execute successfully; selecting a path does not itself produce values.
- Let callers inspect the selected rule and distinguish unselected steps from failed, waiting, and completed work. A step reachable through the selected path must not be marked unselected merely because another rule also names it.
- Define how each selected path reaches its final result, using E2.2's result behavior. A conditional does not permit a downstream step to depend on mutually exclusive paths that cannot both execute.
- Report binding, evaluation, and selected-step failures without silently trying a different branch or falling through to the default. E2.5 defines whether a configured loop policy may capture an iteration error.

## Product validation scenario

A pricing workflow subtracts 10 from an amount of at least 100 and otherwise returns the amount unchanged. An amount of 100 returns 90 through the discount path; an amount of 50 returns 50 through the standard path. The caller can identify the selected path and see that the other path did not execute. Invalid comparison data produces an error rather than selecting the default as a fallback.

This scenario defines the behavior to demonstrate. The implementation plan supplies step definitions, handler choices, input/output schemas, and executable checks for priority overlap, default selection, comparison boundaries, and failures.

## Specification and implementation ownership

The [accepted workflow specification](../../specifications/workflow-interface-v1.md) lists conditional operators but leaves some value semantics open. It also permits a branch without a destination to end the workflow. [E2-S1](../../decisions/m2/e2-s1-local-execution-semantics.md) proposes unique priorities and explicit destinations leading to result steps. Resolve these choices in the specification and implementation together; any restriction on accepted documents must follow the governing versioning rules.

Detailed operator tables, error codes, and test procedures belong in the specification and implementation plan. E2.6 consolidates shared examples and full-system verification; this Epic retains focused verification of conditional behavior.

## Non-goals

- Handler-selected routing, execution based on unvalidated outputs, or retrying another branch after a selected path fails.
- Joins between mutually exclusive paths, parallel paths, loops, persistence, retries, or human decisions.

## Acceptance criteria

- The pricing scenario produces the expected result on both paths and exposes the selection and unselected work to callers.
- Branch selection follows the documented priority and default rules regardless of array order. Comparison and combined-condition behavior is consistent for the same inputs.
- Invalid owner output prevents routing. Missing data and evaluation errors remain distinguishable from a valid false condition.
- Unselected work never executes or supplies outputs. A selected step supplies data only after successful execution and validation.
- Invalid routing and dependencies are rejected; execution failures do not trigger an undocumented fallback or successful result.
- Completion and priority behavior follow the supported document rules, with any breaking change handled explicitly rather than silently tightening the accepted specification.
