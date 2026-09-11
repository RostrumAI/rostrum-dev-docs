# Epic 6: Retrieve run artifacts

Status: Planned

Roadmap milestone: [M3: Durable runs and human control](../../strategy/product-roadmap.md#3-delivery-milestones)

Depends on: [Epic 1](1-recover-durable-runs.md) and [Epic 5](5-inspect-run-timelines.md)

## Outcome

A run can produce a small deterministic artifact that remains independently retrievable after reconnecting. The Control API returns immutable artifact metadata and content, and a caller can verify that the retrieved bytes match the recorded producer, size, and digest.

Artifacts are evidence associated with a run, step, and attempt. They are not embedded in event pages or treated as a replacement for the final workflow result.

## Scope

- Define an artifact identity and metadata contract containing the producing run, step and attempt when applicable, artifact name, media type, byte size, content digest, creation time, and a storage reference that does not expose local filesystem assumptions to callers.
- Persist artifact metadata and content so a committed artifact remains retrievable after daemon and Control API restart. Link the artifact to the checkpoint and event that made it visible; do not expose metadata for content that was never durably committed.
- Make artifact content immutable. A second write cannot replace bytes under an existing identity, and a later step cannot silently rewrite an earlier artifact. Repeated retrieval returns the same content or an explicit integrity/storage failure.
- Verify content size and digest on write and retrieval. Report missing content, incomplete writes, corruption, and digest mismatch distinctly enough for a caller or operator to diagnose them. Never return unverifiable bytes as valid evidence.
- Provide a deterministic reference handler that emits a bounded artifact and records its producer attempt. The fixture remains small and local; it does not introduce scripts, models, external context, or side effects.
- Keep artifact references available from run inspection and the timeline without embedding large bodies in ordinary run projections or events. Retrieval is explicitly authorized through the Control API operation that owns the artifact contract.
- Establish the local retention and cleanup boundary needed to keep committed artifacts available through M3 inspection. Do not promise indefinite retention or cloud object storage.

## Decisions and implementation ownership

Choose where local artifact bytes live. Compare Postgres byte storage, a filesystem/object-style directory, and another self-hostable option against atomic visibility with checkpoint records, size limits, digest verification, backup and cleanup behavior, concurrent access, and operation while the daemon is unavailable. The decision must name the authoritative metadata store, write protocol, path or key isolation, permissions, startup checks, and recovery of orphaned or incomplete content. Do not add a storage abstraction for hypothetical cloud backends, and do not assume Redis is an artifact store without evidence.

Resolve maximum artifact size, supported media types, naming and identity, retention duration, cleanup ownership, and behavior when metadata commits but bytes do not or vice versa. Ensure a failed artifact does not make a successful workflow claim unverifiable evidence. Decide which payloads are sensitive and whether the first local implementation redacts, refuses, or stores them under an explicit policy.

[Epic 1](1-recover-durable-runs.md) owns durable storage and checkpoint atomicity. [Epic 5](5-inspect-run-timelines.md) owns event references and run inspection. [Epic 7](7-complete-m3-conformance.md) verifies the complete retrieval and integrity path. Detailed byte protocols, schemas, and fixture commands belong in implementation plans.

## Non-goals

- External object stores, artifact distribution, retention administration, encryption key management, or cloud tenancy.
- Capturing arbitrary logs, source-system bodies, model transcripts, or unbounded files as artifacts.
- Artifact mutation, versioned replacement, deduplication, or content-addressed workflow execution.

## Acceptance criteria

- A reference run produces one bounded artifact whose metadata identifies the run, producer step and attempt, name, media type, size, digest, creation time, and retrieval identity.
- A committed artifact survives daemon and Control API restart. A caller retrieves the bytes independently of the event timeline and verifies size and digest successfully.
- Artifact visibility is atomic with the associated run transition and event. Incomplete or failed writes do not appear as valid artifacts or produce a successful evidence claim.
- Missing, corrupt, and digest-mismatched content produce stable integrity failures; the API never labels unverifiable bytes valid.
- Existing artifact content cannot be replaced by a duplicate or later producer. Concurrent runs remain isolated, and cleanup does not remove an artifact inside its documented local retention boundary.
