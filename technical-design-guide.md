# Technical design guide

A technical design explains how to implement and verify a reviewed high-level blueprint in the actual repository. Write for the engineer making the change, the reviewer checking its consequences, and the contributor who may resume the work after an interruption. They should be able to follow the behavior across components, not merely locate a list of files.

The [delivery methodology](epic-delivery-methodology.md) owns stage gates and review responsibilities. Use [Writing and self-review](writing-style.md) for the common voice and review procedure, and the [high-level implementation guide](high-level-implementation-guide.md) for the parent blueprint's boundary.

## Boundary and location

Place new technical designs in `designs/<workstream>.md`, or use a clearly named design slice when one blueprint needs several designs. Each design links exactly one parent blueprint and that blueprint's Epic. The parent lists its child designs and their acceptance coverage. Give each design one owner and a nonoverlapping implementation scope; link dependencies on other designs and name the integration owner where several slices contribute to one acceptance outcome.

The design expands the blueprint into repository-level choices. It owns files, callers, interfaces, state, implementation ordering, verification, progress, discoveries, and recovery for its scope. Checkpoints are sections in this document, not a fourth planning artifact. Do not add a separate task plan to hold the work that belongs here, or create speculative empty designs.

Keep the explanation primarily in prose. Include exact signatures, short data examples, or pseudocode only when they settle an ambiguity more clearly than words. A long code sketch is not a substitute for explaining ownership, interactions, and observable outcomes.

Existing `plans/` documents are prior combined-plan records. When resuming that work, establish and review the relevant blueprint and design first. Preserve applicable decisions and historical evidence with their original context, recheck the current baseline, and distinguish completed work from what remains. An old completion claim does not establish current approval or successful execution on a changed baseline.

## Start from the repository, not an imagined implementation

Read the relevant Epic, blueprint, specifications, decisions, and code before choosing the implementation. Record the actual revision and relevant local changes in the implementation checkout, together with the date of inspection and the sources used. If work crosses repositories, identify each relevant baseline rather than treating their revisions as interchangeable.

Explain what already exists, what will be reused, and what must change. A source link supports a statement about code; an exercised scenario supports a runtime claim. State which kind of evidence you have. When a prior design or discovery conflicts with current code, record the difference and the decision needed instead of silently choosing whichever is convenient.

Resolve consequential mechanisms before implementation depends on them. An open naming detail is different from an unresolved state owner, failure contract, or compatibility boundary. Name the owner and blocked checkpoint for decisions that cannot yet be resolved. If the solution would change the blueprint's approach or the Epic's behavior, return the decision to that owning artifact rather than burying it in the design.

## Required artifact outline

Use the following headings as a practical starting format. Supply concrete content for this work; do not leave template instructions in a ready design. Related sections may be combined when the information remains easy to find. State why a topic does not apply instead of omitting an important boundary without explanation.

### Title, ownership, and parent links

Name the implementation outcome. Record the design owner, status, exactly one parent blueprint, and its Epic. Link governing specifications, decisions, dependent designs, and any prior combined-plan record whose decisions or evidence remain relevant. Identify the intended next action so “ready” cannot be mistaken for implementation completion or approval.

### Purpose, scope, and acceptance coverage

State the behavior this design delivers and how a reviewer or caller can observe it. Identify the blueprint responsibilities and Epic acceptance criteria it covers, its exclusions, and the interfaces it needs from sibling work. Where acceptance spans designs, name each contribution and the integration owner; do not defer focused verification to a later conformance effort.

### Current repository baseline

Record the inspected baseline and relevant paths, symbols, services, tests, fixtures, and behavior. Explain the reusable patterns and current limitations that drive the change. Identify incomplete prerequisite work, local changes, or contradictory evidence that affects the design. On resumption, record what was rechecked and which earlier conclusions remain valid.

### Implementation placement and affected contracts

For every substantive file to create, change, or remove, give the action, path, responsibility, and reason. Group related files by behavior so the inventory does not fragment the explanation. Identify existing helpers and maintained components to reuse. Include removals and explain why obsolete code is no longer needed.

Name affected callers and collaborators, including entry points, consumers, shared contracts, and external interfaces where relevant. Explain how all callers move to the new contract and what happens to the old path. State compatibility requirements from the governing source rather than inventing shims or silently breaking consumers. Locate schema or interface changes at their owning boundary and explain how callers observe success and failure.

### State ownership and end-to-end interactions

For each important piece of state, identify its owner, lifetime, source of truth, permitted readers and writers, and relevant transitions. Explain isolation, cleanup, persistence, or recovery only where required by the scoped behavior; do not introduce new runtime infrastructure through a generic checklist.

Then walk through the behavior from entry point to final observation. Name who calls whom, what information crosses each boundary, which result is returned or reported, and what causes the next action. Explain where state changes relative to those interactions. Where the order matters, state both the required order and the failure it prevents.

Address repeated events, concurrent work, cancellation, resource cleanup, partial failure, or compatibility when those conditions can occur in scope. For each relevant failure, identify the detecting component, the outcome it exposes, the participants that receive it, and what work proceeds or stops. Do not rely on “atomic,” “idempotent,” or “thread-safe” without explaining the actual boundary and guarantee.

### Decisions and unresolved questions

Record consequential implementation decisions, rationale, alternatives that materially affected the choice, and the source of approval when approval is required. Distinguish proposals from decided mechanisms. For each unresolved question, name the decision owner, missing answer or evidence, dependent checkpoint, and escalation condition. Use one decision log here rather than maintaining competing lists elsewhere in the design.

A question may remain open only if the intended next action does not depend on its answer. Record the resolution before dependent implementation begins. Changes to shared interfaces, state transitions, persistence, concurrency, compatibility, or security need an appropriately skilled reviewer under the methodology.

### Implementation sequence and checkpoints

Order the work by real dependencies. Each checkpoint should leave the repository runnable and produce an independently verifiable behavior or repository state. Use a checkpoint when it establishes a needed contract, completes a vertical path, addresses a distinct risk, or provides a safe handoff. Do not split work solely to match headings or an arbitrary pull-request count.

For each checkpoint, supply:

- **Outcome and scope:** the observable result, affected files or responsibilities, and acceptance criteria advanced.
- **Dependencies and work:** the prerequisites, ordered changes, and caller migration or removals needed for a coherent state.
- **Owner and review:** the implementer, required reviewer, decisions needing human judgment, and conditions requiring escalation.
- **Verification:** the scenarios and commands to run, their working directory and prerequisites, and the expected result. Link the detailed setup below rather than duplicating it.
- **Recovery and handoff:** the last safe state, what can be resumed or repeated, any partially applied change requiring care, and the owner responsible for restoring a usable state if this checkpoint fails.

A bounded checkpoint can be assigned to a junior developer when the interface, reference pattern, permitted changes, acceptance scenario, and escalation conditions are explicit. Pull requests follow independently mergeable states; a checkpoint can span more than one pull request.

### Verification design

First identify existing coverage. Then specify which tests to add, update, or remove, and why. For each meaningful change to coverage, state:

| Information | What the author supplies |
| --- | --- |
| Behavior and reason | The observable contract or plausible bug the test protects, linked to the covered requirement or interaction. |
| Setup | Relevant state, inputs, fixtures, and control of time, failure, or concurrency needed to make the case deterministic. |
| Expected outcome | The result, error, transition, or side effect a consumer can observe; include the important boundary or failure case. |
| Placement | The existing test location or proposed file and the appropriate unit, integration, end-to-end, or smoke level. |
| Action | Add, update, retain, or remove, with the reason existing coverage is insufficient or obsolete. |

Prefer meaningful assertions over mock echoes, field-copy checks, source-text checks, or a test that merely does not throw. Match repository testing conventions, reuse suitable fixtures, and remove coverage made redundant or invalid by the change. A test is worth keeping when a plausible implementation bug would fail it; document planned verification without manufacturing tests to fill the table.

Define real smoke scenarios as well as automated coverage where needed to demonstrate the changed surface. Supply the actual command or interaction, working directory, dependencies and environment setup, input or fixture, expected observation, and cleanup. For a CLI or UI change, exercise the actual surface. For a service change, describe the real request and the observable result across the changed boundary. State limits when a substitute check cannot demonstrate the full behavior.

Commands in a design are instructions, not evidence that they ran. Label expected results separately from recorded results. Do not invent command names; use the repository's actual scripts or explicitly identify a command to be introduced in a checkpoint. Name who runs combined acceptance scenarios spanning several designs and how their results return to the parent coverage record.

### Progress, discoveries, and evidence

Keep this section current during implementation. Record checkpoint state, completed and remaining work, pull-request links, discoveries, and the owner of the next action. A checklist can summarize progress but does not replace an explanation of changed assumptions or blocked work.

Record unexpected behavior with concise evidence and its consequence for the design. When a discovery changes a decision, update the decision log and the affected interaction or checkpoint so later readers do not have to reconcile contradictory sections.

For each verification run, record the implementation revision and relevant local changes, command or scenario, environment facts needed to interpret it, actual outcome, and an evidence reference when output is stored elsewhere. Summarize what the evidence proves and what it does not. Keep historical results as historical results; do not overwrite an earlier run to imply that later changes were exercised. Record independent agent review findings and their disposition separately from human review and execution evidence.

### Recovery and resumption

Before stopping, record the current usable state, incomplete changes, active blocker, remaining verification, and the next concrete action with its owner. Explain any scoped cleanup, data restoration, or environment teardown needed before continuing. Distinguish this contributor handoff from runtime recovery behavior, which belongs in the interaction design when required.

A resuming contributor rechecks the baseline and relevant decisions before relying on earlier evidence. If an interrupted migration or setup step cannot safely be repeated, state how to detect its current state and who decides the recovery action. Do not prescribe destructive recovery without identifying its scope and consequences.

### Self-review and outcome

Before handoff for implementation, apply the common review procedure and the design-specific criteria below. Record evidence, applicability, and `pass`, `revise`, or `blocked` for each applicable check; revise and rerun failed checks. End with `ready`, `revise`, or `blocked` for the intended next action and the unresolved decisions and owners.

During and after implementation, add the actual behavior delivered, evidence, remaining gaps, reviews, and pull requests. Keep the Epic and blueprint coverage links accurate. A ready design is not proof that acceptance passed, and self-review does not replace the methodology's independent agent and required human reviews. Follow the methodology for completion and retention; keep durable decisions in their appropriate long-lived source without erasing historical verification context.

## Worked interaction explanation

The following is a hypothetical report-building service, not a Rostrum runtime design or a requirement to introduce a queue, database, or retry policy. Assume its governing requirement says that each report uses a fixed set of inputs and that callers can distinguish a usable result from a failed build. The example illustrates the detail a technical interaction explanation needs; a real design must also supply actual repository paths and contracts.

### Insufficient passage

> Update the report service and repository. Persist results before completion. Handle failures and concurrent requests. Add integration tests.

The passage does not identify who owns status, how the builder reports its result, whether results can leak between requests, or what the test must observe.

### Better passage

> The request controller validates the request and passes its fixed input set to the report service. The service creates a report identity and owns the status changes for that report; the builder receives the inputs and returns either generated content or a build failure. The builder does not publish status itself.
>
> When the builder returns content, the service asks the report repository to save it under that report identity. The service exposes successful completion only after the save succeeds, because the lookup controller must not tell callers that a usable result exists before it can retrieve that result. If the builder fails, the service records the agreed failed outcome and no content is exposed as a successful result. If saving fails, the service follows the save-failure contract rather than reporting success; that contract must be resolved before this checkpoint begins.
>
> Concurrent requests receive different report identities and do not share mutable input or result state. The integration scenario starts two requests with distinguishable inputs, delays one builder result, and retrieves each report through the lookup controller. It checks that each report exposes only its own content and that the delayed report is not reported successful early. A separate save-failure scenario makes the save fail and checks that the caller never receives a successful report without retrievable content.

The better passage connects entry point, state owner, collaborator, ordering, failure, and observable verification. It also exposes an unresolved save-failure contract instead of hiding it behind “handle failures.” A real design must resolve that contract, identify the existing or proposed test locations and controls, and record the review outcome before the dependent checkpoint is ready. The example's assumed status and persistence choices are not general architectural rules.

## Design-specific self-review

Use these criteria with the procedure in [Writing and self-review](writing-style.md#self-review-procedure). For each applicable check, cite the design section and the relevant source or proposed verification scenario. A verification plan can establish design readiness; only actual execution evidence can support an implementation result.

| Criterion and applicability | Fails when | Correction and evidence needed |
| --- | --- | --- |
| **Baseline and reuse — every design.** | The design assumes files, scripts, or behavior without inspecting them, or relies on historical completion as current evidence. | Record the actual baseline, sources, reuse choices, and relevant differences. Cite “Current repository baseline” and any retained historical evidence with its context. |
| **Parent and scope — every design.** | There is no single parent blueprint and Epic, implementation changes the approach silently, or coverage overlaps with siblings. | Restore the parent links, resolve approach changes at their owner, and map distinct coverage with dependencies. Cite scope, the parent's child listing, and the decision involved. |
| **Placement and caller cutover — every design.** | Files are listed without purpose, affected callers are missing, or an obsolete path remains without a governing compatibility need. | Explain create/change/remove actions and migrate every affected caller. Cite the inventory and contract changes with their consumers. |
| **Ownership and connected flow — every design.** | Components or state fields are listed but readers cannot trace entry, state changes, collaboration, and final observation. | Write the end-to-end interaction, name readers and writers, and explain the relevant lifetime. Cite the flow and ownership section. |
| **Ordering and exceptional behavior — where these affect correctness.** | The design uses labels such as “safe” or “idempotent” without a boundary, or leaves repeats, concurrent events, and partial failure to the implementer. | Specify the required ordering, guarantee, detecting participant, and observable consequence. Cite interactions and failure scenarios; justify any inapplicable case from the scoped entry points and state model. |
| **Implementable decisions — every design.** | A consequential mechanism is unsettled but its checkpoint is described as ready, or a proposal is presented as approved. | Resolve the decision or name its owner and blocked work. Cite the decision log, its authority where applicable, and checkpoint status. |
| **Useful checkpoints — every design.** | Work is a file-edit checklist with no runnable intermediate outcome, dependency order, reviewer, escalation condition, or safe resumption state. | Define coherent checkpoints and their verification and recovery ownership. Cite the sequence and each affected checkpoint. |
| **Behavioral verification — every design.** | “Add tests” replaces setup and expected outcome, coverage pins implementation details, or acceptance depends only on an unassigned later scenario. | Identify existing coverage and justified additions, updates, and removals; specify meaningful outcomes and placement. Cite the test plan and the owner of integrated acceptance. |
| **Executable smoke path — when changed behavior needs a real-surface demonstration.** | Commands are invented, setup or cleanup is missing, or a mock result is presented as a service, CLI, or UI demonstration. | Supply actual scenario steps, prerequisites, working directory, expected observation, and cleanup; state any verification limits. Cite the scenario. Explain inapplicability for work with no changed runtime surface. |
| **Living evidence and recovery — every design.** | Progress lacks a next owner, evidence cannot be tied to a baseline, review is confused with execution, or another contributor cannot resume safely. | Update progress, discoveries, results, and recovery information without rewriting historical evidence as current. Cite those records and the final handoff. Before implementation, identify the owners and planned record locations without fabricating results. |

A ready technical design lets an implementer act without guessing consequential contracts and lets a reviewer say what evidence will demonstrate success. Completion still depends on working code, exercised behavior, and the reviews required by the methodology.
