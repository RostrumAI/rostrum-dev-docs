# Epic delivery methodology

Status: Proposed for review

Audience: Product owner, engineering leads, developers, and coding agents

Decision requested: Approve the delivery hierarchy, the treatment of Epics 1 through 3, and the review policy before converting active work.

This document defines how Rostrum Epics become checkpointed missions and independently verifiable feature slices. The goal is to let a small team delegate substantial outcomes without making one senior developer review every routine implementation detail.

## Recommendation

Retain Epics as stable product outcomes. Stop using an Epic as a container for a long sequence of layer-based task documents.

Execute an active Epic as one mission with:

1. Human decision gates for unresolved product, architecture, security, or irreversible choices.
2. Checkpoints that leave the repository runnable, verified, and ready for another contributor.
3. Feature slices that deliver observable behavior through the relevant product boundary.
4. A named integration owner who protects shared contracts and resolves cross-slice conflicts.
5. Risk-based verification that states which checkpoints need a machine, a guided reviewer, a domain owner, or a specialist.

The governing rule is:

> Delegate outcomes in large units. Integrate and verify them in small units.

For the Spec-Driven Development workflow used inside feature slices, see [Feature-slice Spec-Driven Development kit](feature-slice-sdd-kit.md). For the repository and GitHub cutover, see [Development documentation migration](development-documentation-migration.md).

## Delivery hierarchy

Rostrum should use the following hierarchy.

| Unit | Purpose | Canonical location | Lifecycle |
| --- | --- | --- | --- |
| Roadmap milestone | Orders major product states | Development documentation repository | Long lived |
| Epic | Defines one independently demonstrable product outcome and its boundaries | Development documentation repository | Long lived |
| Mission | Coordinates delivery of one active Epic | Mission issue plus a living execution plan | Active until the Epic exit proof passes |
| Decision gate | Resolves a choice that implementation must not guess | Gate issue and approved decision record | Closed when approved or rejected |
| Checkpoint | Establishes a runnable, resumable repository state | Mission plan and GitHub Project | Closed when its evidence is accepted |
| Feature slice | Delivers one observable behavior through a stable boundary | OpenSpec change, slice issue, and code pull request | Active until merged and verified |
| Implementation task | Records a concrete step inside a slice | OpenSpec `tasks.md` or the coding agent's task state | Temporary |

An Epic answers, "What product state becomes possible?" A mission answers, "How will this team reach that state without losing control?" A feature slice answers, "What independently observable behavior will this change deliver?"

## Epic document contract

An Epic document should contain durable product intent. It should not track mutable execution state.

Keep these sections in each Epic:

- Purpose and user-visible outcome.
- Scope and explicit boundaries.
- Dependencies on contracts delivered by earlier Epics.
- Product invariants that every implementation must preserve.
- Exit demonstration and acceptance criteria.
- Known decision gates that must close before implementation can rely on them.

Remove these elements from Epic documents:

- Per-task status, assignment, and pickup fields.
- Detailed file-by-file implementation instructions.
- A fixed sequence of layer-based implementation tasks.
- Links that make Markdown task files the source of active work.
- Proof logs and transient command output.

An Epic may show likely workstreams, but the active mission owns the actual checkpoint graph. This keeps the roadmap stable when implementation discoveries change the route.

## Mission contract

Create a mission only when its Epic is ready to enter active delivery. The mission plan is a living execution document. A contributor must be able to resume from the plan without reconstructing state from chat transcripts or issue comments.

Each mission records:

- Parent Epic and product outcome.
- Integration owner.
- Approved contract baseline.
- Open and closed decision gates.
- Checkpoint graph and dependencies.
- Feature slices assigned to each checkpoint.
- Verification class required by each checkpoint.
- Progress and evidence links.
- Decisions and deviations discovered during implementation.
- Escalation conditions.
- Recovery state and the next safe action.
- Exit proof.

The mission issue is the operational index. The long-form plan lives in `rostrum-dev-docs` and the issue links to an approved commit and path.

## Decision gates and checkpoints

A decision gate and a checkpoint are different controls.

A decision gate requires judgment. Examples include selecting a daemon transport, changing published workflow semantics, approving a storage consistency model, or accepting a security boundary. Work that depends on the choice remains blocked until the named decision owner approves it.

A checkpoint proves a repository state. It normally advances without human approval when all of these conditions are true:

- The checkpoint's required behavior works through the stated boundary.
- Its acceptance commands pass.
- Evidence is attached or linked.
- An independent verifier accepts the result.
- No escalation condition has fired.
- The repository is runnable and the next contributor can resume from the mission plan.

A checkpoint can still require human review. The mission must state that requirement explicitly rather than treating every checkpoint as a human gate.

### Verification classes

| Class | Suitable scope | Required verifier |
| --- | --- | --- |
| Machine | Stable contract, deterministic checks, and low-risk isolated implementation | Continuous integration plus an independent agent verifier |
| Guided human | Known pattern, bounded blast radius, and an explicit checklist | Junior developer or another trained contributor |
| Domain owner | Public interfaces, architecture, concurrency, persistence, or broad compatibility | Senior engineer responsible for the domain |
| Specialist | Security, destructive migration, authentication, cryptography, or regulated data | Qualified specialist or designated senior owner |

A junior developer should not approve an unfamiliar architectural or security decision. They can implement and verify a bounded slice when the contract, reference pattern, acceptance scenario, and escalation conditions are explicit.

## Feature-slice rules

A feature slice should cross the layers required to demonstrate one behavior. Avoid assigning separate slices for schema, storage, service, API, and tests when none is useful alone.

A valid slice has:

- One observable outcome.
- One stable entry boundary, such as an HTTP operation, command, or package API.
- Normative requirements and failure scenarios.
- A bounded set of affected modules.
- Acceptance that exercises the real changed boundary.
- A clear relationship to one mission checkpoint.
- No unresolved architecture decision hidden inside implementation work.

Split a slice when it contains two outcomes that can be accepted independently. Combine proposed slices when neither produces useful behavior without the other.

## When to split an Epic

Do not split an Epic merely to give two people separate assignments. Split it only when each resulting Epic is independently understandable, demonstrable, and valuable, and when the contract between the Epics is stable.

Use parallel feature slices inside one Epic when:

- The product outcome is still one coherent state.
- The integration owner can freeze the shared interfaces first.
- Each contributor can work in separate modules or workspaces.
- Each slice has an independent acceptance scenario.
- Failure or rework in one slice does not invalidate the others' basic design.

If those conditions do not hold, keep the work sequential until the next contract checkpoint.

## Rework of Epic 1

Epic 1 is mostly completed. Its implementation tasks and five decision spikes should not be converted into a new set of active issues.

Rework it as follows:

1. Retain a concise Epic 1 outcome document covering the workflow interface, validation, draft revisions, publication, immutable versions, and the demonstrated product state.
2. Retain the approved workflow specification and durable decision records.
3. Create one closed Epic 1 mission record that links the merged implementation and records which exit criteria passed.
4. Preserve the old task documents as historical migration material, not active work.
5. Convert the unfinished authoring lifecycle integration test into a separate M1 hardening slice. It is not local execution work and should not remain numbered as E2-13.
6. Keep authoring guidance deferred to the later authoring milestone without retaining an open Epic 1 task.

The hardening slice should prove the draft-to-publication lifecycle through the real Control API and database. It can run independently of the Epic 2 local execution mission.

## Rework of Epic 2

Epic 2 is the first mission that should use the new method. Its present tasks are organized mostly by implementation layer. Regroup them around contract and behavior checkpoints.

### Gate G0: Approve the execution boundary

This gate contains:

- Approval or revision of the proposed E2-S1 local execution semantics.
- Selection and approval of the E2-S2 local daemon transport.
- Resolution of the workflow interface terminology change in E2-01.
- Approval of this delivery and tracking migration in place of E2-02.

The gate closes when the execution semantics, transport, terminology, and tracking system have approved sources of truth. No implementation slice may change those decisions without reopening the gate.

Required review: Domain owner.

### Checkpoint CP1: Freeze the executable contract

This checkpoint absorbs the contract work from E2-03, E2-04, and E2-06. It produces:

- One execution specification and fixture catalog.
- Workflow schema and validation updates that reject definitions without one execution meaning.
- Handler request, output, failure, and registry contracts.
- Deterministic reference handlers and controlled test handlers.
- Conformance inputs that later slices reuse.

The checkpoint is complete when the shared workflow package accepts every valid execution fixture, rejects every invalid fixture, and exposes the handler contract required by the daemon.

Required review: Domain owner for contract changes. Machine verification for generated schemas and fixture consistency.

### Checkpoint CP2: Prove a thin execution path

This checkpoint delivers the first complete vertical path instead of building the full runtime before exposing it. It draws work from E2-05, E2-06, E2-07, E2-10, E2-11, and E2-12.

A caller must be able to:

1. Start the Control API and daemon as separate processes.
2. Invoke an exact published sequential workflow through the Control API.
3. Disconnect after acceptance.
4. Let the daemon invoke a reference handler and reach an explicit result.
5. Retrieve the terminal output through the Control API.

The same sequential fixture must pass against the runtime, daemon transport, and Control API. This checkpoint establishes the architecture before control-flow breadth is added.

Required review: Domain owner for process and API boundaries. Guided human review is acceptable for reference-handler implementation under the approved contract.

### Checkpoint CP3: Add conditional execution

This checkpoint adds both outcomes of a conditional workflow through the same public run boundary. It also proves that unselected paths do not execute, branch selection follows the approved priority and type rules, and invalid routing produces the documented failure.

Required review: Machine verification plus guided human review unless the implementation changes the execution contract.

### Checkpoint CP4: Add parallel paths and joins

This checkpoint adds bounded parallel execution, matching joins, capacity limits, active-handler drain, stable failure ordering, and non-starving scheduling across active runs. Acceptance must vary handler capacity and controlled completion order without changing the terminal result.

Required review: Domain owner because concurrency and failure ordering have a broad blast radius.

### Checkpoint CP5: Add bounded loops

This checkpoint adds ordered sequential iterations, iteration identity, limit enforcement, fail-fast behavior, error-tolerant behavior, and structured parallel work inside an iteration. Acceptance covers empty, successful, over-bound, wrong-type, fail-fast, error-tolerant, and parallel-body scenarios through the public run boundary.

Required review: Domain owner for state-machine changes. Guided human review is acceptable for fixture and adapter work.

### Exit checkpoint CP6: Converge and prove Epic 2

The exit checkpoint completes the reusable conformance suite and the real separate-process demonstration. It proves every workflow interface v1 control-flow construct, invocation rejection, accepted-run failure, complete ordered failures, and client disconnection.

The checkpoint passes only when:

- The same fixture catalog passes at every applicable layer.
- One command starts the real processes and exercises the complete contract.
- No timing-based sleeps are required for deterministic tests.
- The local-run instructions have been exercised as written.
- The Epic 2 outcome and every prior checkpoint remain working together.

Required review: Domain owner for final acceptance. Continuous integration retains the repeatable proof.

### Epic 2 mapping from old tasks

| Existing work | New location |
| --- | --- |
| E2-S1 and E2-S2 | Gate G0 |
| E2-01 | Gate G0 prerequisite maintenance slice |
| E2-02 | Superseded by the approved migration and tracking policy |
| E2-03, E2-04, and E2-06 contract work | CP1 |
| E2-05, E2-07, E2-10, and their sequential fixtures | CP2 |
| Conditional portions of E2-07, E2-11, and E2-12 | CP3 |
| E2-08 and its E2-11 and E2-12 evidence | CP4 |
| E2-09 and its E2-11 and E2-12 evidence | CP5 |
| Remaining E2-11 and E2-12 convergence work | CP6 |
| E2-13 | Separate M1 authoring hardening slice |

The old task IDs remain historical references during migration. New issues should use outcome-based names instead of reproducing the same numbering as separate documents.

## Rework of Epic 3

Epic 3 is not ready for implementation until Epic 2 establishes stable invocation, run-state, handler, and daemon contracts. Keep it as a roadmap Epic until that dependency passes.

When activated, use this initial mission shape.

### Gate G0: Approve durable consistency and recovery

Combine the decisions presently described by E3-S1, E3-S2, and E3-S4 into one compatible state-transition model. The gate must settle transaction boundaries, attempt identity, interruption, recovery ordering, commands, event ordering, and artifact integrity.

### Gate G1: Approve human decision semantics

Resolve E3-S3 separately because decision requests, response schemas, conflicts, and continuation can be reviewed as a distinct product contract. Research for this gate may proceed in parallel with G0, but implementation waits for the relevant gate.

### Checkpoint CP1: Persist and recover a basic run

Deliver one vertical path in which an accepted run commits durably, survives daemon interruption, recovers from its last approved boundary, and remains inspectable through the Control API.

### Checkpoint CP2: Add attempts, retries, and operator control

Add explicit attempts, bounded retries, pause, resume, cancellation, precedence, and interruption behavior. Exercise each through durable commands and public observation.

### Checkpoint CP3: Add human decision waits

Add a durable decision request, daemon and client interruption during the wait, one accepted response, downstream continuation, and documented duplicate or conflicting submissions.

### Checkpoint CP4: Complete timelines and artifacts

Expose ordered event retrieval and immutable artifact metadata and content. Prove cursor continuation, digest verification, and inspection while the daemon is unavailable.

### Exit checkpoint CP5: Converge and prove Epic 3

Run shared fixtures across the runtime, daemon, store, and Control API. The exit demonstration must cover restart recovery, retry, operator control, human decision, timeline replay, and artifact retrieval without relying on a continuously connected client.

Do not create all Epic 3 slice issues during the migration. Create them when the Epic 3 mission opens and the Epic 2 interfaces are known.

## Treatment of Epics 4 through 13

The product plan names milestones 4 through 13, but the current repository contains detailed Epic documents only for Epics 1 through 3. Keep milestones 4 through 13 as roadmap outcomes. Do not generate task trees for them in advance.

When a milestone becomes eligible:

1. Confirm that the preceding Epic's exit contract is stable.
2. Write or revise the durable Epic outcome and boundaries.
3. Identify unresolved decisions and assign decision owners.
4. Create one mission issue and living plan.
5. Close the minimum decision gates needed to define the first vertical slice.
6. Create slice issues only for the next reachable checkpoint.
7. Expand the mission plan as evidence reveals the next safe slice.

This avoids maintaining speculative task documents for work whose interfaces will change before implementation starts.

## Work assignment in a two-developer team

The senior developer remains the mission integration owner. The junior developer receives complete slices behind approved contracts rather than isolated cleanup work.

Good junior assignments include:

- Implementing another handler from an approved reference handler.
- Adding valid and invalid conformance fixtures with stated expected results.
- Extending a stable adapter without changing its interface.
- Implementing one conditional or loop scenario after the state-transition pattern exists.
- Exercising an end-to-end procedure and recording a reproducible defect.

Escalation is mandatory when a slice requires a shared interface change, introduces a new state transition, weakens an acceptance criterion, changes persistence or concurrency behavior, or produces evidence that conflicts with the specification.

A separate agent should review the implementation against the slice specification before human review. The senior developer then reviews only work classified for domain-owner review, agent findings that remain unresolved, and deviations from the plan.

## GitHub representation

Represent the hierarchy in GitHub as follows:

- One Project item for each active mission, gate, checkpoint, and feature slice.
- One mission issue for the Epic-sized outcome.
- Sub-issues for decision gates and feature slices.
- Project fields for parent mission, checkpoint, owner, integration owner, risk, required verifier, status, and blocked reason.
- One code pull request per independently mergeable slice.
- One development-documentation pull request for each approved specification or decision revision.

Do not create GitHub issues for individual coding-agent steps. Those steps belong in the slice's temporary `tasks.md` and disappear from active planning after the slice closes.

## Adoption criteria

The methodology is ready for use when:

- Epic documents no longer duplicate task status or ownership.
- The Epic 2 mission has one integration owner and approved checkpoint graph.
- Decision gates identify the person with authority to close them.
- Every active feature slice has an observable acceptance scenario.
- Each checkpoint declares its required verification class and escalation conditions.
- A contributor can resume from the mission plan without reading chat history.
- GitHub Issues and Projects contain operational state, while long-form artifacts have one canonical revision in `rostrum-dev-docs`.
