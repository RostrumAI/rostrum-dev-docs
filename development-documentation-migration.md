# Development documentation migration

Status: Proposed for review

Audience: Repository administrators, product owner, engineering leads, developers, and coding agents

Decision requested: Approve the ownership boundary, GitHub Project model, issue conversion policy, history-preserving transfer, and product-repository cleanup before moving files.

This plan moves development planning and long-form product documentation from `RostrumAI/rostrum` to `RostrumAI/rostrum-dev-docs`. GitHub Projects and Issues become the source of operational work state. The product repository retains executable contracts and the minimum contributor material required to build and maintain the code.

## Target ownership model

Use one source of truth for each kind of information.

| Information | Source of truth |
| --- | --- |
| Product strategy and roadmap | `rostrum-dev-docs` |
| Epic outcomes and boundaries | `rostrum-dev-docs` |
| Active mission execution plan | `rostrum-dev-docs` |
| Approved architecture and product decisions | `rostrum-dev-docs` |
| Feature specifications and OpenSpec changes | `rostrum-dev-docs` |
| Work status, assignment, priority, and blockers | GitHub Project |
| Mission, gate, checkpoint, and slice discussion | GitHub Issues |
| Implementation diff and code review | Pull request in the affected code repository |
| Raw build, test, trace, and screenshot evidence | Continuous integration or artifact storage |
| Source code, migrations, generated runtime schemas, and executable fixtures | `rostrum` |
| Public package or API contract distributed with code | `rostrum` or its release artifact |

Do not maintain mirrored task status in Markdown and GitHub. Do not copy complete specifications into issue bodies. Issues link to approved documents; documents link to issues when operational context is useful.

## Current inventory

The product repository contains 67 tracked files under `docs/`:

| Category | Files | Proposed destination or treatment |
| --- | ---: | --- |
| Documentation index | 1 | Replace with an index in `rostrum-dev-docs` |
| Strategy | 2 | Move to `strategy/` |
| Epics | 3 | Move to `roadmap/epics/`, then revise to the new Epic contract |
| Decisions | 6 | Move to `decisions/` |
| Research | 7 | Move to `research/`, including the source PDF |
| Results | 3 | Move durable summaries to `evidence/`; keep raw repeatable proof in code or CI |
| Specifications | 2 | Apply the specification decision below |
| Tasks | 43 | Archive historical work or convert active work to issues and OpenSpec changes |

The repository also contains 21 tracked agent and writing-guidance files:

- One root `AGENTS.md`.
- Eighteen files under `agent-guides/`.
- Two files under `.agents/skills/fix-writing/`.

The existing `AGENTS.md` points to `skills/technical-writing-core/SKILL.md`, which is not present. Do not copy this router unchanged. The destination must contain a valid guidance entry point before the source guidance is removed.

No references to `docs/` or Epic task identifiers were found in the tracked `apps/`, `packages/`, or `scripts/` paths during preparation of this plan. Recheck immediately before the cleanup pull request because code can change during the migration.

## Product-repository boundary

Moving documentation does not mean making the product repository unable to explain or verify itself.

Keep these items in `rostrum`:

- Source code and code comments that state current invariants.
- Database migrations.
- Tests and executable fixtures.
- Generated runtime contracts required by builds, packages, clients, or releases.
- Root repository setup and contribution instructions needed before external context can load.
- Security and licensing files required at repository level.
- Small package-level references required to use a published package correctly.

Move these items to `rostrum-dev-docs`:

- Strategy, roadmap, and Epic planning.
- Research and option analysis.
- Mission plans and feature specifications.
- Decision rationale.
- Temporary task plans.
- Proof summaries and review reports that do not participate in builds.
- Agent methodology and writing guidance, subject to the bootstrap decision.

### Workflow specification decision

`docs/specs/workflow-interface-v1.md` is a human-readable product specification and should move to `rostrum-dev-docs/product-specs/`.

`docs/specs/workflow-interface-v1.schema.json` is emitted from `packages/workflow/src/schema.ts`. Before removing it from the product repository, decide whether any package, client, release process, or external user consumes that exact file path.

Use one of these outcomes:

1. If the schema is a distributed code artifact, relocate it under the owning package or generate it during packaging. Keep it in `rostrum`.
2. If it exists only to support the Markdown specification, move a generated copy to `rostrum-dev-docs` and treat the TypeBox source as authoritative.
3. If neither repository needs a committed generated copy, remove it and add a documented generation command where the package is built.

Do not make the development-documentation repository the runtime source of a schema consumed by application code.

## Destination structure

Use the following initial structure:

```text
rostrum-dev-docs/
  strategy/
  roadmap/
    epics/
  missions/
    active/
    closed/
  decisions/
    epic-01/
    epic-02/
  product-specs/
  research/
    source/
  evidence/
    epic-01/
    epic-02/
  archive/
    legacy-tasks/
  guidance/
    technical-writing/
  openspec/
    config.yaml
    specs/
    changes/
```

Keep the structure shallow. Do not create a directory for every GitHub issue. OpenSpec change directories are the only normal per-slice document folders.

The three methodology proposals in the repository root may move under `methodology/` after review. Keeping them at the root during review makes the initial decisions easy to find.

## GitHub Project design

Create one organization Project for Rostrum product delivery. Use repository filters and views rather than a separate Project per Epic.

### Fields

Configure these fields:

| Field | Values or format | Purpose |
| --- | --- | --- |
| Status | Backlog, Decision needed, Ready, In progress, Verification, Blocked, Done | Operational state |
| Work type | Mission, Gate, Checkpoint, Slice, Maintenance, Defect | Distinguishes planning units |
| Parent mission | Mission issue or stable text identifier | Groups work under one Epic delivery mission |
| Checkpoint | Gate or checkpoint identifier | Shows the repository state the work contributes to |
| Product area | Workflow authoring, execution, durability, tools, models, context, clients, integrations, cloud | Enables ownership and roadmap views |
| Risk | Low, Medium, High, Critical | Determines review policy |
| Required verifier | Machine, Guided human, Domain owner, Specialist | Prevents review by an unqualified approver |
| Integration owner | GitHub user | Names the person responsible for shared boundaries |
| Target repository | `rostrum`, `rostrum-dev-docs`, or another Rostrum repository | Routes pull requests and automation |
| Blocked reason | Short text | Makes external dependencies visible |

Use GitHub's assignee for the current work owner. Do not duplicate the assignee in Markdown status tables.

### Views

Create these views:

- Roadmap: missions grouped by Epic or product milestone.
- Active mission: gates, checkpoints, and slices grouped by checkpoint.
- Decision queue: open gates in `Decision needed`.
- Review queue: items in `Verification`, grouped by required verifier.
- Junior queue: ready or in-progress low-risk and guided-human slices.
- Blocked work: items with blocked status and reason.

## Issue model

Use one issue per mission, decision gate, checkpoint that needs coordination, feature slice, maintenance change, or defect. Do not create issues for every implementation step.

### Mission issue

A mission issue contains:

- Epic outcome.
- Integration owner.
- Link to the mission plan at an approved commit.
- Open decision gates.
- Checkpoint list.
- Child slice issues.
- Exit proof.

### Gate issue

A gate issue contains:

- The exact decision required.
- Decision owner.
- Options or linked research.
- Deadline or blocking relationship when one exists.
- Approval record and linked decision document.

Only the designated decision owner or accepted review policy closes the gate.

### Slice issue

A slice issue contains:

- Observable outcome.
- Parent mission and checkpoint.
- Link to the approved OpenSpec change commit and path.
- Owner and integration owner.
- Risk and required verifier.
- Dependencies.
- Acceptance summary.
- Code pull request and evidence links.

Keep issue comments as discussion. Agents must not treat every comment as authoritative instruction. The approved issue body and pinned specification revision are the allowed instruction sources.

## Conversion policy for existing work

### Epic 1

Epic 1 is historical delivery work.

- Create one closed Epic 1 mission issue with links to the outcome document, approved decisions, specification, proof summaries, and relevant merged pull requests.
- Do not create fourteen closed issues to reproduce every completed or closed task.
- Move the legacy Epic 1 task documents into `archive/legacy-tasks/epic-01/` during the initial history-preserving transfer.
- After the team confirms that issue, decision, and code history provide enough traceability, delete the archived task files from the active tree. Git history will retain them.
- Create one open feature-slice issue for the unfinished authoring lifecycle integration test. Name it by outcome rather than retaining `E2-13` as an Epic 2 task.
- Leave authoring guidance attached to the later authoring milestone rather than opening an implementation issue now.

### Epic 2

Epic 2 becomes the first active checkpointed mission.

Create:

- One mission issue for local workflow execution.
- One decision-gate issue for approval of local execution semantics.
- One decision-gate issue for local daemon transport.
- One maintenance slice for workflow interface terminology.
- One contract slice for the executable workflow and handler contract.
- One thin vertical slice for sequential execution through the real Control API and daemon boundary.
- One conditional-execution slice.
- One parallel-path and join slice.
- One bounded-loop slice.
- One exit-convergence issue for conformance and the complete separate-process proof.

Close E2-02 as superseded when this migration policy and Project configuration are approved. Do not create another issue whose only purpose is to decide where issues live.

The mapping and checkpoint acceptance are defined in [Epic delivery methodology](epic-delivery-methodology.md).

### Epic 3

Create one backlog mission issue for durable runs and human control. Link the current Epic document, but do not create all proposed decision and implementation issues.

Open Epic 3 gates and feature slices only after the Epic 2 exit contract is stable. At that point, rewrite the active mission from current repository behavior and approved interfaces rather than mechanically copying the old task list.

### Epics 4 through 13

Keep these as rows in the product roadmap until they are close enough to delivery for a mission owner to validate their boundaries. The present product plan links to Epic documents that do not exist for Epics 4 through 13. Fix those links during migration by linking to milestone anchors or by removing file links until an Epic document is created.

Do not generate placeholder Epic files or speculative issue trees solely to satisfy those links.

## Agent and writing guidance migration

Choose the external context-loading mechanism before removing `AGENTS.md`, `agent-guides/`, or `.agents/` from the product repository.

The selected mechanism must:

- Load approved guidance before an agent edits code or documentation.
- Pin or identify the guidance revision used for a run.
- Work for both developers.
- Work in continuous integration where guidance affects an automated check.
- Fail clearly when the external repository is unavailable.
- Prevent arbitrary issue comments or unreviewed branches from becoming instructions.

Preferred model:

1. Store reusable guidance under `rostrum-dev-docs/guidance/`.
2. Keep a versioned external harness profile or workspace configuration that names the repository and approved revision.
3. Make the `rostrum-dev-docs` checkout available read-only to ordinary code agents.
4. Grant write access only to work that explicitly changes documentation or methodology.
5. Keep at most a minimal bootstrap file in `rostrum` if the harness cannot discover external guidance reliably.

A zero-file bootstrap makes agent behavior depend on each developer's machine configuration. Accept that trade-off only if the external profile is centrally managed and its absence causes a hard failure rather than silently running without project rules.

The `fix-writing` skill is designed for existing-document rewrites and requires per-file worker agents. Preserve those semantics if the skill moves. Repair the missing `technical-writing-core` entry point before making the new guidance authoritative.

## Preserve history

The destination repository is empty, so the migration can retain source history instead of copying only the latest files.

Perform the history transfer in a disposable clone of `rostrum`. Do not run history-rewriting tools in a working product checkout.

Recommended approach:

1. Clone `rostrum` into a temporary migration directory.
2. Use `git filter-repo` in that disposable clone to retain `docs/`, `AGENTS.md`, `agent-guides/`, and `.agents/`.
3. Optionally lift `docs/` contents to the destination root with a path rename.
4. Inspect the rewritten commits for secrets, generated files, and unwanted large artifacts.
5. Point the disposable clone at `RostrumAI/rostrum-dev-docs` and push the rewritten history.
6. Reorganize the destination tree in ordinary follow-up commits.

Because `git filter-repo` rewrites commit identifiers, links to old source-repository commits must continue to use the original `rostrum` commit. Links to migrated document history use the new repository commit.

Do not force-push after collaborators begin writing to `rostrum-dev-docs`. If the repository receives commits before history migration, either merge the histories deliberately or accept a snapshot migration rather than overwriting their work.

## Migration phases

### Phase 1: Approve the operating model

1. Review the three methodology documents.
2. Approve the Epic hierarchy and Epic 2 checkpoint graph.
3. Approve OpenSpec for a pilot or select the fallback.
4. Approve the product-repository boundary and guidance bootstrap policy.
5. Name the Project administrator and Epic 2 integration owner.

Exit condition: The migration no longer depends on unresolved ownership or tooling decisions.

### Phase 2: Establish the destination

1. Transfer the selected history into `rostrum-dev-docs`.
2. Create the destination directory structure.
3. Repair internal relative links after files move.
4. Add link checking and Markdown checking for the new repository.
5. Repair the broken writing-guidance entry point.
6. Configure branch protection and code owners for strategy, decisions, specifications, and guidance.

Exit condition: Every moved document is readable in the destination and all internal links resolve.

### Phase 3: Create GitHub orchestration

1. Create the organization Project and fields.
2. Add the roadmap, active mission, decision, review, junior, and blocked views.
3. Create issue forms for missions, gates, and slices.
4. Create the closed Epic 1 mission issue.
5. Create the Epic 1 hardening slice.
6. Create the Epic 2 mission, gates, slices, and checkpoint items.
7. Create only the backlog Epic 3 mission issue.
8. Link each issue to the canonical development-documentation commit and path.

Exit condition: GitHub contains the complete active state without reproducing historical task noise.

### Phase 4: Pilot feature-slice SDD

1. Configure `rostrum-dev-docs` as the OpenSpec store.
2. Create the Epic 2 thin-execution change.
3. Link it to its issue and checkpoint.
4. Execute at least two checkpoints from the product repository while reading the external store.
5. Run independent verification and the required human review.
6. Archive the change after the code merges.

Exit condition: The pilot satisfies the criteria in [Feature-slice Spec-Driven Development kit](feature-slice-sdd-kit.md).

### Phase 5: Cut over the product repository

1. Freeze edits to the old documentation paths.
2. Recheck source, tests, scripts, workflows, and package documentation for links to removed paths and task IDs.
3. Resolve the generated workflow-schema location.
4. Update repository, pull-request, and issue links to the new canonical locations.
5. Activate the external agent-guidance loader.
6. Remove the migrated planning documents and heavy guidance files from `rostrum` in one cleanup pull request.
7. Retain a minimal bootstrap only if the approved loading model requires it.
8. Run the product checks and the new documentation link checks.

Exit condition: No active document has two sources of truth, and a clean product checkout can build and test without the development-documentation repository.

### Phase 6: Close the migration

1. Close E2-02 as superseded by the adopted system.
2. Mark old Markdown tasks as archived and non-authoritative.
3. Confirm that Project views show the expected owner, checkpoint, risk, and review class.
4. Confirm that an agent can start from an issue and pinned OpenSpec revision without chat history.
5. Record the final migration decision and remove temporary migration instructions from active work.

Exit condition: Contributors use GitHub for operational state, `rostrum-dev-docs` for long-form development artifacts, and `rostrum` for executable product truth.

## Link policy after cutover

Use relative links between documents in `rostrum-dev-docs`.

When a development document links to code:

- Use a repository path in code font when the exact line may move.
- Use a GitHub permalink to a commit when evidence depends on exact content.
- Use a link to the default branch only for a maintained entry point whose location is stable.

When code or a product-repository README links to development documentation, link to the canonical file on the default branch. Code comments should explain behavior directly and should not cite mission, task, or issue IDs as a substitute for rationale.

Issue and pull-request descriptions may use task and mission identifiers because those records are historical work coordination, not product behavior.

## Evidence retention

Keep concise conclusions in development documentation. Store bulky or regenerable evidence elsewhere.

| Evidence | Storage |
| --- | --- |
| Acceptance command and concise observed result | Mission plan or slice issue |
| Test report and logs | Continuous-integration run |
| Screenshots, traces, and large reports | CI artifact or object storage |
| Proof-of-concept source needed to reproduce a decision | Product repository under a clearly temporary path until the decision closes, then remove or promote it |
| Durable benchmark method and result | Development documentation with the exact code commit and environment |
| Agent transcript | Do not retain unless a specific audit or incident requires it |

A proof summary may remain when it explains why a durable decision exists. It should link to reproducible code or an immutable artifact rather than embedding complete logs.

## Rollback

The cleanup pull request in `rostrum` is the rollback boundary.

If external loading, links, or team access fail after cutover:

1. Revert the cleanup pull request to restore the prior files.
2. Keep the Project and Issues intact.
3. Correct the destination or access problem.
4. Repeat link and agent-loading verification.
5. Submit a new cleanup pull request.

Do not roll back by copying selected files into both repositories. That creates two authoritative versions and makes the next cutover harder.

## Acceptance criteria

The migration is complete when:

- Strategy, roadmap, Epic, mission, decision, research, and human-readable specification documents have one canonical location in `rostrum-dev-docs`.
- GitHub Projects and Issues are the only source of active status, ownership, priority, and blockers.
- Completed Epic 1 work is represented without dozens of artificial closed issues.
- Epic 2 uses the approved checkpoint and slice structure.
- Epic 3 has no prematurely generated implementation issue tree.
- Relative links in `rostrum-dev-docs` pass automated checking.
- `rostrum` contains no links to removed local documentation paths.
- The workflow JSON schema remains available from its approved executable or distribution location.
- Both developers and their agents can load the approved external context revision.
- A missing external context source fails clearly.
- A clean `rostrum` checkout builds and tests without cloning `rostrum-dev-docs`.
- No document or issue independently claims to be a second source of task state.
