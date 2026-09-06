# E2.2: Establish the local daemon boundary

Status: Planned

Roadmap milestone: [M2: Local workflow execution](../../strategy/product-roadmap.md#3-delivery-milestones)

Depends on: M1 standalone Control API process

## Outcome

A developer can start the daemon independently of the Control API, inspect its health and version through an approved local transport, and stop it cleanly.

## Scope

- Select the local transport, request and response envelope, correlation mechanism, error mapping, timeout behavior, and configuration approach.
- Keep workflow and run semantics outside the transport contract.
- Add validated configuration, structured logging, health and version operations, startup, graceful shutdown, and execution-service extension points.
- Add integration support that starts and exercises the real daemon process.

The Control API remains the caller-facing boundary. The daemon interface is internal.

## Non-goals

- Workflow execution.
- Public daemon access.
- Persistence, recovery, remote workers, deployment, or production readiness.

## Acceptance criteria

- The approved transport decision explains its tradeoffs and covers submission, lookup, rejection, timeout, and daemon unavailability.
- The transport correlates requests and responses between independently running processes.
- It carries the E2.1 invocation and run representations without redefining graph behavior.
- Documented commands build, start, inspect, stop, and test the daemon.
- Invalid configuration fails before the daemon accepts requests and produces an actionable error.
- Graceful shutdown stops new requests, invokes registered shutdown handlers, and exits cleanly.
- Integration tests exercise the real process and transport without requiring workflow execution.
