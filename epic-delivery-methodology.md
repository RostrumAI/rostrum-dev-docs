# Epic delivery methodology

Status: Current standard.

This document defines how we turn product requirements into implemented, verified behavior. It governs new work and work resumed from an earlier design.

## Delivery flow

Product strategy establishes the problem, audience, and product boundaries. Roadmap milestones order the capabilities we need. Within a milestone, work follows this sequence:

```text
Product requirement (Epic)
    ↓
High-level implementation blueprint
    ↓
Technical design
    ↓
Code and verification
```

Each stage answers a different question. Keeping them separate lets us review what we need to build before deciding its exact implementation.

| Stage | Responsibility | Location and guidance |
| --- | --- | --- |
| Epic | Define the capability, user-visible behavior, constraints, and observable acceptance criteria. | [epics/](epics/README.md); [Epic format](#epic-format) below. |
| High-level implementation blueprint | Explain what we need to build technically, why that approach fits, and how the major responsibilities interact. | [blueprints/](blueprints/README.md); [high-level implementation guide](high-level-implementation-guide.md). |
| Technical design | Explain how the blueprint will work in the actual repository, including files, contracts, interactions, failures, implementation order, and verification. | [designs/](designs/README.md); [technical design guide](technical-design-guide.md). |
| Code and verification | Implement the agreed behavior and demonstrate that it satisfies the requirements. | Source, tests, fixtures, and implementation pull requests in the code repository. |

The blueprint may choose an architectural approach; it is not a less specific Epic. The technical design must explain how the parts work together, not merely list files or expand the blueprint into code snippets. Both use the [shared writing style and self-review procedure](writing-style.md).

Specifications define durable contracts, and decision records preserve choices that affect more than one workstream. Link them from the relevant stage rather than copying them into every document. A blueprint or design cannot silently override a governing requirement, specification, or decision.

## Scope and relationships

An Epic delivers one coherent product capability with independently observable acceptance. Normally, it has one blueprint. Split its blueprint into separate workstreams only when each has a clear owner and nonoverlapping responsibilities; state their dependencies and show how they cover the whole Epic. Split the Epic instead if the proposed capabilities can be accepted independently.

A blueprint can have several technical designs when the work has separately implementable slices. Each design links to exactly one parent blueprint and to its Epic. The blueprint links back to its designs and identifies which requirements they cover. Cross-workstream dependencies point to the responsible document rather than duplicating its design.

Use descriptive workstream names under `blueprints/` and `designs/`. A design slice adds a descriptive suffix to its workstream name. Milestone Epics remain under `epics/m2/`, `epics/m3/`, and later milestone directories. Add documents to the appropriate directory index and link them from their parent when they are created; do not create empty future designs to complete a list.

New capabilities and architectural changes use all four stages. A correction to already-designed behavior reuses and updates the existing documents instead of creating duplicate planning artifacts. Writing, research, and review-only work use the relevant writing guidance; they do not need a fictional implementation design.

## Epic format

Write for an engineer who knows the product but has not designed the subsystem. State what the capability does, including meaningful failure behavior, without choosing files, interfaces, algorithms, or a test harness.

Each Epic includes the following information. Use headings that fit the subject; completeness matters more than identical wording.

| Section | What the reader needs |
| --- | --- |
| Document context | Roadmap milestone, owner, governing specifications or decisions, and whether the proposed behavior is agreed or still under discussion. Keep delivery progress distinct from agreement on the requirement. |
| Outcome | The capability this Epic adds and what a caller, author, or operator can do or observe afterward. |
| Scope and behavior | What uses are supported, important states and interactions visible to the user, and the required outcomes when something fails. |
| Constraints and non-goals | Boundaries the implementation must preserve, what remains allowed within them, and work explicitly owned elsewhere. |
| Dependencies and decisions | Capabilities this work needs, the owner of each dependency, and unresolved choices that affect the requirement. |
| Acceptance criteria | Observable outcomes that distinguish successful delivery from partial or incorrect behavior. |
| Delivery documents | Links to the blueprint or blueprints and the scope each covers. Do not present unwritten or unreviewed designs as accepted work. |

Technical detail belongs in an Epic when it explains a user-visible distinction or a governing constraint. For example, sequential execution within one run is different from allowing several independent runs at once. Exact scheduler interfaces and controlled-concurrency test fixtures belong in the technical design.

A short scenario can clarify a requirement. The design supplies the concrete workflow, inputs, expected results, and commands that demonstrate it. The Epic introducing a behavior owns its focused verification; a later conformance Epic may combine the evidence without becoming a prerequisite for proving the original behavior.

### Epic-specific self-review

Use these checks with the [common self-review procedure](writing-style.md#self-review-procedure). Each applies to every Epic; where child documents do not exist yet, assess the identified scope and owner rather than requiring empty files.

| Criterion | Fails when | Correction and evidence needed |
| --- | --- | --- |
| Coherent capability | The reader can identify only a list of internal changes, or the Epic mixes independently acceptable capabilities. | State the product outcome or split the scope. Cite the outcome and the user behavior that demonstrates it. |
| Required behavior and limits | A supported use or meaningful failure has no observable outcome, or a limit unintentionally applies to other scopes. | Name the affected caller or use, required result, and boundary. Cite the behavior and its governing requirement. |
| Independent acceptance | Criteria say only that code, tests, or approval must exist, or defer all proof to a later conformance Epic. | State outcomes that could reveal an incorrect implementation and identify ownership of focused verification. Cite the acceptance criteria. |
| Dependencies and authority | A required capability or open decision has no owner, or a proposal is presented as agreed behavior. | Link the responsible source and name the decision, owner, and dependent work. Cite the dependency and status. |
| Blueprint handoff | The Epic prescribes file-level implementation instead of requirements, or its intended scope has no blueprint owner. | Move mechanisms to the appropriate design layer and identify the blueprint scope and owner. Cite the delivery-document section and any existing child links. |

## Review and handoff

Authors self-review the document before asking another person to rely on it. Apply the [common checks](writing-style.md) and the checks for its document level. Cite the sections that satisfy each applicable check; revise unclear or incomplete passages rather than marking them complete because a heading exists.

Each handoff states whether the document is ready, needs revision, or is blocked. Identify unresolved decisions and the work they prevent. A self-review result is not approval of an architectural choice and is not evidence that code works.

| Handoff | What must be established |
| --- | --- |
| Epic to blueprint | The intended capability, scope, acceptance criteria, and governing constraints are clear. Requirement decisions affecting the proposed work are agreed by the responsible owner. |
| Blueprint to technical design | Responsibilities, major interactions, approach, scope boundaries, and requirement coverage are explained and reviewed. Consequential architecture choices are agreed; tentative options are not treated as requirements. |
| Technical design to code | The design is grounded in the repository, covers affected contracts and callers, explains ownership and end-to-end behavior, and supplies meaningful implementation checkpoints and verification. Decisions required by the next checkpoint are resolved and the required reviews are complete. |
| Code to acceptance | The implementation has been exercised, the expected outcomes were observed, required reviews are complete, and the Epic's acceptance criteria are satisfied. Partial progress is not Epic completion. |

Public contracts, state transitions, persistence, concurrency, compatibility, and security boundaries need an appropriately skilled reviewer. Name the reviewer or responsible role in the design. Human approval is required where the owner or governing decision calls for it; never manufacture that approval from an author's self-review or an earlier plan's status.

Work on an independent design slice can proceed while an unrelated choice remains open. State the boundary explicitly. Do not start a checkpoint whose behavior depends on that unresolved choice.

If implementation reveals that the design cannot satisfy the blueprint, update and review the affected upstream decision before proceeding. A changed product outcome also requires updating the Epic. Keep the current direction clear instead of appending a contradictory alternative and leaving the implementer to choose.

## Checkpoints and implementation records

Execution tracking belongs in the technical design, not in a fourth planning document. A design can span several sessions and pull requests. Each checkpoint has one owner, leaves a runnable result, and states the work, observable outcome, verification, required review, and recovery information. The [technical design guide](technical-design-guide.md) defines the format.

Record actual progress, discoveries, decisions, and concise evidence beside the checkpoint they affect. Preserve the difference between a planned check and an observed result. Retain useful references to raw output or implementation pull requests rather than copying long logs into the design.

An independent implementation review checks the code against the Epic, blueprint, design, and governing contracts before human acceptance. Review is not a substitute for exercising the changed behavior. The implementing work owns its fixtures and focused checks even if another workstream owns shared conformance infrastructure.

## Document lifecycle

Create a blueprint when an Epic's scope is ready for technical planning. Create a design when its blueprint is sufficiently settled and the relevant repository state can be inspected. Do not prepopulate later milestones with speculative designs.

While work is active, maintain one current document for each scope. Keep its parent and child links, status, unresolved decisions, and coverage accurate. Distinguish the target behavior from what has actually shipped.

After the work is accepted, move lasting requirements, contracts, and decisions into their durable homes. Retire delivery-only blueprints and designs when no active work depends on them; update links before deleting them. Git history retains their execution record. Keep a still-needed design current rather than maintaining both an active copy and an archive copy.

## Resuming work from prior combined plans

The documents currently under `plans/` combine architectural direction, detailed design, and execution records. They are prior records, not an alternative format for new work. Their notices identify this boundary, and the [documentation index](README.md#prior-combined-plan-records) lists them separately.

Before resuming their implementation:

1. Read the Epic, current specifications and decisions, and the prior plan's decisions, evidence, and unresolved review findings.
2. Establish the relevant high-level blueprint under `blueprints/`. Separate agreed direction from open proposals and link the prior record where it supplies useful context.
3. Produce the technical design under `designs/` against the actual repository. Carry forward applicable constraints and unresolved findings, and re-evaluate earlier assumptions rather than declaring them current by copying them.
4. Complete the review and handoff requirements above before dependent implementation begins. Link the new documents from their parents and indices.

A renamed combined plan is not automatically both a reviewed blueprint and a technical design. Prior evidence remains evidence of the work it actually exercised; this format change neither accepts unfinished work nor changes product behavior.

## Historical task mapping

The earlier decomposition of local workflow execution used the mapping below. It remains a reference for older issues; it does not define a competing delivery process.

| Earlier work | Capability owner |
| --- | --- |
| E2-S2 and E2-05 | M2 Epic 1 |
| E2-S1, E2-03, E2-04, and the run-contract and sequential portions of E2-06, E2-07, E2-10, E2-11, and E2-12 | M2 Epic 2 |
| Conditional portions of E2-07, E2-11, and E2-12 | M2 Epic 3 |
| Parallel implementation portions of E2-08 | M2 Epic 4 |
| Loop implementation portions of E2-09 | M2 Epic 5 |
| Conformance and real-process demonstration portions of E2-08, E2-11, E2-12 | M2 Epic 6 |
| E2-01 | M2 Epic 2 prerequisite or maintenance pull request |
| E2-02 | Earlier methodology and documentation migration approval |

The [M2 overview](epics/m2/overview.md) and [M3 overview](epics/m3/overview.md) own the current milestone breakdown. The [documentation migration record](development-documentation-migration.md) records the move into the independent documentation repository.
