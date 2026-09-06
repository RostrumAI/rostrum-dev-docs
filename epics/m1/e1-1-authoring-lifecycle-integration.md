# E1.1: Prove the authoring lifecycle through the real service

Status: Planned

Roadmap milestone: [M1: Shape of a workflow](../../strategy/product-roadmap.md#3-delivery-milestones)

## Outcome

Continuous integration exercises the complete workflow-authoring lifecycle through a real Control API process and database.

## Scope

Exercise these behaviors over HTTP:

- Create a draft while replacing any author-supplied workflow ID.
- Save revisions against the current revision and return validation findings.
- Return `HTTP 409` with the current revision for a stale `baseRevision`.
- Rewind by appending a copy while keeping published source revisions retrievable.
- Revalidate during publication and return `HTTP 422` for blocking findings.
- Publish idempotently and return the version number, `interfaceVersion`, and digest.
- Retrieve canonical text and reproduce its digest.

The scenario starts a real server process and uses a real database. It must cover sockets, connection lifecycle, persistence, and error mapping rather than the in-process handler harness.

## Non-goals

- New authoring behavior.
- Changes to the workflow interface or lifecycle contracts.
- General authoring guidance, which belongs to a later authoring milestone.

## Acceptance criteria

- One integration path creates, revises, conflicts, rewinds, publishes, and retrieves a workflow through the real service boundary.
- Stored workflow bytes are returned unchanged.
- Published versions remain tied to their source revisions.
- Re-publishing the same revision is idempotent.
- The retrieved canonical text reproduces the published digest.
- The scenario runs deterministically in continuous integration.
