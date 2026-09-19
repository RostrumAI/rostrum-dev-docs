# Technical designs

A technical design explains how a reviewed blueprint will work in the actual repository. It specifies the files and their purposes, affected contracts and callers, state ownership, interactions, ordering and failure behavior, and the implementation and verification needed to deliver the intended result.

Use the [technical design guide](../technical-design-guide.md) for the format, examples, checkpoints, and self-review criteria. Use the same explanatory language as the [blueprint](../blueprints/README.md), with greater implementation detail rather than more code snippets.

## Adding a design

Create a document named for its workstream, adding a descriptive suffix if it covers one implementation slice. Link exactly one parent blueprint and its Epic, and state the requirements this design covers. Link it from the blueprint and list it here.

Keep execution checkpoints, progress, decisions, evidence, and recovery information in the design. Do not create a separate implementation-plan artifact. Follow the [delivery handoffs](../epic-delivery-methodology.md#review-and-handoff) before starting dependent code changes.

## Current designs

No designs have been adopted under this format yet.

The [prior combined-plan records](../README.md#prior-combined-plan-records) preserve earlier technical work but are not reviewed designs under the new process. Re-establish the repository baseline and apply the [resumption requirements](../epic-delivery-methodology.md#resuming-work-from-prior-combined-plans) before using them for implementation.
