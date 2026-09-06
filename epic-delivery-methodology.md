# Epic delivery methodology

Status: Proposed for review

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
One implementation plan per active Epic
```

Product strategy defines the problem, audience, product boundaries, and architectural principles. The roadmap orders observable product goals.

A technical Epic defines one coherent engineering outcome needed to reach a roadmap milestone. It contains scope, inherited contracts, technical requirements, non-goals, and acceptance criteria. It does not contain task status or file-by-file implementation instructions.

The agent assigned to an Epic creates and maintains one implementation plan. The plan describes the current repository state, implementation sequence, checkpoints, decisions, progress, verification, and recovery information. For the plan format, see [Epic implementation plan format](epic-implementation-plan-format.md).

## Epic size

An Epic is the right size when:

- One owner can maintain its implementation plan.
- It has one coherent technical outcome.
- Its acceptance can be demonstrated independently.
- Its plan needs only a small number of checkpoints.
- Another agent can resume from the plan without loading the entire roadmap.

Split an Epic when its plan starts coordinating independent subsystems, separate review domains, or work that different owners can accept independently. If two agents need separate plans, the work should normally be separate Epics.

## Plans and checkpoints

An implementation plan can span several agent sessions and pull requests. Checkpoints are sections inside the plan, not separate documents or tracker objects.

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

The current "Local workflow execution" Epic is too broad for one implementation plan. It becomes roadmap milestone M2:

> A caller can invoke an exact published workflow version through the Control API, disconnect, and later retrieve its progress, output, or failures after the local daemon executes every workflow interface v1 control-flow construct.

M2 is delivered through these technical Epics:

| Epic | Technical outcome | Independent acceptance |
| --- | --- | --- |
| E2.1: Make workflow interface v1 executable | Freeze execution, handler, failure, and validation contracts | The workflow package accepts every executable fixture and rejects ambiguous or unsupported definitions |
| E2.2: Establish the local daemon boundary | Select and implement the daemon transport, lifecycle, configuration, health, and structured errors | The daemon runs separately, responds through the transport, and shuts down cleanly |
| E2.3: Execute sequential workflows | Connect invocation, handlers, runtime state, explicit results, Control API operations, and client disconnection | A caller starts a sequential run, disconnects, and later retrieves its result |
| E2.4: Execute conditional workflows | Evaluate conditions, select one path, and preserve unselected-path state | Both conditional outcomes work through the real API and daemon, and unselected work does not run |
| E2.5: Execute parallel paths and joins | Add bounded concurrency, matching joins, fair scheduling, handler drain, and stable failures | Capacity and completion order do not change the joined result or ordered failures |
| E2.6: Execute bounded loops | Add ordered iterations, bounds, loop variables, both failure policies, and nested parallel work | Loop behavior passes through every supported execution boundary |

E2.3 creates the first runtime, daemon, API, conformance, and end-to-end path. E2.4 through E2.6 extend that same path. Completing E2.6 satisfies the M2 exit demonstration, so conformance does not become a separate testing Epic.

### Current work mapping

| Current work | Revised location |
| --- | --- |
| E2-S1, E2-03, and E2-04 | E2.1 |
| Contract portions of E2-06 | E2.1 |
| E2-S2 and E2-05 | E2.2 |
| Implementation portions of E2-06, sequential portions of E2-07, E2-10, E2-11, and E2-12 | E2.3 |
| Conditional portions of E2-07, E2-11, and E2-12 | E2.4 |
| E2-08 and its conformance and demonstration work | E2.5 |
| E2-09 and its conformance and demonstration work | E2.6 |
| E2-01 | E2.1 prerequisite or maintenance pull request |
| E2-02 | Closed when this methodology and migration are approved |
| E2-13 | M1 authoring hardening, outside M2 |

## Other roadmap work

Epic 1 becomes completed roadmap milestone M1. Keep its durable specification and decisions, but do not recreate completed task files as active issues.

The current Epic 3 becomes roadmap milestone M3. Split it into technical Epics only when M2 contracts are stable and M3 is ready for implementation.

Milestones 4 through 13 remain roadmap entries until their dependencies and boundaries are clear. Do not create speculative Epic files or plans for them.

## GitHub

GitHub Projects is not required. Use a milestone for each active product milestone and, when tracking is useful, one issue for each active technical Epic. The issue links to the Epic, active plan, and implementation pull requests.

Create additional issues only for independently assigned work, unplanned defects, or decisions that need discussion outside the plan. Implementation tasks and checkpoints remain in the plan.

For the repository cutover, see [Development documentation migration](development-documentation-migration.md).
