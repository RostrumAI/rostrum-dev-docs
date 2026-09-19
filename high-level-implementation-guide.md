# High-level implementation guide

A high-level implementation blueprint explains what we need to build technically to deliver an Epic and how the major responsibilities work together. Write for an engineer who knows the product but has not designed this subsystem, and for reviewers deciding whether the proposed approach satisfies the requirement.

The [delivery methodology](epic-delivery-methodology.md) defines the stage gates. Use [Writing and self-review](writing-style.md) for the shared voice and evidence-based review procedure. A [technical design](technical-design-guide.md) then resolves the repository-level mechanisms and implementation work.

## Boundary and location

Keep product requirements in `epics/` and new blueprints in `blueprints/<workstream>.md`. Normally one blueprint covers one Epic. Separate blueprints only when nonoverlapping workstreams need distinct owners; state their dependencies and account for the whole Epic across them. Do not create empty files for anticipated work.

A blueprint can choose an architectural approach. It explains current capabilities and gaps, major responsibilities, important states and interactions, reasons for the approach, and what is deliberately outside the present scope. Naming a component or conceptual operation is useful when it makes a responsibility concrete; it does not require a complete interface or file layout.

Leave exact schemas, file inventories, algorithms, commands, and test setup to the child technical designs unless one of those details is itself necessary to settle the architectural boundary. The blueprint must still be specific enough that reviewers can follow the behavior and judge whether the approach can satisfy the Epic. “Add an execution layer” is not an approach.

Each child design links exactly one parent blueprint and that blueprint's Epic. The parent lists its children, their owners, dependencies, and acceptance coverage. If several blueprints contribute to one Epic, link their coverage boundaries rather than assigning the same work twice. A design split by implementation risk or owner remains a child design, not another planning level.

Existing documents under `plans/` remain prior combined-plan records, not a second format for new work. Before resuming their implementation, establish and review the relevant blueprint and technical design. Carry forward applicable decisions and historical evidence, recheck the baseline, and do not infer approval from a prior completion statement.

## Develop the explanation

Start with the capability already available and the gap the Epic asks us to close. Cite the sources for the baseline, and distinguish observed implementation facts from agreed requirements and proposals. Explain the constraint that makes the gap important near the introduction rather than expecting readers to find it later.

Next introduce responsibilities. For each major participant, explain what it owns, what it needs from others, what it produces, and why the boundary is useful. State both technical responsibility and the human owner of unresolved decisions or cross-workstream agreements. A list of components without their relationships leaves the important design work to the reader.

Walk through the main behavior in an order the reader can follow: what starts it, which participant acts, what information crosses a boundary, and what happens next. Explain important states through the circumstances that produce them and the behavior they enable. Avoid a disconnected catalog of status names and rules.

Cover difficult cases through their outcomes. State the condition, why ordinary progress is not possible, what the caller or collaborating component should observe, and the responsibility that owns that outcome. Detection algorithms and representations belong in the design. If the outcome itself is undecided, name the question and its owner rather than selecting an incidental remedy such as a timeout.

Keep future motivation beside the current boundary. An approach may leave room for later distribution, persistence, or extension without requiring that work now. Say what must be preserved today and what remains excluded. Do not introduce a speculative technology merely to demonstrate that the future has been considered.

## Required artifact outline

Use the headings below as the starting format. The instructions describe what an author supplies; they are not content to leave unresolved in a ready blueprint. Closely related sections may be combined if their coverage remains easy to find. If a topic does not apply, state why rather than leaving an empty heading.

### Title and ownership

Name the technical outcome. Record the Epic link, blueprint owner, document status, and scope or workstream. Link governing specifications and decisions where they affect the approach. Record review outcomes separately from human approval; status must not imply either approval or working implementation without evidence.

### Purpose and current capability

Describe what works today, what is missing, and what this blueprint will make possible. Cite the relevant baseline and explain why the gap matters. Summarize only the Epic context needed to understand the approach rather than restating every requirement.

### Scope and constraints

State included behavior, exclusions, governing constraints, and dependencies on other workstreams. Separate current scope from future motivation. Identify which constraints come from the Epic or governing decisions and which choices this blueprint proposes.

### Responsibilities and rationale

Introduce the major participants and their responsibilities. Explain ownership boundaries, what crosses them, and why this division helps deliver the requirement. Explain consequential architectural choices and any tradeoff needed to understand them. Do not enumerate alternatives that no longer affect a decision.

### Main interactions and important states

Walk through the primary flow from trigger to observable outcome. Explain who changes or observes important state and what each transition enables. Include a small scenario or diagram only if it clarifies a non-obvious relationship; labels alone do not replace the explanation.

### Edge conditions and required outcomes

Cover conditions that affect the architectural approach or the Epic's acceptance: for example, rejected input, unavailable collaborators, conflicting work, or inability to make progress, where relevant. For each, state the condition, consequence, responsible participant, and required visible outcome. Link detailed rules when they already have an owner. Do not import unrelated future failure handling into the scope.

### Child designs and acceptance coverage

Map each in-scope Epic acceptance criterion to the blueprint responsibility or interaction that satisfies it and the child design that will implement and verify it. Use the Epic's existing criterion names or section references instead of inventing a competing requirements list.

For each existing child design, provide its link, owner, covered behavior, and dependencies. Before a design exists, name the intended slice and owner in this section without creating an empty file or a broken link. State any uncovered criterion and the work or decision needed to cover it. The blueprint may be ready to guide design while child designs are still being written; implementation readiness requires the relevant reviewed design under the methodology.

Where multiple blueprints cover an Epic, identify the sibling responsible for each criterion outside this blueprint and the owner responsible for the combined coverage check. A shared acceptance scenario may involve several children; distinguish their contributions and name the integration owner rather than claiming each independently proves the whole outcome.

### Decisions and open questions

Record consequential choices with their rationale and governing source or review status. For each open question, state the owner, the answer needed, the affected scope, and when it must be resolved. A blueprint can leave an exact symbol name to the design. It cannot present an unsettled architectural choice as settled, or let dependent implementation proceed without a resolved boundary.

### Self-review and handoff

Apply the common review procedure and the blueprint-specific criteria below. Record section-level evidence, applicability, and `pass`, `revise`, or `blocked` for each applicable criterion. End with `ready`, `revise`, or `blocked` for the intended next action and name unresolved decisions. Readiness for design is not human approval or runtime verification.

## Explanatory example: two results needed by one consumer

This is a hypothetical dependency example, not a Rostrum scheduling requirement or a decision about current workflow execution. Assume a small system in which B and C each produce a result, and D requires both results before it can do useful work.

B may finish before C. If B's completion alone causes D to begin, D will be missing one of its inputs. We therefore need a coordination responsibility that knows which required results are available. The completion producers report their outcomes to that coordinator; the coordinator makes D eligible only once both successful results are available. The execution responsibility performs D's work after it becomes eligible.

The separation matters because learning that one predecessor finished is different from establishing that all prerequisites are satisfied. If C fails, the system needs a defined outcome for D and an observable explanation of why it did not proceed. That outcome must come from the governing requirement; this example does not choose failure propagation, retries, or recovery behavior.

The blueprint explains these responsibilities and their relationship. Its child design resolves how completion reaches the coordinator, where prerequisite state lives, and how competing notifications are handled if concurrency is in scope. No queue, record shape, or particular function name is implied by this explanation.

### Insufficient passage

> Add a coordinator and executor. Dependencies gate readiness. Handle blocked nodes. Support parallelism later.

The passage names mechanisms but leaves the reader to infer who reports completion, what readiness means, and whether parallel execution is part of the current work.

### Better passage

> In this example, D needs the successful results of both B and C. Their completion producers report results to the coordinator, which decides whether D has all required inputs. The executor performs D's work only after that decision. This keeps partial completion from starting work with missing inputs. The present slice defines eligibility for one executor; adding several executors is excluded, although the responsibility boundary should not depend on the producer also executing D. The required outcome when C fails must be resolved before the dependent design can be considered ready.

The better passage supplies the need, participants, interaction, rationale, present boundary, and unresolved decision. It remains a blueprint because it does not decide the implementation mechanism. Its final sentence is an honest blocker in the hypothetical draft, not a pattern for concealing an unfinished decision in a ready artifact.

## Blueprint-specific self-review

Use these checks with the procedure in [Writing and self-review](writing-style.md#self-review-procedure). Cite the relevant blueprint sections and governing sources; do not replace evidence with a checklist of headings.

| Criterion and applicability | Fails when | Correction and evidence needed |
| --- | --- | --- |
| **Technical contribution — every blueprint.** | The artifact restates the Epic or starts with machinery without explaining the capability gap. | Explain the technical outcome and approach from the actual starting point. Cite “Purpose and current capability” and its baseline sources. |
| **Responsibility boundaries — every blueprint.** | Major participants are only names, ownership overlaps without explanation, or the reader must infer why the split exists. | State what each participant owns, exchanges, and deliberately does not do; explain the consequence of the boundary. Cite responsibilities and the flow that uses them. |
| **Connected behavior — every blueprint.** | States and constraints are individually described but no trigger-to-outcome path connects them. | Walk through the main interaction and explain what each state change enables. Cite that passage and any clarifying scenario. |
| **Edge outcomes — wherever an exceptional condition affects acceptance or architecture.** | The draft says “handle errors,” supplies a remedy without a required outcome, or assumes an unresolved failure policy. | State condition, responsible participant, and observable consequence; identify blocked decisions. Cite the outcome and its governing requirement. Explain any inapplicability by scope. |
| **Present and future boundary — every blueprint.** | Future motivation silently becomes required work, or a named option reads like an agreed dependency. | State the present limitation beside the motivation, and label proposals. Cite scope and the relevant decision status. |
| **Design handoff — every blueprint.** | An implementer would need to choose the architecture from scratch, or detailed file and algorithm choices obscure the approach. | Resolve the architectural responsibility or move implementation detail into the child design. Cite the resulting explanation and explicit delegated decisions. |
| **Parent, children, and coverage — every blueprint.** | The Epic is missing, a criterion has no responsible scope, child ownership is unclear, or siblings duplicate work. | Map criteria to responsibilities and owned design slices; name integration responsibility for shared acceptance. Cite the coverage map and existing child links. Missing required coverage is not inapplicable. |
| **Decision readiness — every blueprint.** | An open decision lacks an owner or allows dependent work to proceed as though settled. | Name the question, owner, dependency, and resolution point. Cite the decision record and the final handoff for the intended next action. |

A successful review leaves the next author able to produce the technical design without reinterpreting the product requirement or guessing how the major parts cooperate. It does not certify that the proposed system has been built.
