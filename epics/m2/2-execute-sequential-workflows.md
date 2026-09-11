# Epic 2: Execute sequential workflows

Status: Planned

Roadmap milestone: [M2: Local workflow execution](../../strategy/product-roadmap.md#3-delivery-milestones)

Depends on: [Epic 1](1-establish-daemon-network-boundary.md), [Workflow format v1](../../specifications/workflow-interface-v1.md), its validator, and immutable workflow publications

## Outcome

A caller invokes a selected workflow publication through the Control API, disconnects, and later retrieves the run's progress, final output, or failures. The daemon executes each run independently of the caller and other runs.

Sequential execution describes the order of steps within one run. It does not limit a workflow to one active run: callers may invoke the same publication concurrently with different inputs, and each invocation has its own identity, state, outputs, and failures.

## Scope

### Starting an independent run

- Select one exact publication using `workflowId` and `publicationNumber`. Later edits or publications cannot change an accepted run.
- Check that the publication exists, its stored content passes the integrity check, the daemon supports its declared behavior, and invocation inputs satisfy the workflow's declared requirements. Unsupported steps, invalid configuration, or invalid inputs reject the request before a run is created.
- Retrieve the publication from the shared Postgres database through `packages/database`. The daemon owns execution and live run state; HTTP carries invocation commands and run observation between the services.
- Give each accepted invocation a stable run ID. Multiple runs may remain in progress together, including runs of the same publication. One run's inputs, failures, or client disconnect must not affect another run.

Callers select a publication, not a runtime version. This Epic uses publication terminology and treats the selected publication as immutable for the run.

### Understanding execution progress

A caller can distinguish these run states:

| State | Meaning |
| --- | --- |
| Queued | Rostrum accepted the invocation, but execution has not started. |
| Running | Rostrum is advancing the workflow or waiting for currently executing work to finish. |
| Succeeded | The workflow produced its final result. The result and terminal state cannot change. |
| Failed | An unhandled error ended execution. The caller can inspect the failures, and no successful final result is available. |

The engine also tracks a stopping phase after an unhandled failure: it starts no new work while already running handlers finish. The public run remains running during this phase, with the observed failures and unfinished work available for inspection. It becomes failed when that work finishes.

Step state explains what happened within the run. Pending steps have not become eligible; ready steps can execute but are waiting for capacity; running steps have started; succeeded steps have validated outputs; failed steps have an execution error. Run inspection must expose these distinctions for active and completed steps while the run remains available in memory. Epic 3 adds the distinction between unselected steps and failed work.

The active-work list, `currentSteps`, shows ready and running steps rather than the last completed step or the whole graph. Completed runs have no active work. Its display order is consistent, but it does not imply that separate runs execute in one fixed order. Durable history across daemon restarts belongs to M3.

### Passing data and producing a result

- Execute reached steps once, in the workflow's declared sequence. A dependent step cannot start until its required predecessors succeed.
- Let authors supply step inputs from literals, workflow inputs, and earlier successful step outputs. Missing required values or invalid data prevent the affected step from running. An optional input may be omitted, but an explicit reference must resolve.
- Make step outputs available to later work only after the entire output has passed validation. Failed, incomplete, or not-yet-executed work cannot supply data.
- Define the supported deterministic task capabilities and their input, output, and failure requirements. A handler performs one step's work; the daemon controls sequencing and workflow completion. Selecting the initial operation set and specifying handler interfaces belongs in the implementation plan.
- Complete a sequential workflow through an explicit result step. Its resolved input values form the caller's final output. Reaching that step without resolving its data is a failure, not success.
- Report failures with an identifiable step, cause, and location. Invalid handler outputs must not become downstream input or a successful final result. Terminal outcomes remain immutable.

## Specification and implementation ownership

[Workflow format v1](../../specifications/workflow-interface-v1.md) defines the accepted workflow document. This Epic establishes the sequential behavior above and keeps the specification, validation, daemon, and APIs consistent. Changes that affect accepted documents must follow the governing versioning rules.

Implementation plans select the deterministic operations, define data and error shapes, and provide executable workflows and verification procedures. Those details are not an operation catalog in this Epic. Epic 3 owns conditional completion; Epic 4 adds parallel scheduling and failure handling; Epic 6 consolidates reusable testing infrastructure without becoming a prerequisite for this Epic's focused checks.

## Non-goals

- Conditional routing, parallel paths within a run, joins, or loops. Concurrent independent runs remain in scope.
- Run persistence, restart recovery, invocation idempotency, retries, waits, cancellation, or side-effecting handlers.
- A general task library, scripts, model calls, or a new top-level workflow output schema.

## Acceptance criteria

- A valid invocation returns a stable run ID tied to the selected publication. Invalid requests create no run and start no step.
- An accepted sequential run completes after its initiating client disconnects, and another client can retrieve its final output or failures.
- Overlapping invocations of the same publication remain independently identifiable and produce results from their own inputs. A failure in one does not fail another.
- Run inspection distinguishes queued, active, succeeded, and failed execution, explains waiting or stopping work, and retains completed step outcomes for the lifetime of the in-memory run.
- Steps follow the declared sequence and consume only available, validated data. Missing inputs and handler failures prevent dependent work from running.
- The final output is exactly the result step's resolved input object, including an empty object when no result inputs are declared. A failed run has no successful final output, and a terminal run cannot later change its outcome.
