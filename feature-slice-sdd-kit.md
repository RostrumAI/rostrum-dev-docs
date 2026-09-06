# Feature-slice Spec-Driven Development kit

Status: Proposed for review

Audience: Product owner, engineering leads, developers, and coding agents

Decision requested: Approve an OpenSpec pilot for Rostrum feature slices, using `rostrum-dev-docs` as an external store and a checkpoint-oriented task convention.

This document recommends a Spec-Driven Development (SDD) kit for the feature slices inside a Rostrum mission. It does not replace the roadmap, Epic, mission plan, GitHub Project, or code review process.

## Decision

Use [OpenSpec](https://github.com/Fission-AI/OpenSpec) for feature-level specifications and implementation plans. Configure `rostrum-dev-docs` as an OpenSpec store so generated planning artifacts remain outside the product repository.

Start with the built-in `spec-driven` schema and customize its rules and templates conservatively. Do not fork the schema until the pilot shows that configuration rules cannot express the required checkpoint structure.

Use OpenSpec for feature slices, not entire Epics. The mission plan remains the parent execution document and links several OpenSpec changes into one checkpoint graph.

## Why OpenSpec fits this repository split

OpenSpec provides the following capabilities needed for Rostrum:

- A change-oriented workflow with proposal, requirement delta, design, task, verification, and archive stages.
- Plain Markdown artifacts that humans and coding agents can inspect.
- Store-only operation, where specifications and changes live in a separate repository.
- A change folder that can correspond to one feature slice, issue, and code pull request.
- Requirement scenarios that give an independent verifier a behavioral contract.
- Custom project rules and custom schemas when the built-in workflow needs adaptation.
- A supported archive step that separates active changes from the accumulated product specification.

OpenSpec documents Stores and Worksets as beta, and it describes schema commands as experimental. Rostrum should therefore pilot the workflow on one Epic 2 slice before making it the only accepted development path. The underlying artifacts are ordinary Markdown and Git commits, so leaving the tool does not trap the specifications.

## Alternatives considered

| Option | Strength | Limitation for Rostrum | Decision |
| --- | --- | --- | --- |
| OpenSpec | Direct store-only model, change deltas, verification, archive lifecycle, and multi-repository planning | Store and workset features are beta | Pilot and adopt if exit criteria pass |
| [GitHub Spec Kit](https://github.com/github/spec-kit) | Mature specify, plan, tasks, implement, and converge workflow; tasks group independent user stories into checkpoints | Its normal feature directory lives with the project, so external storage and cross-repository execution require a local convention | Keep as the fallback and a source for task-organization ideas |
| [OpenAI ExecPlans](https://developers.openai.com/cookbook/articles/codex_exec_plans) | Strong living plan, milestone, recovery, decision-log, and evidence discipline | It is a planning format, not a complete SDD lifecycle or artifact manager | Use its ideas in mission plans and checkpoint sections |
| GitHub Issue templates only | Low setup cost and native assignment | Weak revision review, document coherence, and implementation verification | Use for operational state, not canonical slice specifications |

Spec Kit is a credible alternative if OpenSpec's store workflow proves unreliable. Its task template already organizes work by independently testable user stories and explicit checkpoints, and its converge command compares code with the specification, plan, and tasks. The main cost is building and maintaining the external-artifact bridge that OpenSpec already supplies.

## Scope of one OpenSpec change

One OpenSpec change represents one feature slice. A slice should be small enough to implement and verify in one coherent code pull request, but large enough to produce observable behavior.

A slice must have:

- One user or system outcome.
- A named parent mission and checkpoint.
- One stable product, service, command, or package boundary through which acceptance is observed.
- Requirements and failure scenarios.
- A design that resolves implementation choices before mutation begins.
- Checkpointed tasks with exact evidence and escalation rules.
- One code pull request unless the plan explicitly defines several independently mergeable pull requests.

Do not create an OpenSpec change for each internal layer. For example, "add a run table" is normally a task inside a durable-run slice. "An accepted run survives daemon restart and remains inspectable" is a valid slice outcome.

## Relationship to missions and GitHub

Use this mapping:

| Rostrum unit | OpenSpec or GitHub representation |
| --- | --- |
| Epic | Durable roadmap document |
| Mission | Mission issue and living execution plan |
| Decision gate | Gate issue and approved decision record |
| Checkpoint | Mission-plan section and Project field |
| Feature slice | OpenSpec change, slice issue, and code pull request |
| Implementation task | Entry in the change's `tasks.md` |

The issue owns status, assignment, dependency, and discussion. The OpenSpec change owns the proposal, normative requirement changes, design, and temporary task plan. The code pull request owns the implementation diff and verification checks.

Do not copy the same requirement text into all three places. The issue links to the approved OpenSpec commit. The pull request links to the issue and change path.

OpenSpec change metadata supports an `initiative` field that can record a parent mission. OpenSpec documentation states that no command enforces that link, so GitHub sub-issues and Project fields remain the operational parent relationship.

## External store layout

Use `rostrum-dev-docs` as a store-only OpenSpec repository. The planned layout is:

```text
rostrum-dev-docs/
  openspec/
    config.yaml
    schemas/
    specs/
      workflow-authoring/
      local-execution/
      durable-runs/
    changes/
      <active-feature-slice>/
```

The `specs/` directory describes the product behavior that has shipped or has been approved as the active contract. The `changes/` directory contains proposed deltas and their implementation artifacts.

Register the store on each contributor's machine. For automation and agent prompts, name the store explicitly rather than relying on whichever store happens to be the machine default. An agent working in `rostrum` must have read access to the store checkout and write access only when its assignment includes specification changes.

The OpenSpec Workset feature can open the store and product repository in one editor workspace. Do not make it a hard dependency during the pilot. Its documented terminal openers for Codex and Claude Code are disabled while that workflow is being reworked. A normal multi-root editor workspace or a harness configuration that exposes both sibling repositories is sufficient.

## Artifact contract

The built-in `spec-driven` schema creates four artifacts. Rostrum should assign each a narrow role.

### `proposal.md`

The proposal defines:

- Parent mission, checkpoint, and GitHub issue.
- Outcome and motivation.
- Included and excluded behavior.
- Affected product capabilities.
- Risk class and required reviewer class.
- Dependencies and decision gates.

Keep the proposal short. It is the decision to spend effort, not the full implementation plan.

### `specs/`

The specification delta defines normative behavior. Each requirement needs scenarios with concrete inputs, events, and observable results. Cover success, rejection, and failure when each is part of the contract.

A requirement should not prescribe an internal module unless that module is itself a published contract. Implementation details belong in `design.md`.

### `design.md`

The design defines:

- Relevant repository orientation.
- Interfaces and state transitions.
- Data ownership and process boundaries.
- Alternatives and the selected approach.
- Compatibility and migration behavior.
- Concurrency, persistence, security, and failure considerations.
- Expected files and modules.
- Decisions that require human approval.

A slice cannot enter implementation while its design leaves a required architecture decision to the implementer.

### `tasks.md`

The task plan groups work by checkpoint rather than by technical layer. Each checkpoint must leave the repository runnable and independently verifiable.

Use this shape:

```markdown
## CP1: <observable intermediate outcome>

Outcome: <behavior that works after this checkpoint>

Owner: <person or agent>

Required verifier: machine | guided-human | domain-owner | specialist

Human approval required: yes | no

Acceptance:

- Run `<command>` from `<working directory>`.
- Exercise `<scenario>`.
- Observe `<specific result>`.

Escalate if:

- <condition the implementer must not resolve alone>

Recovery state:

- <files, state, and next safe action another contributor needs>

Tasks:

- [ ] <concrete implementation task with affected paths>
- [ ] <verification task that exercises the changed boundary>
- [ ] Record evidence and update recovery state.
```

A task is not a checkpoint. Several tasks may contribute to one checkpoint. Check off a checkpoint only after its behavior and evidence pass, not when the last source edit is made.

## Recommended OpenSpec configuration

Keep permanent injected context short. The agent should learn repository facts by reading the repository rather than receiving a large standing prompt.

Use configuration rules with this intent:

```yaml
schema: spec-driven

context: |
  Rostrum feature changes belong to one mission checkpoint.
  The product repository contains executable truth. Planning artifacts live in this store.
  Resolve ambiguity in the proposal or design before implementation.

rules:
  proposal:
    - Name the parent mission, checkpoint, GitHub issue, risk class, and required reviewer.
    - State included and excluded behavior.
  specs:
    - Define observable success, rejection, and failure scenarios where applicable.
    - Do not encode incidental implementation details as requirements.
  design:
    - Identify shared interfaces, state transitions, compatibility effects, and escalation decisions.
  tasks:
    - Group tasks into independently verifiable checkpoints.
    - Give every checkpoint acceptance commands, expected evidence, reviewer class, escalation conditions, and recovery state.
    - Keep the repository runnable at every completed checkpoint.

operations:
  apply:
    guidance:
      - Implement only the requested checkpoint when the invocation limits scope.
      - Stop and escalate when a listed escalation condition occurs.
      - Record verification evidence before marking a checkpoint complete.
```

Validate the exact configuration against the pinned OpenSpec version during setup. OpenSpec adds these rules to its built-in instructions; they do not replace the built-in artifact guidance.

## Slice workflow

Use the following lifecycle for each feature slice.

1. Create the slice issue under its mission and assign its target checkpoint.
2. Explore the code and unresolved requirements without creating implementation artifacts.
3. Create the OpenSpec change in `rostrum-dev-docs` and link the change path from the issue.
4. Review the proposal, specification delta, and design. Close any human decision gate before approving implementation.
5. Pin the approved development-documentation commit in the issue and implementation prompt.
6. Apply one checkpoint at a time when the slice is large enough to risk context loss. Update `tasks.md`, evidence, and recovery state after each checkpoint.
7. Run an independent verification pass against the specification before requesting the required human review.
8. Merge the code pull request only when the slice acceptance scenarios pass through the stated boundary.
9. Sync and archive the OpenSpec change after the code ships. Update the mission checkpoint and issue.

OpenSpec's quick path can generate all artifacts at once for a straightforward slice. Use its incremental artifact flow when the requirements or design need separate review.

## Review policy

Use review effort where judgment matters.

Machine-only completion is acceptable when the contract is stable, the change is isolated, all acceptance scenarios are deterministic, an independent agent finds no unresolved issue, and the Project classifies the slice as low risk.

Guided human review is acceptable for a junior developer when the change follows a reviewed reference pattern and the checklist does not require architecture judgment.

Domain-owner review is required for:

- Public API or schema changes.
- New state transitions.
- Persistence and recovery semantics.
- Concurrency and ordering behavior.
- Cross-package ownership changes.
- Compatibility decisions.
- Deviations from an approved design.

Specialist review is required for security boundaries, destructive migrations, authentication, cryptography, secrets, or regulated data.

## Specification persistence

Use a living-spec model for shipped capability behavior and a temporary model for execution artifacts.

- Keep approved capability specifications under `openspec/specs/` and revise them through explicit change deltas.
- Keep active proposals, designs, and task plans under `openspec/changes/`.
- Archive a completed change after its implementation merges and verification passes.
- Do not treat archived `tasks.md` as current product documentation.
- Remove bulky evidence from the documentation repository after its retention period when CI or object storage has the authoritative copy.
- Preserve durable rationale in a decision record only when future maintainers need it to avoid reopening the same choice.

Git history and linked pull requests preserve prior planning revisions. The active tree should contain current capability specifications and active work, not every transient execution transcript.

## Pilot

Pilot OpenSpec with the Epic 2 thin execution path. The pilot should include an external store, one change folder, one slice issue, one code pull request, at least two implementation checkpoints, and an independent verification pass.

Adopt OpenSpec when the pilot proves that:

- An agent can load the approved change and product code without manual copying.
- The product repository receives no generated specification or task files.
- A junior developer can identify the current checkpoint, acceptance, and escalation conditions without reading chat history.
- A second verifier can compare the implementation with the normative scenarios.
- Store commits and code commits remain clearly linked.
- Archive removes the completed change from active work without losing the shipped capability specification.

Reject or pause the adoption when:

- Store selection is unreliable in the tools the team uses.
- Agents write artifacts into the product repository unexpectedly.
- The beta store workflow causes repeated manual repair.
- The generated artifact set costs more review time than it saves.
- The custom rules fail to produce checkpointed, independently verifiable tasks.

If the pilot fails on storage integration rather than SDD quality, use GitHub Spec Kit in `rostrum-dev-docs` and pass its approved feature directory to implementation agents explicitly.

## Sources

- [OpenSpec repository and workflow](https://github.com/Fission-AI/OpenSpec)
- [OpenSpec Stores](https://github.com/Fission-AI/OpenSpec/blob/main/docs-lab/multi-repo/stores.md)
- [OpenSpec Worksets](https://github.com/Fission-AI/OpenSpec/blob/main/docs-lab/multi-repo/worksets.md)
- [OpenSpec schema customization](https://github.com/Fission-AI/OpenSpec/blob/main/docs-lab/customize/schemas.md)
- [GitHub Spec Kit](https://github.com/github/spec-kit)
- [Spec Kit complex-feature guidance](https://github.com/github/spec-kit/blob/main/docs/concepts/complex-features.md)
- [Spec Kit persistence models](https://github.com/github/spec-kit/blob/main/docs/concepts/spec-persistence.md)
- [OpenAI ExecPlans](https://developers.openai.com/cookbook/articles/codex_exec_plans)
