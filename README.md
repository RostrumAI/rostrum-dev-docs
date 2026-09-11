# Rostrum development documentation

This repository is the source of truth for Rostrum product strategy, roadmap milestones, technical Epics, implementation plans, human-readable specifications, durable decisions, and reusable research.

Runtime code, tests, migrations, fixtures, generated artifacts, and executable schemas remain in [`RostrumAI/rostrum`](https://github.com/RostrumAI/rostrum).

## Method

Development work follows this hierarchy:

```text
Product strategy
    ↓
Product roadmap milestone
    ↓
Technical Epics
    ↓
One or more implementation plans per active Epic
```

See [Epic delivery methodology](epic-delivery-methodology.md) and [Epic implementation plan format](epic-implementation-plan-format.md).

## Current documents

### Strategy

- [Product strategy](strategy/product-strategy.md)
- [Product roadmap](strategy/product-roadmap.md)

### Technical Epics

Each roadmap milestone has an overview document stating what the milestone
accomplishes, how its Epics deliver that outcome, and the order in which they
are implemented.

- [Milestone 2 overview: Local workflow execution](epics/m2/overview.md)
- [M2 Epic 1: Establish the daemon network boundary](epics/m2/1-establish-daemon-network-boundary.md)
- [M2 Epic 2: Execute sequential workflows](epics/m2/2-execute-sequential-workflows.md)
- [M2 Epic 3: Execute conditional workflows](epics/m2/3-execute-conditional-workflows.md)
- [M2 Epic 4: Execute parallel paths and joins](epics/m2/4-execute-parallel-paths-and-joins.md)
- [M2 Epic 5: Execute bounded loops](epics/m2/5-execute-bounded-loops.md)
- [M2 Epic 6: Complete M2 conformance](epics/m2/6-complete-m2-conformance.md)
- [Milestone 3 overview: Durable runs and human control](epics/m3/overview.md)
- [M3 Epic 1: Recover durable runs](epics/m3/1-recover-durable-runs.md)
- [M3 Epic 2: Retry bounded failures](epics/m3/2-retry-bounded-failures.md)
- [M3 Epic 3: Pause, resume, and cancel runs](epics/m3/3-pause-resume-and-cancel-runs.md)
- [M3 Epic 4: Wait for human decisions](epics/m3/4-wait-for-human-decisions.md)
- [M3 Epic 5: Inspect run timelines](epics/m3/5-inspect-run-timelines.md)
- [M3 Epic 6: Retrieve run artifacts](epics/m3/6-retrieve-run-artifacts.md)
- [M3 Epic 7: Complete M3 conformance](epics/m3/7-complete-m3-conformance.md)

M2 is the active roadmap milestone. M3 is scoped and ready for implementation planning after M2 contracts stabilize.

### Specifications

- [Workflow interface v1](specifications/workflow-interface-v1.md)

### Decisions and research

Durable decisions are under `decisions/`. Research remains under `research/` only when it is useful beyond one Epic.

## Plans

Create `plans/` when an implementation plan becomes active. A plan covers one scoped workstream within one technical Epic. Delete it after completion once durable information has moved into code, an Epic, a specification, or a decision record. Git history retains the completed plan.
