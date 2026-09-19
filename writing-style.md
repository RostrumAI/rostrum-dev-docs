# Writing and self-review

Write so the next reader can understand the work, make the relevant decision, and continue without reconstructing the author's reasoning. Lead with the outcome, explain who does what and why, and introduce mechanisms after the reader understands their purpose.

This guide applies to development documentation, including Epics, blueprints, technical designs, specifications, research, and setup guides. The [delivery methodology](epic-delivery-methodology.md) owns the delivery stages and review gates. The [high-level implementation guide](high-level-implementation-guide.md) and [technical design guide](technical-design-guide.md) supply the formats for those two artifacts; they are not templates for every document.

## Choose the level before writing

| Document | Reader's main question | Detail that belongs here |
| --- | --- | --- |
| Product requirement (Epic) | What capability do we need, and what should a user observe? | Product outcomes, scope, constraints, non-goals, and observable acceptance criteria. |
| High-level implementation blueprint | What must we build technically, and how do the parts fit together? | Current capabilities and gaps, responsibilities, architectural direction, interactions, important states, rationale, and present versus future scope. |
| Technical design | How will we implement and verify the blueprint in this repository? | Actual baseline, files and callers, contracts, state ownership, ordering, failure behavior, implementation checkpoints, and verification. |
| Code and verification evidence | Does the implemented system deliver the agreed behavior? | Working changes, meaningful tests, exercised scenarios, and observed results. |

A blueprint is not a paraphrase of the Epic. It explains the technical approach. A technical design expands that approach into implementable decisions rather than quietly choosing a different architecture. When the design exposes a necessary change to the blueprint or requirement, resolve it at the owning level and update the links before dependent work proceeds.

Other documents have their own purposes. A specification may need exhaustive normative cases; a research note may compare unresolved alternatives; a setup guide may lead with commands. Apply the common voice and review procedure without forcing these documents into delivery-artifact headings.

For an Epic, use the methodology's [Epic format](epic-delivery-methodology.md#epic-format) and [Epic-specific self-review](epic-delivery-methodology.md#epic-specific-self-review). The blueprint and technical-design guides provide the corresponding checks for those stages.

## Explain the system before its representation

Start with what works today, what is missing, and what the proposed work makes possible. Support current-state claims with relevant repository or specification references. Do not use a metaphor or compressed slogan in place of that starting point.

Introduce each component by its responsibility and the participants it works with. Explain the reason for separating responsibilities before listing records, fields, methods, or algorithms. A file inventory helps an implementer find code, but it does not explain how the system works.

Lead the reader through related behavior. Define a state where it first matters; then explain what changes it and what that change enables. For an interaction, identify the trigger, the participant acting on it, the information passed, and the consequence for the next participant or caller. Include ordering and failure behavior where they change the outcome.

Use causal, collaborative language. “We need…” can introduce a shared goal, while “the controller validates…” assigns a concrete responsibility. Prefer “because,” “when,” and “so that” to unexplained assertions. A real prohibition is useful when its subject, scope, and prevented consequence are clear.

## Preserve distinctions that affect meaning

Name the subject of each rule. A limit on one deployment is not automatically a limit on each run; a workflow definition is not the same thing as a particular execution. Replace ambiguous pronouns and shorthand with the relevant participant or domain term.

Use terminology from governing specifications and decisions. Define unfamiliar terms on first use and link detailed rules instead of reproducing them in several places. If two sources disagree, identify the conflict and its owner rather than smoothing it over with new vocabulary.

Distinguish these kinds of claims where they occur:

- **Existing behavior:** what the inspected baseline does, with a source and relevant baseline reference. Source inspection establishes an implementation fact, not proof that a runtime scenario passed.
- **Agreed direction:** a requirement or decision established by its governing source. Cite that source; do not imply that the behavior is already implemented.
- **Proposal or open decision:** an option still requiring judgment. Name the decision owner, the unresolved question, and the work that depends on the answer.
- **Future motivation:** a later capability that explains a boundary today. State the current limitation beside it so the motivation does not silently become delivery scope.

An illustrative name or technology is not an approved interface or dependency. Label hypothetical examples and state the assumptions they need. Examples in writing guidance do not establish Rostrum architecture or settle runtime behavior.

## Spend detail where it helps

Give each section one coherent subject and order sections so earlier explanations supply concepts needed later. Use paragraphs for reasoning and interactions, bullets for independent items, tables for comparable facts, and numbered lists for actual sequences. Do not split every statement into its own rule.

Keep technical detail when it resolves a decision at the document's level. Move detail that belongs elsewhere and link to its owner. Do not remove the explanation of a consequence merely to shorten the document.

Use a small example when a rule would otherwise be hard to understand. Give the setup, the event that creates a problem, and the intended outcome, then return to the general rule. Avoid catalogs of invented scenarios. Use code only when a short fragment explains an ambiguity more clearly than prose; a diagram should expose a genuine interaction or ownership relationship.

Describe edge cases through conditions and consequences. Explain what cannot proceed, what the caller can observe, and which decision remains open. A possible timeout, retry, queue, or health check is not the required outcome merely because it might address the problem.

Remove filler, promotional language, vague appeals to authority, and narration of document editing. Correct mismatched counts, typos, undefined references, and overloaded terms. “Etc.” can signal representative examples, but cannot close a contract that implementers need to rely on.

## Self-review procedure

Self-review is an evidence-based check of a document's fitness for its next reader. It is not human approval, an independent review, or proof that implementation ran successfully. Keep the review in the artifact being reviewed; do not create a separate planning artifact just to hold a checklist. For documents without a review section, a concise review record in the handoff or pull request is sufficient.

1. **Establish the review boundary.** Identify the document, its purpose and audience, its revision or baseline, and the intended next action. Read its governing sources and the relevant specialized guide. For a resumed artifact, recheck the repository baseline and identify which prior decisions and evidence still apply.
2. **Apply the criteria below and the stage-specific criteria.** For each criterion, record whether it applies. Mark an inapplicable criterion explicitly as `not applicable` with a reason tied to this scope; do not silently omit it. This is an applicability judgment, not a fourth review outcome.
3. **Record evidence and an outcome for each applicable criterion.** Cite the document section containing the explanation and, where needed, the source, caller, scenario, or recorded result that supports it. Use `pass` when the evidence meets the criterion, `revise` when the author can correct a defect, and `blocked` when an unresolved decision or unavailable prerequisite prevents a sound answer. A checkmark or “looks good” is not evidence.
4. **Make the correction concrete.** For `revise`, identify the missing or misleading passage and the intended correction. For `blocked`, name the missing answer or evidence, its owner, and the dependent work that must wait. Continue independent work where the boundary is clear.
5. **Revise and rerun.** Reapply each failed check after editing and revisit related criteria affected by the change. Replace stale conclusions with evidence from the revised document. Do not leave an earlier pass in place when its supporting section changed meaning.
6. **State the handoff.** Report `ready` only when every applicable criterion passes and no unresolved decision blocks the intended next action. Otherwise report `revise`, or `blocked` when progress depends on an unresolved prerequisite. List unresolved decisions even when they do not block that next action, with owners and resolution points. Follow the methodology's separate review gates.

A compact review record is enough:

| Criterion | Applicability | Evidence | Outcome and next action |
| --- | --- | --- | --- |
| Interaction explanation | Applicable | “Completion flow” names the producer, receiver, and caller-visible result; “Failure outcomes” covers rejected input. | Pass. |
| Scope boundary | Applicable | “Future work” mentions multiple workers, but “Current scope” never says whether they are included. | Revise: state the present worker boundary and update the coverage section. |
| Concurrent updates | Not applicable: this document only corrects terminology and changes no behavior. | Scope section and unchanged governing contract. | No outcome required. |

These rows illustrate the record, not results for a real artifact. Evidence must come from the document under review. A section citation should point to an explanation that answers the check, not merely a heading with the right name.

## Common review criteria

Use the failure condition to diagnose a draft, then make the indicated correction. Add stage-specific checks from the appropriate guide rather than copying the entire common guide into each artifact.

| Criterion and applicability | Fails when | Correction and evidence needed |
| --- | --- | --- |
| **Purpose and starting point — all documents.** | The introduction starts with machinery or a slogan, and the reader cannot identify the outcome or question. | State the purpose, audience, and relevant starting point. Cite the introduction and the sources supporting baseline claims. |
| **Appropriate level — all documents.** | An overview requires reconstruction from implementation detail, or a design delegates a consequential mechanism without naming the blocked work. | Move misplaced detail to its owning artifact; add the missing explanation or decision boundary. Cite both the passage and the linked owner. |
| **Responsibilities and interactions — documents explaining a system or process.** | Names, fields, or rules are listed without saying who acts, what triggers the action, or what the next participant receives. | Walk through the flow in prose and state the reason for each important separation. Cite that flow and the ownership explanation. |
| **Precise scope and terminology — all documents.** | A rule has an ambiguous subject, terms conflict with governing sources, or a restriction unintentionally includes other scopes. | Name the subject, define the boundary, and reconcile terminology against the governing source. Cite the corrected passage and source. |
| **Status and authority — all documents.** | Existing behavior, requirements, proposals, and future work are indistinguishable, or an example is treated as an approved choice. | Label the claims, supply their sources, and assign owners to unresolved decisions. Cite the baseline, decision, or scope section as applicable. |
| **Reasons and consequences — documents proposing or constraining behavior.** | A choice is stated without its purpose, or failure is described only as “invalid” or “handle errors.” | Explain the constraint and observable consequence, including who detects or reports the problem at the appropriate level. Cite the choice and outcome. |
| **Examples and presentation — all documents.** | An example adds scope, a code sketch obscures the explanation, or repetition and shorthand make the reader infer the meaning. | Remove or narrow the example, make its assumptions explicit, and organize the explanation around coherent subjects. Cite the revised passage; mark the example-specific part inapplicable if there are no examples. |
| **Evidence and handoff — all documents.** | Readiness relies on assertions of approval or execution without a source, stale evidence is presented as current, or failed checks have no owner and next action. | Separate document readiness from review and runtime results, attach the relevant evidence, and state the remaining action. Cite the review record and any actual verification record. |

The aim is not a score. A single missing interaction or unsupported decision can block an otherwise polished document; many concise sections can fully explain a small change. Review the meaning and consequences, not the number of headings or words.
