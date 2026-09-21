---
id: reference.decision-layer-functional-validation
title: Decision Layer Functional Validation and Handoff Proof
type: reference
status: current
owner: project-governance
created: 2026-09-21
updated: 2026-09-21
summary: Small required functional suites for the first JEV implementation handoff, installed proof, review evidence and telemetry-led evaluation of later consumers.
---

# Decision layer functional validation

This is the test plan for the
[integrated implementation and pilot plan](../exec-plans/active/2026-09-21-major-adoption-and-measurement.md).
It specifies intended proof, not completed tests. Existing suite names below were read from the
source; proposed additions are labeled. The implementing agent records the actual commands and
results in its external handoff. Runtime logs and adopter identities do not belong here.

## Testing objective

Prove basic functioning before the pilot: the consumer runs through a supported caller, affects the
intended delivery, preserves required facts, falls back promptly, records useful observations and
works from the installed archive. Test observable behavior, not helpers restating their own inputs.

Use deterministic fake-provider responses for required functional tests. Include the transport/caller
boundary so a passing test does not merely prove that its own fake was called once. Do not make
paid JEV availability or a private credential a condition for the source suite.

We are not trying to prove all future model quality before collecting real telemetry. A compact set
of representative cases plus critical boundary tests is enough to enter an explicitly experimental
pilot. Statistical precision/recall, calibration, savings, long soak and platform expansion remain
separate evaluations. Critical evidence, authority, privacy and cleanup cannot be postponed to telemetry.

## Required first-handoff suites

| ID | Suite / minimum cases | Existing owners and proposed additions | Done when |
| --- | --- | --- | --- |
| F1 | Decision contract and fallback: valid answer, unknown/invalid answer, off/missing-token with zero transport calls, timeout/cancel, bounded calls and usage retention | Existing `decisions`, `decision-configuration`, `decision-cancellation`, `decision-doctor`, `decision-telemetry` tests; add a focused question-contract test if needed | Consumer receives validated results or the ordinary fallback; no answer expands scope/authority |
| F2 | Output selection: routine success, failure amid noise with multiline diagnostics, ambiguous/incomplete output, archive/provider failure, protected content exceeding delivery capacity | Proposed `tool-output-selection.test.ts`; reuse existing log owner/fixtures | Relevant selection actually changes delivered text; native result and complete original stay unchanged; protected/unscored material survives; omissions can be retrieved |
| F3 | Completion advice: supported claim, unrelated or broader-scope evidence, contradictory/failed cleanup evidence, honest partial/blocked report, provider unavailable | Proposed `completion-claim-advice.test.ts` | One bounded advice result reaches the caller; no false pass, new stop gate, approval prompt or automatic test dispatch |
| F4 | Consumer/caller integration: off, shadow and enabled delivery; independent flags; global/aggregate budget; stale input; no-call defaults | Proposed `decision-consumer-integration.test.ts`, existing `context-route-command`/`context-packet` paths as regression | All eight reach their supported callers; enabling one cannot enable another; off makes zero calls; shadow preserves delivery; shared limits hold |
| F5 | Measurement: joined decision and caller result, fallback/no-call classification, known versus missing native usage, repeated receipt, unavailable telemetry storage | Extend decision/provider/check/projection suites only where changed | No double counting or fabricated zero usage; telemetry failure cannot change native execution/proof |
| F6 | Release and update: stable behavior retained, matching RC accepted, identity mismatch refused, hash-bound lock, explicit RC pin, ordinary stable discovery excludes RC | Existing `scripts/release-assets.test.mjs`, `runtime-lock`, `runtime-staging`, `startup-release-inventory`, `startup-compatibility` tests | RC support works as one deliberate path without silently enrolling existing installations |
| F7 | Host/workflow regression for changed owners: instruction preservation, correct managed command effect, same-job observation, cancellation and cleanup | Existing host-instruction/startup/runtime-command-classification/workflow suites | Affected public paths retain behavior; unchanged owners do not require a new combinatorial matrix |
| F8 | Installed package smoke: public CLI/API and all eight consumers on a tiny fixed corpus, per-feature delivery/fallback, persisted receipts and original-output access | Existing `verify-package.mjs`; add installed consumer assertions there or a single explicit companion | Compiled installed bytes work outside source checkout, without live JEV credentials; temporary installation/process cleanup confirmed |
| F9 | Code/test advice: a meaningful assertion/mock or rule concern, an intentional legitimate change, unknown setup and unsupported input | Proposed `test-quality-advice.test.ts` and `code-review-advice.test.ts` | Both consumers deliver source-linked advice without editing tests/code, accepting work or changing deterministic findings |
| F10 | Context selection: relevant candidates, required/conflicting content, no useful candidate, stale source and lexical fallback | Extend existing context ranking/packet tests | The actual delivered packet changes only optional content/order and retains mandatory evidence and usable fallback |
| F11 | Workflow/check recommendations: supplied eligible IDs, mixed/unknown intent, required checks and absent history | Proposed `workflow-advice.test.ts` and `validation-advice.test.ts` | Both planning callers receive advice; no command is dispatched and the original required plan, execution order and reuse decision are unchanged |
| F12 | Device diagnosis: bounded unfamiliar failure, healthy slow launch, stale/wrong-target/missing evidence and misleading logs | Proposed `device-diagnostic-advice.test.ts` | Existing failure report receives diagnosis/probe advice; native state, cleanup and target identity remain; no probe/reset/rebuild is dispatched |

“Enabled” in these suites means existing `auto` mode at the consumer's RC1 `advise` effect.
DL03/DL13 may shape optional delivered text; the other six deliver advice. Shadow records suggestions
only in receipts, with baseline caller output. Use the
[configuration and budget contract](../specs/engine-decision-layer.md#first-rc-configuration-and-aggregate-budget),
including strict keys, global off/shadow ceilings and old E3 allowlist migration without new grants.
Verify omitted `effect` resolves to advice in both doctor and receipts, and cannot select an execution
effect. An explicit effect is validated; upgrading feature support must not widen the default.
F4 includes the deliberate E3 invocation migration: legacy `context-route` without a bound or explicit task ID returns
`scope-unavailable`; adding `--decision-task` reuses existing `--revision` and permits only the
previously enabled question under the shared budget. Migration notes show both outcomes.
Also exercise a supported caller that passes its existing authoritative task/revision automatically:
no extra model-provided flags, no project-global current-task state, and conflicting manual identity
is rejected. Unintegrated/manual callers retain explicit flags or ordinary missing-scope fallback.

F4's mixed-consumer case must span separate CLI processes with the same workspace/task/revision:
reserve the last available budget concurrently, prove at most the allowed transport calls occur,
and prove repeat observations cannot reset accounting. Exercise the actual SQLite transaction owner:
restart after a committed reservation and verify the allowance remains spent; an aborted transaction
must dispatch no request. Include bounded database contention/unavailable storage and missing scope
fallback. F5 records `budget-exhausted` as a no-call fallback, not a failed native operation;
unavailable telemetry storage must not turn a refused reservation into a provider request.
Use a small representative concurrency/restart fixture, not a database fault-injection matrix.

F5 invokes the offline report against known decision/caller/check/provider fixtures plus later labels.
Use the public `telemetry decisions` entry and the proposed optional outcomes-manifest input.
Duplicate/shared-batch receipts count once, missing joins/usage remain explicit, and the report makes
zero inference or workflow calls. Report failure cannot affect native execution or budget enforcement.

F6 proves deliberate archive-plus-lock verification/staging outside stable startup discovery.
Keep startup rejection of RCs; retain preview and arbitrary prerelease rejection in the publisher.
Assert RC manifest/lock/archive agreement, prerelease/non-latest publication arguments and RC
`from_version` equal to the exact tag, alongside unchanged stable metadata. Local manifest/lock
entries carry the selected RC identity before packing, without a real remote publication.

F9 reaches `check`'s separate advice projection and preserves native findings/exit status. Include
one compatible DL01/DL02 batch that delivers independent findings with native usage counted once,
and a mixed disabled/shadow case proving that shared preparation cannot leak an enabled effect.
Incompatible evidence/data scope uses separate calls; sharing must not omit a required input. F11
reaches `context-route.workflowAdvice` using supplied recipes resolved against the operation catalog,
and the validation plan's separate advice field. No workflow is invented from an operation name.
Reject a candidate recipe whose workspace realpath differs from the context-route project root.
F12 reaches `workflow-status`/`workflow-wait.deviceAdvice` using the recorded combined stage log and
bound target/artifact evidence. Test the explicit `--diagnostic-evidence` path and missing-envelope
fallback; repeated status/wait calls reuse the same decision. These fixtures do not prove automatic
evidence export from a live adopter's RN loop.

F2's mixed log case should include a required warning, a split/multiline stack and misleading text.
F3's scope case should include simulator versus physical or source versus installed proof. Combine
closely related assertions in meaningful scenarios; do not multiply every case across every provider,
platform and mode. A small independent set of later live cases must not be the fixture-tuning set.

Eight shipped flags do not require testing every combination. Use a shared parameterized contract
smoke for per-feature isolation/fallback, meaningful cases for each consumer, and one mixed-enabled
case for the aggregate budget. RC1 workflow/check/device advice must not acquire execution effects.

Exercise each primitive actually implemented by the batch, including its invalid shape. If Score or
candidate-isolated groups remain unused, preserve their designed contract and record deferred coverage
rather than building extensive unused machinery. Do not claim unsupported primitives implemented.

## Commands and cadence

Use the root package's qualified Node 24.16.x-or-later 24.x runtime. Source TypeScript tests are a
development surface; production verification runs compiled package code. Inspect installed dependencies
first; use the existing pinned installation process if setup is needed, not a dependency upgrade.

During implementation, run the suite matching the changed behavior. The following are existing commands:

```sh
npm run typecheck
node --test components/engine/test/decisions.test.ts components/engine/test/decision-configuration.test.ts components/engine/test/decision-cancellation.test.ts components/engine/test/decision-doctor.test.ts components/engine/test/decision-telemetry.test.ts
node --test components/engine/test/context-packet.test.ts components/engine/test/context-route-command.test.ts
node --test components/engine/scripts/release-assets.test.mjs components/engine/test/runtime-lock.test.ts components/engine/test/startup-release-inventory.test.ts components/engine/test/startup-compatibility.test.ts
```

These are groups to select, not a requirement to replay all groups after every edit. Add actual
first-consumer test paths to the first batch's `npm run test:decision-pilot` script. The implemented script selects decision tests plus context-route and context-packet regressions,
with no live credentials and no implicit device work. Record its actual list in the handoff.

At the frozen first implementation/package boundary:

```sh
npm test
npm run typecheck
```

`npm test` already includes engine, continuity and release-script tests. Do not separately replay
the entire continuity suite just to obtain a second count. Run focused repairs for failures, then
the required consolidated candidate boundary when materially changed inputs justify it.

Use one new external output directory for the candidate. The existing package commands are:

```sh
npm run pack:engine -- /absolute/external/candidate-directory
node components/engine/scripts/verify-package.mjs /absolute/external/candidate-directory/exact-candidate.tgz
```

Those paths are placeholders: create the directory, use the archive actually produced and retain
its hash. Never select an arbitrary old archive with a broad wildcard. F8's new assertions should
be part of the verifier or have one documented explicit command next to it. The companion may create
a tiny generic project with a profile, facts lock, operation/recipe candidates, task ledger and
captured diagnostic fixtures. Exercise public installed callers there. Do not copy package
implementation into the installed test harness or resolve its imports back into the checkout.

The source/release workflow currently also requires the legacy-owner boundary while 2.x owners remain:

```sh
python3 -m unittest discover -s tests -p 'test_runtime_*.py'
python3 -m pip wheel . --no-deps --wheel-dir /absolute/external/wheel-proof
python3 tools/verify-runtime-wheel.py /absolute/external/wheel-proof/exact-wheel.whl
```

Run that boundary once when preparing the first release candidate, or earlier for relevant ownership/
packaging changes. It is not a required rerun for each output-filter or claim-advice edit. Preserve
the workflow's existing dependencies and artifact commands; if a test fails, diagnose its complete
evidence and fix the owning cause rather than weakening the test to produce a pass.

Documentation checks use the normal impacted source-governance path at the batch boundary. Preserve
other contributors' index/worktree state. No automatic full device build follows Markdown changes.

## What is required after review, during actual adoption

These observations are not Claude's local-source completion claims:

1. Published asset/hash/metadata readback, including RC status and deliberate pinning.
2. Fresh native host session sees the intended runtime and actual event/completion delivery.
3. One representative RN iOS simulator build/launch/scenario/cleanup with the adopted artifact.
4. Relevant wired-device readback when an affected claim requires it; otherwise explicitly justified
   reuse of retained evidence. No blanket final-archive device rerun is implied by identical inputs.
5. Off/missing-token behavior and one small enabled provider smoke in the approved data/cost scope.

A provider smoke proves protocol/configuration for those calls. It does not prove model quality or
savings. Existing release/device receipts remain bound to their original identities. No physical
disconnect/reconnect test, all-platform matrix or live release/CI-provider deployment is required here.

## Later batches: basic proof first, evaluation from telemetry

| Batch | Minimum functional proof before enabling its pilot | Telemetry to guide subsequent research |
| --- | --- | --- |
| S5 code/test/context refinements | Affected rule/language/ranking regressions; initial functional advice is already covered by F9/F10 | Useful versus false findings, missed evidence, extra review and actual reading/usage |
| S6 workflow/local-CI effect promotion | Qualified eligible IDs, authority, required checks, dependencies/capacity and complete reuse inputs before execution effects | Planning turns, feedback time, compute, failures discovered and coverage misses |
| S7 device effect promotion | Current target binding, granted/bounded probes or recovery, failed cleanup retained; initial diagnosis is already covered by F12 | Diagnostic turns, unnecessary rebuilds, completed scenarios, rescue and recovery success |
| S9 supervision/model routes | Advice first; explicit model policy retained; unavailable service cannot stop a healthy worker; one bounded escalation | Wrong intervention, total-model cost, repeated attempts and accepted quality |
| S10 release/history | Claims bind supplied evidence; original incidents retained; no publish/policy mutation from semantic output | Review time, duplicate investigation, useful suggestions and rework |

First collect the cases that occur. Use their frequency, cost and failure patterns to select larger
evaluation sets, threshold tuning, additional regression fixtures and future experiments. Keep an
untouched evaluation sample before making measured quality claims. Do not pre-build a giant benchmark
for every hypothetical condition or require favorable JEV results to close functional implementation.

## Review handoff checklist

- [ ] Exact source base/head and a manifest for all changed/untracked implementation files; identify
  pre-existing proposal documents and unrelated changes explicitly.
- [ ] Short feature-to-caller map: all eight consumers' entry points, flags, fallbacks, delivered effects
  and unsupported host surfaces. Include off/shadow/enabled example outputs from real caller tests.
- [ ] Exact commands, exits, test totals, artifact hashes and cleanup. Separate source, installed,
  fake-provider, live-provider and native-host/device evidence. Do not aggregate them into one claim.
- [ ] Existing protocol/configuration migration and release-policy changes explained, with known
  limitations and deferred work. Preserve all failed-run evidence relevant to unresolved findings.
  Include exact synthetic request/response JSON for each implemented provider primitive, marked
  unverified against the live provider until an authorized live smoke confirms that wire shape.
- [ ] One compiled review artifact and instructions for reproducing the small consumer smoke.
- [ ] No publication, SDK activation, paid evaluation or code/architecture approval claimed.

The operator/coordinating agent performs code and architecture review after the implementation
handoff. The implementer does not invoke another reviewer or wait for a review model unless asked.
