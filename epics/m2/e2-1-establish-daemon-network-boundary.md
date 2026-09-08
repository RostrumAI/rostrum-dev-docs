# E2.1: Establish the daemon network boundary

Status: Planned

Roadmap milestone: [M2: Local workflow execution](../../strategy/product-roadmap.md#3-delivery-milestones)

Depends on: Standalone Control API process and the shared `packages/database` package

## Outcome

The Control API and one daemon run as separate services, on the same host or different machines. The Control API sends commands to the daemon over private, authenticated HTTP. Both services connect independently to the same Postgres database through `packages/database`.

## Scope

- Define the private daemon API: available operations, JSON request and response bodies, how a request is identified across both services' logs, timeout behavior, and the errors returned to the Control API. E2.2 adds run creation and retrieval; this Epic establishes the service boundary they use.
- Make every listening network address and port configurable, along with the Control API's daemon URL and each service's database connection settings. Neither service may assume that the other service or Postgres is on localhost.
- Define how the daemon verifies the Control API's identity and how cross-host traffic is encrypted. Any same-host development exception must be explicit, restricted to loopback communication, and unable to disable protection for remote connections.
- Define health, readiness, and shutdown behavior so an operator can distinguish a live process from a service ready to accept work. Specify how invalid configuration and unavailable required dependencies affect readiness and how failures appear in responses and logs.
- Use `packages/database` for shared database types and access. State which service owns each database operation used by this boundary; do not create separate service databases or duplicate database models. Service commands travel over HTTP, not through database polling or shared files.
- Move backend services from `apps/` to `apis/` in the implementation repository, including the Control API and daemon. Update workspace discovery, imports, scripts, build and deployment paths, and setup instructions in the same cutover. Retain `apps/` for user-facing applications such as the web app, mobile app, and TUI.

The Control API remains the caller-facing API. Only the daemon executes workflow graphs. Sharing Postgres does not mean sharing in-process connection objects, scheduler state, or a filesystem. M2 run state stays in daemon memory; storing and recovering run progress belongs to M3.

## Validation scenario

Start the Control API and daemon as separate processes with explicit network and database settings. Both use the same database through their own connections. Request daemon health through the authenticated service client and inspect the documented response. Repeat without valid credentials, with an invalid setting, and with the daemon unavailable; each case must produce the corresponding error or readiness state rather than a successful response. Stop either service and confirm that the other process remains independently manageable.

This Epic supplies the service behavior and focused checks. [E2.6](e2-6-complete-m2-conformance.md) owns the reusable integration environment and the automated separate-container or separate-network proof, including shared-database access. It is not an additional infrastructure checklist for this Epic.

## Non-goals

- Workflow execution or durable run storage.
- Direct client access to the daemon.
- Multiple daemons, daemon selection, load balancing, or failover.
- Remote worker pools, distributed scheduling, service discovery, or fleet management.

## Acceptance criteria

- The services can use different host addresses without shared process memory or files. Both connect to the same Postgres database using the shared database package.
- Backend services live under `apis/`; the workspace and service commands use those paths without compatibility aliases under `apps/`.
- Network listeners, the daemon URL, and database connections use explicit configuration. Invalid settings identify the affected setting and prevent the service from accepting work.
- Requests without valid service credentials are rejected. Cross-host HTTP traffic is encrypted, and a loopback-only development exception cannot expose an unprotected remote listener.
- Health and readiness return the specified JSON responses, including dependency-unavailable states. Malformed requests, authentication failures, timeouts, and daemon unavailability have documented error responses.
- Shutdown stops accepting new requests, completes or bounds outstanding service work according to the documented shutdown rule, and closes the service's own resources without shutting down the other service or the shared database.
