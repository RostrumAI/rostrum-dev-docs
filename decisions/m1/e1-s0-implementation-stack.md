# E1-S0 decision: Implementation stack, Control API contract, and workflow persistence

| Tracking | Value |
| --- | --- |
| Status | Decided — proof of concept verified |
| Source | [E1-S0 task at the migration revision](https://github.com/RostrumAI/rostrum/blob/4da89f6316abd44f6ef499a27b87c60aca35e610/docs/tasks/epic-01/e1-s0-select-implementation-stack.md) |
| Last updated | 2026-08-23 |

## Decision

Rostrum builds on **Bun** as the TypeScript runtime, stores workflow state in **Postgres**, serves the Control API with **Hono**, defines the API contract as **OpenAPI 3.1 generated code-first from TypeBox schemas**, and uses **JSON Schema 2020-12 (TypeBox) as the single schema language** shared by the workflow interface specification and the API contract.

## Context

E1-S0 must select the stack before product code exists. The blueprint and epics impose requirements the stack must satisfy:

- The Control API is the single product contract for web, desktop, mobile, CLI, SDK, and integration clients; there is no second client-specific source of truth (blueprint §4.8–4.9).
- The same contract is reimplemented by the tenant-aware Cloud control plane (blueprint §4.8), so the contract must be language-neutral and machine-readable.
- API documentation is generated from or checked against the implemented contract (E1-02 acceptance criteria).
- The workflow interface v1 is delivered as a public JSON Schema consumed by the validator, AI authors, and external tooling (E1-03).
- Conformance suites run the same fixtures against the runtime, daemon, and Control API (E2-07, E3-08), so the contract must be mechanically checkable.
- The workflow domain is JSON-native: workflow JSON, JSON Schema, and structured findings.

## Why these choices

| Decision | Choice | Reason |
| --- | --- | --- |
| Language and runtime | Bun + TypeScript | Chosen architecture; Bun provides runtime, package management, test runner, and native HTTP in one toolchain. |
| TypeScript toolchain | TypeScript 7 (`typescript@^7.0.2`) | Native compiler with a stable CLI surface; verified by the POC with zero source changes. The unstable programmatic API is a deferred caveat for future API-consuming tooling, not for the current stack. |
| Database | Postgres | Chosen database; durable store for drafts, revisions, findings, and published versions. |
| Database driver | `postgres` (postgres.js) | Proven, Bun-first-class, and portable to non-Bun runtimes for the Cloud control plane; built-in connection pooling and `sql.begin(...)` transactions. |
| Query and migration layer | Kysely + Kysely `Migrator` with TypeScript migration modules | Typed queries without ORM magic for the persistence contract the Control API and daemon share; migrations are TypeScript modules whose queries typecheck against the schema types, and they run programmatically in tests. Amended during E1-07 review: the proof-of-concept SQL-file convention is replaced so migrations can be typed and unit-tested like code. |
| Local development database | Docker Compose Postgres service, configured through environment variables (`DATABASE_URL`) | One documented command starts a reproducible local database with no machine-local install assumptions; environment overrides select any target. |
| Repository layout | Bun workspaces: `apps/` for runnable applications and `packages/` for shared libraries | The Control API and the future daemon are independently runnable while sharing workflow and persistence code; one `bun.lock` and no build step. |
| Backup assumption | Documented `pg_dump` backup and restore path; no replication or point-in-time recovery in Epic 1 | Sets the durability ceiling: published versions are recoverable to the dump file, and nothing stronger is assumed. |
| Lint and format | Biome | One fast Rust-based tool for lint, format, and import organization; the ecosystem default (hono-openapi itself uses it). |
| Continuous integration | GitHub Actions | Repository is GitHub-hosted; one workflow runs install, typecheck, tests, and lint, with a Postgres service container for integration tests, later joined by conformance suites and end-to-end demos. |
| HTTP framework | Hono | Runs on Bun's native server, portable to other runtimes for the Cloud control plane, first-class SSE for future event subscription, and socket-free `app.fetch()` integration tests. |
| API contract | OpenAPI 3.1, code-first | Language-neutral and machine-readable (blueprint §4.8 requires the Cloud control plane to reimplement the same contract); satisfies the E1-02 "generated or contract-checked documentation" criterion; supports typed client generation and conformance testing. |
| Schema library | TypeBox (1.x line) | Schemas are JSON Schema 2020-12 by construction, which is also the OpenAPI 3.1 dialect — one schema language for the workflow spec, the API contract, and the OpenAPI document, with no conversion layer. The public workflow JSON Schema is the product's core artifact; authoring it natively is lossless. |
| Validator shape layer | TypeBox `Schema.Compile` | JIT-compiled validation for the custom validator (E1-04) and for contract-checking responses in the conformance harness (E2-07, E3-08). Accepts TypeBox types or native JSON Schema, so future step-type configuration schemas validate directly; falls back to dynamic validation in JIT-restricted environments such as Cloudflare Workers. |

## Alternatives considered

| Alternative | Rejected because |
| --- | --- |
| Elysia | Bun lock-in and a TypeScript-only client story (Eden); the contract must remain consumable by non-TypeScript clients and the Cloud control plane. |
| Fastify | Mature JSON-Schema-first stack, but runs on Bun through the Node compatibility layer rather than Bun's native HTTP. Held as the conservative fallback. |
| Express / bare `Bun.serve` | No built-in validation, error shape, or OpenAPI tooling; the Control API surface grows across 13 epics. |
| tRPC | TypeScript-only wire contract; blocks non-TS clients, SDKs, and the Cloud reimplementation. |
| GraphQL | Poor fit for a command-heavy control API; versioning and findings mapping fight the model. |
| gRPC / Protobuf | HTTP/2-only with poor browser, curl, and webhook ergonomics; the domain is JSON. |
| Zod | Its JSON Schema output is a conversion layer with documented gaps (transforms excluded, `optional`/`default` mis-mapping, `oneOf` vs `anyOf`), and those gaps land directly in the public workflow spec. |

## Assumptions to confirm in the proof of concept

- `bun test` serves as the test runner and `bun` as the package manager.
- TypeBox 1.x (the `typebox` package) is used with a TypeScript 7.x toolchain (`typescript@^7.0.2`, the native compiler). TypeBox 1.x requires TypeScript 6.0–7.0+ and is ESM-only; the 0.x LTS line (`@sinclair/typebox`) is only for a repository pinned to TypeScript 5.x. TypeScript 7 was adopted after the proof of concept verified the swap: zero source or configuration changes, the full check surface green, and the workspace typecheck roughly 4.5× faster. TypeScript 7's programmatic API is not yet stable, but no stack tooling uses it today (the stack only runs `tsc --noEmit`; `openapi-typescript` and Biome have their own pipelines). Revisit the API-stability caveat before adopting tooling that consumes the TypeScript API (typedoc, API extractor, custom transformers).
- `hono-openapi` (third-party, schema-agnostic) generates the OpenAPI document from TypeBox schemas; its lack of runtime response type-checking is closed by contract-checked response assertions in the test and conformance harnesses.

## Deferred decisions

- The published-workflow retrieval pattern for future execution requests is deferred to Epic 2, where the daemon consumer and the API-to-daemon transport are defined (E2-S2 and E2-02). Epic 1 implements basic retrieval of drafts, revisions, and published versions in E1-07 with direct indexed queries and stored-digest verification.

## Verification

The proof of concept verified the package, process, persistence, and driver transaction boundaries before this record moved to Decided. E1-S3 defines revision-check and publication atomicity, and E1-07 implements and tests those rules.
