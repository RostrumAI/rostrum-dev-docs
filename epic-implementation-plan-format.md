# Epic implementation plan format

Status: Proposed for review

This document defines the format used by each implementation plan for a technical Epic.

## Recommendation

Use the Epic as the specification and one or more living implementation plans as its execution artifacts. Do not adopt OpenSpec or GitHub Spec Kit by default. Their proposal, specification, design, and task files would duplicate information already present in the Epic and plans.

This remains spec-driven development:

```text
Epic requirements and acceptance
    ↓
Implementation plan
    ↓
Code and verification
```

The plan format follows the useful parts of [OpenAI ExecPlans](https://developers.openai.com/cookbook/articles/codex_exec_plans): observable outcomes, living progress, independent checkpoints, decision history, verification, and recovery.

## Artifact boundary

The Epic defines what must be true. Each plan defines how to complete one scoped part of that outcome.

| Epic | Implementation plan |
| --- | --- |
| Technical outcome | Current repository state |
| Scope and non-goals | Files, interfaces, and implementation sequence |
| Inherited contracts and invariants | Decisions and discoveries |
| Acceptance criteria | Commands, scenarios, and expected results |
| Durable product meaning | Temporary progress and recovery state |

Do not restate the complete Epic in the plan. Link to it and include only the context needed to implement it safely.

## Plan lifecycle

The owner creates a plan immediately before its workstream starts. The plan remains canonical for that scope until its acceptance criteria pass.

Several plans may be active under one Epic. Each has one owner, covers a distinct scope, and links to dependent plans. Agents continuing that scope update the same plan rather than creating a competing plan.

After a plan is complete, move durable facts into the Epic, a shared specification, code, tests, or a separate decision record. Delete the completed plan from the repository. Git history and pull requests preserve its execution history.

## Required sections

Use this template:

```markdown
# Implement <technical Epic>

Epic: <link to the Epic document>

## Purpose

State the technical outcome and how a reviewer can observe it.

## Current repository state

Describe the relevant packages, services, interfaces, and behavior.

## Scope

State what the implementation includes and excludes.

## Decisions

Record approved decisions and mark any decision that requires human approval before dependent work begins.

## Progress

- [ ] Record implementation progress and pull-request links.

## Checkpoints

### Checkpoint 1: <observable intermediate outcome>

State the work, acceptance commands, expected result, reviewer, escalation conditions, and recovery state.

## Implementation approach

Describe the files, interfaces, state transitions, and sequence of changes.

## Verification

List the commands and real scenarios that prove the Epic acceptance criteria.

## Discoveries

Record unexpected behavior and concise evidence.

## Decision log

Record implementation decisions and their rationale.

## Outcome

Record the final behavior, evidence, remaining gaps, and pull requests.
```

## Checkpoints

A checkpoint is a plan section, not another artifact. It must leave the repository runnable and produce a result that can be verified independently.

Use a checkpoint when it:

- Establishes a contract needed by later work.
- Produces the first complete vertical path.
- Adds a distinct behavior or risk area.
- Creates a safe handoff point for another developer or agent.

Each checkpoint states its owner and required reviewer. A junior developer can own work behind a stable interface and reference pattern. Changes to shared interfaces, state transitions, persistence, concurrency, compatibility, or security require an appropriately skilled reviewer.

## Agent workflow

1. Read the product strategy, roadmap milestone, Epic, durable specifications, and relevant code.
2. Create the implementation plan from the repository's actual state.
3. Resolve or flag decisions that block implementation.
4. Implement one checkpoint at a time.
5. Exercise the changed behavior and record evidence.
6. Update progress, discoveries, decisions, and recovery state before stopping.
7. Run an independent agent review against the Epic and plan.
8. Request human review for the risks identified in the plan.
9. Complete the Epic only when its acceptance criteria pass.

One checkpoint may produce one or more pull requests. Pull-request boundaries follow independently mergeable repository states, not the number of headings in the plan.

## When a plan is too large

Split a plan when distinct workstreams need separate owners but still contribute to one technical outcome. Split the technical Epic when the outcomes can be accepted independently or no longer form one coherent result.

## Optional tooling

OpenSpec and GitHub Spec Kit remain available if Rostrum later needs generated requirement deltas, formal artifact validation, or large-team workflow automation. Do not add either tool until the Epic and plan model proves insufficient in real development.
