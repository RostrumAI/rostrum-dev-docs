# Development documentation migration

Status: Approved

This plan moves long-form development documentation from `RostrumAI/rostrum` to `RostrumAI/rostrum-dev-docs` and replaces the current task-file hierarchy with roadmap milestones, technical Epics, and one or more implementation plans per active Epic.

## Ownership

Use one source of truth for each kind of information.

| Information | Source of truth |
| --- | --- |
| Product strategy and roadmap | `rostrum-dev-docs` |
| Technical Epics and durable decisions | `rostrum-dev-docs` |
| Epic implementation plans | `rostrum-dev-docs` |
| Human-readable product specifications | `rostrum-dev-docs` |
| Implementation and code review | Pull requests in the affected code repository |
| Raw test output, traces, and screenshots | Continuous integration or artifact storage |
| Source, migrations, executable fixtures, and runtime schemas | `rostrum` |

## Destination structure

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
  specifications/
  decisions/
  research/
```

Only current plans remain in `plans/`. Delete a plan when its work is complete. Git history retains the plan without creating an active and inactive directory structure.

Create a separate decision, research, or specification document only when its content must remain useful across several Epics. Keep temporary research, decisions, progress, and evidence in the relevant implementation plan.

## What moves

Move these documents to `rostrum-dev-docs`:

- Product strategy and roadmap.
- Technical Epics.
- Human-readable specifications.
- Durable decisions and reusable research.
- Current implementation plans.

Copy the current documents without transferring their Git history. The `rostrum` repository remains the historical source for earlier versions.

Do not migrate `agent-guides/`, `.agents/`, or other agent-specific documentation. Replace them with a minimal `AGENTS.md` in `rostrum` that directs agents to `rostrum-dev-docs` for development documentation.

## What stays in the product repository

Keep these items in `rostrum`:

- Source and comments that explain current invariants.
- Database migrations.
- Tests and executable fixtures.
- Runtime schemas and generated artifacts required by builds, packages, clients, or releases.
- Licensing, security, and essential repository setup instructions.
- The minimal root `AGENTS.md`.

The human-readable `docs/specs/workflow-interface-v1.md` moves to `rostrum-dev-docs/specifications/`.

`docs/specs/workflow-interface-v1.schema.json` is generated from `packages/workflow/src/schema.ts`. Keep or relocate it inside `rostrum` if code, packages, clients, or releases consume it. Otherwise generate it when needed. The development-documentation repository must not become a runtime dependency.

## Rework current planning

### M1: Shape of a workflow

Treat the current Epic 1 as completed roadmap milestone M1. Retain its durable specification and decisions. Do not recreate its completed task files as plans.

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

Close E2-02 when this methodology and migration are approved. Create one or more plans when a technical Epic is ready to start.

### M3: Durable runs and human control

Treat the current Epic 3 as roadmap milestone M3. Split it into technical Epics after M2 establishes stable execution, handler, daemon, and Control API contracts.

Do not migrate the existing Epic 3 task files as plans. Use them as source material when the technical Epics are written against the implemented repository.

### M4 through M13

Keep these product goals in the roadmap. Do not create placeholder Epics or plans until their dependencies and boundaries are clear.

## Migration sequence

1. Approve the methodology, plan format, and repository boundary.
2. Copy the selected documents at one revision and create the destination structure.
3. Rework M1, M2, and M3 as described above.
4. Add link and Markdown checks to `rostrum-dev-docs`.
5. Update repository links and replace the agent documentation with the minimal `AGENTS.md`.
6. Remove the migrated documents, `agent-guides/`, and `.agents/` from `rostrum` in one cleanup pull request.
7. Run product checks from a clean `rostrum` checkout without `rostrum-dev-docs`.

The cleanup pull request is the rollback boundary. Revert it if links or agent instructions fail. Do not restore selected files in both repositories.

## Completion

The migration is complete when:

- Strategy, roadmap, Epics, plans, and human-readable specifications have one canonical location in `rostrum-dev-docs`.
- M2 is represented by six technical Epics instead of one broad plan and thirteen task files.
- Each active Epic has one or more current plans, with no inactive-plan directory.
- Runtime code, schemas, migrations, fixtures, and tests remain in `rostrum`.
- `rostrum` contains only a minimal `AGENTS.md` that points to the development-documentation repository.
- A clean `rostrum` checkout builds and tests without cloning `rostrum-dev-docs`.
- No planning state has two sources of truth.
