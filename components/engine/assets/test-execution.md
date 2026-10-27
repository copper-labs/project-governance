---
name: test-execution
description: Select focused checks or authorized durable workflows, then assess input identity, results and cleanup.
---

# Test Execution

Choose the cheapest reliable proof for one coherent change. Reuse evidence only while its source,
configuration, toolchain and claim remain applicable. Run quick focused checks directly. The project
owns commands and assertions; the installed engine owns durable execution and results.

Use the absolute repository-local `.governance/runtime/bin/project-governance` entrypoint for the
commands below. Never install or update from a delegated worker or Git hook.

## Checks

Prefer an already configured check for a genuinely isolated command. The check route owns durable
command observation, but does not acquire workflow shared-resource leases. Use workflows for shared
build trees, devices, services or coordinated cleanup. Do not infer isolation from a command name.

A small change needs its outcome, implementation and relevant proof. Use structured plans when they
help coordinated work or an existing project policy requires them. Run useful focused diagnostics
without inventing a cadence exception. Consolidate broader checks at the coherent batch boundary;
let normal Git hooks count for their gates instead of immediately repeating them by hand.

Use `plan --stage STAGE --mode impacted --json` to inspect selection, then
`check --stage STAGE --mode impacted --summary` for the selected proof. Add `--staged` for staged
pre-commit proof. Use `--pack PACK_ID` only when that specific pack matches the intended claim.
For long checks, `check` accepts `--detach`; retain the returned run ID. Observe that same run with
`check-status --run RUN_ID`. Request cancellation with `check-cancel --run RUN_ID`, then verify its
terminal result and cleanup. Submission or cancellation acknowledgment is not completion.

## Build and device workflows

Use the project's declared recipe and an existing authorized task action. For a fresh run, use
`workflow-bind --request REQUEST.json --receipt RECEIPT.json` from the worktree root. The request
contains `workspace`, `taskId`, `taskVersion`, `sessionId`, `recipeFile` and a stable `operationId`.
The receipt supplies the existing submit arguments below; binding does not start execution.

A project that deliberately adopted `workflow_authorization.mode: task` in its governance profile
binds through current task authority without another dialog. Its exact `resources` and
`credential_env` lists must cover the recipe; empty lists permit none. Do not opt in, expand these
lists, or change an existing requirement without operator authorization. Missing policy keeps the
operator dialog; malformed policy refuses. The file selects policy, not authenticated consent or a
sandbox. Host permissions, user restrictions, credential filtering and shared-resource custody remain.

Routine driver/catalog/source edits use fresh input hashes, operation IDs and receipts under that
policy. Never change an in-flight run or reuse stale evidence. Task revisions stop later ordinary
stages; after cleanup, bind the current authorized task instead of renewing an old workflow grant.
Policy-based receipts record that origin honestly. Opting out stops new policy bindings but does not
revoke already bound actions; use task withdrawal/cancellation for those actions.

Submit with
`workflow-submit --database LEDGER --task TASK_ID --task-version VERSION --action ACTION_ID
--recipe RECIPE_FILE --authority AUTHORITY_REF --operation-id OPERATION_ID`.
Keep the same operation ID for submission replay; do not create a second run to recover uncertain work.

Observe with `workflow-wait --database LEDGER --run RUN_ID --wait-ms 30000`; retain the event cursor
and pass `--after-event EVENT_ID` on subsequent waits. A wait timeout is not failure. Use
`workflow-status --database LEDGER --run RUN_ID` for a snapshot. Cancellation uses
`workflow-cancel --database LEDGER --run RUN_ID --authority AUTHORITY_REF`.

Do not invent authorization, switch devices, terminate unrelated processes or release resources
merely because a wait expired. Unknown outcomes require evidence reconciliation before another dispatch.
Device identity, installed build identity, scenario assertions and cleanup must match the requested
simulator or physical-device claim. One does not establish the other.

## Assess

Inspect every failed, blocked, cancelled or incomplete stage. Confirm source/input identity, result
identity and cleanup before accepting evidence. A successful process exit alone is insufficient.
Preserve the run and its receipts; a duplicate completion notice requires assessment, not rerunning.
Report what passed, what failed, what remains uncertain, and the smallest justified next action.
Retain existing telemetry for elapsed time, decisions, provider usage and outcome comparisons;
do not claim token savings from provider price or one fast run.
