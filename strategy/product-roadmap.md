# Rostrum product roadmap

Status: Rough first draft for product and architecture discussion  
Depends on: [Product strategy](product-strategy.md)
Audience: Product, engineering, design, security, and operations

## Purpose

The [product strategy](product-strategy.md) describes Rostrum's architecture and boundaries. This document defines what to build, the order in which it becomes useful, and the showcases that demonstrate the result.

Rostrum defines and executes workflows. A caller selects a workflow and supplies its declared inputs. Prompt intake, request interpretation, and workflow selection are outside the platform unless a user builds or connects a workflow that performs those jobs.

## Contents

- [1. Product scope](#1-product-scope)
- [2. What we are building and why](#2-what-we-are-building-and-why)
- [3. Delivery milestones](#3-delivery-milestones)
- [4. Showcase suite](#4-showcase-suite)
- [5. Product boundaries](#5-product-boundaries)
- [6. Finalized Rostrum state](#6-finalized-rostrum-state)

## 1. Product scope

### Rostrum provides

- Versioned workflow JSON definitions.
- Durable graph execution across model, deterministic, script, integration, approval, and control nodes.
- Typed node inputs and outputs, explicit policies, and required evidence.
- Read-only, pass-through access to approved external context.
- Docker isolation for local/self-hosted runs and microVM isolation for Rostrum Cloud.
- One Control API shared by clients, SDKs, and integrations.
- Co-authoring, validation, per-node simulation, publication, observation, and governance.

### Rostrum does not implicitly provide

- General-purpose chat or prompt intake.
- Automatic workflow selection.
- A mandatory workflow domain.
- Workflow marketplace, packaging, signing, distribution, or monetization in the initial product.

## 2. What we are building and why

| Product area | What we build | Why it exists |
| --- | --- | --- |
| Workflow definition | Portable, versioned workflow JSON with graph, schema, policy, budget, evidence, and completion contracts | Gives humans, AI authors, clients, and runtimes one executable source of truth |
| Authoring and collaboration | Visual editing, revisioned drafts, semantic diffs, comments, review, immutable publication, and Git import/export | Supports live co-authoring as well as branch-and-pull-request review |
| Simulation and mock library | Per-node simulation contracts defining allowed mock results and effects, plus reusable mock data for models, tools, context, integrations, and human decisions | Lets workflows exercise realistic paths without pretending a simulation is a real run |
| Rostrum daemon | Durable scheduler and graph executor with retries, checkpoints, waits, recovery, and cancellation | Keeps execution correct when clients disconnect or workers fail |
| Control API | Contracts for workflow versions, runs, events, controls, approvals, artifacts, configuration, and provider/context references | Gives every client and integration one authoritative boundary |
| Web and desktop control app | Shared web application with an installable Electron or equivalent desktop shell; responsive approval views for mobile browsers | Provides the primary authoring, simulation, review, and run-management experience |
| Late-stage workflow CLI | Local and remote validation, upload, download, inspection, and diffing of workflow JSON, with machine-readable results | Adds a scriptable workflow client after the public workflow and Control API contracts stabilize |
| Rostrum authoring skill | Instructions and fixtures that first teach an AI coding agent to produce workflow JSON through the Control API, then add the CLI workflow when it ships | Makes AI-authored workflows practical without making prompt intake part of Rostrum |
| SDK | Typed programmatic clients for invoking selected workflows, observing or waiting on runs, controlling execution, submitting decisions, and retrieving artifacts | Embeds Rostrum in applications, CI, and internal platforms |
| Model Provider Layer | Provider-neutral model catalog, authentication, capability discovery, request/response normalization, routing, fallback, and usage accounting | Separates model access from workflow logic and from the Context Layer |
| Model runtime | Structured reasoning nodes, tool boundaries, model execution strategies, context limits, and traceability | Adds probabilistic reasoning without making models the source of workflow truth |
| Deterministic tools and scripts | Built-in tools plus container-defined script nodes supplied as an image, Dockerfile/build context, or equivalent runnable definition | Lets workflow authors bring any runtime while owning its dependencies and output behavior |
| Context Layer | Read-only, policy-filtered, just-in-time access to repositories, Slack, Discord, documentation, incidents, and other sources | Supplies project knowledge without exposing source credentials or requiring a source-content cache |
| Sandboxing | Docker targets for local/self-hosted execution and Rostrum Cloud microVM targets | Keeps code, scripts, tools, dependencies, and credentials outside the daemon and user host |
| State and observability | Durable run state, event streams, artifacts, traces, costs, policy decisions, and audit records | Makes runs recoverable and their results inspectable |
| Governance and approvals | Users, teams, groups, projects, policies, budgets, credentials, approvals, and kill switches | Makes consequential workflows safe to operate |
| Integrations | Authenticated triggers, callbacks, notifications, external jobs, and structured result publishing | Connects workflows to the systems that initiate work and consume outcomes |

## 3. Delivery milestones

The roadmap orders observable product states. Technical Epic files are created only when work is scoped and ready for planning.

| Milestone | Product state | Technical delivery | Exit demonstration |
| --- | --- | --- | --- |
| M1 | The shape of a workflow is defined and validatable | Complete. [Workflow interface v1](../specifications/workflow-interface-v1.md) and [M1 decisions](../decisions/m1/). [E1.1](../epics/m1/e1-1-authoring-lifecycle-integration.md) is follow-up hardening. | A human or AI saves incomplete workflow JSON as a draft, revises it from validation findings, publishes a valid revision, and retrieves its immutable version and digest. |
| M2 | A workflow can execute locally | [E2.1](../epics/m2/e2-1-make-workflow-interface-v1-executable.md), [E2.2](../epics/m2/e2-2-establish-local-daemon-boundary.md), [E2.3](../epics/m2/e2-3-execute-sequential-workflows.md), [E2.4](../epics/m2/e2-4-execute-conditional-workflows.md), [E2.5](../epics/m2/e2-5-execute-parallel-paths-and-joins.md), and [E2.6](../epics/m2/e2-6-execute-bounded-loops.md) | A caller invokes an exact published workflow version through the Control API, disconnects, and later retrieves its progress, output, or failures after the local daemon executes every workflow interface v1 control-flow construct. |
| M3 | A run can survive, wait, and be inspected | Define technical Epics after M2 stabilizes the execution, handler, daemon, and Control API contracts. | A run survives restart and reconnect, exposes events and artifacts, retries bounded failures, and pauses and resumes around a human decision. |
| M4 | A workflow can safely run tools and scripts | Roadmap only | A workflow runs built-in tools and a container-defined script in Docker, applies policy, and binds captured results into downstream nodes without losing durable evidence. |
| M5 | Models can be used in workflows | Roadmap only | A model node executes through the provider-neutral layer with structured output, scoped credentials, policy, usage accounting, retry, and fallback. |
| M6 | Project context can be used in workflows | Roadmap only | A node receives a read-only, filtered context view with provenance while source credentials and source bodies remain outside the run record by default. |
| M7 | Workflows can be simulated | Roadmap only | A workflow runs through per-node mocks, reports traversed and uncovered paths, and identifies every simulated result and suppressed effect. |
| M8 | Workflows can be authored and operated visually | Roadmap only | One user visually edits, validates, simulates, publishes, invokes, observes, and controls a workflow from web or desktop, with mobile-responsive decisions. |
| M9 | Applications can embed Rostrum | Roadmap only | An application invokes a selected workflow, observes or waits on the run, submits a decision, and retrieves structured results and artifacts through a typed SDK. |
| M10 | External systems can participate | Roadmap only | A repository, continuous integration system, schedule, alert, or external application invokes an explicit workflow and receives authenticated, replay-safe outcomes. |
| M11 | Teams can co-author workflows | Roadmap only | Multiple authors create revisions, avoid silent overwrites, compare and merge changes, review in Rostrum or Git, and publish the approved revision. |
| M12 | The workflow CLI and showcase suite prove product breadth | Roadmap only | The CLI exercises the stable workflow and Control API contracts, and every showcase passes through the same public workflow, execution, policy, evidence, and client contracts on self-hosted Docker. |
| M13 | Rostrum can be operated as Cloud | Roadmap only | The same workflow JSON and Control API operate across tenants with managed identity, credentials, quotas, billing, operations, and microVM isolation. |
| Final | Rostrum matches the finalized product state | M1 through M13, in order | A team can define, simulate, operate, integrate, co-author, and govern workflows; run every node type durably across supported isolation targets; inspect complete evidence; and reproduce the showcase suite locally, self-hosted, and in Rostrum Cloud. |

## 4. Showcase suite

| Showcase | What it proves | Required milestones |
| --- | --- | --- |
| Product discovery brief | Read-only context retrieval with provenance, model synthesis, human revision and approval, and artifact lineage from evidence to product decisions | M5, M6, M8, M10 |
| Roadmap prioritization and release plan | Container-defined scoring, typed script output, fan-out and joins, scenario comparison, durable approval waits, and reusable mocks | M3, M4, M7, M8 |
| AI-authored Rostrum workflow | An AI agent can create portable workflow JSON that the shared contract validates before visual review and simulation | M1, M7, M8, M11, M12 |
| Secure note-taking application delivery | Model and deterministic nodes coordinate isolated implementation, Git review, independent verification, deployment, approval, and rollback | M4, M5, M12 |
| Incident investigation and governed remediation | External triggers, read-only context, controlled write actions, durable approval, retry, rollback, and escalation remain separate and observable | M3, M4, M6, M10 |
| Cross-system data reconciliation | Deterministic scripts, typed piping, idempotency, parallel comparison, joins, exception review, and structured publishing work without model nodes | M3, M4, M10, M12 |

## 5. Product boundaries

### Open-source and self-hostable

- Workflow JSON schema, validator, authoring skill, CLI, SDK, and Control API.
- Rostrum daemon, web application, desktop application, and mobile-responsive views.
- Revisioned draft, Git import/export, review, publication, and per-node simulation contracts.
- Model Provider Layer contracts and self-hosted provider adapters.
- Context Layer contracts, broker, and self-hosted connectors.
- Deterministic tools, container-defined script nodes, Docker execution, state, events, artifacts, and conformance tests.
- Showcase workflow definitions and local fixtures.

### Rostrum Cloud

- Managed tenancy, identity, credentials, retention, notifications, quotas, billing, and operations.
- Hosted provider and integration credential brokering.
- Rostrum Cloud microVM execution and fleet management.

Workflow packaging, installation, signing, distribution, marketplace behavior, and monetization remain deferred.

## 6. Finalized Rostrum state

Rostrum is complete for this plan when:

- humans and AI systems can create workflow JSON and verify it through the same CLI/API contract;
- teams can co-author drafts, use Git-based review where appropriate, compare revisions, and publish immutable versions;
- simulation behavior is declared per node and supported by a rich reusable mock library;
- clients and integrations invoke explicitly selected workflows with schema-validated inputs;
- model, deterministic, container-defined script, context, human, integration, and control nodes compose in one durable graph;
- the Model Provider Layer brokers model access separately from the read-only Context Layer;
- scripts own their runtime and dependencies through a Dockerfile, image, or equivalent runnable definition;
- runs survive client, worker, and daemon interruptions and expose artifacts, policy decisions, costs, and failures;
- the same workflow contracts run locally and self-hosted in Docker and in Rostrum Cloud microVMs;
- every showcase in this document passes without adding a domain-specific execution path.
