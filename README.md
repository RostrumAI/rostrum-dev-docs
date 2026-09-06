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

- [E1.1: Prove the authoring lifecycle through the real service](epics/m1/e1-1-authoring-lifecycle-integration.md)
- [E2.1: Make workflow interface v1 executable](epics/m2/e2-1-make-workflow-interface-v1-executable.md)
- [E2.2: Establish the local daemon boundary](epics/m2/e2-2-establish-local-daemon-boundary.md)
- [E2.3: Execute sequential workflows](epics/m2/e2-3-execute-sequential-workflows.md)
- [E2.4: Execute conditional workflows](epics/m2/e2-4-execute-conditional-workflows.md)
- [E2.5: Execute parallel paths and joins](epics/m2/e2-5-execute-parallel-paths-and-joins.md)
- [E2.6: Execute bounded loops](epics/m2/e2-6-execute-bounded-loops.md)

M1 is complete except for E1.1 hardening. M2 is the active roadmap milestone. M3 remains a roadmap milestone until M2 contracts stabilize.

### Specifications

- [Workflow interface v1](specifications/workflow-interface-v1.md)

### Decisions and research

Durable decisions are under `decisions/`. Research remains under `research/` only when it is useful beyond one Epic.

## Plans

Create `plans/` when an implementation plan becomes active. A plan covers one scoped workstream within one technical Epic. Delete it after completion once durable information has moved into code, an Epic, a specification, or a decision record. Git history retains the completed plan.
