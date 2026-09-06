# Workflow interface v1 specification

| Tracking | Value |
| --- | --- |
| Status | Accepted |
| Source | [E1-03 task at the migration revision](https://github.com/RostrumAI/rostrum/blob/4da89f6316abd44f6ef499a27b87c60aca35e610/docs/tasks/epic-01/e1-03-write-workflow-interface-v1-specification.md) |
| Decisions | [E1-S1](../decisions/m1/e1-s1-workflow-interface-v1.md), [E1-S2](../decisions/m1/e1-s2-validation-behavior.md), [E1-S3](../decisions/m1/e1-s3-draft-publication-lifecycle.md), [E1-S4](../decisions/m1/e1-s4-interface-versioning-methodology.md) |
| Machine-readable schema source | [`packages/workflow/src/schema.ts`](https://github.com/RostrumAI/rostrum/blob/main/packages/workflow/src/schema.ts) |
| Last updated | 2026-08-28 |

## What this specification defines

This specification defines workflow interface v1: the JSON document that describes a workflow, the validation contract that decides whether a document can be published, the lifecycle that turns drafts into immutable published versions, and the versioning rules that keep every published v1 document readable forever.

Five consumers read this contract:

- the visual editor and automated authors, which write and read the JSON;
- the shared workflow library and validator, which check it mechanically;
- the Control API, which carries it across the service boundary;
- the daemon, which executes published versions;
- the Rostrum Cloud control plane, which reimplements the same contract.

A workflow document is a single JSON object in camelCase, optimized for machine generation and parsing. The primary authoring surface is a visual editor. The document carries no lifecycle fields: creation time, revision identity, published-version number, and digest are assigned by the server during the lifecycle defined in [Draft and publication lifecycle](#draft-and-publication-lifecycle).

The JSON Schema 2020-12 document emitted from [`packages/workflow/src/schema.ts`](https://github.com/RostrumAI/rostrum/blob/main/packages/workflow/src/schema.ts) covers the document-shape rules that validation stage 2 enforces. Topology, conditional semantics, termination, data references, and lifecycle rules are enforced by the staged validator described in [Validation](#validation); JSON Schema cannot express them.

## Document structure

### Top-level fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `interfaceVersion` | string | **required** | The workflow interface version. v1 is the literal `"v1"`. Rostrum selects the document schema and step-type registry from this value by exact match; there is no fallback. See [Interface versioning and evolution](#interface-versioning-and-evolution). |
| `id` | string (UUID v7) | **required** | Stable workflow identifier, unique within a workspace. Assigned by the server when the draft is created. Referenced by the Control API and run requests. |
| `name` | string | **required** | Workflow name. Display-only; see [Field classification](#field-classification). |
| `description` | string | optional | Workflow description. Display-only. Defaults to absent. |
| `firstNode` | string (UUID v7) | **required** | The `id` of the step where execution begins. |
| `inputs` | object | optional | Workflow inputs. Each key is an input name; each value is a JSON Schema 2020-12 fragment describing the accepted value. Defaults to `{}`. |
| `steps` | array | **required** | Unordered list of step objects. Minimum length 1. Execution order follows the graph topology, never array order; the visual editor determines display order. |
| `conditionals` | array | optional | List of conditional objects used for evaluated routing. Defaults to `[]`. See [Conditionals](#conditionals). |

"Required" in the field tables means required for a valid, publishable document. Drafts are held to a lower bar on purpose: any syntactically valid JSON saves as a draft, and a fresh workflow missing `firstNode` or `steps` saves with those missing-field findings attached (see [Saving a draft](#saving-a-draft)). The schema rules below therefore describe the publishable end state, not what the editor must show at every moment.

### Step fields

Every step shares the same base shape; `config` is the step-type-specific part.

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `id` | string (UUID v7) | **required** | Step identifier, unique across the workflow's `steps`. The target of `firstNode`, `successors`, `dependencies`, `branches[].next`, `default.next`, and `loop.body`. |
| `type` | string | **required** | Step-type name. Selects the configuration schema and validation rules from the step-type registry for the declared interface version. |
| `config` | object | optional | Step-type-specific configuration, validated against the registered schema for `type`. Defaults to `{}`. |
| `inputs` | object | optional | Bindings from this step's input names to literal values or references. Defaults to `{}`. See [Data references](#data-references). |
| `outputs` | object | optional | Declared outputs. Each key is an output name; each value is a JSON Schema 2020-12 fragment describing the produced value. Defaults to `{}`. |
| `successors` | array of strings (UUID v7) | optional | Step IDs to execute after this step completes. All successors run in parallel with no ordering guarantee. Mutually exclusive with `conditional`. |
| `dependencies` | array of strings (UUID v7) | optional | Step IDs that must complete before this step starts. Enables fan-in. Defaults to `[]`. See rule 3 under [Graph topology](#graph-topology). |
| `conditional` | string (UUID v7) | optional | The `id` of a conditional object that evaluates this step's routing. Mutually exclusive with `successors` and with `loop`. |
| `loop` | object | optional | Bounded iteration configuration. See [Loops](#loops). |

Control-flow rule: a step has exactly one of `successors` or `conditional`, or neither. A step with neither is terminal. A step may additionally have `loop`. A terminal step outside a loop body must be typed `result`; a loop body's terminal step may be any type, and its outputs are collected as that iteration's result. A conditional branch or default that omits `next` also ends the workflow; the run's terminal result is the conditional step's resolved outputs.

### Identifiers

All identifiers are UUID v7 strings: lowercase hexadecimal, version nibble 7 in the third group, RFC 9562 variant in the fourth group (for example `0192b0a0-7e1d-7000-8000-000000000001`). UUID v7 is time-ordered, so sorting identifiers chronologically never depends on array position. The server mints every identifier; authors never fabricate them (see [Identifier model](#identifier-model)).

### Built-in step types

The shape fixes the extension mechanism, not the step catalog. Two demonstrative types are named here; the authoritative reference step set is selected separately by later work.

| Type | `config` | `outputs` | Meaning |
| --- | --- | --- | --- |
| `task` | `{ "operation": "<string>" }` plus type-specific fields | Declared by the author | A deterministic unit of work. Its handler produces the declared outputs. |
| `result` | none required | none | A terminal step. Its `inputs` bind the workflow outputs; the resolved `inputs` object is the run's terminal result. |

### Step-type extension

A step type is a registry entry keyed by its `type` string. The entry contributes a JSON Schema 2020-12 fragment for the step's `config` object and any validation rules beyond the config schema. Rostrum validates a step's `config` against the schema registered for its `type` under the declared `interfaceVersion`.

- A step whose `type` is not registered is a blocking finding. The workflow is invalid, never silently reinterpreted.
- Adding a step type never changes the base document shape. It is a backward- and forward-compatible extension: older releases reject the new type explicitly as unsupported, and newer releases read existing types identically.
- A registered type's `config` schema may be relaxed within v1. A change that invalidates a previously valid `config` requires a new interface version or a new type name (see [Breaking and additive changes](#breaking-and-additive-changes)).

## Graph topology

The step graph is a directed acyclic graph (DAG). These rules are enforced at validation time:

1. **Acyclic.** No step may transitively depend on itself. A cycle is a blocking validation error.
2. **Forward-only edges.** `successors`, `branches[].next`, `default.next`, and `loop.body` must reference steps that do not transitively lead back to the current step.
3. **Dependency reachability.** Every step listed in a `dependencies` array must be reachable on all paths from `firstNode` to the dependent step (the merge-after-branch restriction). This prevents a step from waiting on a predecessor that may not execute on every branch path. Relaxing this restriction is deferred to a future interface version.
4. **Fan-out parallelism.** When a step has multiple `successors`, all successors start in parallel when the step completes. There is no ordering guarantee among parallel successors.
5. **Fan-in via dependencies.** A step with multiple `dependencies` starts only after all dependencies have completed. This enables join points where parallel branches converge.
6. **Terminal steps.** A step with neither `successors` nor `conditional` is terminal. A terminal step outside a loop body must be typed `result`. Within a loop body, the terminal step may be any type, and its outputs are collected per iteration.
7. **Path endings.** Every reachable path ends at a terminal `result` step or at a conditional branch or default whose `next` is omitted. An end-workflow branch ends the run with the conditional step's resolved outputs as the terminal result.

## Data references

A binding value is either a JSON literal (string, number, boolean, object, array, or `null`) or a reference object with the exact shape `{ "ref": "<path>" }`. A path is one of:

- `inputs.<name>` — a workflow input;
- `step.<stepId>.<outputName>` — an output declared by a step that completes before this reference resolves; a step that declares a `loop` also exposes the reserved output `results`, the array of collected iteration results (see [Loops](#loops));
- `loop.<variable>` — the current element in a loop iteration, available only within loop body steps.

A reference resolves to the referenced value at execution time. A `result` step binds its `inputs` the same way, and the resolved object is the run's terminal result.

A JSON object whose only key is `ref` with a string value is always interpreted as a reference, never as a literal. Passing such a literal object requires an escape syntax that no v1 workflow needs; if one appears, an escape syntax will be defined in a future interface version.

Validation checks that each reference resolves to a declared workflow input, a declared output of an existing step that completes before the consumer, or a loop variable in scope. How thoroughly v1 compares producer and consumer types is defined in [Input and output compatibility](#input-and-output-compatibility).

## Conditionals

Conditionals are a separate top-level shape. A step that uses conditional routing references a conditional by `id` through its `conditional` field. The conditional declares which step outputs it depends on, an ordered list of branch rules, and a default fallback.

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `id` | string (UUID v7) | **required** | Conditional identifier. Referenced by a step's `conditional` field. |
| `dependencies` | array of strings (UUID v7) | **required** | Step IDs whose outputs are needed to evaluate the branch conditions. Every step referenced in a branch condition must be listed here. These steps must complete before the conditional is evaluated. |
| `branches` | array | **required** | Ordered array of branch rule objects. Minimum length 1. |
| `default` | object | **required** | Fallback branch taken when no branch condition matches. |

### Branch rule

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `label` | string | **required** | Display name for the branch. |
| `priority` | integer (≥ 0) | **required** | Branch priority. Among branches whose conditions evaluate to true, the branch with the lowest priority number is selected. |
| `condition` | object | **required** | Boolean condition expression. See [Condition expressions](#condition-expressions). |
| `next` | string (UUID v7) | optional | Step ID to execute if this branch is selected. Omitting `next` ends the workflow on this branch. |

### Default branch

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `label` | string | **required** | Display name for the default branch. |
| `next` | string (UUID v7) | optional | Step ID to execute when no branch condition matches. Omitting `next` ends the workflow when the default is selected. |

Ending the workflow from a conditional covers the common fallback scenario without requiring a `result` step on a path that produces nothing new. When the workflow ends this way, the run's terminal result is the resolved outputs of the step that owns the conditional.

### Condition expressions

A condition is either a leaf predicate or a boolean group.

Leaf predicate:

```json
{ "ref": "step.<stepId>.<outputName>", "op": "<operator>", "value": <json-value> }
```

Supported operators: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in`, `notin`, `contains`, `truthy`, `falsy`. For `truthy` and `falsy`, the `value` field is omitted.

AND group — true only if every child condition is true:

```json
{ "all": [ <condition>, <condition> ] }
```

OR group — true if any child condition is true:

```json
{ "any": [ <condition>, <condition> ] }
```

Groups nest to any depth.

## Loops

A step with a `loop` field performs bounded `forEach` iteration over a collection. The loop body is a subgraph within the same `steps` array, starting at the step referenced by `loop.body`.

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `collection` | reference object | **required** | Reference to the array value to iterate over: a workflow input (`inputs.<name>`) or a step output (`step.<stepId>.<outputName>`) from a step that completes before iteration begins, including the loop step's own output. Must resolve to a finite array at execution time. |
| `maxIterations` | integer (≥ 1) | **required** | Hard cap on the number of iterations. If the collection length exceeds this value, the run fails with a structured error. The upper bound on `maxIterations` itself is set by a configurable platform config variable, defaulting to 1000; a document that declares a larger value is invalid. |
| `variable` | string | **required** | Name under which the current element is accessible in body step inputs via `loop.<variable>`. |
| `body` | string (UUID v7) | **required** | Step ID of the body subgraph's first step. The body subgraph is validated as a separate DAG within the same `steps` array. |

Loop rules:

1. The body subgraph must be acyclic, under the same DAG rules as the top-level graph.
2. The body subgraph must have at least one terminal step.
3. No nested loops in v1: a step within a loop body cannot declare a `loop` field.
4. Only bounded `forEach` iteration is supported. No `while` or `until` loops are expressible in v1.
5. `loop` can coexist with `successors`: the body runs per iteration, and `successors` fire after all iterations complete.
6. `loop` is mutually exclusive with `conditional`.
7. Body terminal steps' outputs are collected into an array and exposed as the loop step's output under the reserved output name `results`. A reference to `step.<loopStepId>.results` resolves to the collected array without a declaration in the loop step's `outputs`; declaring `results` in `outputs` is optional and documents the element shape.
8. The loop step's own handler runs before iteration begins, so `collection` may reference the loop step's own outputs in addition to any workflow input or upstream step output.

## Interface versioning and evolution

### Version selection

Rostrum supports a set of interface versions by retaining one immutable rule set per version: the document schema plus the step-type registry. v1 is the first such set. Rule selection is an exact match on `interfaceVersion`. An unknown version is a blocking finding, never a silent fallback to v1 or to the nearest version.

Every future release retains the frozen v1 rule set, so a v1 document keeps validating and executing identically forever. Recognition means "validated and executed with v1 semantics", never "migrated to the newest version". There is no automatic upgrade or rewriting: a v1 document stays v1.

The platform (engine) version — a Rostrum release — is a separate axis from the interface version. Shipping a new engine release may add or retire interface-version support, but it never changes the semantics of a supported rule set. A run of a supported version is therefore unaffected by an engine upgrade.

### Field classification

Every v1 field has exactly one class. The classification is in force from v1 and governs versioning consequences only; the validator still re-validates every publish.

| Field | Class |
| --- | --- |
| `id` (top level) | identity — changing it changes which workflow the document is, not a versioning event |
| `name`, `description` | metadata — display-only; cannot affect any run |
| `interfaceVersion` | version selector — chooses the frozen rule set |
| `firstNode`, `inputs`, `steps`, `conditionals` | operational |
| Step fields (`id`, `type`, `config`, `inputs`, `outputs`, `successors`, `dependencies`, `conditional`, `loop`) | operational — step `id` is identity within the document; duplicates are validation errors |
| Branch and default `label` | operational-by-default — display-only in effect, but part of routing inspection |

A **metadata change** is an edit touching only metadata-class fields. An **operational change** is any other edit. Step-type `config` fields are classified by each registry entry when it ships; the base-shape classes above are fixed.

### Breaking and additive changes

A change that makes a previously valid v1 document invalid requires a new interface version (`"v2"`, `"v3"`, …). Breaking changes are:

1. a rule-set change that makes a previously valid v1 document invalid;
2. a step-type `config` schema change that invalidates a previously valid `config` — bump or new type name;
3. removal of a step type from the registry;
4. reinterpretation of an existing construct that changes execution behavior for identical documents — it must ship as a new version's rule set, and the frozen v1 rule set is never mutated;
5. a change to the normalization or digest contract that breaks reproduction of stored digests.

Additive changes stay within `v1` and never bump the interface version: a new optional top-level field, a new step type, relaxed validation or a relaxed `config` schema, a new conditional operator, a relaxed DAG rule. An additive change is allowed only if every previously valid v1 document remains valid.

Shipping a new interface version moves no documents. An author migrates by editing `interfaceVersion` in a draft, resolving blocking findings, and publishing. Deprecating a step type keeps it registered and documented; removal is breaking.

### Runtime impact

- **Bind-on-start.** A run executes the exact published version it was started against, to completion, with that version's rule set. Later publishes, interface versions, or deprecations never alter an in-flight run.
- **Future invocations.** The version named at invocation determines behavior. New invocations change only when an author republishes with a new `interfaceVersion`, or when the platform deprecates a version.
- **Deprecation windows.** The platform may announce an end-of-life (EOL) date for an interface version. Before EOL the version remains fully supported. At EOL, new invocations of that version are refused with a documented error; in-flight runs continue; drafts and validation of that version's documents remain available. Authoring never breaks, only new execution.
- **No in-flight auto-upgrade in v1.** Any future mechanism must be additive to bind-on-start — opt-in per run or per workflow — never a silent switch of a started run's version.

### Metadata-only changes

Metadata-only edits never bump `interfaceVersion` and never change the digest. A metadata-only republish is permitted and produces a new published version whose digest equals the previous version's digest: callers comparing digests see that the definition is unchanged.

## Draft and publication lifecycle

Three objects make up the lifecycle. A **draft** is the workflow's working copy: what the editor shows and what the author edits. Every successful save creates a new **revision**: a checkpoint holding the exact bytes the author submitted plus a snapshot of validation findings. Every revision is typed: `save` for an author save, `rewind` for the checkpoint a rewind appends (see [Rewind](#rewind)). The draft's current revision is the newest one, and only the current revision can be published. A **published version** is an immutable release: the current revision's content, canonicalized and hashed, stored forever under a per-workflow version number. Publishing never removes the draft; rewinding the draft to an earlier revision is how an author selects an earlier state for publication.

### Identifier model

| Identifier | Type | Assigned by | Changes when |
| --- | --- | --- | --- |
| Workflow `id` | UUID v7 | Server, at draft creation; injected into the stored document | Never |
| Draft | = workflow `id` | — | — |
| Revision `id` | UUID v7 | Server, per successful save | New id per save; the current one changes on every save and on rewind |
| Revision name | string, optional | Author | Checkpoint label; editable while the revision exists |
| Revision type | `save` or `rewind` | Server, when the revision is created | Never |
| Published version | integer ≥ 1 | Server | Increments by 1 per successful publish |
| Digest | SHA-256 hex (64 chars) | Server, computed from the document | Deterministic on content; immutable once stored |

The server mints the workflow `id` when the draft is created and injects it into the stored document, so the document is always self-identifying and the author never mints, collides, or misaddresses ids. An embedded `id` in a creation payload is replaced, never honored. On later saves, an embedded `id` that differs from the addressed workflow is an identity conflict; an omitted `id` is stored with the workflow's `id` injected.

Revision ids carry no position, so rewinding never renumbers anything.

### Saving a draft

- **Eligibility.** Any syntactically valid JSON saves as a draft, including documents with blocking validation findings. Parse failures — invalid JSON, duplicate keys, `NaN`/`Infinity`, invalid UTF-8 — are errors, not drafts.
- **Revision check.** Updates carry `baseRevision`: the id of the revision the client last saw. The server commits only when it equals the draft's current revision; otherwise the save fails with a conflict carrying the current revision and findings. The first save has no `baseRevision`.
- **Atomicity.** One transaction inserts the revision row — a fresh server-generated UUID v7 id, the exact submitted bytes, the findings snapshot, the optional name, and the `save` revision type — then, under a short row lock, conditionally updates the draft's current revision. A stale save fails cleanly.
- **Findings.** Recomputed on every save and stored with the revision, so retrieval returns findings without re-validation.
- **Content.** The exact submitted bytes are stored in the revision row and returned unchanged. This is the only draft-side copy of the author's JSON.

### Publishing

- The author publishes the draft's current revision. To publish an earlier state, rewind first, then publish.
- Publication re-runs validation on the stored content. Blocking findings reject the publish without creating anything. A valid revision is canonicalized once and stored as an immutable published version with its digest. The stored content is the canonical text; verification is `sha256(retrieved) == digest`.
- The response carries the workflow `id`, published version number, `interfaceVersion`, and digest.
- A revision publishes at most once. Publishing the same revision again returns the existing version (idempotent). Concurrent publishes of the same revision return the same single version.

| Scenario | Result |
| --- | --- |
| Publish with blocking findings | Rejected with findings; no version created; draft untouched |
| Publish with no draft revisions | Not found |
| Publish an already-published current revision | Existing version returned (idempotent) |
| Save with stale `baseRevision` | Conflict with current revision and findings; no partial write |
| Save with embedded `id` ≠ addressed workflow | Identity conflict |
| Edit a draft after publication | New revision; published versions unchanged |
| Rewind to an earlier revision | A copy of the target becomes current; every revision stays in history; published versions unchanged |
| Rewind past the newest published revision's source | Succeeds — the published version's source revision stays retrievable |
| Rewind to the current revision | No-op |

### Rewind

Rewinding appends a copy of the earlier target revision as the newest revision and repoints the draft's current-revision pointer at that copy. The copy carries the target's exact bytes and findings snapshot and is stored with the `rewind` type; the target and every newer revision stay in history, so published versions always keep their source revisions retrievable. Further saves create new revisions after the copy.

### Draft after publication

The draft remains editable after publication. Further saves create new revisions, rewind appends a copy of an earlier revision and repoints the draft at it, and further publishes create new versions. Published rows are immutable and are never touched by draft operations.

## Digest

The digest identifies a workflow definition so that any implementation — the validator, the Control API, the daemon, the Cloud control plane, a conformance harness — can verify published content from the document alone.

- **Canonicalization.** RFC 8785 (JSON Canonicalization Scheme): member names sorted lexicographically by UTF-16 code units; numbers serialized as the shortest IEEE-754 round-trip (`1.0` becomes `1`, `-0` becomes `0`); strings minimally escaped; no whitespace; `NaN`/`Infinity` rejected.
- **Metadata exclusion.** The top-level `name` and `description` members — the metadata-class fields in v1 — are removed from the parsed document before canonicalization. The digest therefore covers `interfaceVersion`, `id`, `inputs`, `steps`, and `conditionals`: the definitional content. A metadata-only edit leaves the digest unchanged. The published version's stored content is the full canonical document including metadata; only the digest excludes it.
- **Hash.** SHA-256 over the canonical form, encoded as lowercase hexadecimal.
- **Input constraints.** The document must be duplicate-key-free; duplicate keys are rejected at parse. Unicode is not normalized: NFC and NFD forms of the same text produce different digests. This is defined behavior.
- **Reproducibility.** The digest is computable from the document alone. Server context — version number, timestamps — is never hashed. The digest is computed at publish; implementations may compute and cache it at save.

## Validation

Validation starts from raw text and runs an eight-stage pipeline in a fixed order. A stage runs only when none of its prerequisite stages produced a blocking finding. Draft save, explicit validation, and publication return the same findings for the same raw text, sorted by JSON Pointer then code.

| Stage | Checks | Prerequisite |
| --- | --- | --- |
| 0. Parse | Text is valid JSON; duplicate keys rejected; source map built for line and column | None |
| 1. Interface version | `interfaceVersion` is present and equals `"v1"` (exact match) | Parse |
| 2. Document shape | Required fields, types, UUID v7 formats, `additionalProperties: false`, array bounds, `maxIterations >= 1`. Enforced by the schema emitted from [`packages/workflow/src/schema.ts`](https://github.com/RostrumAI/rostrum/blob/main/packages/workflow/src/schema.ts). Unknown fields are reported here | Interface version |
| 3. Identity and references | Step and conditional ids unique; `firstNode`, `successors`, `dependencies`, `loop.body`, `branches[].next`, `default.next` reference existing steps; `type` in the registry; mutual exclusions (`successors` xor `conditional`; `loop` xor `conditional`) | Shape |
| 4. Graph topology | Acyclic (top level and loop bodies); no nested loops; `maxIterations` a positive integer; dependency reachability | Identity |
| 5. Conditional semantics | Branch and default present; every condition-referenced step listed in `dependencies`; operators from the allowed set; leaf refs well-formed | Identity, Graph |
| 6. Path and termination | Every reachable path ends at a terminal `result` step or an end-workflow branch; terminal steps outside loop bodies typed `result` | Graph, Conditional |
| 7. Data references | Every `{ "ref": "..." }` syntactically valid and resolvable to a declared input, an upstream step output, or an in-scope loop variable | Identity, Graph |
| 8. Input and output compatibility | Existence and ordering checks from stage 7; type-level compatibility advisory only in v1 | Data references |

### Findings

Each finding carries: `code` (a stable dot-namespaced identifier such as `workflow.graph.cycle` — the contract; message text is not), `message` (human-readable), `blocking` (whether it prevents publication), `path` (JSON Pointer, RFC 6901), `line` and `column` (from the source map when text is available), `relatedLocations` (additional pointers for cross-reference conflicts), and `details` (structured context for automated repair).

All findings are blocking in v1 except advisory input/output type mismatches.

### Input and output compatibility

v1 checks that each reference resolves to a declared input or output and that the producing step completes before the consuming step. It does not compare the producer's and consumer's JSON Schema fragments beyond that existence check. A runtime may still fail when a step produces a value whose shape does not satisfy the consumer; static compatibility is intentionally limited in v1. A future interface version may add a blocking type-compatibility check.

## Examples

The example set lives in `packages/workflow/tests/fixtures/`, one file per document, organized as `valid/` (publishable), `incomplete/` (saveable drafts with blocking findings from stages 3 through 8), `invalid-shape/` (rejected by the interface-version stage or the document schema for one specific reason), and `invalid-parse/` (rejected at parse). Each non-valid fixture has a committed expected-findings manifest under `packages/workflow/tests/fixtures/expected/<category>/` that records the exact codes, blocking flags, JSON Pointers, related locations, details, and source locations the validator must return. Each valid example's digest vector is committed in [`digest-vectors.json`](https://github.com/RostrumAI/rostrum/blob/main/packages/workflow/tests/fixtures/digest-vectors.json) and asserted by the workflow library tests.

### Valid — sequential with terminal result

Binds a name, produces a greeting, returns it. (`tests/fixtures/valid/sequential.json`)

```json
{
  "interfaceVersion": "v1",
  "id": "0192b0a0-7e1d-7000-8000-000000000001",
  "name": "Greet and summarize",
  "description": "Bind a name, produce a greeting, return it.",
  "firstNode": "0192b0a0-7e1d-7000-8000-000000000002",
  "inputs": {
    "name": { "type": "string" }
  },
  "steps": [
    {
      "id": "0192b0a0-7e1d-7000-8000-000000000002",
      "type": "task",
      "config": { "operation": "greet" },
      "inputs": { "name": { "ref": "inputs.name" } },
      "outputs": { "greeting": { "type": "string" } },
      "successors": ["0192b0a0-7e1d-7000-8000-000000000003"]
    },
    {
      "id": "0192b0a0-7e1d-7000-8000-000000000003",
      "type": "result",
      "inputs": { "greeting": { "ref": "step.0192b0a0-7e1d-7000-8000-000000000002.greeting" } }
    }
  ]
}
```

The smallest publishable workflow is a single terminal `result` step (`tests/fixtures/valid/minimum.json`). The remaining valid examples demonstrate conditional branching with two terminal results, fan-out and fan-in (a PR review workflow: one trigger spawns five parallel reviewers that fan into a summarizer), a bounded loop over a collection, and grouped AND/OR conditions:

- `tests/fixtures/valid/conditional-branching.json`
- `tests/fixtures/valid/fan-out-fan-in.json`
- `tests/fixtures/valid/bounded-loop.json`
- `tests/fixtures/valid/conditional-groups.json`

### Incomplete — valid JSON, blocking findings

Syntactically valid and saveable as a draft, but not publishable. In `unfinished-connection.json`, `successors` names a step that does not exist and the workflow has no terminal result — findings from stages 3 and 6 of the pipeline, not from the schema:

```json
{
  "interfaceVersion": "v1",
  "id": "0192b0a0-7e1d-7000-8000-000000000050",
  "name": "Unfinished workflow",
  "firstNode": "0192b0a0-7e1d-7000-8000-000000000051",
  "steps": [
    { "id": "0192b0a0-7e1d-7000-8000-000000000051", "type": "task", "successors": ["0192b0a0-7e1d-7000-8000-000000000099"] }
  ]
}
```

In `unknown-step-type.json`, the step's `type` is not in the registry. The error is explicit, never ignored:

```json
{
  "interfaceVersion": "v1",
  "id": "0192b0a0-7e1d-7000-8000-000000000060",
  "name": "Unknown step type",
  "firstNode": "0192b0a0-7e1d-7000-8000-000000000061",
  "steps": [
    { "id": "0192b0a0-7e1d-7000-8000-000000000061", "type": "no-such-type" }
  ]
}
```

The remaining incomplete drafts each isolate one post-schema finding: an unfinished branch target, a fresh workflow missing `firstNode` and `steps`, duplicate step ids, a `firstNode` that names no step, a step `config` that violates its type schema, mutually exclusive control-flow fields, a top-level cycle and a loop-body cycle, an unreachable dependency (branch-then-join), a nested loop, conditional-semantics violations (missing dependency, unknown operator, malformed condition ref, condition referencing an unknown step, empty condition group), a non-result terminal, and data references that are malformed or do not resolve. Two fixtures fail at parse instead: `invalid-parse/duplicate-key.json` carries a duplicate object key and `invalid-parse/malformed-syntax.json` is not valid JSON; both are errors, never drafts.

### Invalid — unknown interface version

Fails validation because no rule set exists for `v2` in a release that ships only v1; it is never treated as v1. (`tests/fixtures/invalid-shape/unknown-interface-version.json`)

```json
{
  "interfaceVersion": "v2",
  "id": "0192b0a0-7e1d-7000-8000-000000000070",
  "name": "Not yet supported",
  "firstNode": "0192b0a0-7e1d-7000-8000-000000000071",
  "steps": [
    { "id": "0192b0a0-7e1d-7000-8000-000000000071", "type": "task", "config": { "operation": "noop" } }
  ]
}
```

The remaining invalid-shape examples each isolate one rule: a missing required field, an unknown top-level field, a malformed UUID, an empty `steps` array, a missing `interfaceVersion`, a `maxIterations` value below 1, a loop missing its `collection`, and a conditional missing its `default`:

- `tests/fixtures/invalid-shape/missing-required-field.json`
- `tests/fixtures/invalid-shape/unknown-field.json`
- `tests/fixtures/invalid-shape/malformed-uuid.json`
- `tests/fixtures/invalid-shape/empty-steps.json`
- `tests/fixtures/invalid-shape/missing-interface-version.json`
- `tests/fixtures/invalid-shape/loop-bound-below-one.json`
- `tests/fixtures/invalid-shape/loop-missing-collection.json`
- `tests/fixtures/invalid-shape/conditional-default-missing.json`
