# E2.6: Complete M2 conformance

Status: Planned

Roadmap milestone: [M2: Local workflow execution](../../strategy/product-roadmap.md#3-delivery-milestones)

Depends on: [E2.5](e2-5-execute-bounded-loops.md)

## Outcome

The same workflow behaves the same way when executed directly by the runtime or invoked through the daemon and Control API. One command demonstrates all M2 execution constructs with real services, a shared database, and a client that disconnects and returns for its result.

## Scope

- Define the M2 testing strategy: which behavior each layer checks, how examples and expected outcomes are shared, how tests control concurrent work, and how the real services and database start and stop. E2.1 through E2.5 own focused checks for their behavior; this Epic owns the reusable testing infrastructure and full-system proof.
- Turn the validation workflows in E2.2 through E2.5 into one reusable example catalog. Each example contains a workflow document, invocation inputs, deterministic handler behavior where needed, and expected validation findings or run outcomes. These are the conformance fixtures: shared examples that check whether each implementation follows the workflow specification.
- Cover rejected run requests, unresolved input references, handler errors, invalid handler outputs, conditional evaluation and routing errors, invalid parallel structures, failed joins, loop bounds, and both loop error policies. Keep errors caught by a loop policy distinguishable from failures that end the run.
- Assign each example to the layers that implement its behavior using the matrix below. Compare the caller-visible meaning, allowing expected transport differences such as HTTP status codes and generated run IDs. Do not copy execution rules into the test adapters or require the workflow validator to execute workflows.
- Specify how to observe concurrent behavior without assuming one global completion order. Use explicit handler start/release controls and recorded state transitions; bound waits so stalled tests fail with useful diagnostics. Verify failure ordering for the failures actually observed, not identical failure membership when lower capacity prevents a handler from starting.
- Build one command that starts Postgres, the Control API, and the daemon in an isolated test environment. Put the services in separate containers or network namespaces so a hard-coded localhost service URL cannot work. Give each service its own connection to the same Postgres database through `packages/database` and use the private authenticated HTTP boundary for service commands and run observation.
- Include E2.1's network checks: configured listeners and URLs, authorized and unauthorized requests, cross-host encryption, malformed requests, dependency readiness, timeouts, and unavailable services. Prove shared-database access without shared application files or process memory.
- Run the complete workflow catalog through that environment, demonstrate client disconnect and later retrieval, and stop all test-owned services and database resources after success or failure.
- Publish a local execution guide with the command, prerequisites, configuration, expected results, and failure diagnostics. Correct any disagreement in the owning specification or implementation rather than accepting a different workflow meaning at each layer.

## Layer responsibilities

| Layer | What it checks |
| --- | --- |
| Workflow package | Whether the document can be published: registered step types, configuration, references, graph structure, and declared data types. Runtime-only values and execution outcomes are not validator assertions. |
| Runtime | Step execution, output availability, branch selection, join readiness, loop policies, active-work state, final output, and failures, without HTTP. |
| Daemon HTTP API | Request checks and error responses, daemon-owned execution, and run retrieval through the private service API. |
| Control API | Publication selection, public request and response behavior, and progress/results obtained from the daemon without executing the graph in the Control API. |
| Real services and database | Network configuration, authentication, shared storage access, client disconnect, process lifecycle, and the complete public invocation path. |

## Validation workflows

Use the exact inputs, graph structure, expected outputs, and failure variants named in each execution Epic. The catalog must include sequential success and rejection, every conditional destination, parallel joins at capacity one and higher capacities, and bounded loops with successful and failed iterations under both policies.

Also compose the constructs in a batch-classification workflow. Use the deterministic handler registry established by E2.2 and extended for the E2.4 and E2.5 examples; specify any example-only arithmetic or counting handler through that same registry, not a separate execution path.

1. Accept `values: [1, 2]` and a loop bound of 3.
2. For each value, split into two deterministic paths that compute `value * 2` and `value + 10`. Join both outputs into one iteration result. The loop returns `[{ "doubled": 2, "offset": 11 }, { "doubled": 4, "offset": 12 }]` as successful entries using E2.5's result-entry representation.
3. After the loop, a sequential step counts the successful entries and produces `count: 2`.
4. A conditional selects the `nonEmpty` path when `count > 0`, otherwise its default selects the `empty` path. Each path ends at its own result step. The non-empty result is `{ "category": "nonEmpty", "count": 2 }`; an empty input array produces `{ "category": "empty", "count": 0 }`.
5. Make the offset handler for value `1` return an error eligible for loop capture. The fail-fast policy must prevent iteration 1 (value `2`) and a successful final result. The error-tolerant policy must retain the error at iteration 0, finish iteration 1, and return `{ "category": "nonEmpty", "count": 1 }`. The failed iteration's success join must never run with missing inputs.

For the disconnect case, hold one deterministic handler at an explicit test control point after accepting the run. Disconnect the initiating client, release the handler, then use a new client connection to retrieve the same run ID and final result. These controls belong to the test environment, not to the product API. Client disconnect is not daemon restart recovery.

## Non-goals

- New workflow constructs or a second interpretation of workflow behavior in test code.
- Persistence of run progress, restart recovery, retries, human decisions, scripts, tools, models, or production deployment.
- Duplicating every example in separate layer-specific test suites.

## Acceptance criteria

- Every M2 construct and failure class has a shared example with an explicit expected outcome and assigned layers. An omitted layer has a reason based on what it implements.
- The workflow package accepts or rejects documents consistently with the specification. Runtime, daemon API, and Control API agree on execution outcomes for every applicable example.
- Concurrent checks prove dependencies, capacity limits, failure handling, and ordering without timing sleeps or a fabricated total order.
- One command proves that separately networked services use configured authenticated HTTP and independently access the same database. It includes the E2.1 service-boundary failures.
- The combined workflow proves sequential work, conditional routing, parallel joins, and bounded loops together, including a parallel failure captured by the loop's error-tolerant policy.
- Accepted work continues after the initiating client disconnects. A new client retrieves progress and the final result through the Control API using the original run ID.
- The command cleans up its own services and database resources on success or failure without touching an existing developer database. The guide documents how to run it and interpret its results.
