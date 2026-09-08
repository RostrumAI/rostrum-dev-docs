# E2.3: Execute conditional workflows

Status: Planned

Roadmap milestone: [M2: Local workflow execution](../../strategy/product-roadmap.md#3-delivery-milestones)

Depends on: [E2.2](e2-2-execute-sequential-workflows.md)

## Outcome

The daemon evaluates declared conditions against validated step outputs, executes only the selected path, and lets callers distinguish unselected work from failed work.

## Scope and inherited rules

This Epic specifies operator types, boolean groups, branch priorities, branch destinations, conditional completion, and unselected-step state. It implements those rules in workflow validation and daemon execution, using E2.2's invocation, binding, handler, result, and public failure contracts.

[Workflow interface v1](../../specifications/workflow-interface-v1.md) already lists the operators, requires a default, selects the lowest-numbered matching priority, and permits a branch without `next` to end the workflow. It does not fully define operator value semantics. [E2-S1](../../decisions/m2/e2-s1-local-execution-semantics.md) proposes unique priorities and an explicit `next` on every branch, with an eventual `result` step on every path. E2-S1 remains proposed. The operator policy below is a concrete candidate for the missing semantics, not a claim that these choices are already approved or implemented.

### Operator value rules to specify

Define every allowed and disallowed operand combination in the execution contract. A predicate's `ref` resolves a step output; its `value`, when required, is a literal JSON value. Missing data is a binding error, not JSON `null` and not a false condition. Runtime errors are distinct from conditions that successfully evaluate to `false`.

Use the following candidate rules as the decision baseline. If a different policy is approved, replace the rules and examples together before implementing them.

| Operator | Candidate accepted operands and result | Invalid operands |
| --- | --- | --- |
| `eq`, `neq` | Any two JSON values. Equality requires the same JSON type and equal value. Objects compare recursively by keys and values, ignoring key order; arrays compare recursively in order. `neq` negates equality | Missing or non-JSON values |
| `gt`, `gte`, `lt`, `lte` | Two JSON numbers, compared numerically | Strings, booleans, `null`, objects, and arrays, even when they resemble numbers |
| `in`, `notin` | The `value` is an array; compare the referenced JSON value to each member using the `eq` rule. `notin` negates membership | A non-array `value`, or a missing referenced value |
| `contains` | A referenced array and any JSON `value`, using the `eq` rule; or a referenced string and string `value`, using case-sensitive exact substring matching | Objects, numbers, booleans, or `null` as containers; non-string search values for strings |
| `truthy`, `falsy` | A boolean referenced value only. `truthy` returns that boolean; `falsy` returns its negation. The `value` field is absent | Numbers, strings, `null`, objects, and arrays; a supplied `value` field |

The boolean-only `truthy`/`falsy` candidate deliberately avoids JavaScript truthiness. It must be an explicit decision: accepting numbers or containers instead would require a documented truth table for zero, empty strings, empty arrays, empty objects, and `null`. Do not inherit host-language behavior accidentally.

Examples under the candidate policy:

- Number `100` compared with string `"100"` using `eq` is `false`; using `gte` is a type error. Neither operator converts the string to a number.
- `null eq null` is `true`, and `null eq 0` is `false`. A missing output fails reference resolution before either operator evaluates.
- Objects `{ "a": 1, "b": 2 }` and `{ "b": 2, "a": 1 }` are equal; `[1, 2]` and `[2, 1]` are not. Object identity in memory has no role.
- A reference to `false` passes `falsy`; references to `0`, `""`, `[]`, `{}`, or `null` fail boolean operand validation rather than selecting a branch.
- Membership in `[]` is `false`; `notin []` is `true`. A string contains the empty string; an empty array contains no value.

Specify nested `all` and `any` groups with left-to-right, short-circuit evaluation: stop `all` on the first false child and `any` on the first true child. An error in an evaluated child fails evaluation; a skipped child is not evaluated. Publication must still check the structure and references of every child, including children that might be skipped. Reject empty groups, a leaf with missing required `value`, `truthy`/`falsy` with `value`, and unknown operators. Any new blocking shape restriction needs the compatibility treatment described below.

### Output availability, routing, and state

1. Execute the step that owns the conditional using E2.2's handler contract. Validate and record its entire output object before evaluating its conditions. A handler failure or invalid output prevents all routing.
2. Resolve each evaluated predicate from successful recorded outputs. The conditional's `dependencies` must include every step referenced by its predicates. The owner may reference its own just-recorded outputs; other producers must already have completed on the active path.
3. Evaluate branches in ascending numeric priority, stopping at the first true branch. Array position and branch label do not determine priority. If every evaluated branch is false, select the mandatory default. An evaluation error reports a failure, not a default selection. In this Epic it ends the run; E2.5 defines which iteration errors a configured loop policy may capture.
4. Under the proposed unique-priority rule, reject duplicate priorities at publication. Do not invent array-order tie-breaking for a contract that has not chosen it.
5. Activate only the selected destination. Selection is permission to execute, not a produced value: outputs from a selected step become available only after that step actually executes, succeeds, and passes output validation.
6. Record the selected branch label and destination, or end-workflow selection when allowed by the format. Expose enough run inspection data for a caller to identify the choice and the states of the affected steps. `currentSteps` alone is insufficient because it contains only ready and running work.
7. Mark steps that can only be reached through excluded branches as `notSelected`. They never enter the worker queue or produce outputs. A destination reachable through the selected branch must not be marked unselected merely because another rule points to it. Work blocked by an execution failure is not `notSelected`.

A conditional does not authorize a join between mutually exclusive paths. Accepted v1 requires every declared dependency to be reachable on every path to the dependent step. Keep separate result steps for the discount and standard paths in the example below. A shared result depending on both path tasks is invalid because both tasks cannot run in the same invocation. References to unselected outputs must not resolve to fabricated `null` or empty values.

### Completion and specification changes owned here

Keep the accepted rule for v1 until a separately approved versioned change replaces it: a selected branch or default with omitted `next` completes with the conditional owner's validated output object. A branch that names a destination executes that destination and completes according to its path. A `result` returns its resolved `inputs` object, as E2.2 specifies; there is no separate top-level output schema.

This Epic must resolve the following changes in the specification, schemas, validator, and runtime together:

- Expand "Condition expressions" with the full operand matrix, JSON equality, `null` versus missing values, numeric-string behavior, and group evaluation and error rules.
- Expand "Conditionals" with validated-output timing, selection records, default behavior, unselected-path state, and whether priority values must be unique.
- If E2-S1's explicit-destination proposal is approved, change `branches[].next` and `default.next` from optional to required. Update "Step fields," "Graph topology," "Conditionals," path validation, and affected examples to require explicit result completion. This invalidates some accepted v1 workflows and must use the specification's breaking-change/version process; do not silently tighten v1.
- Apply the same compatibility review to unique priorities and any new blocking operand or group rules. Preserve v1's advisory-only producer/consumer type compatibility. Runtime operand errors must not become an undocumented static type checker.
- Update E2-S1 to identify the chosen rules, including any departure from its proposal. E2.2 owns the shared result payload contract; this Epic owns how conditional paths reach completion.

## Validation workflows

This Epic supplies the following concrete workflows and failure cases and verifies conditional behavior through the Control API, using focused handler controls where needed. E2.6 later consolidates reusable infrastructure, the example catalog, layer coverage, and the real-process harness; it is not a prerequisite for these checks. These are implementation acceptance scenarios, not claims of current runtime support.

### Discount or standard price

Use server-assigned IDs. The names below are readable aliases for those IDs, not literal identifier values. Declare workflow input `amount` with schema `{ "type": "number", "minimum": 0 }`.

Select and specify two additional candidate deterministic task operations for this workflow. `identity-number` accepts required number `amount` and returns exactly `{ "amount": <same number> }`. `subtract` accepts required numbers `amount` and `deduction` and returns exactly `{ "total": <amount minus deduction> }`. Their configuration is only `{ "operation": "<candidate name>" }`, they accept no optional or extra inputs, and their output declarations are numbers. They perform no I/O or implicit conversion. A non-finite arithmetic result fails output validation rather than becoming JSON `null`. These names are not an existing operation catalog; E2.2's registry and return/failure contract apply.

| Step | Inputs, outputs, and control flow |
| --- | --- |
| `readAmount` | `firstNode`; task operation `identity-number`; binds `amount` to `inputs.amount`; declares number output `amount`; owns conditional `priceRoute` |
| `discount` | Task operation `subtract`; depends on `readAmount`; binds `amount` to `step.<readAmountId>.amount` and literal `deduction: 10`; declares number output `total`; successor `discountResult` |
| `standard` | Task operation `subtract`; depends on `readAmount`; binds `amount` to `step.<readAmountId>.amount` and literal `deduction: 0`; declares number output `total`; successor `standardResult` |
| `discountResult` | Terminal `result`; depends only on `discount`; inputs are literal `path: "discount"` and `total` bound to `step.<discountId>.total` |
| `standardResult` | Terminal `result`; depends only on `standard`; inputs are literal `path: "standard"` and `total` bound to `step.<standardId>.total` |

`priceRoute.dependencies` contains only `readAmount`. Its branch rules are:

| Rule label | Priority | Condition | Destination |
| --- | --- | --- | --- |
| `discount` | 10 | `{ "ref": "step.<readAmountId>.amount", "op": "gte", "value": 100 }` | `discount` |
| `standard-band` | 20 | `{ "ref": "step.<readAmountId>.amount", "op": "gte", "value": 50 }` | `standard` |
| `standard-default` | Default | No predicate | `standard` |

1. Publish and invoke an exact publication for each input in the table below. Retrieve terminal state and the branch/step inspection record.
2. Expect `readAmount`, exactly one price task, and its matching result to execute once. The other price task and result must be `notSelected` and must never execute.
3. Check the exact output and selected label. At `100`, both numbered predicates would be true, but priority 10 wins. Below `50`, neither matches and the default is selected.
4. Reverse the branch array order without changing priorities. Expect the same selected label and final output for every input.

| Invocation input | Selected label | Exact successful `output` |
| --- | --- | --- |
| `{ "amount": 0 }` | `standard-default` | `{ "path": "standard", "total": 0 }` |
| `{ "amount": 49 }` | `standard-default` | `{ "path": "standard", "total": 49 }` |
| `{ "amount": 50 }` | `standard-band` | `{ "path": "standard", "total": 50 }` |
| `{ "amount": 99 }` | `standard-band` | `{ "path": "standard", "total": 99 }` |
| `{ "amount": 100 }` | `discount` | `{ "path": "discount", "total": 90 }` |
| `{ "amount": 101 }` | `discount` | `{ "path": "discount", "total": 91 }` |

Hold the selected price task at a controlled handler release point before it returns. The task may be `running`, but its `total` and the run's final output must remain unavailable. Use a controlled failing handler on the unselected price path to prove that it is never called; the selected run still succeeds. Do not add a dependency on that unselected task to observe it.

### Invalid values and routing failures

| Change or input | Expected outcome |
| --- | --- |
| Invoke with `amount: "100"`, `null`, an object, an array, or a negative number; omit `amount` | Invocation rejection under E2.2's schema/input contract; no run is created |
| Change the priority-10 comparison literal from number `100` to string `"100"` while retaining `gte` | Under the candidate policy, runtime operand-type failure when evaluated; default and both path handlers do not run. Any static finding remains advisory where v1 requires it |
| Change that comparison to `eq` with string `"100"` and invoke with number `100` | The comparison is false without conversion; `standard-band` selects the standard path and returns `{ "path": "standard", "total": 100 }` |
| Return a string `amount` from `readAmount`, whose output schema declares a number | `run.output.type` before condition evaluation; no path is selected or executed |
| Remove a conditional dependency, name an unknown destination, use an unknown operator, or omit the mandatory default | Blocking validation finding with a stable code and exact document path; no publication |
| Duplicate a priority | Rejection under the proposed rule only after its compatibility/version decision is implemented; otherwise exercise the supported format's documented behavior |
| Add a shared result depending on both `discount` and `standard`, or bind a selected path to the other path's output | Blocking dependency/reference finding under accepted v1; no publication |
| Cause an evaluated reference to be unavailable in a controlled runtime case | `run.binding.unresolved-reference`; no default fallback, no selected-path handler, and no final output |
| Make the selected price handler return a failure | Failed run with that step's structured error; do not execute the other path as a fallback |

Specify stable condition-evaluation error codes, phases, and paths for unsupported runtime operand types and other evaluated-condition failures. Preserve E2.2's binding and output error codes rather than renaming the same errors in this Epic. A failed run retains its observed errors, has `output: null`, and cannot later become successful. Invalid graphs that publication rejects use runtime fault controls for defensive checks; they are not published by bypassing normal validation.

### Operator and completion cases

Use small variants of the routing workflow to exercise every row of the operator matrix, the concrete `null`, object, array, and numeric-string examples, and nested `all`/`any` groups. Include an error in an evaluated child and an error-producing operand combination in a skipped child to distinguish failure from short-circuiting. Outputs and schemas for each variant must allow its test value so output validation does not hide the operator behavior being checked.

For accepted v1 completion, remove `next` from the default of the original numeric workflow and invoke with `amount: 49`. Expect success with exactly `{ "amount": 49 }`, the recorded output of `readAmount`, and no price task execution. If a new format adopts E2-S1's explicit-destination rule, the corresponding missing-`next` document must instead fail validation under that format. Keep those version-specific expectations separate. In both formats, the original workflow's explicit result paths retain the exact payloads above.

## Non-goals

- Handler-selected branch names or routing based on unvalidated or unexecuted outputs.
- Joins between mutually exclusive paths, parallel execution, loops, or human decisions.
- Persistence, retries, or treating a failed selected path as a request to try another branch.
- A general pricing library or reusable multi-layer test infrastructure; the operations above only make the routing example executable, and E2.6 owns the infrastructure.

## Acceptance criteria

- The execution contract lists every supported operator's operand types and result rules, including boolean truth tests, `null`, missing values, object and array equality, and numeric strings. The runtime follows those rules without host-language conversion.
- The discount workflow produces every exact result above, including both boundaries, overlapping matches, the default, and reversed branch-array order.
- The owner output is validated and recorded before routing. A selected destination produces no available output until it executes successfully. Invalid owner output activates no branch.
- Run inspection identifies the selected rule and distinguishes `notSelected` work from failed work. An unselected handler never runs, and its outputs never become available.
- Publication rejects malformed routing and dependencies on mutually exclusive paths with stable findings. Runtime binding, operator, and selected-handler failures expose stable codes and locations, stop the run when no policy captures them, and do not fall through to default or a different branch.
- Conditional completion and duplicate-priority behavior follow an explicit supported-format contract. Any adoption of the E2-S1 restrictions updates the specification and affected validation examples through the required version process rather than silently changing accepted v1.
