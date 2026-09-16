# Identifier naming review

Status: Proposed  
Reviewed revision: [`RostrumAI/rostrum@c6bbcea`](https://github.com/RostrumAI/rostrum/tree/c6bbcea028769490266aee206eb9e65a6971acfe)  
Purpose: Record which identifiers in the Rostrum codebase cannot be understood from their names, propose alternatives verified against the whole repository, and state what each change costs.

## Summary

Several identifiers require the reader to open a second file (or the whole call site) before they can say what the thing is. `PublicationPreparer` and `V1_RULE_SET` are two examples, but the problem is broader: it appears in the workflow format library, in the storage and service packages, in the Control API, and in the review automation under `scripts/review`.

The table below recommends 43 renames: 38 internal TypeScript, module, or CLI changes with no wire, storage, or operator-configuration impact, and the 5 listed under [APIs: wire-contract names](#apis-wire-contract-names-breaking) that require a client contract bump.

Two rules produce most of the fixes: name the subject as well as the operation, and use the workflow format specification's own words for the concepts it already names.

## What this review covers

All product source under `packages/workflow`, `packages/database`, `packages/server`, `apis/control-api`, and `apis/daemon`, plus the review automation under `scripts/review`. Test files, fixtures, and the generated `openapi.json` artifacts were read as usage evidence only; renaming them is mechanical and is not counted.

The governing vocabulary was read first and is treated as authoritative: [Workflow format v1](../specifications/workflow-interface-v1.md) (data references, findings, rule sets, drafts, revisions, publications, digest, validation stages), the M2 Epics, and the [M2 Epic 1 plan](../plans/m2-epic-1-daemon-network-boundary.md) (boundary vocabulary, configuration contract).

## How names were judged

The test applied to each identifier is whether a competent engineer who has never read the file can say what it is and roughly what it does, given the name alone. A name fails when it:

- names an operation whose subject is missing (`PublicationPreparer` prepares *what*, how?);
- carries a version, scope, or format qualifier that the reader cannot anchor (`V1_RULE_SET`, `OMP`, `GTS`, `retro`);
- reuses a term that already means something else in the ecosystem (`SourceMap`) or in this repository (`Finding`, `not-found`, `selectRuleSet`);
- names one thing and returns another (`DatabaseCheck` is a result, `modulesImportedOnlyByExemptFiles` returns modules, `AnsweredFinding` also holds unanswered threads);
- gives one concept two names, or gives two concepts one name, so the reader must translate (`IdentityStage` versus the specification's "Identity and references"; `merge.ts` versus the file that actually merges lens output).

Names that are short but conventional (`db`, `id`, `url`), or that the specification fixes (`workflowFormatVersion`, `publicationNumber`, `RevisionType`, `digest`, `boundary`), were not flagged and are listed under [Names reviewed and kept](#names-reviewed-and-kept).

## What can change, and what cannot

| Name surface | Change class | Notes |
| --- | --- | --- |
| TypeScript identifiers, module file names, CLI flags | Internal | Clean cutover per package; no compatibility aliases |
| HTTP response fields and error codes | Breaking | Clients read them; ship with the next Control API client contract bump |
| SQL tables, columns, environment variables, YAML keys | Frozen | Operator-facing contracts documented in the M2 Epic 1 plan and the repository README |
| Applied migrations | Historical | Past migrations are a record, not a description; do not rewrite them |

## Recommendations by area

| Current | Proposed | Location | Class |
| --- | --- | --- | --- |
| `V1_RULE_SET` | `V1_WORKFLOW_FORMAT_RULE_SET` | `packages/workflow/src/rules/v1.ts:35` | Internal |
| `PublicationPreparer` | `PublicationCanonicalizer` | `packages/workflow/src/publish/publication-preparer.ts:28` | Internal |
| `PublicationPreparation` | `CanonicalPublication` | same file, line 5 | Internal |
| `ValidationContext.findings` | `ValidationContext.findingFactory` | `packages/workflow/src/validation/validation-context.ts:21` | Internal |
| `SourceMap` | `PointerLocationMap` | `packages/workflow/src/source-map.ts:26` | Internal |
| `SourcePointer` | `SourceSpan` | same file, line 18 | Internal |
| `IdentityStage` | `IdentityAndReferencesStage` | `packages/workflow/src/validation/stages/identity-stage.ts:20` | Internal |
| `FormatStage` | `FormatVersionStage` | `.../stages/format-stage.ts:16` | Internal |
| `CompatibilityStage` | `InputOutputCompatibilityStage` | `.../stages/compatibility-stage.ts:17` | Internal |
| `validation/refs.ts` | `validation/data-references.ts` | package module | Internal |
| `STEP_REF_PATTERN` | `STEP_OUTPUT_REF_PATTERN` | `packages/workflow/src/validation/refs.ts:10` | Internal |
| `WorkflowDocument` (schema value) | `WorkflowDocumentSchema` | `packages/workflow/src/schema.ts:121` | Internal |
| `WorkflowDocumentType` (alias) | removed | `packages/workflow/src/index.ts:43` | Internal |
| `includeLoopFeeds` (parameter) | `includeIterationResultEdges` | `packages/workflow/src/validation/workflow-graph.ts:146` | Internal |
| `StoredRevision` | `Revision` | `packages/database/src/repositories/workflow-repository.types.ts:13` | Internal |
| `PublishInput` | `PublicationInsertInput` | same file, line 85 | Internal |
| `not-found` (union arm) | `workflow-not-found` | `packages/database/.../workflow-repository.types.ts` and `apis/control-api/src/workflows/service.ts:56` | Internal |
| `Flight` | `InFlightProbe` | `packages/database/src/client.ts:157` | Internal |
| `DatabaseCheck` | `DatabaseProbeResult` | `packages/database/src/client.ts:26` | Internal |
| `CheckResult` | `ReadinessCheckResult` | `packages/server/src/protocol.ts:58` | Internal |
| `dependencyIdentity`, `liveIdentity`, `listenerIdentity` | `dependencyFingerprint`, `liveDependencyFingerprint`, `listenerFingerprint` | `packages/server/src/lifecycle.ts:67,77,109` | Internal |
| `ServiceDependencies` | `ServiceResources` | `packages/server/src/lifecycle.ts:33` | Internal |
| `RuntimeConfig` | `ReloadableServiceConfig` | `packages/server/src/lifecycle.ts:15` | Internal |
| `isToken` | `isTokenSyntax` | `packages/server/src/tokens.ts:8` | Internal |
| `RULE_SET_REGISTRY` | `WORKFLOW_FORMAT_REGISTRY` | `apis/control-api/src/workflows/rule-sets.ts:15` | Internal |
| `selectRuleSet` (Control API) | `ruleSetForFormatVersion` | `apis/control-api/src/workflows/service.ts:257` | Internal |
| `Services.signal` (daemon) | `Services.abortSignal` | `apis/daemon/src/services.ts:19` | Internal |
| `readRequestBody` | `readDocumentRequestBody` | `apis/control-api/src/workflows/request-body.ts:35` | Internal |
| `Finding` (review pipeline) | `ReviewFinding` | `scripts/review/types.ts:36` | Internal |
| `--repo-root` | `--review-checkout` | `scripts/review/index.ts:88`, `adjudicate-cli.ts`, CI workflows, `SKILL.md` | Internal |
| `merge.ts` | `finding-triage.ts` | `scripts/review/` | Internal |
| `AnsweredFinding` | `PostedFinding` | `scripts/review/merge.ts:36` | Internal |
| `suppressAnswered` | `suppressPostedFindings` | `scripts/review/merge.ts:123` | Internal |
| `resolveOmpInvocation` | `resolveReviewerCommand` | `scripts/review/reviewer.ts:143` | Internal |
| `retro.ts`, `review:retro` | `retrospective.ts`, `review:retrospective` | `scripts/review/` | Internal |
| `--confidence` | `--confidence-floor` | `scripts/review/index.ts:85` | Internal |
| `"stood"` (action arm) | `"stands"` | `scripts/review/adjudicate.ts:75` | Internal |
| `workflow_not_valid` | `workflow_not_publishable` | `apis/control-api/src/workflows/errors.ts:92` | Breaking |
| `invalid_workflow_input` (parse failures) | `workflow_parse_failure` | same file, line 50 | Breaking |
| publication `content` | `canonicalText` | `apis/control-api/src/workflows/schemas.ts:129` | Breaking |
| revision `type` | `revisionType` | same file, line 78 | Breaking |
| `BoundaryError` versus `ErrorResponse` | one shared `ServiceError` | `packages/server/src/protocol.ts:14`, `apis/control-api/src/schemas.ts:5` | Breaking |

## Workflow format library

### `V1_RULE_SET` → `V1_WORKFLOW_FORMAT_RULE_SET`

`packages/workflow/src/rules/v1.ts:35` · 7 non-test references · internal only

The constant is the frozen workflow format v1 rule set, but its name omits the family. `v1` alone is ambiguous across a repository that also versions HTTP APIs, and the sibling export in the same package is `WorkflowFormatRuleSet`, so the family word is dropped exactly where it carries the meaning. An import line reads as if there were one rule set rather than one member of a per-version set; the constant's only consumer is `new WorkflowFormatRegistry([V1_RULE_SET])`, whose whole contract is selection among rule sets by version token. The specification itself writes "the frozen v1 rule set" and "one immutable rule set per version".

`V1_WORKFLOW_FORMAT_RULE_SET` keeps the version first, matches the SCREAMING_SNAKE convention already used for exported constants in the package (`STEP_REF_PATTERN`, `RULE_SET_REGISTRY`), and needs no new vocabulary. `WORKFLOW_FORMAT_V1_RULE_SET` is equivalent; pick one and apply it everywhere.

### `PublicationPreparer` → `PublicationCanonicalizer`, `PublicationPreparation` → `CanonicalPublication`

`packages/workflow/src/publish/publication-preparer.ts:5,28` · 7 and 3 non-test references · internal only

"Preparer" names no operation, so a reader cannot tell whether the class validates, injects ids, assigns publication numbers, or serializes. It canonicalizes a valid document to RFC 8785 form and computes the SHA-256 digest over the metadata-stripped copy, returning `{ canonicalText, digest }`. Both callers exist for those two outputs: the Control API hands one instance to the repository to verify stored content (`service.ts:86`) and builds a second per publish request (`service.ts:223`). The result type repeats the problem from the other direction: "Preparation" is a noun of action used as a data type.

`PublicationCanonicalizer` uses the specification's verb, and `CanonicalPublication` describes the pair it produces. Rename the method `prepare()` to `canonicalize()` for the same reason; inside the class body a bare `canonicalize(...)` still resolves to the imported `canonical-json` helper, and all call sites must keep using `this`, so the change is mechanical.

The alternative end state — one shared shape instead of a separate `PublicationPreparation` and `PublishInput` — is viable and would remove a second pair of names; see `PublishInput` below.

### `ValidationContext.findings` → `ValidationContext.findingFactory`

`packages/workflow/src/validation/validation-context.ts:21` · 35 call sites (the highest-use name in this review) · internal only

The field holds the factory that mints findings, not findings, so `context.findings.create({ code, message, path })` reads as if a collection named `findings` exposed `create`. The collision is visible in one function body: a stage declares its own `const findings: Finding[] = []` and also calls `context.findings.create(...)` a few lines later. `findingFactory` matches the held type and adds no vocabulary; the 35 call sites keep reading correctly because the method name does not change.

### Stage class names

The validation pipeline's class names should match the stage names in the [specification's Validation table](../specifications/workflow-interface-v1.md#validation), which is the reference a reader already has open when debugging a finding code.

| Current | Proposed | Why the current name fails |
| --- | --- | --- |
| `IdentityStage` | `IdentityAndReferencesStage` | Also enforces reference integrity, step-type registry membership, per-type config schemas, and mutual exclusions; only three of its seven finding codes are `workflow.identity.*`, and the rest are `workflow.reference.unknown-target`, `workflow.step.unknown-type`, `workflow.step.invalid-config`, and `workflow.shape.mutually-exclusive` |
| `FormatStage` | `FormatVersionStage` | "Format" reads as JSON formatting; the stage reads `workflowFormatVersion` and selects a rule set by exact match |
| `CompatibilityStage` | `InputOutputCompatibilityStage` | "Compatible with what?" is unanswerable; the specification calls stage 8 "Input and output compatibility", and the class is a documented no-op in v1 |

Each class has 2 non-test references (import plus construction in `rules/v1.ts` or `workflow-validator.ts`), so this is the cheapest group in the review. Finding codes and stage ids (`shape`, `identity`, `format`, `compatibility`) do not change.

### `SourceMap` → `PointerLocationMap`, `SourcePointer` → `SourceSpan`

`packages/workflow/src/source-map.ts:18,26` · 11 and 3 non-test references · re-exported from the package entry point

"Source map" already means the bundler debugging artifact throughout the JavaScript ecosystem, and nothing in the name says this is a JSON Pointer to source-location table. The value type has the same defect from the other side: because the map key is a JSON Pointer, `Record<string, SourcePointer>` reads as if the value were the pointer, when it is the start and end location of one JSON value. `PointerLocationMap` and `SourceSpan` (`{ value, valueEnd }`) describe both halves without borrowing an established term.

### `validation/refs.ts` → `validation/data-references.ts`, `STEP_REF_PATTERN` → `STEP_OUTPUT_REF_PATTERN`

`packages/workflow/src/validation/refs.ts:10` · 3 importers · 7 references to the constant

"refs" reads as React refs or git refs. The module is the grammar for the specification's [Data references](../specifications/workflow-interface-v1.md#data-references) section, and it also exports `LOOP_RESULTS_OUTPUT`, which is not a reference at all. The regex `/^step\.([0-9a-f-]{36})\.(.+)$/` matches `step.<stepId>.<outputName>` and captures both parts, so `STEP_OUTPUT_REF_PATTERN` says what is matched; it is applied to step input bindings and to conditional leaf references alike, which the current name hides.

### `WorkflowDocument` schema value → `WorkflowDocumentSchema`, dropping `WorkflowDocumentType`

`packages/workflow/src/schema.ts:121`, `packages/workflow/src/index.ts:43` · internal only

One name serves two things: the TypeBox schema value and the document type. The entry point patches over the ambiguity with `WorkflowDocument as WorkflowDocumentType`, an alias referenced nowhere else in the repository, so consumers never learn which name to use. Naming the value `WorkflowDocumentSchema` and keeping `WorkflowDocument` as the type removes the alias.

That name is currently taken by the Control API's permissive request-body document (`apis/control-api/src/workflows/schemas.ts:144`, `Type.Unknown`). The two artifacts are unrelated, and the Control API's is the weaker claim on the name, so rename it to `PermissiveWorkflowDocumentSchema` or `RequestBodyDocumentSchema` in the same cutover. If that cross-package change is unwanted now, `WorkflowFormatV1DocumentSchema` is viable without touching the Control API.

### `includeLoopFeeds` → `includeIterationResultEdges`

`packages/workflow/src/validation/workflow-graph.ts:146` · 4 references · internal only

At call sites the flag is unreadable: `this.orderingEdges(true)` and `graph.orderingEdges(false)`. "Loop feeds" names an internal mechanism rather than the fact it adds — one edge per loop body member to its loop step so a consumer can reach the collected iteration results through the loop step. The proposed name states the semantic and is honest at a boolean call site.

## Storage and services

### `StoredRevision` → `Revision`

`packages/database/src/repositories/workflow-repository.types.ts:13` · 15 non-test references · internal only

The two revision shapes are named against their own meaning: `StoredRevision` is the application-facing shape (`revisionId`, parsed `findings: Finding[]`), while `RevisionRow` is what is actually stored (`id`, `findings` as JSON text). A reader comparing them would assign the names the other way round; the mapping function makes it concrete — `toStoredRevision(row: RevisionRow)` renames `row.id` to `revisionId` and parses `row.findings`.

`Revision` matches the specification's term and, more importantly, completes the pairing the file already has: `Publication` with `PublicationRow`. `RevisionRow`, `RevisionType`, and `schema/revisions.ts` stay as they are.

### `PublishInput` → `PublicationInsertInput`

`packages/database/src/repositories/workflow-repository.types.ts:85` · 3 non-test references · internal only

The suffix promises an operation input from a caller, but a publish request is a workflow id and arrives at the API layer; this is the storage insert payload produced by the publication canonicalizer (canonical text, digest, format version, and the two ids). Its siblings `CreateDraftInput` and `SaveRevisionInput` really are operation inputs, which is what makes the wrong assumption tempting. `PublicationInsertInput` keeps the file's `...Input` convention and says what the payload is for.

### `not-found` → `workflow-not-found`

`packages/database/src/repositories/workflow-repository.types.ts:75,82,107` and `apis/control-api/src/workflows/service.ts:56,186` · 13 references · internal only (handlers translate outcomes to HTTP statuses)

The sibling arms are qualified (`revision-not-found`, `target-not-found`) but the arm meaning "this workflow does not exist" is bare `not-found`, so a reader of `rewind()` must consult the consumers to learn which entity is missing. The ambiguity crosses the service boundary because the storage union and the API union both carry it. `workflow-not-found` matches the existing `workflowNotFound` error helper and makes all three arms self-describing.

### `Flight` → `InFlightProbe`

`packages/database/src/client.ts:157` · 2 references · internal only

The name is pure aviation with no route to its meaning: the dedup record for concurrent readiness probes, holding `controller`, `subscribers`, and `result`, created and cleared inside `probe()` and aborted on `close()`. The word neither says probe nor says shared, so it cannot carry the coalescing semantics a reader must understand before touching handle lifecycle. The TSDoc already says "one shared in-flight probe", which is the name to promote.

### `DatabaseCheck` → `DatabaseProbeResult`, `CheckResult` → `ReadinessCheckResult`

`packages/database/src/client.ts:26` · 7 references; `packages/server/src/protocol.ts:58` · 8 references · internal only

Both names read as the act of checking rather than its outcome. `probe(...): Promise<DatabaseCheck>` looks like it returns a check that has yet to run, and `classifyTransportFailure(...): CheckResult` gives no clue what was checked. The same idea also carries two names across two packages that must interoperate. `DatabaseProbeResult` aligns with the method that returns it; `ReadinessCheckResult` ties the server type to the `Readiness.checks` aggregate it feeds. Neither appears in `openapi.json`, so both are contract-safe.

### `dependencyIdentity` → `dependencyFingerprint`

`packages/server/src/lifecycle.ts:67,77,109` · 2 references each · internal only

"Identity" suggests a stable id or a comparison target, but the value is a JSON fingerprint of database settings used only for inequality tests. The trap is downstream: `liveIdentity` holds that fingerprint while `liveDependencies` holds the resources, so `liveIdentity !== candidateDependencyIdentity` reads as an identity comparison while deciding whether to rebuild the database handle. `dependencyFingerprint`, `liveDependencyFingerprint`, and `listenerFingerprint` say what is compared and what the comparison rebuilds.

### `RuntimeConfig` → `ReloadableServiceConfig`, `ServiceDependencies` → `ServiceResources`

`packages/server/src/lifecycle.ts:15,33` · 4 and 2 references · internal only

Two ambiguities in one file. `RuntimeConfig` is the reloadable subset of a service config — it omits `tokens`, and its own doc comment states the rule — but the name does not, so a reader cannot explain the omission. `ServiceDependencies` is the bundle of resources the runtime owns and closes, while `dependencyIdentity` and `dependencyTimeoutMs` in the same file denote the probed database and daemon link; one word, two meanings.

`ReloadableServiceConfig` states the defining property; `ServiceResources` frees "dependency" for the readiness meaning and reads correctly in `RunServiceOptions<C, D extends ServiceResources>` (the factory would become `createResources`). The API packages' structurally-satisfying `Dependencies` interfaces should follow in the same cutover.

### `isToken` → `isTokenSyntax`

`packages/server/src/tokens.ts:8` · 3 references · internal only

The name asks whether something is a token; the function answers whether it is hexadecimal, even length, and at least 64 characters. That distinction matters at its most sensitive call site, where the daemon uses it as a pre-filter before the constant-time digest comparison (`apis/daemon/src/auth.ts:21`): a reader could mistake the cheap shape check for the authentication decision. The TSDoc already says "syntax shared by configured tokens and a single incoming bearer credential".

### `RULE_SET_REGISTRY` → `WORKFLOW_FORMAT_REGISTRY`

`apis/control-api/src/workflows/rule-sets.ts:15` · 4 references · internal only

The constant instantiates `WorkflowFormatRegistry([V1_RULE_SET])`, so the constant and its own class disagree about which noun is primary, and its sibling `WORKFLOW_VALIDATOR` is named for the workflow format while this one is not. Nothing says the registry is keyed by `workflowFormatVersion`. The proposed name is the class's own noun, so the declaration reads `export const WORKFLOW_FORMAT_REGISTRY = new WorkflowFormatRegistry([...])`.

### `selectRuleSet` (Control API) → `ruleSetForFormatVersion`

`apis/control-api/src/workflows/service.ts:257` · 1 call site · internal only

The name says only "select a rule set"; the body reads the document's declared `workflowFormatVersion` and then calls `this.registry.select(declared)`. The repository already has this name with the opposite direction: `ValidationContext.selectRuleSet(ruleSet)` records a rule set it was handed, so a search for `selectRuleSet` returns a lookup and a setter as if they were one operation. A lookup name that states its key removes both problems.

### `Services.signal` (daemon) → `Services.abortSignal`

`apis/daemon/src/services.ts:19` · 3 references · internal only

The value is the per-request admission controller's signal, passed into the request handler and aborted when the shutdown deadline expires, so an in-flight readiness probe is cancelled by shutdown. The interface otherwise holds a config and a database handle, nothing hints at request lifetime, and the request path touches several other abort signals. The Control API's equivalent arrives as a named `signal` parameter, which is why the field reads like ordinary state.

### `readRequestBody` → `readDocumentRequestBody`

`apis/control-api/src/workflows/request-body.ts:35` · 4 references · internal only

`readRequestBody` and `readValidatedBody` describe identical work — both read, strictly parse, and schema-check the body — while the real difference is invisible: the first also returns the byte-exact source text of the body's `document` member so findings anchor to stored bytes. Callers pick between them by need rather than by name. The proposed name states the distinguishing product; leave the sibling as it is, or rename it `readValidatedJsonBody` if symmetry is wanted.

## APIs: wire-contract names (breaking)

These five change the bytes clients read. None of them is urgent, and each should ship with the next Control API client contract bump rather than on its own.

### `workflow_not_valid` → `workflow_not_publishable`

`apis/control-api/src/workflows/errors.ts:92` · publish path only

The code says the workflow is invalid, which a caller fixes by editing the document; the producer is the publish path, where an otherwise fine revision carries blocking findings that prevent publication and create nothing. The spec's term for the condition is "blocking findings", the same findings a save deliberately accepts. `workflow_not_publishable` names the refused operation instead of a property the workflow does not have.

### `invalid_workflow_input` covers two failures → split

`apis/control-api/src/workflows/errors.ts:50` · two producers

One code covers both "the body is not strict JSON" (duplicate keys, `NaN`/`Infinity`, invalid UTF-8) and "the body is valid JSON but violates the operation schema", and the storage layer's `InvalidWorkflowInputError` maps into the same code. A client cannot tell whether to repair bytes or repair shape. Give the parse failure its own code (`workflow_parse_failure`) and leave the schema failure under the existing name.

### Publication `content` → `canonicalText`, revision `type` → `revisionType`

`apis/control-api/src/workflows/schemas.ts:129,78` · two fields

Two wire names lose a distinction the internal types keep. The publication body's `content` is the canonical text whose byte-exactness the digest depends on, while the revision body's `content` is the author's submitted bytes; a client that hashes both has no warning that only one is canonical. The revision's `type` is its origin (`save` or `rewind`), which the same API family also uses for step types. Adopting `canonicalText` on the publication body only, and `revisionType` on the revision body, puts the wire names on the specification's terms (`canonicalText`, `RevisionType`).

### `BoundaryError` versus `ErrorResponse` → one shared `ServiceError`

`packages/server/src/protocol.ts:14`, `apis/control-api/src/schemas.ts:5` · two component names for one envelope

Both services answer `{ code, message, findings }`: the Control API publishes `#/components/schemas/ErrorResponse`, the daemon publishes `#/components/schemas/BoundaryError`, and the shapes differ only in that the daemon pins `findings` to `maxItems: 0`. A client written against one contract cannot name the other's error body, and no name exists for the envelope both services answer. Promote one shared schema into `packages/server` (`ServiceErrorSchema` / `ServiceError`) and reference it from both apps, keeping the daemon's stricter variant as a documented refinement of that component.

## Review automation (`scripts/review`)

### `Finding` → `ReviewFinding`

`scripts/review/types.ts:36` · 37 references · internal only

In this repository a reader meets `Finding` first as the specification-governed validation result exported from `@rostrum/workflow`, with `{ code, message, blocking, path }` and a `blocking` flag that decides `validForPublication`. The review pipeline exports a second, disjoint `Finding` with `{ ruleId, path, line, severity, confidence, ... }`, and the collision extends to behavior: both packages export a `sortFindings`, and the review's `isBlocking(severity)` reads like the product `Finding.blocking`. Nothing says which finding is meant. The review pipeline yields to the product type, which a frozen specification governs; `ReviewFinding` matches `ReviewContext` and `ReviewThread` already in the module.

### `--repo-root` → `--review-checkout`

`scripts/review/index.ts:88`, `adjudicate-cli.ts`, `.github/workflows/code-review.yml`, `.github/skills/code-review/SKILL.md` · 12 occurrences, including four CI invocations

The flag does not set the repository root: it binds `reviewRoot`, the checkout the reviewers read (the pull request head in CI), while `repositoryRoot` means the base-branch checkout the script and rule corpus come from. The flag therefore asserts exactly what the other variable already means, the value appears a third time as `ReviewContext.workingDirectory`, and the validation error names a fourth concept ("does not look like the repository"). `--review-checkout` binds to `reviewRoot` by name and matches the `--review-*` prefix the sibling CLI already uses.

### `merge.ts` → `finding-triage.ts`, `AnsweredFinding` → `PostedFinding`, `suppressAnswered` → `suppressPostedFindings`

`scripts/review/merge.ts:36,123` · 3 importers · 6 references · internal only

The file name promises a merge step, but the merging happens in the pipeline; this module suppresses, deduplicates, caps, floors, and sorts — its own header calls the job "Finding suppression, deduplication, and ordering". A reader looking for where lens results are merged opens the wrong file.

Inside it, `AnsweredFinding` claims a disposition that half its uses contradict: `partitionThreads` returns it for both the open and the resolved lists, so an "answered" entry can be unanswered by definition, and `suppressAnswered` reads the open list. `PostedFinding` describes the invariant every entry has (this pipeline posted it), and the plural rename keeps the function honest at its call sites.

### `resolveOmpInvocation` → `resolveReviewerCommand`

`scripts/review/reviewer.ts:143` · 4 references · internal only

`OMP` is expanded nowhere in the repository; it is the harness installed as `@oh-my-pi/pi-coding-agent` whose binary is plain `omp`. The function's own doc comment says it "builds the command that runs one reviewer agent" and it returns `AgentInvocation`, so name and return type disagree about the subject. Rename the environment constant with it: `OMP_BINARY_ENV` / `REVIEW_OMP_BIN` become `REVIEW_BINARY_ENV` / `REVIEW_AGENT_BIN` (no CI file or document sets the current variable).

### `retro.ts` → `retrospective.ts`, `--confidence` → `--confidence-floor`

`scripts/review/retro.ts`, `scripts/review/index.ts:85` · 5 and 2 references

Every other surface spells the word out — `runRetrospective`, the "Reviewer retrospective" report title, the `retrospective` CI job, the skill's "Weekly retrospective" section — while the file name, the `review:retro` script, and the workflow's concurrency group abbreviate. Similarly, `--confidence` binds a floor: it feeds `numericOption(..., "confidence floor", ...)` alongside `REVIEW_CONFIDENCE_FLOOR`, so the flag and the environment variable beside it disagree about the concept. Both renames must sweep the two documents that describe the command (`SKILL.md`, `code-review-retro.yml`) in the same cutover, or the docs stop matching the command.

### One-word states: `"stood"` → `"stands"`, and drop `"open"`

`scripts/review/adjudicate.ts:75`, `scripts/review/retro.ts:68` · 2 references each · internal only

The adjudication action `"stood"` is a fourth word for a state the pipeline already names three ways: the `Verdict` arm is `"stands"`, `NON_WITHDRAWING` matches on it, `renderDecisionTitle` prints "ISSUE STANDS", and the retrospective tallies `record.stands`. Any caller matching actions against verdicts must translate. Using `"stands"` collapses that to one word; the arms are a model-written wire format, so `verdicts.ts`'s own marker contract is unchanged.

In the retrospective, `FindingOutcome.verdict` carries both `"unadjudicated"` and `"open"`, and both feed the single `RuleRecord.unadjudicated` counter through the same path. Two arms for one state force every future switch to handle a case that behaves identically; drop `"open"`.

## Names reviewed and kept

These were examined because they look like candidates and were rejected; recording them prevents a second review from reopening them.

| Name | Why it stays |
| --- | --- |
| `Boundary` / `BoundaryError` | Governing M2 Epic 1 vocabulary; only the duplicate envelope name is proposed for change |
| `workflowFormatVersion`, `publicationNumber`, `revisionId`, `baseRevision`, `digest`, `validForPublication` | Specification field names fixed by the workflow format and the PLAN_1 cutover |
| `RevisionType` = `save` \| `rewind` | The specification's identifier model names exactly this term |
| `PublicationRow`, `RevisionRow`, `WorkflowRow`, `schema/*.ts` modules | Mirror the SQL tables, which is the storage contract |
| `Lens`, `lenses`, `--lenses`; `Verdict` and its five arms; `adjudicate` / `adjudication` | Defined by the code-review skill corpus and, for verdicts, a model-written wire format |
| `CanonicalizationError`, `StepTypeRegistry`, `WorkflowValidator`, `WorkflowGraph`, `ValidationPipeline`, `FindingFactory`, `SourceLocation`, `LOOP_RESULTS_OUTPUT` | Pass the test at their call sites |
| `DatabaseHandle`, `createDatabase`, `migrateToLatest`, `ReadinessProbe`, `checkReadiness`, `FeatureRoute`, `loadFeatures`, `parseTokens`, `accessLog` | Readable; the last has a daemon-side asymmetry that is an implementation gap, not a naming defect |
| `DEPENDENCY_TIMEOUT_MS` | Operator-facing contract fixed by the M2 Epic 1 configuration table and the README; `READINESS_TIMEOUT_MS` would be clearer if that contract is ever revised |
| Migration `003_published_versions` table and column names (`published_versions`, `version_number`, `interface_version`) | Applied migrations are a historical record; `005_publications` already renames all three, and rewriting shipped SQL for cosmetics would be worse than a stale name |

## Rules these recommendations follow

New code should keep the properties the proposals restore, so the same review is not needed again.

1. Name the subject with the operation. `PublicationCanonicalizer` beats `Preparer`; `workflow-not-found` beats `not-found`.
2. Use the specification's words for concepts the specification already names — data references, findings, rule sets, revisions, publications, digest, validation stages.
3. Do not reuse a term with an established meaning elsewhere in the ecosystem (`SourceMap`) or in this repository (`Finding`, `selectRuleSet`, `type`).
4. Qualify arms of a union by their subject (`revision-not-found`, `workflow-not-found`) so a reader never has to consult the consumer to learn which entity is missing.
5. Keep the schema value and the document type distinguishable: `WorkflowDocumentSchema` for the value, `WorkflowDocument` for the type, no alias.
6. Expand in the name anything a reader cannot look up locally. `OMP`, `GTS`, and `retro` all fail this test; the corpus, the file name, or the install command is one hop too far.

## Verification

Every proposed name was checked against the whole repository, including `dev-docs`, for an existing identifier or file of that name at the reviewed revision. The only match anywhere was the specification's own heading anchor `#data-references`, which is the alignment target, not a collision. No identifier named in this review was changed in the reviewed revision.

Reference counts are non-test occurrences at the reviewed revision, counted with a repository-wide search; they measure rename cost, not usage importance. Test files, fixtures, and generated `openapi.json` artifacts will need mechanical updates in the implementing change.

## Sequencing

1. Internal renames inside one package per cutover, with every call site migrated in the same change and no compatibility aliases: workflow format library first, then storage and services, then the review automation.
2. The Control API renames that cross packages (`WorkflowDocumentSchema`, the shared error envelope, the outcome arm) after the library and service cutovers, so each package keeps a compiling state.
3. Wire renames last, with a client contract bump and regenerated `openapi.json`.
4. Migration history and the operator configuration surface stay untouched.

A coding agent can execute the first tranche mechanically; the wire tranche needs a decision on the client contract bump before it starts.
