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

A technical Epic defines one coherent engineering outcome needed to reach a roadmap milestone. It contains scope, inherited contracts, technical requirements, non-goals, and acceptance criteria. It does not contain task status or file-by-file implementation instructions.

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

Write for an engineer who knows the product but has not designed this subsystem. Name the behavior and the decisions the Epic must settle. For example, replace "define invocation validation" with the workflow identity, required inputs, supported step types, and rejection behavior that must be specified. Introduce code field names alongside their meaning.

Keep requirements at the level of an engineering outcome. Configurable network listeners are an Epic requirement; calling a particular listen function belongs in an implementation plan. Each execution Epic includes a concrete workflow with named steps, inputs, expected output, and failure cases. Acceptance checks those outcomes rather than asking only for a "reviewed contract."

Distinguish existing rules from proposals. Link the current specification, identify which rules must change, and state where unresolved decisions will be recorded before dependent code is written. Review requirements belong in the plan's ownership and risk sections, not as repeated approval gates with no defined artifact.

The Epic introducing a behavior owns focused verification of that behavior. A dedicated testing Epic may own shared examples, test infrastructure, and full-system checks without making earlier Epics responsible for building that infrastructure independently.

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

> A caller can invoke an exact published workflow version through the Control API, disconnect, and later retrieve its progress, output, or failures after the local daemon executes every workflow interface v1 control-flow construct.

M2 is delivered through these technical Epics:

| Epic | Technical outcome | Independent acceptance |
| --- | --- | --- |
| E2.1: Establish the daemon network boundary | Run independently configured Control API and daemon services over private authenticated HTTP, with both using the same Postgres database through `packages/database`; move backend services to `apis/` | Focused service checks prove authenticated requests, readiness, errors, and independent shutdown; E2.6 owns the automated separate-network environment |
| E2.2: Execute sequential workflows | Specify the supported deterministic steps, request checks, execution state, data bindings, handler responses, and final result while implementing sequential execution | A named sequential workflow returns the expected output after the caller disconnects; invalid requests create no run and execution errors prevent success |
| E2.3: Execute conditional workflows | Specify operator types and branch priority, select one destination, and distinguish unselected work from failures | A concrete workflow exercises each destination, boundary values, and invalid comparisons without running unselected steps |
| E2.4: Execute parallel paths and joins | Execute bounded parallel work, wait for matching successful paths, share capacity across runs, and stop and settle failed work within its execution scope | A concrete workflow produces the expected joined output at different capacities and reports observed failures in stable order |
| E2.5: Execute bounded loops | Specify ordered iteration results and workflow-configured error policies, including parallel work inside an iteration | A concrete collection produces ordered results; fail-fast stops later iterations and error tolerance captures eligible iteration failures and continues |
| E2.6: Complete M2 conformance | Define the testing strategy, shared example catalog, layer responsibilities, and real-service environment | One command proves all M2 constructs, shared-database and authenticated network access, client disconnect, and cleanup |

The Epics introduce rules with the behavior that uses them. E2.2 defines the shared run, handler, binding, result, and failure rules needed for sequential execution. E2.3 through E2.5 update the workflow specification, types, validator, schemas, example workflows, and daemon together for each control-flow construct. An error captured by a configured loop policy is an iteration result, not automatically a failed run. E2.4's handling of parallel failures must support that distinction. E2.6 compares the finished implementations and owns reusable testing infrastructure rather than introducing another interpretation of workflow behavior.

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

## Other roadmap work

The current Epic 3 becomes roadmap milestone M3. Split it into technical Epics only when M2 contracts are stable and M3 is ready for implementation.

Milestones 4 through 13 remain roadmap entries until their dependencies and boundaries are clear. Do not create speculative Epic files or plans for them.

For the repository cutover, see [Development documentation migration](development-documentation-migration.md).
