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
| E2.1: Establish the daemon network boundary | Let the Control API and one daemon communicate over a private, authenticated HTTP boundary without requiring the same process, filesystem, database, or host | The real services communicate from separate containers or network namespaces, reject unauthenticated requests, report health, and stop independently |
| E2.2: Execute sequential workflows | Define the run, handler, binding, result, and failure rules while building the first working execution path | A caller starts a sequential run, disconnects, and later retrieves its result or failures |
| E2.3: Execute conditional workflows | Define and implement condition evaluation, branch selection, and unselected-path state | Both branch outcomes work through the real Control API and daemon, and unselected work does not run |
| E2.4: Execute parallel paths and joins | Define and implement bounded concurrency, matching joins, fair scheduling, handler drain, and stable failures | Worker capacity and completion order do not change the joined result or ordered failures |
| E2.5: Execute bounded loops | Define and implement ordered iterations, bounds, loop variables, failure policies, and parallel work inside an iteration | Loop behavior passes through every supported execution boundary |
| E2.6: Complete M2 conformance | Run one fixture catalog through each layer that implements the behavior and prove M2 with real processes | The workflow package, runtime, daemon HTTP API, and Control API agree, and one command proves local execution |

The Epics introduce contracts with the behavior that uses them. E2.2 defines only the shared run, handler, binding, result, and failure rules needed for sequential execution. E2.3 through E2.5 update the workflow specification, types, validator, schemas, fixtures, and daemon together for each control-flow construct. E2.6 checks the finished system rather than introducing another interpretation of workflow behavior.

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
