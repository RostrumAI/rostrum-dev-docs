# Documentation repository instructions

Read [README.md](README.md) and the [delivery methodology](epic-delivery-methodology.md) before planning or changing development guidance. Read the relevant roadmap, Epic, specifications, decisions, and existing delivery documents before changing their requirements or design.

New and resumed implementation follows **Epic → high-level implementation blueprint → technical design → code and verification**. Use [epics/](epics/README.md), [blueprints/](blueprints/README.md), and [designs/](designs/README.md) for those documents. Prior combined plans are context and evidence, not an alternative delivery format.

For every human-authored technical document, apply [writing-style.md](writing-style.md). For a blueprint or design, also use its [high-level implementation guide](high-level-implementation-guide.md) or [technical design guide](technical-design-guide.md). Use the common self-review procedure and applicable level-specific checks before handing off a document; report evidence, revisions, and unresolved decisions rather than an unsupported pass. Self-review does not grant approval or prove implementation behavior.

Preserve the distinction between existing behavior, agreed direction, open proposals, and future work. Explain responsibilities and interactions in plain language. Technical designs include file purposes and meaningful verification; include code only when it makes a point clearer than prose.

Keep requirements and planning in this repository, and source, executable schemas, tests, fixtures, and runtime configuration in the implementation repository. Do not duplicate an active document or rewrite historical evidence as a claim about current code.

Before completion, run the Markdown and relative-link checks in [.github/workflows/documentation.yml](.github/workflows/documentation.yml). These checks validate document structure and links, not the technical meaning of the prose. Commit and push documentation changes from this independent checkout.
