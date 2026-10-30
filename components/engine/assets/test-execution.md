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

## Finish reconciled cleanup

For resolved local producer/storage claims whose owner has an original execution/closure report,
record the initial release through the supported owner command from the original worktree:

`workflow-release-resources --database LEDGER --run RUN_ID --revision CURRENT_REVISION
--worker-directory ORIGINAL_WORKER_DIR --registry RESOURCE_REGISTRY
--authority ORIGINAL_BINDING_AUTHORITY --kind local-host
--evidence ORIGINAL_CLOSURE_REPORT --evidence-digest sha256:ORIGINAL_FILE_DIGEST --receipt RELEASE.json`.

Use the existing report, not invented observations or a hand-assembled release receipt. The runtime
binds it to original native requests/cleanup and fresh process absence, obtains the original lease
generations and writes the receipt before release. The report needs completed process closure,
observed original PIDs/fingerprints and a completion time within that command's execution window. Capture the
native-launched report writer's own PID/start fingerprint at entry and merge it into the final
report after child cleanup. Keep that identity separate from child stop/kill targets; a short-lived
child alone may not appear in native membership. Never add it retroactively to an old report.
Opaque resource names do not prove local scope. Devices, network/remote obligations, emulator and
retained sessions still need their qualified owner adapter. Never opt into local-host for those.
The command preserves failed outcomes, never runs stages or signals processes, and exits 0 only for
completed lease retirement. Interrupted calls retry the same receipt path; never remove the journal.

For an originally observation-only iOS run with exactly a device claim, matching app claim and
one local-storage claim, select the explicit `--kind ios-observation` adapter instead. Keep the
same original run/revision/authority, worker, registry, report digest and receipt arguments; add
`--local-resource EXACT_ORIGINAL_STORAGE_CLAIM --lock-directory CANONICAL_ORIGINAL_LOCK_DIRECTORY`.
The original report must identify the device, record `appOrSDKLaunch: false` and
`ownedFileLockHeld: false`, and have its observation time and original modification time within
one original native command window. Do not rewrite/backdate the report to manufacture those facts.

The original trusted owner declares the mapping from that opaque local claim to its existing
canonical lock directory. This is not inferred from a name or a new grant. The adapter reads lock
absence without creating, acquiring, deleting or stale-pruning it. It reuses qualified device-info
readback for the exact device and installed app container/process absence, and checks original
native command/process closure. It records that fresh owner observation in the existing release
receipt; `sdkLifecycle` remains `unclaimed`. No app launch/stop/install, SDK lifecycle call or
workflow rerun is performed. Device readback still needs the owner's existing permissions.

Live/unavailable/ambiguous device or host custody, extra/unsupported claims, changed original
evidence, current ownership/revision mismatch or a present lock retain all original claims.
Interrupted release reuses the same receipt and obtains fresh closure again before committing;
a historical completed release only reads back that original release and leaves later owners alone.

After the original resource release is recorded, use
`workflow-reconcile-cleanup --database LEDGER --run RUN_ID --revision CURRENT_REVISION
--receipt ORIGINAL_CLEANUP.json --registry RESOURCE_REGISTRY --worker-directory ORIGINAL_WORKER_DIR`.
The registry here owns resource leases, not installed runtime generations. The original worker
argument also retires its detached runtime reservation. Terminal status alone does not do that.

Replay keeps the original outcome; a failed/cancelled result still exits 1. Preserve the original
request, owner acknowledgement and release receipt. On macOS, finalization can recognize a reused
PID only from distinct valid start fingerprints plus a replacement start after the unchanged
acknowledgement. Live or unknown original identity refuses. Never edit timestamps or evidence to
make recovery pass, signal the replacement process, or treat reservation retirement as test success.

## Assess

Inspect every failed, blocked, cancelled or incomplete stage. Confirm source/input identity, result
identity and cleanup before accepting evidence. A successful process exit alone is insufficient.
Preserve the run and its receipts; a duplicate completion notice requires assessment, not rerunning.
Report what passed, what failed, what remains uncertain, and the smallest justified next action.
Retain existing telemetry for elapsed time, decisions, provider usage and outcome comparisons;
do not claim token savings from provider price or one fast run.

For this observation adapter only, a fast original command may have no retained membership sample.
The exact original native supervisor receipt must itself confirm cleanup with a resolved outcome;
unknown execution/cleanup or owner-loss inference cannot substitute. The release proof records
`membershipHistory: not-recorded` and the original native receipt as closure authority. It does not
invent historical descendant observations. Fresh owner/guardian/child/group absence remains required,
and a membership file appearing during collection refuses release. Existing producer-report and
local-host membership requirements remain unchanged.

A genuinely compiler-only failed simulator run with exactly a simulator claim and one local
producer claim uses the explicit `--kind ios-simulator-build` adapter. Supply the original failed
compiler closeout/report digest plus `--local-resource`, `--lock-directory` and
`--simulator-lock-directory` under the original owner. The closeout must show no SDK rebuild,
no app closure entries, released locks and resolved original process closure. The owner selects
compiler-only scope explicitly; empty lists do not establish SDK shutdown. The adapter observes
fresh simulator Shutdown and host lock/process absence, then releases both original generations
atomically. It performs no simulator/app control or SDK work. Unsupported/live/unknown state
refuses. Preserve already-released historical runs and later owners; do not redo their release.

For a borrowed Android device or already-running emulator, use the explicit recipe
`androidAppSession` descriptor: `ownership: borrowed`, exact `serial`, canonical external `adb`,
explicit foreground `userId`, and original local resource-to-lock mappings in `localLocks`.
Keep existing `android:<serial>` and `app:<package>` claim identities. Do not mix this descriptor
with owned-emulator lifecycle custody or drop a local claim. Normal finish/cleanup continuation
uses fresh exact-user/package/UID/process and local-lock closure without stopping the emulator.
Unsupported/failed ADB observations remain unknown; suffixed/custom-name/shared-UID processes
retain custody. For stopped owners, public `workflow-release-resources --kind android-app-session`
requires an original native command `result.json` as `--evidence` with its actual digest; mappings
come from the original recipe. Follow normal reconciliation after release. Resource closure does
not prove SDK-close acknowledgement, API acceptance or a successful test. Never fabricate those.

A fresh Android workflow that owns VM boot/shutdown may instead set
`androidAppSession.ownership: owned-emulator` and `emulator: {bootStage, lockPath}`. Keep the
original android/app/local keys and all local locks. Its original producer records version1
`android-emulator-owner.json` in the boot stage's existing runtime artifact directory: run/stage,
exact target/user/lock, confirmed pre-boot target absence and closed console/ADB ports, acquired
ownership lock, original retained VM PID/fingerprint, host launch time and final observation time.
Missing or ambiguous ownership retains custody. Governance reuses target/ports/lock shutdown and
original native/local closure; it never boots or stops the device. Normal finish, continuation and
the existing public app-session owner release select that bound lifetime. Preserve failed results
and unclaimed SDK acknowledgement. Do not relabel a stopped previously owned VM as borrowed or
add this declaration to an older binding. Use a fresh normally authorized workflow after adoption.


A missing historical process join is not repaired by editing a finished report. Where an existing
explicit authority decision approves fresh local-host recovery, use the distinct
`workflow-release-resources --kind local-host-observed --request-file <exact-request> --receipt
<new-receipt>` contract. Bind the original whole claim set, reader, raw report, approval and real
project mutex mapping. The runtime obtains fresh process and lock observations. Unknown mapping or
live/ambiguous ownership refuses. Preserve the original failure and use normal failed cleanup
reconciliation afterward. This is an explicit trusted local owner recovery, never a silent fallback,
a substitute for device cleanup, a human-confirmation claim or permission to run more work.
