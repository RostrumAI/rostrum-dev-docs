# Hermes Agent Docker sandbox notes

Status: Research input for Rostrum's Docker execution design
Purpose: Capture useful patterns from Hermes Agent without treating its implementation as a Rostrum commitment.

## Sources

- [Hermes Agent Docker documentation](https://hermes-agent.nousresearch.com/docs/user-guide/docker/)
- [Hermes Agent security documentation](https://hermes-agent.nousresearch.com/docs/user-guide/security)
- [Hermes Agent configuration documentation](https://hermes-agent.nousresearch.com/docs/user-guide/configuration/)

## Relevant patterns

Hermes distinguishes between running the agent inside Docker and running the agent on a host while sending terminal/tool execution into a Docker sandbox. Rostrum should adopt the second architectural distinction: the daemon and Control API remain outside the execution workspace, while generated code and deterministic tools execute inside a controlled Docker workspace.

Useful patterns to investigate for Rostrum:

- explicit container lifecycle and ownership labels;
- reconnecting to a surviving container when persistence is intentionally enabled;
- orphan reaping and cleanup after daemon or host failures;
- per-workload CPU, memory, disk, and process limits;
- capability dropping and `no-new-privileges`;
- network-disabled or network-allowlisted execution;
- explicit environment-variable and credential-file forwarding;
- separate per-task containers when parallel workers must not share a filesystem;
- persistent versus ephemeral workspace policy.

## Rostrum decisions and differences

Rostrum should default to one isolated Docker workspace per workflow run or implementation task. Parallel tasks should not share a mutable container or workspace. They should exchange branches, artifacts, and structured task outputs through the daemon and Control API.

Rostrum should avoid broad host-directory mounts. A run should receive a source snapshot and explicit mounts, then return a branch or commit, diff, artifacts, and evidence. The user's host repository is not the execution workspace.

Rostrum should not expose arbitrary Docker flags to workflow authors. Resource, network, capability, mount, and privilege settings should be represented as validated target/policy fields so a workflow cannot silently weaken its own sandbox.

Credentials should be injected through scoped tool or context-broker mechanisms. Raw credentials should not be forwarded into a container merely because a model requested them. Any exception should be explicit, policy-controlled, and auditable.

Persistent containers may be useful for long-running development servers or deliberate reattachment, but ephemeral execution is the default for implementation and verification. Persistence must have an owner, expiration, cleanup behavior, and an explicit reason.

## SPIKE implications

- Compare Docker Engine and Docker Compose lifecycle management for per-task workspaces.
- Test workspace snapshot/import and branch push behavior under parallel runs.
- Benchmark ephemeral versus persistent containers for development-server workflows.
- Verify resource and network enforcement across Docker Desktop and Linux Docker Engine.
- Define the minimum hardening profile Rostrum can enforce without making common builds unusable.
