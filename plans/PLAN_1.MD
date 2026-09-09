# Simplify the version model

Epic: [E2.2: Execute sequential workflows](../epics/m2/e2-2-execute-sequential-workflows.md)

## Purpose

Record the agreed model and enough repository context for another agent to resume the cutover later.

## Current repository state

- Workflow JSON and validation use `interfaceVersion`.
- Publications use `versionNumber` and "published version."
- Draft saves use `revisionId`.
- Publishing already maps the current revision to one per-workflow number. Repeat publication returns the same number.
- Control API routes use `/api/v1`, and `GET /api/v1/system/version` exposes package and workflow-interface versions.
- Postgres uses `published_versions`, `version_number`, and `interface_version`.

## Scope

Apply one clean rename across code, storage, fixtures, generated artifacts, tests, and documentation. Do not retain aliases for the old names.

## Decisions

- `interfaceVersion` becomes `workflowFormatVersion`; the first value remains `"v1"`.
- The workflow format version selects the document validation and execution rules. There is no separate schema or execution version.
- Draft operations continue to use `revisionId`.
- `versionNumber` becomes `publicationNumber`.
- A revision has zero or one publication. Every publication points to its source revision.
- Publication retrieval and run APIs use `workflowId` plus `publicationNumber`.
- "Published version" becomes "publication."
- `digest` remains an internal integrity value.
- Remove the Control API service-version endpoint. Do not add one to the daemon.
- Remove service, engine, platform, and execution versions from product contracts.
- Remove `/v1` from Control API paths until the public API is deliberately stabilized. Keep routes under `/api`.
- E2.1 establishes separate-host deployment for one Control API and one daemon, both using the same Postgres database through `packages/database`. It also moves backend services from `apps/` to `apis/`, retaining `apps/` for user-facing clients. Compatibility across independently upgraded releases remains later work.

## Progress

- [x] Resolve storage migration treatment.
- [x] Rename the workflow format contract.
- [x] Rename publication storage and APIs.
- [x] Remove service-version endpoints and `/api/v1` paths.
- [x] Update fixtures, generated artifacts, tests, and documentation.
- [x] Run focused verification.

## Checkpoints

### Checkpoint 1: Workflow and storage contract

Rename the workflow JSON field, rule-set selection, validation pointers and findings, TypeScript types, fixtures, digest vectors, database types, and repository methods.

Before implementation, decide how to handle existing stored JSON. Migrations are immutable, and saved revision text contains `interfaceVersion`. Renaming it also changes publication digests. Choose either a development database reset or an explicit additive data migration. Do not silently rewrite revision history.

### Checkpoint 2: Control API contract

Use `publicationNumber` and `/publications/{publicationNumber}`. Remove the system version feature. Move routes from `/api/v1` to `/api`. Regenerate OpenAPI and update the smoke scenario.

### Checkpoint 3: Documentation and verification

Update the workflow specification, M2 Epics, E2-S1 decision, and implementation repository README files. Verify that old terms and paths are gone.

## Implementation approach

Primary areas:

- `packages/workflow/src/`, including its fixtures and tests.
- `packages/database/migrations/` and `packages/database/src/`.
- `apis/control-api/src/`, its smoke script, and `openapi.json` after E2.1's directory cutover. The current checkout still uses `apps/control-api/src/`; E2.1 owns that move, not this naming workstream.
- Implementation README files and the durable documents linked above.

Use language-server renames for exported TypeScript symbols. Regenerate checked-in artifacts from their source.

## Verification

```text
bun test packages/workflow
bun test packages/database
bun run --filter @rostrum/control-api test
bun run --filter @rostrum/control-api generate-openapi
bun run --filter @rostrum/control-api smoke
bun run check
bun run lint
```

Also run Markdown lint and `node scripts/check-links.mjs` in `rostrum-dev-docs`.

## Discoveries

- Postgres already enforces one publication per `(workflowId, revisionId)`.
- The checked-in OpenAPI document contains the current names and paths.
- Renaming the workflow JSON field changes canonical content and digest vectors.

## Decision log

- Reduced model approved with the name `workflowFormatVersion`.
- Revision IDs remain for authoring; publication numbers remain the execution-facing handle.
- E2.1 owns separate-host deployment, shared-database access, and the backend-service move to `apis/`; independent-upgrade compatibility remains a later design topic.

## Outcome

Completed in the `feat/plan1-simplify-version-model` worktree. Storage treatment is additive migration `005_publications` (renames `published_versions` to `publications` with new column names in place; pre-release development databases carry no durable data, so no revision-history rewrite). Workflow format contract renamed (`workflowFormatVersion`, `WorkflowFormatRuleSet`, `WorkflowFormatRegistry`, `FormatStage`, `workflow.format.*` findings); publication storage and APIs renamed (`publications`, `publicationNumber`, `Publication`, `getPublication`); Control API serves `/api/*` with `GET /workflows/{workflowId}/publications/{publicationNumber}`, no system version endpoint; digest vectors regenerated for all six valid fixtures; checked-in OpenAPI regenerated and the smoke scenario updated. Durable documents updated: workflow format specification, E2.2 and E2.3 Epics, E2-S1 decision, roadmap, and this plan. Verification: `bun test packages/workflow` (249 pass), `bun test packages/database` (19 pass), control-api `test` (26 pass), `generate-openapi`, `smoke`, `bun run check`, `bun run lint`, Markdown lint, and `node scripts/check-links.mjs` all green.
