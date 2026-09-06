# AI workflow engine market research: synthesis

Source: [AI Workflow Engine Market Research.pdf](source/AI%20Workflow%20Engine%20Market%20Research.pdf)  
Purpose: Preserve the research conclusions that inform the Rostrum strategy document.

## Core thesis

The market is moving from unconstrained agent loops toward graph-based workflow engines. In this model, the system owns sequencing, state, retries, approvals, and completion conditions. Language models provide specialized reasoning inside that system rather than acting as the entire system. The same platform primitives can support software development and other automation domains.

The research supports the following parts of Rostrum's proposed architecture:

- a "workflow" is a reusable workflow graph;
- reasoning nodes and deterministic execution nodes are distinct;
- loops are bounded and observable;
- state is durable and can pause for human input;
- control clients remain detachable from execution;
- execution happens in a selectable local or hosted runtime;
- SaaS execution is event-driven, isolated, governed, and metered.

## Findings that shape Rostrum

### 1. Graphs are the control mechanism

Graphs make the workflow's sequence, branches, joins, loops, and handoffs explicit. The research compares approaches including LangGraph, PydanticAI, Hensu, GraphBit, and Mastra, with different tradeoffs around statefulness, type safety, compilation, performance, and flow control.

Rostrum needs a stable workflow definition and execution model before it needs a collection of specialized agents.

### 2. Deterministic nodes must be first-class

File access, tests, compilers, static analysis, policy checks, artifact collection, approvals, and branching on structured results should not be left to model discretion. These nodes provide the evidence that later reasoning nodes use to decide what happens next.

In the workflow model, "agent," "tool," and "sandboxed script" should be peer node categories with explicit input/output contracts, piping rules, and side-effect policies.

### 3. Verification should be independent from implementation

The research describes an orchestrator-worker-validator pattern. An implementation worker gets a bounded task and a fresh context. A separate verifier evaluates the resulting artifact against the original contract and deterministic checks. Failures are returned to the orchestrator for a targeted fix or escalation.

Rostrum should model verify-fix loops, attempt limits, budgets, and escalation paths directly rather than hiding them in prompts.

### 3a. Transfer nodes should preserve trajectory, not prose

The [Prewalk-style model handoff notes](prewalk-model-handoff-notes.md) capture a related execution pattern: let a capable model explore and establish a grounded trajectory, then use a transfer node to move execution to another model after an explicit transition condition. The useful transfer packet is context and state that has already been grounded in the environment, not a short plan that forces a second model to reread everything.

The product implication is that Rostrum should support provider-neutral trajectory checkpoints and explicit transfer-node conditions as a first-class workflow capability.

### 4. Workflows represent constraints, not personalities

The report identifies five useful workflow shapes:

- review-only;
- planning;
- guided build;
- fast fix;
- autonomous project work.

Each shape is distinguished by what it may mutate, which gates it requires, how much planning it performs, and how broad its task graph can become.

The product implication is that Rostrum's workflow system should encode permissions and lifecycle rules, not just a different system prompt.

### 5. Control clients should be detachable from execution

The report explicitly separates the interface from execution. It proposed a TUI that could visualize graph state, tool calls, artifacts, approvals, and blockers while reconnecting to remote runs.

The backend or local daemon must own state and orchestration. Rostrum applies that finding through a shared web application, an Electron or equivalent desktop application, mobile-responsive views, SDKs, integrations, and a workflow CLI. The CLI is a late-stage client added after the workflow and Control API contracts stabilize. A TUI is deferred.

### 6. Execution target is a policy decision

The research describes a spectrum from native local processes and Git worktrees through Docker, filtered user-space runtimes, and isolated microVMs. Rostrum's initial product decision is narrower: Docker for local and self-hosted execution, and microVMs only for Rostrum Cloud. Git branches and commits remain part of change tracking, but Git worktrees are not the execution-isolation mechanism. See the separate [Hermes Agent Docker sandbox notes](hermes-agent-docker-sandbox-notes.md) for Docker lifecycle and hardening patterns to investigate.

Rostrum needs a common execution-target contract. The workflow should be portable while the selected runtime supplies the appropriate isolation and capabilities. Each parallel task should receive its own container or microVM workspace and push its branch or commit to an origin.

### 7. Context must be controlled and pass-through

The research emphasizes context loaders, retrieval, isolated tools, and credential boundaries. Rostrum should make this a first-class read-only Context Layer. Source connectors should fetch approved Slack, Discord, repository, issue, and documentation material just in time, filter and redact it, and deliver a context view to the agent without exposing source credentials.

The product implication is that Rostrum should not become a mandatory cache of enterprise communications. Source content should not be persisted by default; Rostrum should retain provenance, policy decisions, hashes, and operational metadata, with source-content snapshots requiring explicit opt-in.

### 7. SaaS requires eventing, zero-trust credentials, and metering

Hosted workflows are useful when triggered by repository events, CI failures, monitoring alerts, schedules, or collaboration tools. The report also covers ephemeral identities, credential isolation, sidecar-style tools, auditability, and usage-based accounting.

Integrations, governance, and metering are part of the hosted execution architecture, not later dashboard features.

### 8. Sandboxed scripts are a general composition primitive

Many useful workflows require small deterministic programs for parsing, transforming, querying, validating, or coordinating data. Rostrum should accept an image, Dockerfile/build context, or equivalent runnable definition and let the script author own dependencies and output behavior. Rostrum owns isolation, input delivery, output capture, author-defined bindings, limits, and policy.

## Categories covered by the source

| Category | Examples discussed | Relevance to Rostrum |
| --- | --- | --- |
| Graph orchestration | LangGraph, PydanticAI, Hensu, GraphBit, Mastra | Workflow definition, state, typing, branching, and durable execution |
| Autonomous engineering | Factory, SWE-AF, OpenHands, Kiro | Planning, worker pools, issue graphs, and software-delivery automation |
| TUI and remote consoles | Ralph TUI, ccmux, steer | Detachable observability, remote control, and session multiplexing |
| Execution sandboxes | Docker, gVisor, Firecracker, E2B-style runtimes | Local prototyping and hosted untrusted execution |
| Governance and identity | AgentField, Agyn-style architectures | Ephemeral credentials, isolation, and auditable tool access |
| Usage and billing | Polar | Variable-cost metering and hosted-service monetization |

These references are market context, not implementation commitments. They help identify validated patterns and areas where Rostrum needs deliberate differentiation.

## Strategic implications

The research supports the following architecture decisions:

1. Build the workflow definition and execution core before building any optional conversational or prompt-routing experience.
2. Treat workflows as versioned workflow graphs with typed state and explicit side effects.
3. Make durable state, event streams, artifacts, approvals, and bounded loops foundational.
4. Keep the web/desktop application, mobile-responsive views, workflow CLI, SDK, and integrations as clients of one Control API.
5. Make local execution a first-class path, not merely a development mock of the cloud.
6. Make the Context Layer read-only and pass-through by default.
7. Use Docker for local/self-hosted execution and microVMs only for Rostrum Cloud.
8. Separate provider brokering from context retrieval through a distinct Model Provider Layer.
9. Keep the workflow, context, provider, runtime, script, and transfer-node contracts open-source; reserve managed multi-tenancy, hosted execution, credentials, billing, and cloud operations for the hosted service.

## Open questions carried into the next documents

The source establishes direction but does not settle implementation choices. The delivery Epics and their SPIKEs should resolve:

- workflow JSON schema evolution and semantic identity;
- revisioned co-authoring, Git review, and per-node simulation/mock semantics;
- whether code-based and declarative workflow authoring coexist;
- local daemon versus embedded runtime boundaries;
- late-stage workflow CLI validation/upload semantics and separate SDK run-lifecycle semantics;
- checkpointing and tool-execution delivery guarantees;
- the policy model for approvals and side effects;
- Docker workspace lifecycle and Rostrum Cloud microVM operations;
- context source, selector, redaction, and pass-through retention contracts;
- artifact retention and event replay requirements;
- Model Provider Layer process placement, credentials, and adapter contracts;
- the minimum vertical slice that proves Rostrum's advantage.
- provider-neutral model trajectory and transfer-node contracts;
- container-defined script admission, output bindings, and resource limits.
