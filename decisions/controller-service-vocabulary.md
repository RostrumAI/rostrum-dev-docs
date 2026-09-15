# Controller and service vocabulary

Status: Accepted direction; implementation verification is recorded by the implementation work.

Decided: 2026-09-15

Applies to: `@rostrum/server`, the Control API, the daemon, and repository review conventions.

## Decision

A declared HTTP operation is a **controller**, not a service or a handler. A controller orchestrates request input, business-service calls, and HTTP responses. Business services own business rules and database operations. Transport wiring binds controllers to the server.

This amends the route-module terminology in [Restart-only server framework](../research/restart-only-server-framework.md) and the handler terminology proposed by the [vocabulary implementation plan](../plans/handler-service-vocabulary.md). It does not change the restart-only lifecycle or any HTTP path, status, error code, schema, operation id, or generated OpenAPI contract.

| Term | Responsibility | Location |
| --- | --- | --- |
| Controller | One declared operation: method, complete path, request schemas, OpenAPI metadata, documented responses, and its callback | `apis/*/src/controllers/<area>/` |
| Business service | Business rules, domain validation, and database-backed operations | `apis/*/src/services/<area>/` |
| HTTP transport | Branded application, static route registration, application controller builder, and tags | `apis/*/src/http/` |
| Running service | Backend process that loads configuration, composes dependencies, serves requests, and closes its owned resources | Control API and daemon process composition; `@rostrum/server/lifecycle` |

A controller value still declares the function member `handler(request, response, context)`. The callback name is not a competing tier name, and unrelated callback terminology is unchanged.

## Framework vocabulary

The route contract lives in `packages/server/src/controller.ts`, published as `@rostrum/server/controller`. Its exported vocabulary is:

- `createControllerBuilder`, `ControllerBuilder`, `ControllerDefinition`, and `ControllerDefinitionInput`;
- `ControllerBinding`, `ControllerBinder`, `ControllerMethod`, and `CONTROLLER_METHODS`;
- `ControllerRequest`, `ControllerResponse`, `ControllerContext`, and `Controller` (the callback type);
- `ControllerRequestDefinition`, `ControllerResponseDefinition`, and `ControllerOpenApiDefinition`.

Application registration uses `createControllerRegistrar` and `registerController`. Request decoding uses `ControllerBodyDecoder`, `ControllerBodyResult`, and `controllerErrorBody`. Application builders are named `defineControlController` and `defineDaemonController`. The registration module remains plural: `http/routes.ts`.

`ServiceRuntimeConfig` and `OpenedService` keep their names because they describe a running backend process, not an operation. Retired route-contract exports and subpaths have no compatibility aliases.

## Dependency and resource boundary

The application process constructs service dependencies once at startup. Controllers reach those instances only through `context.services`; they neither construct them nor import a runtime service instance. Type-only contracts, domain schemas, and domain-error values may be imported where they describe domain data rather than provide service instances.

The controller-facing context is service-only in its dependency surface. It also carries immutable configuration and request cancellation, and the framework adds the reserved `raw` transport capability. It does not expose connections, repositories, query facades, pool ownership, or close functions. Nesting such a capability inside `services`, hiding it in a helper, or reaching it through the raw transport context does not make it a business service.

Controllers have no direct or indirect database access. A controller calls a business operation such as saving a workflow; the service chooses the required database operations. Controllers must not issue queries, obtain repositories, reproduce persistence rules, or call transport helpers that perform those operations on their behalf. Services may depend on the database package and other backend collaborators without exposing those collaborators to controllers.

The process owns its database pool and retains its close capability. Business services receive the operations they need, not ownership of pool closure. Startup failure and shutdown release process-owned resources through the existing bounded lifecycle; controllers and business services do not close the pool. `WorkflowService` exposes no `close()` method.

The Control API context is `{ config, services: { workflows, system }, abortSignal }`, with `WorkflowService` and `SystemService` instances. Its readiness controller calls `context.services.system.checkReadiness(context.abortSignal)`; `SystemService` owns the database probe and authenticated daemon check. The daemon context mirrors it with only `services.system`, whose service owns the database readiness probe over the process-owned handle. Neither context exposes a `database` field or a per-request readiness closure.

Business services do not raise HTTP-shaped errors. `WorkflowService` throws domain errors for parse failure, identity conflict, and storage-rejected input, and returns typed outcomes for expected states. The controller tier maps those errors and outcomes to HTTP statuses, payloads, and bodies.

## Workflow placement

- `services/workflows/workflow-service.ts` owns workflow business operations.
- `services/workflows/rule-sets.ts` owns workflow rule-set selection. Business validation remains in the service tier rather than moving into controller request decoding.
- `services/workflows/schemas.ts` owns `FindingSchema`, shared domain vocabulary derived from `@rostrum/workflow`. The application-wide error schema and controller response schemas may both import it.
- `controllers/workflows/schemas.ts` owns HTTP identifier patterns, path-parameter schemas, request and response shapes, and `revisionResponse`. A schema used by only one controller stays beside that controller in its `*.schema.ts` module.
- Controller error mapping and request-body decoding stay at the HTTP boundary. `src/schemas.ts` retains the application-wide HTTP error shape.

The dependency direction is HTTP wiring → controllers → business-service contracts, with runtime service instances supplied by process composition. Domain schema imports do not reverse ownership of business behavior. The daemon has a system service because readiness is a database-backed operation; it does not need an empty workflow service tier merely for symmetry.

## Review and historical records

Active route-module rules apply to `controllers/**`. The security lens accepts `controllers`, `features`, and `services` layouts, so historical diffs retain their coverage; business services in the current layout also activate that lens.

Historical evidence citations and delivered plans retain the paths and names they recorded. Active setup documentation, framework examples, and review guidance use controller terminology. The implementation plan remains a record of the earlier handler proposal; this decision records the controller amendment without rewriting that history.
