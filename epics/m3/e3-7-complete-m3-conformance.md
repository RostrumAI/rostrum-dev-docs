# E3.7: Complete M3 conformance

Status: Planned

Roadmap milestone: [M3: Durable runs and human control](../../strategy/product-roadmap.md#3-delivery-milestones)

Depends on: [E3.1](e3-1-recover-durable-runs.md), [E3.2](e3-2-retry-bounded-failures.md), [E3.3](e3-3-pause-resume-and-cancel-runs.md), [E3.4](e3-4-wait-for-human-decisions.md), [E3.5](e3-5-inspect-run-timelines.md), and [E3.6](e3-6-retrieve-run-artifacts.md)

## Outcome

A contributor can demonstrate M3 with one repeatable command using the real Control API, daemon, durable store, and local artifact boundary. A run survives restart and reconnect, retries bounded failures, pauses and resumes at a recoverable point, waits for a human decision, exposes its timeline, and returns verifiable artifact evidence.

This Epic consolidates evidence. It does not define a second execution model or replace the focused checks owned by E3.1 through E3.6.

## Scope

### Shared conformance scenarios

- Build a shared fixture catalog from the capability Epics. Each fixture records its workflow publication, inputs, controlled interruption point, expected run projection, attempts, commands, decisions, events, artifacts, and terminal result.
- Exercise durable acceptance and a lost invocation response. Repeat an identical invocation with its idempotency key and verify one run; reuse the key with changed inputs and verify a conflict without execution.
- Stop and restart the daemon at each checkpoint boundary selected by E3.1, including before handler start, during an active handler, after handler return but before outcome commit, and after outcome commit. Verify committed progress, interrupted attempts, no duplicate requests, and deterministic recovery.
- Exercise sequential, conditional, parallel, and bounded-loop behavior after recovery. Preserve M2's selected paths, joins, iteration ordering, captured errors, failure draining, worker capacity, and concurrent-run independence.
- Exercise retry success, retry exhaustion, pending retry recovery, and races between retry readiness and operator commands. Verify attempts and failure classification rather than relying on log text or timing sleeps.
- Exercise pause, resume, and cancellation through the Control API. Verify durable command identity, acknowledgement versus application, cooperative interruption, replacement attempts, cancellation boundaries, and command conflicts.
- Exercise a human-decision wait across client and daemon interruption. Submit valid, invalid, duplicate, late, and conflicting responses and verify only the accepted response selects continuation.
- Retrieve the run projection while the daemon is unavailable, page through its complete event timeline with a saved cursor, and retrieve the reference artifact independently with size and digest verification.

### Real-service demonstration

- Start the Control API and daemon as separate processes with independently configured network addresses and an isolated test database or schema. Use the same shared database contract as local operation, but never touch an existing developer database.
- Exercise authentication, readiness, unavailable-daemon inspection, process restart, and clean shutdown. A service response must not be treated as execution progress unless the corresponding durable record commits.
- Control concurrency through explicit synchronization or test handlers that expose durable barriers. Do not establish correctness with arbitrary sleeps, fixed global completion order, or a failure set containing handlers that never started.
- Provide one command that provisions or migrates its isolated resources, runs the complete demonstration, emits useful failure diagnostics, and cleans up on success or failure.

## Decisions and implementation ownership

Define the fixture format, layer coverage, process controls, isolated database setup, synchronization mechanism, and command contract. Choose whether the full-service demonstration runs against a temporary Postgres database, a temporary schema with isolated credentials, or another supported local store based on E3.1's storage decision. The test environment must prove real persistence and must not silently fall back to process-local state.

Define which assertions belong to the workflow validator, runtime, daemon, durable store, Control API, and artifact boundary. Transport-specific status codes may differ where the public contract permits, but the accepted workflow, durable records, and observable execution outcome must agree. Add focused regression tests only where a plausible durable behavior could regress; do not duplicate every fixture across every layer.

The capability Epics own their contracts and focused verification. This Epic owns their composition, real-process interruption, concurrency controls, and one end-to-end release gate. A tested operational guide may be part of the implementation plan, but a new product Epic, telemetry platform, or Cloud deployment is out of scope.

## Non-goals

- New workflow constructs, a second persistence or execution model, live event delivery, hosted storage, or production deployment automation.
- Timing-based race tests, synthetic success-only checks, or separate layer suites that drift from shared fixtures.
- Tools, scripts, models, external context, integrations, identity policy, or retention administration.

## Acceptance criteria

- One command runs the M3 demonstration against real separately configured services and an isolated durable store, reports failures with enough context to diagnose them, and cleans up its resources.
- The demonstration proves that accepted runs, committed step outcomes, interrupted attempts, retry state, commands, decisions, events, and artifacts survive the required daemon and client interruptions.
- A recovered run does not repeat committed work, create a duplicate decision request, bypass a pause or cancellation, reset retry limits, release an incomplete join, or alter another concurrent run.
- Retry success and exhaustion expose the correct attempt history. Pause and resume follow the safe interruption contract. Cancellation prevents later work. A human response selects only its declared continuation.
- Timeline pages are gap-free and ordered after cursor reconnect. Artifact retrieval verifies producer identity, byte size, and digest, and corruption or missing content fails explicitly.
- M2 focused behavior remains unchanged when M3 capabilities are unused. Runtime and API observations agree with the shared fixtures while legitimate transport differences remain explicit.
- Continuous integration runs the command from a clean checkout and does not require a developer daemon, database, filesystem state, or credentials.
