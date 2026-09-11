# Epic delivery methodology

Status: Approved

This document defines how Rostrum turns product goals into technical work that an agent can plan, implement, and verify without creating a large planning hierarchy.

## Method

Rostrum uses four levels:

```text
Product strategy
    ↓
Product roadmap milestone
    ↓
Technical Epics
    ↓
One or more implementation plans per active Epic
```

Product strategy defines the problem, audience, product boundaries, and architectural principles. The roadmap orders observable product goals.

A technical Epic defines one coherent product capability needed to reach a roadmap milestone. It explains the intended behavior, scope, constraints, non-goals, and observable acceptance criteria. Include technical detail when it explains what a user can do or inspect, or a boundary the implementation must preserve. An Epic is not a detailed design or implementation plan.

Each implementation plan covers one coherent workstream within an Epic. Its owner records the current repository state, implementation sequence, checkpoints, decisions, progress, verification, and recovery information. For the plan format, see [Epic implementation plan format](epic-implementation-plan-format.md).

## Epic size

An Epic is the right size when:

- One owner can maintain each implementation plan.
- It has one coherent technical outcome.
- Its acceptance can be demonstrated independently.
- Each plan needs only a small number of checkpoints.
- Another agent can resume from the plan without loading the entire roadmap.

An Epic may have several plans when separate owners can work on distinct parts of the same technical outcome. Each plan must have a clear scope and owner, and plans must link any dependencies between them. Split the Epic when its outcomes can be accepted independently or no longer form one coherent result.

## Writing an Epic

Write for an engineer who knows the product but has not designed the subsystem. Lead with the capability and the behavior users should expect. Explain unfamiliar terms, identify who or what each rule applies to, and distinguish limits on a deployment from limits on individual uses of it.

Keep useful technical detail without designing the implementation in the Epic. Execution states belong here when they help a caller understand progress or inspect an outcome, even if the engine also uses them internally. Handler interfaces, schema fields, algorithms, operation catalogs, and exhaustive error cases belong in the specification or implementation plan.

Use a short product scenario when it clarifies a requirement. Do not require a sample implementation or executable test procedure in every Epic. The implementation plan selects the concrete operations and workflows, supplies their inputs and expected results, and explains how to verify them.

Use terminology from the current governing decisions, and distinguish agreed direction from implemented behavior and unresolved proposals. Link detailed rules rather than repeating them. Acceptance criteria state observable outcomes; review ownership and verification procedures belong with the work that performs them.

The Epic introducing a behavior owns focused verification of that behavior. A dedicated testing Epic may consolidate examples and test infrastructure without making earlier Epics depend on that later work.

## Plans and checkpoints

An implementation plan can span several agent sessions and pull requests. Checkpoints are sections inside the plan, not separate documents or tracker objects.

Several plans can be active under the same Epic. Each checkpoint belongs to exactly one plan, and the plans together must cover the Epic acceptance criteria without duplicating work.

Each checkpoint states:

- The behavior or repository state it produces.
- The work needed to reach it.
- The commands and scenarios that prove it.
- Any decision that requires human approval.
- The information another contributor needs to resume.

The plan records temporary research, implementation decisions, discoveries, and concise evidence. Create a separate specification, decision record, or research document only when its content must remain useful across several Epics.

## Reviews and ownership

The plan identifies which work requires senior review. Public contracts, state transitions, persistence, concurrency, compatibility, and security boundaries require an appropriately skilled reviewer.

A junior developer can own a bounded Epic or checkpoint when the contract, reference pattern, permitted files, acceptance scenario, and escalation conditions are explicit. They must escalate work that changes a shared interface or introduces a decision outside the approved plan.

An independent agent reviews the implementation against the Epic and plan before human review. Human review then concentrates on decisions and risks that require judgment.

## Local workflow execution example

The current "Local workflow execution" Epic is too broad to be one coherent technical Epic. It becomes roadmap milestone M2:

> A caller can invoke an exact workflow publication through the Control API, disconnect, and later retrieve progress, output, or failures. One daemon supports independent concurrent runs and every M2 control-flow construct.

M2 is delivered through these technical Epics:

| Epic | Technical outcome | Independent acceptance |
| --- | --- | --- |
| E2.1: Establish the daemon network boundary | Run independently configured Control API and daemon services over private authenticated HTTP, with both using the same Postgres database through `packages/database`; move backend services to `apis/` | Focused service checks prove authenticated requests, readiness, errors, and independent shutdown; E2.6 owns the automated separate-network environment |
| E2.2: Execute sequential workflows | Invoke a selected publication, follow its sequence, and inspect each run's progress and outcome | Accepted runs continue after client disconnect and remain independent, including concurrent invocations of the same publication |
| E2.3: Execute conditional workflows | Select one path from declared conditions and show which work was selected or excluded | A pricing scenario produces the correct result on each path; invalid conditions remain distinguishable from false conditions |
| E2.4: Execute parallel paths and joins | Combine independent work within a run while sharing worker capacity across runs | Joins wait for successful paths, results do not depend on completion order, and busy runs do not starve other eligible runs |
| E2.5: Execute bounded loops | Process items in order with author-selected iteration error handling | Fail-fast prevents later iterations; permitted error capture preserves the failed item's position and allows later items to run |
| E2.6: Complete M2 conformance | Demonstrate consistent M2 behavior across execution layers and real services | One command proves the combined constructs, shared storage and secure network access, concurrent runs, client disconnect, and cleanup |

The Epics introduce behavior in dependency order. E2.2 establishes run identity, progress, data flow, and results. E2.3 through E2.5 extend execution with each control-flow construct while keeping the specification, validation, and runtime consistent. Their implementation plans supply detailed contracts and executable examples. E2.6 consolidates those examples and verifies the whole system rather than defining a different execution model.

### Current work mapping

| Current work | Revised location |
| --- | --- |
| E2-S2 and E2-05 | E2.1 |
| E2-S1, E2-03, E2-04, and the run-contract and sequential portions of E2-06, E2-07, E2-10, E2-11, and E2-12 | E2.2 |
| Conditional portions of E2-07, E2-11, and E2-12 | E2.3 |
| Parallel implementation portions of E2-08 | E2.4 |
| Loop implementation portions of E2-09 | E2.5 |
| Conformance and real-process demonstration portions of E2-08, E2-09, E2-11, and E2-12 | E2.6 |
| E2-01 | E2.2 prerequisite or maintenance pull request |
| E2-02 | Closed when this methodology and migration are approved |

## Milestone 3: Durable runs and human control

M3 is delivered through seven technical Epics:

| Epic | Technical outcome | Independent acceptance |
| --- | --- | --- |
| [E3.1: Recover durable runs](epics/m3/e3-1-recover-durable-runs.md) | Persist accepted runs and recover interrupted M2 execution | A run survives service restart, preserves committed work, and remains inspectable while the daemon is unavailable |
| [E3.2: Retry bounded failures](epics/m3/e3-2-retry-bounded-failures.md) | Retry explicitly eligible failures within durable attempt limits | A retry succeeds or exhausts with every attempt visible and no unbounded repeat |
| [E3.3: Pause, resume, and cancel runs](epics/m3/e3-3-pause-resume-and-cancel-runs.md) | Apply durable operator commands at recoverable execution boundaries | A caller can pause, resume, or cancel one run and distinguish request acceptance from applied execution |
| [E3.4: Wait for human decisions](epics/m3/e3-4-wait-for-human-decisions.md) | Wait durably for one validated general decision and continue its selected path | A decision survives restart, accepts one response, and exposes its continuation and response |
| [E3.5: Inspect run timelines](epics/m3/e3-5-inspect-run-timelines.md) | Expose committed per-run events through cursor-based retrieval | A reconnecting caller can read complete ordered history without a live daemon |
| [E3.6: Retrieve run artifacts](epics/m3/e3-6-retrieve-run-artifacts.md) | Store and retrieve bounded immutable evidence with integrity metadata | A caller retrieves an artifact independently and verifies its producer, size, and digest |
| [E3.7: Complete M3 conformance](epics/m3/e3-7-complete-m3-conformance.md) | Demonstrate the combined durable lifecycle through real services | One isolated command proves restart, retry, controls, decisions, timelines, artifacts, and M2 compatibility |

E3.1 establishes the durable source of truth and recovery rules. E3.2 through E3.6 add independent lifecycle capabilities while extending the same checkpoint and observation contracts. E3.7 composes them into one real-service demonstration. The Epics require implementation plans to resolve storage, schemas, interruption behavior, and test controls without prescribing a database, queue, artifact backend, or live subscription system in advance.

M3 is separate from later governance. A decision records a response and available caller identity, but does not assign approvers or send notifications. Operator controls affect one run, while human decisions are workflow steps.

## Other roadmap work

Milestones 4 through 13 remain roadmap entries. Do not create speculative Epic files or plans for them until their dependencies and boundaries are clear.

For the repository cutover, see [Development documentation migration](development-documentation-migration.md).
