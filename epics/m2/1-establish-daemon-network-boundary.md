# Epic 1: Establish the daemon network boundary

Status: Planned

Roadmap milestone: [M2: Local workflow execution](../../strategy/product-roadmap.md#3-delivery-milestones)

Depends on: Standalone Control API process and the shared `packages/database` package

## Outcome

An operator can run the Control API and daemon as separate services on the same host or different machines. The Control API sends commands over private, authenticated HTTP. Both services independently access the same Postgres database through `packages/database`.

M2 supports one daemon per deployment, not one workflow execution at a time. A workflow is a reusable definition; each invocation creates a separate run. Multiple runs of the same publication, or different workflows, may be in progress together on that daemon. Epic 2 introduces independent runs; Epic 4 adds parallel paths within a run and shared worker-capacity rules.

## Scope

- Establish a private daemon API for service commands and live run observation. The Control API remains the caller-facing API, and only the daemon executes workflows. Epic 2 adds run creation and retrieval.
- Let operators configure network listeners, the daemon URL, and database connections without assuming that either service or Postgres is on localhost.
- Authenticate service requests and encrypt cross-host traffic. Any development-only transport exception must be restricted to local connections; it must not weaken protection for remote access. This concerns connection security, not how many runs may execute.
- Expose health and readiness so an operator can distinguish a live process from one able to accept work. Invalid configuration, unavailable dependencies, and service failures must produce useful diagnostics.
- Define shutdown behavior for outstanding requests and active work. Services must start and stop independently without closing the other service or the shared database. Shutdown rules apply to all affected work, not to a single workflow instance.
- Use the shared database package for database types and access, with clear ownership of each service's operations. HTTP carries service commands; the services do not coordinate through shared memory, application files, or database polling.
- Move backend services from `apps/` to `apis/` in the implementation repository and update their workspace, build, deployment, and setup references. Retain `apps/` for user-facing applications such as the web app, mobile app, and TUI.

The implementation plan specifies endpoint bodies, authentication and encryption setup, configuration names, and startup/shutdown mechanics. [Epic 6](6-complete-m2-conformance.md) owns the reusable separate-network test environment. This Epic owns focused verification of its service behavior.

## Non-goals

- Workflow execution itself or durable run storage. M2 run state remains in daemon memory; restart recovery belongs to M3.
- Direct client access to the daemon.
- Multiple daemon instances, daemon selection, load balancing, failover, or distributed scheduling. These deployment limits do not prohibit concurrent runs on one daemon.

## Acceptance criteria

- The services communicate at independently configured network addresses and each accesses the shared database without shared process memory or application files.
- Unauthorized requests are rejected, cross-host traffic is encrypted, and a local development exception cannot expose unprotected remote access.
- Operators can identify invalid settings, unavailable dependencies, and an unhealthy or unready service through its responses and diagnostics.
- Stopping one service follows its documented treatment of outstanding work and leaves the other service and shared database independently manageable.
- Backend services and their references use `apis/` without compatibility aliases under `apps/`.
