# Product requirements: Epics

Epics define the capability we need, the behavior a user can observe, the constraints we must preserve, and the outcomes that demonstrate delivery. They do not specify the implementation's files, interfaces, or test harness.

Use the [Epic format](../epic-delivery-methodology.md#epic-format) and [shared writing and self-review guidance](../writing-style.md). Each Epic links to its roadmap milestone and to its [high-level implementation blueprint](../blueprints/README.md). The blueprint explains what we need to build technically; its [technical designs](../designs/README.md) explain how.

## Milestones

- [M2: Local workflow execution](m2/overview.md) — its overview links the six capability Epics and their dependencies.
- [M3: Durable runs and human control](m3/overview.md) — its overview links the seven capability Epics and their dependencies.

Keep each milestone's Epics in its own directory. Add a new Epic to the milestone overview when its scope is ready, and link its blueprint when that document exists. Do not create placeholder Epics for future roadmap entries.
