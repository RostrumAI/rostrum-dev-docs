# E2.5: Execute bounded loops

Status: Planned

Roadmap milestone: [M2: Local workflow execution](../../strategy/product-roadmap.md#3-delivery-milestones)

Depends on: [E2.4](e2-4-execute-parallel-paths-and-joins.md)

## Outcome

The daemon processes a bounded array one item at a time. A workflow can stop on an iteration error or capture eligible iteration failures as ordered results and continue. A captured iteration error does not by itself make the run fail.

## Scope and technical requirements

### Collection, body, and iteration identity

- Run the loop step's own handler before resolving its collection, as the current interface specifies. The collection may refer to that handler's validated outputs, an earlier step output, or a workflow input.
- Require the resolved collection to be an array. Check its length against `maxIterations` before any body handler starts. Keep the existing positive-integer bound and platform maximum, whose default is 1000. An empty array succeeds with `results: []`.
- Process indices `0` through `length - 1` in order. The loop variable, referenced as `loop.<variable>`, holds only the current item and is available only to body steps.
- Execute the full body for each item, including sequential work, conditionals outside open parallel sections, and properly nested parallel paths under E2.4. Each selected body path must reach one iteration terminal. A parallel body must join before that terminal, which may itself be the join. The terminal's outputs supply the iteration value; it does not finish the workflow.
- Record an iteration outcome only after its successful body output has passed validation, or its failed scope has drained and the error policy has resolved the failures. Record it in memory before starting the next iteration. This is not a database commit; run persistence starts in M3.
- Keep body outputs isolated between iterations. A body step instance is identified by run ID, step ID, and iteration index. The run's `currentSteps` list shows ready work waiting for capacity and handlers currently running, with that index. Follow E2.4's stable display order; do not expose completed iterations as active work.
- A loop inside an outer parallel path must finish all its iterations before that path can reach the outer join. Body handlers share the daemon-wide worker limit and fair scheduling rule. Waiting for a body or the next iteration must not reserve a worker slot.

### Error policy and ordered results

[E2-S1](../../decisions/m2/e2-s1-local-execution-semantics.md) proposes workflow-configured iteration error tolerance, but neither it nor the current workflow schema defines the wire format. This Epic must settle and implement the following contract, not leave it as an approval-only gate:

| Contract area | Required definition and behavior |
| --- | --- |
| Configuration | Define the field under `loop`, its exact serialized values for fail-fast and error-tolerant behavior, and its default when omitted. Define rejection of unknown values and invalid types. A policy on a loop applies only to its iterations, not its own setup handler or arbitrary steps elsewhere. |
| Fail-fast | Stop later iterations after an iteration failure. Drain active handlers in the failed scope and propagate uncaptured failures to the run; do not publish a successful loop output or invoke its successor. |
| Error-tolerant | Capture only eligible errors after the failed iteration drains, produce an error entry at that iteration index, and continue with the next item. No handler within the failed iteration resumes and no failed handler is retried. |
| Eligible errors | Enumerate each supported error class and stable code: structured handler failures, thrown handler exceptions, body input-binding failures, body output-validation failures, and condition-evaluation failures. State explicitly which the tolerant policy can capture. Define normalization of thrown errors into the shared structured failure shape. Do not infer eligibility from an error message. |
| Errors outside capture | Invocation rejection creates no run. A loop setup-handler error, unresolved or non-array collection, and exceeded collection bound occur before an iteration exists and cannot become iteration result entries. An ineligible body error or an error outside a capturing loop remains an unhandled run failure. Daemon/process failure is not an iteration result or recovery feature in M2. |
| Success/error result schema | Define exact fields and a discriminator that distinguishes a successful terminal output from an error entry. Include iteration identity and an ordered array of structured errors for a failed iteration, since parallel body handlers can fail together. Specify required fields, forbidden extra fields, and the schema of the successful value. One completed iteration contributes one entry, never one entry per parallel path or per failure. |
| Downstream binding | Keep `step.<loopStepId>.results` as the reserved ordered array. Specify how its success/error element schema relates to an optional `outputs.results` declaration and how downstream handlers consume the two variants. Bind it only after the loop completes; do not expose a partial array as a successful result after fail-fast. Body-local outputs and the loop variable must not be available outside their iteration. |
| Run-level failures | Captured errors belong to iteration results, not the run-level `failures` array. A run that reaches its explicit `result` step after permitted captures succeeds with `failures: []`. If a later unhandled error fails the run, report unhandled failures at run level without reclassifying earlier captures. The final workflow `output` is then `null`. |

The default, serialized policy names, eligible-code list, and exact result fields remain decisions for E2.5. They must appear in the specification, workflow types, executable schemas, validator, and runtime before delivery. The workflows below name policies by behavior and describe result entries semantically; they do not claim that unapproved JSON fields already exist. Omitted-policy validation must demonstrate the selected default.

When a body path fails, E2.4 stops new work in that iteration, settles active handlers, and suppresses joins that lack successful inputs. The loop evaluates the complete observed failure set. It may continue only if its policy can capture every failure in that set. If any failure is ineligible, the iteration fails and the run stops; do not silently discard other failures observed in that iteration. Other parallel work outside the failed iteration can continue while an eligible capture is being resolved, but an unhandled error stops new work across the run. Sort observed errors by step ID, iteration index, code, and document path. Worker capacity can change which body handlers start and which failures are observed; it must not scramble result positions or the ordering of the observed set.

### Future specification changes

Update the [workflow specification](../../specifications/workflow-interface-v1.md) and its executable contracts together for:

- Loops: sequential iteration order, preflight collection checks, error-policy configuration, exact result entry schema, and the distinction between a setup error and an iteration error.
- Graph topology and termination: one selected terminal outcome per iteration, structured parallel bodies, and isolation of body steps from outer paths. Preserve the ban on nested loops and unbounded loops.
- Data references and output compatibility: loop-variable lifetime, iteration-local output identity, the reserved `results` array, and downstream validation of success/error variants.
- Runtime and inspection: iteration-scoped drainage, captured versus run-level failures, and iteration identity in active work.

E2-S1 remains proposed. Resolve these changes against the specification's versioning rules before shipping them; neither this Epic nor a new result schema silently changes existing published documents.

## Validation workflows

These named examples are reusable workflow fixtures: definitions, inputs, and expected outcomes. Names below are readable step labels, not literal step IDs. E2.6 owns the shared catalog and multi-layer process harness. This Epic owns the focused behavior checks below, using controllable handler completion points rather than timing sleeps.

Reuse the deterministic handler registry from E2.2 and arithmetic operations from E2.3 and E2.4. Specify setup, iteration-terminal, division, and summary handlers through that registry, including exact input bindings and output schemas. The loop setup handler is an ordinary registered task; iteration terminals return the value described below, and only the workflow's final `result` publishes the caller's output.

### Double three items: collection order and bounds

Input: `{ "items": [10, 20, 30] }`; `maxIterations: 3`; loop variable `item`.

Graph: `loop -> result`, with body `double -> iterationEnd`. `double` reads `loop.item` and produces `item * 2`; `iterationEnd` supplies `{ "doubled": value }` as the successful iteration value. The final `result` binds the loop's ordered `results` array.

1. Hold the first body's handler. Inspect active work: every active body entry belongs to iteration `0`; iteration `1` has not started.
2. Release each body in turn. The successful values in positions `0`, `1`, and `2` are respectively `{ "doubled": 20 }`, `{ "doubled": 40 }`, and `{ "doubled": 60 }` in the selected result-entry schema.
3. Run with `items: []`: no body runs and the final result contains `results: []`.
4. Run with four items and bound three: no body runs, and the run fails with `run.loop.bound-exceeded`. Resolve a non-array collection from a setup handler in a separate variant so invocation input checking does not hide the loop's collection check; it fails before iteration `0` with the defined collection error.
5. Reject zero, fractional, and above-platform-maximum `maxIterations` values at publication. Reject nested loops and out-of-scope loop-variable or body-output references.

### Divide three items: fail-fast versus capture

Input: `{ "items": [2, 0, 5] }`; bound three. Body `divide -> iterationEnd` computes `100 / item`. For zero, the reference handler returns a structured division-by-zero failure rather than an invalid JSON number. Declare this structured handler failure eligible for the tolerant scenario.

- With fail-fast, iteration `0` records the successful value `{ "quotient": 50 }`. Iteration `1` fails. Iteration `2` and the workflow `result` never start; the run is failed with `output: null` and the observed iteration-1 failure in its top-level failure list.
- With error tolerance, ordered entries contain success `{ "quotient": 50 }`, the captured division-by-zero error at index `1`, and success `{ "quotient": 20 }`. A downstream summary handler consumes the selected result schema and returns `{ "sum": 70, "failedIterations": [1] }`; the final result returns that object with run status `succeeded` and `failures: []`.
- Run with the policy omitted and demonstrate the documented default. Reject unsupported policy values at publication.
- Vary the iteration-1 error across the finalized eligibility table: a thrown exception, missing body binding, malformed body output, and invalid condition operand. Each eligible case occupies index `1` and allows index `2`; each ineligible case fails the run without starting index `2`.
- Make the loop's own setup handler fail in the tolerant variant. No iteration starts and the run fails. Make the downstream summary handler fail after captures: the run fails with that unhandled summary error, not with the earlier captured division error.

### Parallel items: drain before the next iteration

Input: `{ "items": [10, 20] }`; bound two; worker limit two. Body graph: `split -> [double, addOne] -> sum`, where `sum` is the iteration terminal. Successful values are `{ "total": 31 }` at index `0` and `{ "total": 61 }` at index `1`.

1. Run at worker limits one and two, reversing legal completion orders at limit two. Each iteration joins correctly and the result values stay in collection order.
2. In iteration `0`, start both body handlers, make `double` fail with an eligible structured error, and hold `addOne` active. Observe that iteration `1` cannot start and `sum` never starts with a missing `double` output.
3. Let `addOne` succeed. Under error tolerance, record one error entry for index `0`, then run index `1` to obtain `{ "total": 61 }`. Under fail-fast, no iteration `1` or workflow result starts.
4. Repeat with both active handlers failing in reversed completion orders. Capture one index-0 error entry containing both errors in stable order if both are eligible. If either is ineligible, fail the run and retain both observed errors. At limit one, do not expect an error from a sibling handler that never started.
5. Place this loop on one side of an outer parallel split with another path producing `9`. Without injected failures, summarize loop totals as `92` and join with `9` for a final total of `101`. The outer join waits for loop completion; a one-worker run still completes without a parent consuming the worker while waiting.

## Non-goals

- Unbounded or nested loops, concurrent iterations, and changes to conditional or parallel topology beyond their use in a loop body.
- Retries, cancellation, generic step/parallel continue-on-error policies, or recovery after daemon failure.
- Persistence, human decisions, scripts, tools, models, or production deployment.
- A separate fixture catalog, multi-layer testing project, or process harness; E2.6 owns those.

## Acceptance criteria

- The specification, workflow types, executable schemas, validator, and runtime agree on policy field names/values/default, eligible error codes, result variants, and downstream binding. Unknown policy values and malformed result declarations are rejected rather than guessed.
- Double three items preserves iteration order and values, accepts an empty collection, and prevents body execution for non-array or over-bound collections.
- Iteration outputs do not leak into later iterations or outer paths. Active work includes the correct index, respects E2.4 ordering and worker limits, and never shows overlapping iterations.
- Divide three items demonstrates both policies, the omitted-policy default, each eligible/ineligible error class, setup failure, and later downstream failure with the specified public outcomes.
- Parallel items waits for drain before advancing, never runs a partial success join, preserves all observed errors, and returns ordered results independent of successful handler completion order.
- A permitted capture can lead to run success with an empty top-level failure list. An unhandled error stops new run work and yields a failed run with no final workflow output.
