# E2.2: Execute sequential workflows

Status: Planned

Roadmap milestone: [M2: Local workflow execution](../../strategy/product-roadmap.md#3-delivery-milestones)

Depends on: [E2.1](e2-1-establish-daemon-network-boundary.md), [Workflow interface v1](../../specifications/workflow-interface-v1.md), its validator, and immutable published workflow definitions

## Outcome

A caller starts a sequential workflow through the Control API, disconnects, and later retrieves its state, final output, or failures after the daemon executes it.

## Scope and inherited rules

This Epic defines and implements invocation checks, run and step state, input binding, the handler registry, deterministic reference handlers, sequential scheduling, result completion, and public failure reporting. Run creation and retrieval use the Control API and the daemon HTTP boundary established by E2.1. The daemon owns execution and keeps run state in memory until M3; a caller disconnect is not a daemon restart.

The Control API and daemon independently connect to the same Postgres database through `packages/database`. The daemon retrieves the requested immutable publication from that shared store and verifies it before execution; it does not require an API-owned database copy or workflow file transfer. HTTP carries invocation commands and live run state between the services. Shared publication storage does not make the in-memory run state persistent.

[Workflow interface v1](../../specifications/workflow-interface-v1.md) is the accepted document contract. [E2-S1](../../decisions/m2/e2-s1-local-execution-semantics.md) is a proposal, not an approved or implemented runtime contract. The requirements below identify the behavior to deliver and the proposal conflicts to resolve. [PLAN_1](../../plans/PLAN_1.MD) records a future naming cutover to `workflowFormatVersion`, `publicationNumber`, and `/api` paths. Those names and paths must not be described as already deployed. Invocation must identify one exact publication under whichever contract is implemented, never "latest."

### Invocation checks

Before allocating a run ID or scheduling any step, the daemon must check:

1. The requested workflow ID and publication number identify an existing immutable publication, not a draft or revision alone. Bind the run to that publication so later edits or publications cannot change it.
2. The daemon supports the publication's exact workflow format and its validation and execution rules. Unknown formats must not fall back to another rule set.
3. The stored published content matches its recorded digest, using the accepted digest algorithm. A mismatch rejects invocation; it must not execute unchecked content.
4. Invocation input names match the declared workflow input names. Under the E2-S1 proposal every declared workflow input is required. Reject a missing name, an undeclared name, or a value that fails its JSON Schema. JSON `null` is a supplied value and is valid only when the schema allows it.
5. Every step type and task operation used by the publication has a compatible registered handler. Check configuration, required step input bindings, and declared output names and schemas against that handler contract. Do not defer an unknown operation until its step starts.
6. The graph is valid for the supported execution contract. This Epic demonstrates a straight sequence; the later Epics add executable support for conditionals, parallel paths, and loops. A construct not yet supported must be rejected explicitly, not silently treated as sequential.

The API contract must define HTTP status, stable error code, and document or request path for each rejection. E2-S1 proposes HTTP 404 with `run.invocation.workflow-not-found`; HTTP 400 with `run.input.missing`, `run.input.unknown`, `run.input.type`, or `run.step.unsupported`; and HTTP 201 for acceptance. This Epic must also specify the format, digest, invalid-configuration, and unsupported-construct rejection codes and statuses. Rejection creates no retrievable run and invokes no handler.

### Run state and active work

Specify the response fields for both creation and retrieval: stable `runId`, exact workflow/publication identity, `status`, `currentSteps`, `output`, and `failures`. `currentSteps` means work ready to start or currently executing, not the last completed step or the whole graph.

| Public status | Meaning | Observable fields |
| --- | --- | --- |
| `queued` | Invocation was accepted; the scheduler has not started this run | `currentSteps: []`, `output: null`, `failures: []` |
| `running` | The scheduler is advancing the sequence | Ready or running work appears in `currentSteps`; `output` remains `null` |
| `succeeded` | The terminal result's input bindings resolved and its final payload was recorded | `currentSteps: []`, final `output` object, `failures: []` |
| `failed` | An unhandled execution error stopped the run and active work has finished | `currentSteps: []`, `output: null`, ordered `failures` |

E2-S1 also proposes an internal `stopping` state: dispatch has stopped while already running handlers finish. Define its public projection as `running` until the run becomes `failed`, with only still-running work in `currentSteps` and the failures observed so far. Record this proposed projection in the execution/API contract before implementation. E2.4 supplies the concurrent drain behavior.

Each `currentSteps` entry contains `stepId` and `state`, either `ready` (eligible but waiting for a worker) or `running` (execution started). Sequential instances omit an iteration index; E2.5 defines it for loop instances. Order entries by step ID and then iteration index when present, with an absent index before numbered iterations. A fast step need not appear in a caller's polling response, but every returned snapshot must be consistent.

Internal step states have separate meanings: `pending` has not yet become eligible, `ready` has been reached and all dependencies succeeded, `running` is executing, `succeeded` has validated and recorded outputs, and `failed` has an execution error. A step becomes ready only after its control-flow predecessor selects it and all declared dependencies succeed. A failed dependency never satisfies readiness. E2.3 adds `notSelected` for conditional work that was bypassed; work prevented by a failure must not receive that label.

### Bindings and handler registry

A binding supplies a literal JSON value or an accepted reference such as `{ "ref": "inputs.name" }` or `{ "ref": "step.<stepId>.greeting" }`. Resolve bindings before calling the handler. Workflow inputs are available after invocation validation. Step outputs are available only after that step succeeds and the daemon validates and records all its output fields together. Partial, failed, and not-yet-executed outputs are unavailable. Recording outputs here is an in-memory state change, not a database write.

The registry selects the step implementation by workflow format and `type`; the `task` entry also selects its operation using `config.operation`. Extend the accepted registry contract to state each operation's configuration schema, required and optional input names and value schemas, exact output names and value schemas, and execution function. The workflow package uses the same contract for validation that the daemon uses for execution. A handler receives only its resolved inputs and validated configuration, not mutable run state or authority to select successors.

A missing required step input binding is invalid. Omit an unbound optional input from the handler's input object; do not add `undefined` to JSON. If the workflow explicitly binds an optional input, that binding must resolve and pass validation. A supplied `null` does not mean "omitted." A missing or unavailable reference fails with `run.binding.unresolved-reference`; the handler must not run. Define stable codes and paths for resolved input values that fail the handler's schema.

Handlers return one of two tagged JSON objects proposed by E2-S1:

- Success: `{ "type": "success", "outputs": { ... } }`. A handler with no declared outputs returns `outputs: {}`.
- Failure: `{ "type": "failure", "error": { ... } }`. Specify the handler error's stable code, message, and optional JSON details; the engine adds execution identity, phase, and document path to the public failure record.

Validate a success before exposing any output: every declared field is present, no extra field exists, each value satisfies its declared schema, and the values are serializable JSON. Reject missing, extra, and wrong-type outputs using `run.output.missing`, `run.output.unknown`, and `run.output.type`. Define stable errors for an invalid return shape, a non-JSON value, and a thrown exception. An invalid return must not be mistaken for successful empty output. A handler error fails the sequential run; this Epic adds neither retries nor generic continue-on-error behavior.

### Reference operations to select and specify

The accepted specification names demonstrative `task` and `result` types but has not selected the task operation catalog. Select and specify the following minimal deterministic operations, or explicitly approve replacement names with the same behavior, during this Epic. These are candidate operation names, not claims of existing implementations.

| Candidate operation | Inputs and configuration | Exact success output |
| --- | --- | --- |
| `greet` | `config: { "operation": "greet" }`; required string `name`; optional string `salutation`, defaulting to `"Hello"` only when omitted | `{ "greeting": "<salutation>, <name>" }`; concatenate exactly, without trimming or extra punctuation |
| `uppercase-ascii` | `config: { "operation": "uppercase-ascii" }`; required string `text`; no optional inputs | `{ "upper": "<text with a-z changed to A-Z>" }`; leave all other characters unchanged |

Both accept empty strings, perform no I/O, and depend on neither locale, clock, randomness, nor environment. Their output fields have string schemas. Extra inputs and configuration fields are invalid. Valid inputs have no operation-specific failure; binding, input validation, malformed returns, and thrown exceptions use the engine's failure rules. Fault verification uses controlled handler substitutes, not a shipped task operation that exists only to fail.

### Sequential completion and final payload

Execution follows `firstNode` and the sequence's single successors, never the order of objects in `steps`. Each reached step runs once. A terminal `result` is engine-controlled: resolve its `inputs` using the ordinary binding rules, then publish that entire resolved object as the run's `output`. Input names are final payload keys, so `{ "message": { "ref": "step.<id>.upper" } }` produces `{ "message": "HELLO, ADA" }`. Literal result inputs are valid; omitted result inputs produce `{}`. An unresolved result reference fails the run and leaves public `output: null`.

This result rule already exists in accepted v1. There is no top-level workflow output schema, and a `result` step does not need task-style output declarations. Do not add such a schema by interpreting E2-S1's phrase "public output schema" as an existing field. A plain task ending a sequential workflow is invalid. Success makes the public output and terminal state immutable; a later error or response cannot overwrite them.

### Specification and decision changes owned here

- Add the invocation input requirement, run/step state meanings, active-work projection, binding availability, handler return and error shapes, and output validation rules. Record exact codes and HTTP responses in the execution/API contract.
- Extend "Step-type extension" and "Built-in step types" with the selected operation catalog and its schemas, without implying that illustrative operation names were already supported.
- Retain "Data references" and the `result` input-to-payload rule. Correct E2-S1's unsupported top-level output-schema implication.
- Resolve E2-S1's proposed blocking static type compatibility against v1's advisory-only compatibility rule. Keep advisory publication checks for accepted v1 and enforce actual values at runtime; a future blocking rule needs the version treatment required by "Breaking and additive changes."
- E2-S1 proposes explicit result steps on every path, while accepted v1 permits a conditional branch without `next` to finish with the owning step's outputs. Sequential completion does not resolve that conflict. E2.3 owns the conditional completion decision and any versioned change to "Step fields," "Graph topology," "Conditionals," and path validation.

## Validation workflows

These are focused behavior checks to deliver with implementation, not evidence that execution exists today. This Epic supplies the workflows and expected outcomes below and verifies the sequential path through the Control API. Use small, local handler controls where a check needs a known intermediate state or injected error. E2.6 later consolidates reusable controls, the shared example catalog, layer coverage, and the automated real-process harness; completing this Epic does not depend on that infrastructure.

### Greeting workflow

Use server-assigned step IDs, called `greet`, `uppercase`, and `finish` below for readability. `firstNode` is `greet`; the workflow declares one string input, `name`.

1. `greet` uses candidate operation `greet`, binds `name` to `inputs.name`, declares string output `greeting`, and has successor `uppercase`.
2. `uppercase` depends on `greet`, uses candidate operation `uppercase-ascii`, binds `text` to `step.<greetId>.greeting`, declares string output `upper`, and has successor `finish`.
3. `finish` is a terminal `result`, depends on `uppercase`, and binds `message` to `step.<uppercaseId>.upper`.
4. Publish the workflow and invoke that exact publication with `{ "name": "Ada" }`. Expect HTTP 201 and a stable run ID with the queued representation. Disconnect the invoking client after acceptance.
5. Retrieve the run with another request until terminal. Use controlled handler release points when checking intermediate state rather than assuming polling catches a fast step. Expect `greet` then `uppercase` then `finish`, each once, followed by `succeeded`, `output: { "message": "HELLO, ADA" }`, empty `currentSteps`, and empty `failures`.
6. Repeat with a literal `salutation: "Welcome"` binding and expect `{ "message": "WELCOME, ADA" }`. This checks the difference between omitted optional input and supplied input.

### Rejection and failure cases

| Input or workflow change | Expected outcome |
| --- | --- |
| Unknown workflow/publication; draft-only identity; unsupported format; mismatched digest; unavailable step type or operation | Reject before run creation with the documented status, code, and path; no handler starts |
| Invoke the greeting workflow with `{}`, `{ "name": 42 }`, `{ "name": null }`, or `{ "name": "Ada", "extra": true }` | Reject with missing, type, type, and unknown-input errors respectively; no run ID |
| Missing required handler binding, invalid config, unknown reference, or terminal ordinary task | Blocking workflow finding where statically detectable; no publishable executable workflow |
| Bind an optional input to an unavailable reference in a controlled runtime case | `run.binding.unresolved-reference`; the handler does not run; failed run has no final output |
| Substitute greeting returns with a missing `greeting`, an extra output, or a numeric `greeting` | Corresponding `run.output.*` failure; neither `uppercase` nor `finish` starts; no invalid output becomes available |
| Substitute an explicit handler failure, thrown exception, invalid return tag, or non-JSON output | Failed run with the specified structured error and location; no successor starts and no final output appears |
| Make a result binding unresolved in a controlled runtime case | Failed run, `output: null`; reaching a result alone is not success |
| Publish a single `result` with literal inputs, then a single `result` with omitted inputs | Successful outputs equal the literal input object and `{}` respectively |

Some runtime binding faults cannot pass publication validation. Exercise those faults directly at the runtime boundary with controlled handler behavior rather than weakening the validator to publish invalid graphs. Public failures contain code, message, phase, step ID, document path, and JSON details where applicable. Sort failures actually observed by step ID, iteration if present, code, and path. Message wording is explanatory, not a stable identifier.

## Non-goals

- Conditional routing, parallel paths, joins, and loops; their Epics extend this execution path.
- Run persistence, restart recovery, invocation idempotency, retries, waits, cancellation, and side-effecting handlers.
- A general task catalog, scripts, model calls, or a new top-level workflow output schema.
- Reusable test infrastructure or a separate multi-layer conformance project; E2.6 owns those.

## Acceptance criteria

- Each invocation rejection has a documented HTTP status, stable code, and location. Invalid requests create no run and execute no handler; valid requests return the documented queued run identity.
- The greeting workflow completes after the caller disconnects and returns exactly `{ "message": "HELLO, ADA" }` for input `Ada`.
- Retrieval distinguishes queued, active, successful, and failed execution using the defined fields. Terminal snapshots have no active work and cannot change.
- Required, optional, literal, and referenced inputs follow the binding rules. Only validated successful outputs become available to later steps.
- The selected deterministic handlers have complete configuration, input, output, and failure contracts. Each malformed-return case above fails without running downstream work.
- Result input bindings produce the entire final payload, including literal and empty results. No implicit output schema or arbitrary last-task output replaces that rule.
- The specification, E2-S1 proposal, schemas, validator, runtime, and API describe the implemented sequential rules consistently, with any breaking document change assigned explicit version treatment rather than silently rewriting accepted v1.
