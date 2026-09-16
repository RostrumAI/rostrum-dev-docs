# Implement sequential workflow execution

- **Epic:** [M2 Epic 2: Execute sequential workflows](../epics/m2/2-execute-sequential-workflows.md)
- **Status:** Planned; execution is not implemented.
- **Repository baseline:** [2176f0b](https://github.com/RostrumAI/rostrum/commit/2176f0b), checked 2026-09-16.

## Purpose

Make a published workflow runnable. A caller starts it through the Control API, receives a run ID, and can disconnect. The daemon continues the work; the caller can return later to inspect progress, results, or failures.

## Current repository state

We already have workflow publishing and communication between the services. This Epic adds execution on top of those foundations:

- **Authoring and storage:** the Control API creates, validates, and publishes workflows. Postgres stores immutable publications; `WorkflowRepository.getPublication` retrieves one and verifies its integrity.
- **Workflow definitions:** `@rostrum/workflow` provides document validation, graph rules, reference syntax, and digest calculation. It does not execute steps.
- **Daemon connection:** the daemon already runs separately and exposes authenticated health/readiness endpoints. The Control API already has an authenticated daemon client.
- **Server framework:** `@rostrum/server` supplies request validation, OpenAPI, startup, cancellation signals, and bounded HTTP shutdown. Configuration changes require restart; SIGHUP does not reload anything.
- **Application layout:** HTTP controllers live in `src/controllers/`, business logic in `src/services/`, and route registration in `src/http/routes.ts`. Extend these rather than introduce another framework.

## Scope

**Included:**

- Invoke an exact publication with validated inputs.
- Execute a sequence of deterministic tasks ending in an explicit `result` step.
- Pass literal values, workflow inputs, and successful step outputs into later steps.
- Run multiple invocations independently, including the same publication with different inputs.
- Inspect run/step states, completed outputs, and failures while the daemon remains running.
- Let accepted runs finish after client disconnect and during graceful daemon shutdown.

**Not included:**

- Conditional routing, parallel paths within a run, joins, loops, or worker-capacity scheduling.
- Persistent run storage, restart recovery, retries, idempotent invocation, cancellation, or human waits.
- Scripts, model calls, side-effecting operations, or a general plugin system.

## Decisions

These implementation choices are proposed; the owner and API/specification reviewers must agree them before implementation:

- Use `POST /api/runs` with `workflowId`, `publicationNumber`, and `inputs`. Return 202 with the run ID after acceptance. Use `GET /api/runs/:runId` for inspection.
- Start with `greet`, `add`, and `divide`. They demonstrate simple work, optional handler inputs, data flow, and a natural failure: division by zero.
- Require every declared workflow input and successful step output. Reject undeclared invocation inputs. An operation may define optional inputs; `add.right` defaults to zero only when omitted.
- Bound request and response size: 1 MiB invocation bodies, 8 MiB snapshots of run/step outcomes, and 64 KiB readiness/error responses. Runtime values and schema fragments may nest at most 128 levels.
- Retain runs until daemon exit, without automatic eviction. This means retained memory grows with accepted runs; durability and retention policies belong to later work.

Preserve [workflow v1 compatibility](../specifications/workflow-interface-v1.md#breaking-and-additive-changes), the [controller/service boundary](../decisions/controller-service-vocabulary.md), and the [restart-only lifecycle](../research/restart-only-server-framework.md#decision).

## Progress

- [ ] Agree execution and API contracts.
- [ ] Build and demonstrate the runtime directly.
- [ ] Connect invocation and inspection through both services.
- [ ] Verify independence, shutdown, and operator setup.

## Checkpoints

The implementing engineer owns these steps. Review shared contracts with the API/specification owners and execution/shutdown behavior with an independent concurrency reviewer.

### 1. Agree the contracts and prepare publications

- Define invocation, run, step, and failure data, including what callers can inspect. Keep shared execution contracts separate from HTTP response handling.
- Add publication preparation: validate execution support, compile value schemas, and build an immutable sequence. Clarify execution rules in the workflow specification without tightening publication rules.
- **Done when:** supported publications prepare successfully; unsupported graphs, operations, configuration, or schemas reject before any run is created. Existing workflow fixtures and digests remain unchanged.

### 2. Build the sequential runtime

- Add `packages/runtime` for preparation, binding resolution, built-in operations, and per-run execution. It must run without HTTP or Postgres.
- Execute reached steps once, validate their complete outputs, and finish through `result`. Keep each run's mutable state independent.
- **Done when:** the example below succeeds directly, division by zero fails only its own run, and a held run does not prevent another from completing.

### 3. Connect the services

- Add a daemon run service to retrieve publications, prepare invocations, allocate IDs, and own the in-memory run map. Construct it once in `Daemon.open`.
- Add a Control API run service using `src/clients/daemon.ts`. Add run controllers to both services, register them in `http/routes.ts`, and generate both OpenAPI documents.
- **Done when:** a caller creates/publishes a workflow, invokes that publication, receives 202, and retrieves its eventual outcome through the Control API. Invalid requests create no run.

### 4. Prove independence and shutdown

- Extend `OpenedService`/`boot` so shutdown waits for accepted runs as well as HTTP requests, under the existing single deadline. Do not reintroduce reload support.
- Add a real-service `smoke:sequential` command, using disposable Postgres and a Control API process helper modeled on the existing daemon helper.
- **Done when:** the checks below pass, forced shutdown stays bounded, and operator documentation explains that daemon restart loses run state.

## Implementation approach

- **Keep responsibilities clear.** Controllers translate HTTP requests/responses; injected business services perform operations. The runtime knows nothing about databases or HTTP. Keep workflow domain schemas out of the generic server framework.
- **Prepare before accepting.** Retrieve and verify the exact publication, check supported behavior, validate inputs, and ensure its snapshot can fit. Recheck shutdown/cancellation before inserting the run; no handler starts before that point.
- **Separate request and run lifetime.** After insertion, execution needs neither the initiating request nor further database reads. A lost acceptance response is ambiguous; neither service automatically retries invocation.
- **Follow the graph, not the array.** Start at `firstNode` and follow successors. Reject branching/loops; dependencies must be earlier in the sequence. Allow one running task per run, not one run for the whole daemon.
- **Validate data before passing it on.** Use TypeBox and offline JSON Schema validation. Reject unsupported schemas before acceptance and invalid handler outputs before dependent steps can see them. Never coerce values or insert schema defaults.
- **Preserve reference meaning.** Resolve whole bindings such as `{ "ref": "inputs.amount" }`. Nested reference-shaped objects remain literal data, and names containing dots remain flat names rather than object paths.
- **Make outcomes inspectable.** Show queued/running/succeeded/failed runs and pending/ready/running/succeeded/failed steps. `currentSteps` contains only ready/running work and is empty when terminal. Keep earlier successful outputs after a failure.
- **Make completion final.** The result step's resolved inputs are exactly the final output, including `{}`. Failed runs have no final output. Stop dispatch after failure, settle any running work, then freeze the terminal outcome.
- **Keep observations complete and safe.** Return structured failures with a step, code, and publication location, not raw exceptions. Fail a step before its output would exceed the snapshot budget; do not truncate inspection. Run responses use `Cache-Control: no-store`.

## Verification

Use one reusable example: add `amount` and `surcharge`, divide the total by `people`, then return `{ total, perPerson }` through a result step.

- Inputs `{ amount: 90, surcharge: 10, people: 4 }` produce `{ total: 100, perPerson: 25 }`.
- `people: 0` produces an accepted run that fails at division; the addition output remains visible and the result never runs. A string amount or missing required input rejects before acceptance.
- Reuse the existing minimum/result-only and greeting fixtures in `packages/workflow/src/fixtures/valid/`. Reordering steps must not change execution.
- Check missing bindings, invalid/partial outputs, optional inputs versus explicit unresolved references, schema/depth limits, and snapshots larger than the readiness-response limit.
- Hold one run while another completes or fails. Publish a newer version while the first runs; its original publication and outputs must remain unchanged.
- Disconnect the caller, restart only the Control API, or remove database access after acceptance; daemon execution and inspection must continue. SIGHUP must change neither configuration nor runs.
- Shut down with accepted work: finish within the deadline for a clean exit, or force a bounded nonzero exit. After daemon restart, old run IDs return not found.

- Run the example directly and through the actual service entry points.
- Use test-only controlled handlers for held-work checks, not production `sleep` or `fail` operations.
- Dispose only the processes and database created by the checks.
- Leave separate-network conformance to Epic 6.

### Commands

- Add `bun run --filter @rostrum/runtime smoke` for direct execution.
- Add `bun run smoke:sequential` for the real-service example.
- During implementation, run focused runtime, controller, client, and lifecycle checks; regenerate both OpenAPI documents.
- Finish with both existing service smoke commands, `bun run check`, `bun run lint`, and `bun test`.

## Discoveries

- Publishable does not yet mean executable: current validation permits missing task config, unknown operations, and malformed value-schema fragments. Reject these at invocation without changing publication validity.
- TypeBox compilation can accept malformed schemas and enforces format hints. Validate schemas before using them; format annotations must not reject otherwise valid values.

## Decision log

- 2026-09-16: build on the delivered controller/service split and restart-only framework. Earlier reload-generation and feature-loader designs no longer apply.
- The operation set, presence rules, API shapes, and limits above remain proposals; record agreed changes here before dependent work.

## Outcome

No execution implementation has shipped. Complete the four checkpoints, record implementation PRs and verification results, then move lasting contracts into the specification/code and retire this plan.
