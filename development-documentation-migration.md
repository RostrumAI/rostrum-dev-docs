# Development documentation migration

Status: Proposed for review

This plan moves long-form development documentation from `RostrumAI/rostrum` to `RostrumAI/rostrum-dev-docs` and replaces the current task-file hierarchy with roadmap milestones, technical Epics, and one active implementation plan per Epic.

## Ownership

Use one source of truth for each kind of information.

| Information | Source of truth |
| --- | --- |
| Product strategy and roadmap | `rostrum-dev-docs` |
| Technical Epics and durable decisions | `rostrum-dev-docs` |
| Active Epic implementation plans | `rostrum-dev-docs` |
| Human-readable product specifications | `rostrum-dev-docs` |
| Assignment and discussion when tracking is useful | GitHub Issues |
| Implementation and code review | Pull requests in the affected code repository |
| Raw test output, traces, and screenshots | Continuous integration or artifact storage |
| Source, migrations, executable fixtures, and runtime schemas | `rostrum` |

GitHub Projects and OpenSpec are not part of the initial method.

## Destination structure

Use a small directory tree:

```text
rostrum-dev-docs/
  strategy/
    product-strategy.md
    product-roadmap.md
  epics/
    m1/
    m2/
    m3/
  plans/
    active/
  specifications/
  decisions/
  research/
  guidance/
```

Create a separate decision, research, or specification document only when its content must remain useful across several Epics. Keep temporary research, decisions, progress, and evidence in the active implementation plan.

## Current material

`rostrum` contains 67 tracked files under `docs/`: two strategy documents, three broad Epic documents, 43 task files, six decisions, seven research files, three proof results, two specification files, and one index.

It also contains 21 tracked agent and writing-guidance files under `AGENTS.md`, `agent-guides/`, and `.agents/`.

The current `AGENTS.md` refers to `skills/technical-writing-core/SKILL.md`, which is missing. Repair that entry point before the moved guidance becomes authoritative.

## What moves

Move these documents to `rostrum-dev-docs`:

- Product strategy and roadmap.
- Technical Epics.
- Human-readable specifications.
- Durable decisions and reusable research.
- Active implementation plans.
- Agent and writing guidance, subject to the bootstrap rule below.

Do not preserve completed task files as active documents. Git history can retain them during the migration.

## What stays in the product repository

Keep these items in `rostrum`:

- Source and comments that explain current invariants.
- Database migrations.
- Tests and executable fixtures.
- Runtime schemas and generated artifacts required by builds, packages, clients, or releases.
- Licensing, security, and essential repository setup instructions.

The human-readable `docs/specs/workflow-interface-v1.md` moves to `rostrum-dev-docs/specifications/`.

`docs/specs/workflow-interface-v1.schema.json` is generated from `packages/workflow/src/schema.ts`. Keep or relocate it inside `rostrum` if code, packages, clients, or releases consume it. Otherwise generate it when needed. The development-documentation repository must not become a runtime dependency.

## Rework current planning

### M1: Shape of a workflow

Treat the current Epic 1 as completed roadmap milestone M1. Retain its durable specification and decisions. Do not create issues for its completed tasks.

Move the unfinished authoring lifecycle integration test into a small M1 hardening Epic. Keep authoring guidance assigned to the later authoring milestone.

### M2: Local workflow execution

Replace the current broad Epic 2 with roadmap milestone M2 and six technical Epics:

1. E2.1: Make workflow interface v1 executable.
2. E2.2: Establish the local daemon boundary.
3. E2.3: Execute sequential workflows.
4. E2.4: Execute conditional workflows.
5. E2.5: Execute parallel paths and joins.
6. E2.6: Execute bounded loops.

The detailed mapping from current work is in [Epic delivery methodology](epic-delivery-methodology.md).

Close E2-02 when this methodology and migration are approved. Create an implementation plan only when one of the six technical Epics is ready to start.

### M3: Durable runs and human control

Treat the current Epic 3 as roadmap milestone M3. Split it into technical Epics after M2 establishes stable execution, handler, daemon, and Control API contracts.

Do not migrate the existing Epic 3 task files into active plans. Use them as source material when the technical Epics are written against the implemented repository.

### M4 through M13

Keep these product goals in the roadmap. Do not create placeholder Epics or plans until their dependencies and boundaries are clear.

## GitHub tracking

GitHub Issues is optional and lightweight:

- Use one milestone for each active product milestone.
- Use one issue for each active technical Epic when assignment or discussion needs a tracker.
- Link the issue to its Epic, active implementation plan, and code pull requests.
- Create additional issues only for independently assigned work, unplanned defects, or decisions that need discussion outside the plan.

The implementation plan owns checkpoints, progress, and detailed work. Do not mirror that state into issue labels or another board.

## Agent guidance

Choose the external context-loading mechanism before removing `AGENTS.md`, `agent-guides/`, or `.agents/` from `rostrum`.

The mechanism must load an approved guidance revision before work begins, work for both developers, fail clearly when unavailable, and prevent unreviewed issue comments from becoming instructions.

Prefer a centrally managed harness or workspace configuration that exposes `rostrum-dev-docs` read-only to code agents. Keep a minimal bootstrap in `rostrum` only when the harness cannot discover the external guidance reliably.

## Preserve history

Use a disposable clone to transfer documentation history. Do not rewrite the working `rostrum` checkout.

1. Clone `rostrum` into a temporary directory.
2. Use `git filter-repo` to retain `docs/`, `AGENTS.md`, `agent-guides/`, and `.agents/`.
3. Inspect the rewritten history for secrets and unwanted generated or large files.
4. Push the filtered history to `rostrum-dev-docs`.
5. Reorganize and simplify the documents in ordinary follow-up commits.

Do not force-push after collaborators begin adding work to `rostrum-dev-docs`. If that has happened, merge the histories deliberately or use a snapshot migration.

## Migration sequence

1. Approve the methodology, plan format, repository boundary, and guidance bootstrap.
2. Transfer the selected history and create the destination structure.
3. Rework M1, M2, and M3 as described above.
4. Add link and Markdown checks to `rostrum-dev-docs`.
5. Update links and activate the external guidance loader.
6. Remove migrated documents and heavy guidance from `rostrum` in one cleanup pull request.
7. Run product checks from a clean `rostrum` checkout without `rostrum-dev-docs`.

The cleanup pull request is the rollback boundary. Revert it if external loading or links fail. Do not restore selected files in both repositories.

## Completion

The migration is complete when:

- Strategy, roadmap, Epics, plans, and human-readable specifications have one canonical location in `rostrum-dev-docs`.
- M2 is represented by six technical Epics instead of one broad plan and thirteen task files.
- Active implementation has one plan per technical Epic.
- GitHub Projects and OpenSpec are not required.
- Runtime code, schemas, migrations, fixtures, and tests remain in `rostrum`.
- Both developers and their agents can load the approved external guidance.
- A clean `rostrum` checkout builds and tests without cloning `rostrum-dev-docs`.
- No planning state has two sources of truth.
