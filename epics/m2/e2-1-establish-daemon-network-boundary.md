# E2.1: Establish the daemon network boundary

Status: Planned

Roadmap milestone: [M2: Local workflow execution](../../strategy/product-roadmap.md#3-delivery-milestones)

Depends on: Standalone Control API process

## Outcome

The Control API and one daemon can run on the same host or different machines and communicate only through a private, authenticated HTTP boundary.

## Scope

- Define the daemon HTTP endpoints, JSON envelopes, correlation IDs, timeout behavior, and error mapping used by the Control API.
- Add daemon address binding and a configurable daemon base URL in the Control API.
- Define how the Control API authenticates to the daemon and how cross-host traffic is encrypted.
- Support a restricted development mode for same-host communication without weakening the cross-host default.
- Add structured logging, health and readiness endpoints, startup, and graceful shutdown.
- Keep workflow and run behavior out of the HTTP transport layer.
- Prevent dependencies on shared process memory, a shared filesystem, or direct access to another service's database.
- Provide the execution-service boundary that E2.2 will implement.
- Add integration support that starts the real services in separate containers or network namespaces where they cannot reach each other through localhost.

The Control API remains the caller-facing API. The daemon HTTP API is a private service boundary.

## Non-goals

- Workflow execution.
- Direct client access to the daemon.
- Multiple daemons, daemon selection, load balancing, or failover.
- Remote worker pools, distributed scheduling, service discovery, or fleet management.

## Acceptance criteria

- The daemon and Control API run as separate processes on the same host or different network addresses.
- The Control API reaches the daemon through a configured URL rather than a localhost assumption.
- Requests across the boundary are authenticated, and unauthenticated requests are rejected.
- Cross-host traffic uses the approved encrypted transport.
- The services communicate without shared memory, a shared filesystem, or direct access to each other's database.
- Health and readiness requests return documented JSON responses.
- Malformed requests, authentication failures, timeouts, and daemon unavailability map to documented errors.
- Invalid configuration prevents the affected service from accepting requests and names the invalid setting.
- Graceful shutdown stops new requests, runs registered shutdown handlers, and exits cleanly.
- An integration scenario runs the Control API and daemon in separate containers or network namespaces and proves communication through the configured HTTP boundary.
