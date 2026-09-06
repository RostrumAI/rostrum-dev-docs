# E1-S2 decision: Validation checks, finding shape, and execution order

| Tracking | Value |
| --- | --- |
| Status | Decided |
| Source | [E1-S2 task at the migration revision](https://github.com/RostrumAI/rostrum/blob/4da89f6316abd44f6ef499a27b87c60aca35e610/docs/tasks/epic-01/e1-s2-define-validation-behavior.md) |
| Depends on | [E1-S1: Workflow JSON v1 shape](e1-s1-workflow-interface-v1.md) |
| Last updated | 2026-08-16 |

## Decision

Rostrum validates workflow JSON through an eight-stage pipeline that runs in a fixed order, gates later stages on earlier blocking findings, and returns the same ordered findings for draft save, explicit validation, and publication. TypeBox (JSON Schema 2020-12) handles document shape; imperative stages handle graph, conditional, termination, and data-reference rules. Each finding carries a stable code, a human message, a blocking flag, a JSON Pointer, line and column when source text is available, related locations for cross-reference errors, and a structured details object so an automated author can repair without parsing the message. Static input and output compatibility in v1 checks existence and declaration, not schema subtyping.

## Context

E1-S1 fixed the workflow shape: a DAG with successors, dependencies, conditionals as a separate top-level list, and bounded loops. All identifiers are UUID v7. A step carries exactly one of successors or conditional, or neither (terminal); a branch or default may omit next to end the workflow.

Epic 01 requires that draft save, explicit validation, and publication return the same findings for the same JSON, that later checks run only when earlier results provide enough reliable information, and that publication blocks when any finding is blocking. The spike must decide which checks run, in what order, which prerequisites gate each check, which document through data-reference problems are detected, how findings prevent publication, what each finding contains, and how far v1 checks input and output compatibility before execution.

E1-S0 fixed the toolchain: Bun, TypeScript 7, TypeBox as the single schema language. The proof of concept for E1-S0 left finding shape provisional and blocking uniformly true. E1-S2 fixes both.

## Why these choices

| Aspect | Choice | Reason |
| --- | --- | --- |
| Schema layer | TypeBox `Schema.Compile` as the shape stage, JSON Schema 2020-12 as the public dialect | One schema language for the workflow specification, the API contract, and validation. Native TypeBox types produce the stored JSON Schema without conversion; unknown fields and unknown step types surface as explicit findings instead of silent union failures. An alternative that spread validation across multiple libraries would reintroduce the gaps the stack decision rejected. |
| Orchestration | Staged pipeline where each stage declares prerequisite stage ids; a stage with a blocking finding gates its dependents | Matches the epic requirement that later checks run only when earlier results are reliable. A flat validator that always runs every check emits cascading findings on structurally broken input, which the proof of concept demonstrates. The pipeline keeps prerequisite logic declarative and testable without scattering early-exit guards. |
| Finding identity | Dot-namespaced stable code per rule (for example `workflow.graph.cycle`, `workflow.conditional.missing-dependency`) | Automated authors match on code and details, not on message text. Codes remain stable across wording changes. |
| Locations | JSON Pointer for every finding; line and column from a source map when the original text is available; `relatedLocations` for two-site conflicts (for example a dependency that is not reachable on all paths points to the dependent step and to the dependency step) | A visual editor needs a pointer into the document; an automated author needs structured details; a human needs a line reference when editing raw JSON. One location field cannot serve all three. |
| Ordering | Findings sorted by pointer then code, deterministic across runs and stages | The Control API, the daemon, and conformance suites compare findings by equality. Nondeterministic order would require set comparison and hide regressions. |
| I/O compatibility boundary | v1 checks that each `{ ref }` resolves to a declared workflow input, a declared step output, or a loop variable in scope, and that the target step completes before the consumer. Type-level compatibility beyond existence is not blocking in v1. | The workflow inputs and outputs are JSON Schema fragments; a general subtyping check is a separate decision with its own compatibility semantics. Existence and ordering catch the authoring errors that block publication without committing v1 to a schema-subtyping rule that later epics would need to broaden. |

## Validation contract

Validation starts from raw text. The stages below run in order. A stage runs only when none of its prerequisite stages produced a blocking finding. The finding shape and blocking decisions are part of the contract.

| Stage | What it checks | Prerequisite | Representative codes | Publication impact |
| --- | --- | --- | --- | --- |
| 0. Parse | Text is valid JSON under the selected duplicate-key rule. Source map is built for line and column. | None | `workflow.parse.json-invalid` | Blocking |
| 1. Interface version | `interfaceVersion` is present and equals `v1` (exact match; no fallback). Supported interface versions are enumerated in details. | Parse | `workflow.version.missing`, `workflow.version.unknown` | Blocking |
| 2. Document shape | Required fields, types, string formats (UUID v7, NUL-free), `additionalProperties: false`, array bounds, and `maxIterations >= 1` at the schema level. TypeBox errors map to `workflow.shape.*` codes with schema path in details. Unknown fields and unknown step types are reported here. | Interface version | `workflow.shape.required-field`, `workflow.shape.unknown-field`, `workflow.shape.type`, `workflow.shape.format`, `workflow.shape.constraint` | Blocking. When this stage blocks, graph and later stages are gated. |
| 3. Identity and reference integrity | Step and conditional ids are unique. `firstNode` references an existing step. Every `successors`, `dependencies`, `loop.body`, `branches[].next`, and `default.next` that is present references an existing step. `type` is in the registry for the selected interface version. Mutually exclusive control-flow fields are enforced (`successors` xor `conditional`; `loop` xor `conditional`). | Shape | `workflow.identity.duplicate-step-id`, `workflow.identity.duplicate-conditional-id`, `workflow.identity.first-node-unknown`, `workflow.step.unknown-type`, `workflow.reference.unknown-target`, `workflow.shape.mutually-exclusive` | Blocking |
| 4. Graph topology | The combined graph of `successors`, conditional branches, and loop bodies is acyclic. Loop body subgraphs are acyclic. No step inside a loop body declares a `loop` (no nesting in v1). `maxIterations` is a positive integer. Dependency reachability is checked: every dependency must be reachable on all paths from `firstNode` to the dependent step (merge-after-branch restriction). Fan-in dependencies that violate the restriction produce `unreachable-dependency` with a related location pointing to the dependency step. | Identity | `workflow.graph.cycle`, `workflow.loop.invalid-max-iterations`, `workflow.loop.nested`, `workflow.graph.cycle` (body), `workflow.graph.unreachable-dependency` | Blocking |
| 5. Conditional semantics | Each conditional has at least one branch and a default. Every step id referenced in a branch condition is listed in the conditional `dependencies`. Predicate operators are from the allowed set and leaf refs are `step.<uuid>.<output>`. Conditional refs that target unknown steps are reported. | Identity, Graph | `workflow.conditional.empty-branches`, `workflow.conditional.missing-dependency`, `workflow.conditional.invalid-operator`, `workflow.conditional.invalid-ref`, `workflow.conditional.unknown-step` | Blocking |
| 6. Path and termination | Every reachable path from `firstNode` leads to a valid ending: a terminal `result` step, or a conditional branch or default whose `next` is omitted (end-workflow). A terminal step outside a loop body must be typed `result`. Dependency-induced fan-in edges are included when enumerating reachable paths so parallel predecessors that join through `dependencies` are not reported as unterminated. | Graph, Conditional | `workflow.termination.non-result-terminal`, `workflow.termination.unterminated-path` | Blocking |
| 7. Data references | Each `{ ref }` is syntactically valid and resolves: `inputs.<name>` to a declared workflow input, `step.<id>.<output>` to a declared output of an existing step, `loop.<variable>` to the variable of an enclosing loop. Loop collection refs follow the same rule and may reference the loop step own output. A step ref that does not complete before the consumer is reported (`not-upstream`); a loop variable outside its body is reported (`loop-out-of-scope`). | Identity, Graph | `workflow.reference.invalid-syntax`, `workflow.reference.unknown-input`, `workflow.reference.unknown-step`, `workflow.reference.unknown-output`, `workflow.reference.not-upstream`, `workflow.reference.loop-out-of-scope` | Blocking |
| 8. Input and output compatibility | Static compatibility in v1 is limited to the existence checks in stage 7. When both a producer output and a consumer declare a `type` keyword, a mismatch is not blocking in v1; the stage exists to document the boundary and to reserve a stable code for a future version that may make type compatibility blocking. | Data references | None blocking in v1; reserved `workflow.io.type-mismatch` as advisory when both sides declare a primitive `type` | Advisory only in v1 |

Stage 0 through 2 establish that the document can be read and that its shape is trustworthy. Stage 3 establishes that identifiers and targets exist. Stages 4 through 7 assume targets exist and therefore are safe to build graph structures. When a stage gates a later stage, the gated stage emits no findings for that document; the early finding already explains why the later property cannot be evaluated.

## Finding shape

Each finding is the object returned by the shared validator and by the Control API. Draft save, explicit validation, and publication return the same array for the same raw text, sorted by pointer then code.

| Field | Type | Meaning |
| --- | --- | --- |
| `code` | string | Stable dot-namespaced identifier. The prefix `workflow.` denotes the workflow domain. The remainder names the stage and rule, for example `workflow.graph.cycle`. Codes are the contract; message text is not. |
| `message` | string | Human-readable explanation of the problem and, where relevant, the received value. |
| `blocking` | boolean | Whether the finding prevents publication. All problems listed in the contract except advisory I/O mismatches are blocking in v1. |
| `path` | string | JSON Pointer (RFC 6901) to the part of the workflow that caused the finding, or `""` for a document-level problem such as a cycle. |
| `line` | number | One-based line in the original text, when the source map is available. Omitted when the validator is called with a parsed object. |
| `column` | number | One-based column in the original text, when the source map is available. |
| `relatedLocations` | array of `{ path, message }` | Additional pointers involved in a cross-reference conflict, for example the location of a dependency step when the dependent step violates reachability. |
| `details` | object | Structured, machine-readable context for automated repair without parsing the message. Examples: `{ cycle: ["id1","id2","id1"] }`, `{ step: "id4", dependency: "id2" }`, `{ received: "no-such-type", supported: ["task","result"] }`, `{ conditionalId: "c1", referencedStep: "s2", ref: "step.s2.output" }`. |

The proof of concept demonstrates that each rule populates details with the identifiers and values an automated author needs. The runbook lists representative vectors that show codes, pointers, related locations, and details for cycles, unreachable dependencies, missing conditional dependencies, nested loops, unknown outputs, unknown step types, invalid ref syntax, and invalid predicate operators.

## Input and output compatibility limits in v1

v1 does not evaluate whether the value expected by a later step is compatible with the value produced by an earlier step beyond existence. The validator verifies that a reference resolves to a declared input or output and that the producing step completes before the consuming step. It does not perform JSON Schema subtyping between the producer schema and the consumer schema.

A future interface version may add a blocking `workflow.io.type-mismatch` check that compares declared `type` keywords or full schemas. That change requires its own compatibility rule and test vectors and is out of scope for v1. Authoring guidance will document that v1 guarantees publication when refs resolve, and that a runtime may still fail when a step produces a value whose shape does not satisfy the consumer, because static compatibility is intentionally limited.

## Alternatives considered

| Alternative | Rejected because |
| --- | --- |
| Single-pass validator that always runs every stage | Later stages that build graph structures run on structurally broken input and emit secondary findings that obscure the root cause. The staged pipeline gates those stages and matches the epic requirement that later checks run only when earlier results are reliable. The demo contrasts the two: the staged pipeline yields one denotative finding for a cycle, while the flat validator either misses branch and dependency checks or floods the result with derived errors. |
| Schema-only validation without imperative stages | JSON Schema cannot express acyclicity, dominator-based reachability, conditional-dependency coverage, path termination, or ref ordering. Those properties require graph construction and are part of the E1-S2 contract. |
| Validation as a separate service rather than a shared library | Epic 01 already requires a shared workflow library used by the Control API, the validator, and the future daemon. A service boundary would force the Control API and daemon to agree on findings over the network; a library guarantees identical findings for the same JSON. |
| Type-compatibility as blocking in v1 | A full subtyping check for JSON Schema fragments requires a decision on which keywords are compared and how `anyOf`, `$ref`, and missing schemas are handled. That decision is not part of E1-S1 or E1-S2 and would make otherwise valid v1 documents unpublishable without authoring-visible benefit. |

## Deferred decisions

- Reference-literal escaping for the literal object `{ "ref": "..." }` remains deferred to E1-03; the validator interprets any object with sole key `ref` as a reference.
- Draft revision identity, publication identity, and digest rules are E1-S3 scope; findings determine whether publication is allowed, not how the version number or digest is computed.
- Versioning methodology — what triggers an interface version bump and how version changes affect running workflows — is E1-S4 scope; the exact-match token contract for `interfaceVersion` is not altered by that investigation.
- The authoritative step-type catalog and each type `config` schema remain E2-S3 scope; the v1 registry demonstrated here contains `task` and `result` only.
- Unbounded loops, `while` and `until` loops, nested loops, and relaxation of the merge-after-branch restriction are deferred to a future interface version; the validator reports nested loops and unreachable dependencies as blocking in v1.

## Verification

The proof of concept lives in `tmp/e1-s2-poc` and is the verification for this decision. It contains a staged pipeline implementation (`poc-b/validator.ts`) and a flat sequential baseline (`poc-a/validator.ts`) for comparison, plus a shared fixture set that covers the contract. The fixtures are the denotation tests: each finding carries its code, pointer, line and column, related locations, and details.

Run the demos from the repository root:

```bash
bun run tmp/e1-s2-poc/run-demo.ts
bun run tmp/e1-s2-poc/run-denotation-demo.ts
```

Expected result for the staged pipeline on the representative matrix:

| Fixture | Expected code and blocking |
| --- | --- |
| Valid sequential | No findings, publishable |
| Cycle | `workflow.graph.cycle` blocking with `details.cycle` |
| Unreachable dependency (branch-then-join) | `workflow.graph.unreachable-dependency` blocking with `relatedLocations` pointing to the dependency step |
| Missing branch target | `workflow.reference.unknown-target` blocking |
| Nested loop | `workflow.loop.nested` blocking with outer and inner ids |
| Invalid loop bound | `workflow.shape.type` and `workflow.loop.invalid-max-iterations` blocking |
| Conditional missing dependency | `workflow.conditional.missing-dependency` blocking with conditional id and missing ref |
| Unterminated path | `workflow.termination.non-result-terminal` blocking |
| Conditional that ends the workflow | No findings, publishable |
| Unknown step type | `workflow.step.unknown-type` blocking with supported types |
| Ref to unknown output | `workflow.reference.unknown-output` blocking with output name |
| Fan-out and fan-in (PR review) | No findings, publishable |
| Loop body cycle | `workflow.graph.cycle` blocking, including body subgraph cycle |

The denotation demo prints each finding as JSON, showing that an automated author can map from `code` and `details` to a repair action without parsing the message. The gating demo shows that a document with shape errors produces only shape findings; graph and termination findings are absent because the pipeline gates them.

The decision is complete when the product owner and implementing engineer confirm that the contract, finding shape, ordering, and compatibility limits above answer the spike acceptance criteria and can serve as the validator specification for E1-03 and E1-04.
