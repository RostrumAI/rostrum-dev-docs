# Rostrum development documentation

This repository is the source of truth for Rostrum product strategy, roadmap milestones, Epics, high-level implementation blueprints, technical designs, human-readable specifications, durable decisions, and reusable research.

Runtime code, tests, migrations, fixtures, generated artifacts, and executable schemas remain in [`RostrumAI/rostrum`](https://github.com/RostrumAI/rostrum).

## Delivery documents

New and resumed implementation follows **Epic → high-level implementation blueprint → technical design → code and verification**. Product strategy and roadmap milestones supply the context above the Epic.

| Where to work | What the document answers | Format and writing guidance |
| --- | --- | --- |
| [epics/](epics/README.md) | What capability do we need, and what should a user be able to do or observe? | [Epic format](epic-delivery-methodology.md#epic-format). |
| [blueprints/](blueprints/README.md) | What do we need to build technically, why, and how do the major responsibilities fit together? | [High-level implementation guide](high-level-implementation-guide.md). |
| [designs/](designs/README.md) | How will the blueprint work in the actual repository, and how will we implement and verify it? | [Technical design guide](technical-design-guide.md). |

Each directory has an index. Add a delivery document to that index and link it from its parent when it is created. A technical design owns implementation checkpoints, progress, decisions, evidence, and recovery information; there is no separate implementation-plan stage.

Read the [delivery methodology](epic-delivery-methodology.md) for scope, document relationships, review gates, resumption, and retirement. Use the [shared writing style](writing-style.md) for all human-authored technical prose and the matching guide for a blueprint or design. Before handing off a document, complete the evidence-based self-review and report whether it is ready, needs revision, or is blocked. Self-review does not grant approval or demonstrate that implementation works.

## Product context

- [Product strategy](strategy/product-strategy.md).
- [Product roadmap](strategy/product-roadmap.md).
- [M2: Local workflow execution](epics/m2/overview.md) — the active milestone; its overview links the six Epics.
- [M3: Durable runs and human control](epics/m3/overview.md) — scoped for technical planning after the M2 contracts stabilize; its overview links the seven Epics.

## Specifications

- [Workflow format v1](specifications/workflow-interface-v1.md).

## Decisions and research

Durable decisions live under `decisions/`. Research remains under `research/` when it is useful beyond one workstream. Specifications and decisions govern the affected contracts; a blueprint or design must not silently redefine them.

- [Controller and service vocabulary](decisions/controller-service-vocabulary.md) — the vocabulary used by the framework, Control API, and daemon.
- [Restart-only server framework](research/restart-only-server-framework.md) — the framework design record; current vocabulary amendments are recorded in the decision above.
- [Pre-production compatibility](decisions/pre-production-compatibility.md) — breaking changes and clean cutovers are permitted until the first production deployment.

## Prior combined-plan records

The existing `plans/` documents combine high-level direction, detailed design, and delivery records. They are retained for their proposals, decisions, evidence, and unresolved findings, not as an alternate format for new work. Follow the methodology's [resumption requirements](epic-delivery-methodology.md#resuming-work-from-prior-combined-plans) before continuing their implementation.

- [Daemon network boundary](plans/m2-epic-1-daemon-network-boundary.md) — prior combined plan and recorded checkpoint evidence.
- [Service framework vocabulary and application tiers](plans/handler-service-vocabulary.md) — prior vocabulary proposal; the controller/service decision records its terminology amendment.

The earlier sequential-execution plan has been superseded by its [technical design](designs/m2-epic-2-sequential-workflows.md), filed under `designs/`.

Do not create new combined plans in `plans/` or treat renaming one as completion of the new review gates. Establish the relevant blueprint and technical design against current requirements and the actual repository. The [documentation migration record](development-documentation-migration.md) preserves the earlier repository move, not the current format.

## Document checks

Run the same checks as [documentation CI](.github/workflows/documentation.yml), from this checkout:

```sh
npx --yes markdownlint-cli@0.46.0 "**/*.md" --disable MD013
node scripts/check-links.mjs
```

These checks validate Markdown structure and relative file links. The writing guides' self-review checks evaluate purpose, level of detail, interactions, scope, and evidence; automated structure checks do not replace them.
