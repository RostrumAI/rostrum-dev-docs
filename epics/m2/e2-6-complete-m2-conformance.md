# E2.6: Complete M2 conformance

Status: Planned

Roadmap milestone: [M2: Local workflow execution](../../strategy/product-roadmap.md#3-delivery-milestones)

Depends on: [E2.5](e2-5-execute-bounded-loops.md)

## Outcome

The workflow package, runtime, daemon HTTP API, and Control API produce the same results and failures for the shared workflow fixtures. One real-process scenario exercises the complete M2 path.

## Scope

- Finish the shared fixture catalog for sequential steps, conditionals, parallel paths, joins, and bounded loops.
- Cover invocation rejection, input binding, handler failure, output validation, routing failure, join failure, and loop failure.
- Run each fixture at every layer where its behavior applies.
- Remove layer-specific interpretations of workflow behavior found by the conformance runs.
- Add one command that starts the Control API and daemon in separate containers or network namespaces, runs every workflow interface v1 control-flow construct across their configured HTTP boundary, disconnects and reconnects a client, and stops both services.
- Publish the tested local execution guide.

## Non-goals

- New workflow constructs.
- Persistence, restart recovery, retries, human decisions, scripts, tools, models, or production deployment.
- Duplicating every fixture in separate layer-specific test suites.

## Acceptance criteria

- One fixture catalog covers every supported control-flow construct and M2 failure class.
- The workflow package, runtime, daemon HTTP API, and Control API return the same public result or failure for every applicable fixture.
- Conformance checks do not rely on timing sleeps or timing-dependent polling.
- The real-process scenario proves that accepted work continues after the initiating client disconnects.
- The real-process scenario observes progress and the final result through the Control API.
- The Control API and daemon use configured network addresses and share no process memory, filesystem, or direct database connection.
- The command stops the Control API and daemon cleanly after success or failure.
- The local execution guide documents the command and the behavior it proves.
