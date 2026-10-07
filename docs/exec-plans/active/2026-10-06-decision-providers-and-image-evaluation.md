---
id: plan.decision-providers-and-image-evaluation
title: Decision Providers and Image Evaluation Delivery
type: exec-plan
status: active
owner: project-governance
created: 2026-10-06
updated: 2026-10-06
summary: Plans three coherent batches for provider interchangeability, supplied-image evaluation and installed agent/test integration.
---

# Decision providers and image evaluation delivery

## Final state and authorization

The [specification](../../specs/engine-decision-providers-and-image-evaluation.md) owns R1–R7.
One existing decision runtime supports explicit JEV/OpenAI adapters and a reusable advisory
`evaluate_evidence` operation for text/images. CLI, a narrow library export and agent guidance
share that operation. A project test script can use it without another browser or check runner.

The operator approved implementation and focused local verification for release 4.2 on 2026-10-06,
following publication of the qualified 4.1 release. The design, Opus 5.5 medium review,
reconciliation and separate simplification pass are complete. The 4.1 source and archive are frozen
at their release identity; new runtime changes belong to 4.2. Preserve normal hooks and make local
commits at completed coherent seams. Paid inference, 4.2 publication and adopter changes remain
separate actions. One writer owns shared decision contracts. The independent B3 credential boundary
may be implemented in its existing execution owners while B2 proceeds; final integration and package
proof still depend on B2's settled interface. Root owns documentation, assets, package metadata and
installed proof. The optional browser pilot owns disjoint caller fixtures, not shared runtime code.

## Fixed decisions and source owners

- Extend `DecisionRuntime`; adapters translate provider contracts and reuse common transport.
- Keep existing registered consumers separate from the explicit generic evaluation entry.
- Preserve current JEV profiles, consumer defaults, effect ceilings and provider-free fallback.
- Configure providers explicitly. Unsupported images on JEV never trigger hidden OpenAI dispatch.
- Use the existing budget/receipt store with a separate evaluation scope; never fabricate a task.
- Images are bounded immutable local artifacts. All questions share the admitted evidence set.
- Expose a CLI and a narrow evaluation-only export; agents use their existing command tool and a
  packaged skill. A new MCP server or host plugin is unnecessary for initial delivery.
- Test scripts own capture, baselines, interpretation and native results. The first use is advisory.
- Keep empirical visual accuracy, live provider compatibility and accepted-task benefit separate
  from fixture correctness and installed-package execution.

| Concern | Current owner to extend |
| --- | --- |
| Runtime and legacy consumers | `components/engine/src/decision-runtime.ts`, `decisions.ts`, `decision-catalog.ts` and existing advice callers |
| Configuration and diagnostics | `decision-settings.ts`, `decision-configuration.ts`, `decision-doctor.ts`, `decision-operational-health.ts` |
| Provider codec and preparation | `decision-schema.ts`, `decision-request-preparation.ts`, `decision-transport.ts`, `decision-admission.ts` |
| Accounting, identity and retained usage | `decision-scope.ts`, `decision-budget.ts`, `decision-telemetry.ts`, `decision-episodes.ts`, `release-evaluation-cost.ts` |
| Generic command and narrow public entry | `cli.ts`, one evaluation entry module, `package.json` exports and current package-asset owner |
| Pinned launcher execution | Existing `runtime-invocation.ts` write-command admission and generation lifecycle; public-entry proof uses that owner |
| Project check execution/evidence | `check-worker.ts`, `check-run.ts`, `native-check-command.ts`, `credential-environment.ts`, `command-argv.ts`, `checker-results.ts`; project scripts retain navigation/capture |
| Documentation and installed proof | Existing packaged skill resources, developer catalog after acceptance, `verify-decision-pilot.mjs` and `verify-package.mjs` |

These names locate ownership, not a demand for a new module per concern. Keep adapter code close
to its current owner unless an observed boundary earns a separate file. No harness task-store
changes or copied Python assets are planned.

## Plan tracking and validation cadence

This plan uses prose checkpoints. Machine tracking requires real configured proof
owners and the then-current spec digest; no source pack exists for this proposal. Documentation
validation does not qualify runtime behavior. No additional runner is needed for progress tracking.

Follow the [validation strategy](../../governance/validation-strategy.md). Use Node `>=24.16.0 <25`
and verify the Git executable inherited by fixtures before the checkpoint.
Author each batch's source, bindings and meaningful fixtures together; run focused checks once at
batch completion. Repeat failed/invalidated owners, or run early for a named blocking uncertainty.
Existing hooks remain effective. Retain original proof and update implementation/verification/
closeout boxes at each batch or handoff. B1–B3 are implemented, mechanically verified and independently reviewed. One independent
implementation review consumes B3 proof; commits/publication remain separately authorized.

## B1 — Interchangeable text providers

- Depends on: none; reconcile source ownership with ongoing 4.1 work first.
- Requirements: R1, R2, R4; provider identity portions of R3/R7.
- Ownership: one writer for shared decision configuration/runtime/codecs and affected callers.
- Execution: sequential. Read-only support may check current consumer/default compatibility and
  independently verify the two provider schemas; no second writer to shared owners.
- Acceptance: existing text consumers work through the adapter seam, unchanged profiles retain
  JEV behavior, and explicit OpenAI text configuration has honest fallback and accounting.
- Review boundary: settled provider/configuration/answer contract; final independent QA consumes
  this original proof at B3 unless a material issue requires earlier review.

Implementation:

- [x] Extract one small typed provider seam and preserve shared transport/operational ownership.
- [x] Implement JEV and OpenAI codecs for Boolean, Choice and weighted Score; validate model aliases
  according to provider rules and retain requested/returned identities and native usage.
- [x] Extend canonical configuration, provider/account admission and passive diagnostics without
  enabling generic evaluation, changing legacy defaults or adding paid doctor probes.
  Generic configuration has one provider/model, not separate modality routes.
- [x] Declare compatible evidence layouts and reject unsupported isolated layouts without dispatch.
  Keep registered OpenAI swaps shadow-only; use exact adapter model mappings, with no new
  qualification registry or guessed dated alias forms.
- [x] Preserve unknown/refusal/per-question-invalid/envelope-invalid distinctions and current
  deterministic consumer fallbacks. Add provider-neutral version-3 outcomes, version-2 JEV receipt
  projection and provider-aware reports, usage and health without rewriting historical receipts.
- [x] Author fixture transport regressions for both providers and unchanged registered callers.

Verification:

- [x] Run the B1 focused suite and no-emit typecheck at the completed batch checkpoint.
- [x] Confirm zero dispatch on unsupported capability, denied disclosure, absent credentials and
  local-only policy; exact answer/distribution validation and existing cancellation remain effective.

Closeout:

- [x] Record settled configuration/adapter contracts, retained original proof and any remaining
  provider-alias or live-service evidence limits before B2.

| Trigger | Exact checkpoint command | Scope/claim | Repeat only when |
| --- | --- | --- | --- |
| B1 complete | B1 command below | Provider codecs, unchanged consumers/configuration, native usage, admission and fallback | Relevant source/configuration/model contract changes or failed proof |
| B1 complete | `npm run typecheck` | Shared TypeScript integration and affected callers | Relevant typed source/dependency changes or failure |

```sh
node --test --test-concurrency=2 components/engine/test/decision-configuration.test.ts components/engine/test/decision-settings.test.ts components/engine/test/decision-doctor.test.ts components/engine/test/decision-schema.test.ts components/engine/test/decision-runtime.test.ts components/engine/test/decision-transport.test.ts components/engine/test/decision-admission.test.ts components/engine/test/decisions.test.ts components/engine/test/decision-telemetry.test.ts components/engine/test/decision-outcomes.test.ts components/engine/test/decision-episodes.test.ts components/engine/test/release-evaluation.test.ts components/engine/test/release-evaluation-capture.test.ts components/engine/test/decision-providers.test.ts components/engine/test/decision-context-advice.test.ts components/engine/test/decision-check-advice.test.ts components/engine/test/decision-output-advice.test.ts components/engine/test/decision-device-advice.test.ts components/engine/test/decision-claim-advice.test.ts components/engine/test/decision-workflow-advice.test.ts components/engine/test/decision-validation-advice.test.ts components/engine/test/decision-review.test.ts components/engine/test/decision-attention.test.ts components/engine/test/decision-provider-advice.test.ts components/engine/test/decision-log-filter.test.ts components/engine/test/decision-diagnose.test.ts components/engine/test/decision-task-binding.test.ts components/engine/test/context-route-command.test.ts components/engine/test/context-route-presentation.test.ts components/engine/test/context-packet.test.ts components/engine/test/context-evaluation.test.ts components/engine/test/context-metadata.test.ts components/engine/test/context-passage-advice.test.ts components/engine/test/context-family.test.ts components/engine/test/context-task-switch.test.ts components/engine/test/context-observations.test.ts components/engine/test/provider-context.test.ts components/engine/test/new-project-operational.test.ts
```

The command above freezes 38 affected suites, including the new provider codec owner and current
presentation/filter/episode readers. Version-3 outward JSON uses provider identity. The checkpoint
and focused replacements cover 286 distinct passing cases, together with the no-emit typecheck.
The initial environment used a
slow platform Git launcher; retain its failed timing cases as diagnosis, not runtime qualification.
Corrected process access qualifies native ownership tests without weakening those checks. Original
commands, logs and source hashes stay in the external B1 evidence record; passing cases are not
double-counted across retries.

The settled seam preserves JEV payload/parser/defaults and its aggregate pacing. OpenAI uses the
documented Decisions request/answer arrays, exact `gpt-6-luna` alias checks and byte admission with
no invented token estimate. Registered swaps remain shadow-only, and generic evaluation stays
disabled. Provider/account admission, v3 usage/reporting and historical v2 projection are verified.
Receipt and cursor reuse require the same provider/adapter/model/configuration; unqualified history
cannot dispatch or charge the same reserved event again. Live API compatibility and immutable
backend identity remain unqualified. No network inference was used. B2 can now extend this settled
seam. Default cadence remains batch completion, with failed or invalidated owners rechecked.

## B2 — Supplied-image evaluation and public entry

- Depends on: B1.
- Requirements: R2–R5; image/model qualification limits in R7.
- Ownership: one writer for generic admission, image preparation, accounting identity, CLI/export.
- Execution: sequential. A reader may challenge disclosure/replay fixtures while the writer
  completes the settled contract; findings are needed before this checkpoint.
- Acceptance: standalone text/image evaluation works without a task, shares the canonical runtime,
  and reports scoped results without registered effects or hidden provider changes.
- Review boundary: complete generic request/result, image admission and replay/accounting behavior.

Implementation:

- [x] Add explicit generic-entry admission without dynamic registration or weakening existing
  consumer enablement: typed registered/supplied branches, validated request-local questions,
  fixed advice-only effect and disabled/enabled generic setting. Add supplied-evidence permission.
- [x] Extend the existing budget store for evaluation scopes while preserving old counters/receipts.
  Use typed reserved keys with unchanged version-2 storage and one host-derived workspace/window
  aggregate allowance. Bind stable evaluation IDs to exact requests; new IDs/processes or changed
  settings cannot reset spending. Task/run association is verified provenance only.
- [x] Persist the workspace/evaluation-ID request claim independently of daily charges, in the same
  reservation transaction. Midnight/closed-window replay without a receipt cannot dispatch again;
  changed input conflicts. Close prior window scopes while retaining dispatch guards.
- [x] Capture bounded static PNG/JPEG/WebP inputs under approved roots; verify actual media,
  dimensions, immutable bytes and serialized expansion. No fetching, animation or conversion.
  Declare/document fixed adapter request limits; operators set daily spending, disclosure and
  roots rather than a second set of image/question/duration allowances.
- [x] Extend the existing provider pool for OpenAI byte/image admission and call/concurrency pacing;
  token estimate remains null and cost uses native usage. Preserve JEV text preparation/pacing.
- [x] Implement the versioned JSON request/result and `project-governance evaluate --request-file`.
  Define the narrow evaluation-only export; keep trusted-host authority APIs out of it.
- [x] Retain per-question outcome, coverage, artifact provenance, native usage/timing and receipt
  identity. Shared v3 Score has one computed score; retain native score and validate agreement.
  Always print the result envelope; exit 0 permits only answered/unknown/refused, otherwise exit 1.
- [x] Author synthetic image, taskless invocation, disclosure, limits, refusal, replay/conflict,
  interrupted dispatch and CLI/library boundary regressions alongside the implementation.

Verification:

- [x] Run B2 owner suites plus existing budget/scope/runtime/preparation regressions and typecheck.
- [x] Cover spec R3/R4's identity, rejection and answer cases; add interrupted/missing-receipt
  replay across midnight, new IDs within the same daily allowance, old storage coexistence and
  unconditional structured CLI failure output. Preserve declared evidence layouts and task absence.

Closeout:

- [x] Freeze the public request/result/exit contract and package export before B3. Record original
  proof, failure cases and model-alias/image-token-estimation limits.

| Trigger | Exact checkpoint command | Scope/claim | Repeat only when |
| --- | --- | --- | --- |
| B2 complete | `node --test --test-concurrency=2 components/engine/test/decision-budget.test.ts components/engine/test/decision-scope.test.ts components/engine/test/decision-runtime.test.ts components/engine/test/decision-schema.test.ts components/engine/test/decision-transport.test.ts` plus frozen new evaluation/image suites | Existing accounting and new generic/image request, CLI, export and reuse boundaries | Changed accounting/preparation/public-entry inputs or failed proof |
| B2 complete | `npm run typecheck` | Canonical types and public-entry integration | Relevant typed source/dependency changes or failure |

The new owning suites are `evaluation-budget.test.ts`, `evaluation-command.test.ts`,
`evaluation-images.test.ts` and `evaluation-runtime.test.ts` under `components/engine/test`.
The frozen checkpoint also includes existing budget, scope, runtime, schema, transport, admission,
provider, settings, outcome and cancellation suites. Distinct proof covers 105 passing cases and
no-emit typecheck. A reader challenge reproduced parent replacement, FIFO input, request growth
and forged cached task association. Corrections bind bounded nonblocking reads to inspected file
identities and cached association to the original request. Original failures and replacement proof
remain outside source; retries are not counted as new cases. Container checks do not decode pixels.
Live service compatibility and visual accuracy remain unqualified.

## B3 — Agent/test integration and installed boundary proof

- Depends on: B2.
- Requirements: R5–R7 and integrated R1–R4 regression coverage.
- Ownership: one writer for packaged guidance, synthetic project wrapper, exports/assets and proof.
- Execution: serial package build/archive proof after the candidate is stable. Read-only QA
  consumes completed batch evidence and checks capability/authority boundaries once.
- Acceptance: agents can invoke the documented command, a generic project checker links evaluation
  evidence correctly, and the exact installed archive supports the narrow CLI/library surface.

Implementation:

- [x] Package a small agent skill using the existing native command tool; describe taskless evaluation,
  explicit disclosure, ad hoc advisory questions, outcomes and failure handling. No MCP service.
- [x] Provide a synthetic project test-wrapper fixture using the existing custom-check/evidence
  seam. It owns capture conditions, baseline references and interpretation, emits valid checker
  JSON and links the evaluation receipt to the original run.
- [x] Wire explicit custom-command credential-name declarations through detached worker and native
  command filtering. Keep host-owned values only in declared environments; support standard
  adapter-declared exact key names. Prove absent declarations deny forwarding, one absent value
  affects only its declaring command, and canary values never persist.
- [x] Exercise the wrapper on success, known defect, uncertainty, refusal and provider outage;
  native failures remain failures. Required visual assertion examples never treat unusable answers
  as pass or not-applicable. Fixture answers qualify wiring, not visual-model accuracy.
- [x] Add accepted command/library guidance to the developer catalog and indexes. Explain advisory
  first use, project-owned qualification and semantic-versus-pixel comparison without claiming
  a UI capture backend or qualified screenshot detector.
- [x] Extend installed proof for one taskless fixture evaluation with text/image through CLI and
  the narrow library outside the checkout, packaged skill/assets and the real credential canary.
  Source suites own default/disclosure/answer cases; existing installed pilot remains constituent
  proof rather than a duplicate matrix.

Verification:

- [x] Run `npm run test:engine` once on the stable candidate; it includes the integration and decision
  pilot source suites. Include new wrapper/export/credential regressions in their owning paths.
- [x] Build one exact archive and verify clean installation, exports/assets and invocation from
  outside the source checkout. Use real configured fixture transport, never paid inference.
- [x] Complete one independent implementation review and reconcile material findings against
  original evidence. Recheck affected changes; broaden only for a named invalidated boundary.

Closeout:

- [x] Complete R1–R6 mechanical mapping and R7 evidence-limit review; consolidate source docs and
  original command evidence. Record implementation readiness separately from publication/adoption.
- [x] Leave live service compatibility, visual accuracy, required-project-gate adoption and
  accepted-task benefit explicitly unqualified until a separately authorized comparison.

| Trigger | Exact checkpoint command/runbook | Scope/claim | Repeat only when |
| --- | --- | --- | --- |
| Stable integrated candidate | `npm run test:engine` | Existing integration/decision source suites plus new wrapper/export/credential regressions; broader configuration/accounting/disclosure boundary | Shared boundary or frozen candidate changes, failure or named uncovered contract |
| Stable package boundary | Archive runbook below | Actual built/installed CLI, public export, packaged skill and fixture behavior | Source/dependencies/assets/toolchain/archive change or failed proof |

```sh
mkdir -p /private/tmp/decision-evaluation-package-proof
npm run pack:engine -- /private/tmp/decision-evaluation-package-proof
node components/engine/scripts/verify-package.mjs <one-exact-archive.tgz> .
```

Use a fresh empty output directory if that example path already exists. Replace the placeholder
with the one archive produced by the build and record its SHA256. The final `.` supplies the
qualified lint-tool root; an unavailable-tool shortcut is not package qualification. These are
reproduction commands; executed originals remain in the external evidence record. Serial wait on the original process; explicit checkpoint
deadline and evidence location belong to the actual invocation. Wait timeout alone is not failure.

The installed proof must exercise the real CLI → detached check worker → native command filtering
path with a synthetic credential canary and fixture endpoint, then inspect retained artifacts for
its absence. `verify-package.mjs` already invokes `verifyDecisionPilot` from
`verify-decision-pilot.mjs`; extend that constituent proof instead of running a second pilot command.

The integrated source checkpoint ran 1,109 cases: 1,107 passed and two failures were retained.
One failure was the checkpoint's Python path lacking PyYAML; the configured source environment
passes that two-case owner. The other exposed a credential guard rejecting the existing startup
coordination identity. Its correction preserves the original hook admission and passes 23 focused
cases, including real synthetic preparation and apply. Final no-emit typecheck passes. The optional
caller's 38-case focused replacement retains missing-answer denominators and bounds final readback.
These reconciled checkpoints are distinct from a single all-green invocation; unchanged passing
owners were not rerun. No live provider, accepted development or savings claim follows from them.

The final exact archive passes clean installation and the complete installed pipeline, including
20 evaluator cases. The pinned launcher reaches the evaluator through a verified stage, records its
write effect and releases the invocation reader. A registered but unselected optional experiment
leaves real startup, task/checkpoint resume and an unrelated native check intact, with its command,
dependency and network tripwires untouched. Eleven intercepted provider dispatches qualify wiring;
none are external inference. Original failures and intermediate archives remain distinct from this
final candidate. The obsolete source-only pilot convenience script was removed: canonical package
proof supplies a verified stage, and standalone proof scripts reject missing stage input before
fixture execution. See the [implementation reconciliation](../../reviews/2026-10-07-decision-evaluation-implementation-reconciliation.md).

Independent implementation review and its targeted recheck are complete. Material findings are
closed; smaller code/documentation/accounting corrections have focused original proof. One
stable-candidate impacted sign-off under normal source hook authority
follows implementation when required; an invoked hook counts instead of duplicating its gate.
Do not run full CI or rebuild unrelated adopters as a documentation/design checkpoint.

## Live qualification and rollout boundary

A later explicitly scoped comparison is needed before replacing JEV or making a visual assertion
required. Use frozen human-labeled text cases and screenshots, matched criteria, known-good and
defective cases, dynamic-content and incomplete-capture cases. Report false passes, false alarms,
uncertainty/refusal, p50/p95 end-to-end wall time, observed provider usage/cost and any accepted-task
benefit. Include failed calls/retries; do not treat summed parallel duration as elapsed time.

Optional local Holo grounding combined with Decisions checkpoints is owned by the
[optional computer-use specification](../../specs/engine-optional-computer-use-testing.md) and
[plan](2026-10-06-optional-computer-use-testing.md). It does not turn `evaluate_evidence` into an
executor or extend the current recipes' permitted effects.

Include a caller-owned image optimization comparison. Start with the same frozen captures at
original resolution and two smaller aspect-preserving sizes, without upscaling. Then compare a
relevant-region crop at native resolution and supported image-detail settings on the promising
candidate. Compare PNG with compressed encodings separately; fewer uploaded bytes do not establish
fewer billable image tokens. Keep paired reference/current images under matching preparation.

Use frozen human labels and known subtle defects, including small validation text, clipped labels,
wrong values and missing controls. Full-resolution model answers are another comparison arm, not
ground truth. Report false passes, false alarms, refusal/uncertainty, preprocessing and end-to-end
latency, observed native input usage and total workflow cost, including higher-resolution follow-ups.
Select the cheapest preparation that meets the assertion's declared quality requirement; provider
confidence alone cannot justify accepting reduced detail or omitting a follow-up.

The test runner retains original and evaluated artifacts, dimensions, crop/resize/encoding settings
and requested detail. These explicit derivatives do not add automatic preprocessing to the evaluator.
Keep control-image geometry separate from evaluation preparation; any transformed control image
needs verified coordinate mapping. Image optimization remains part of this separately scoped live
comparison, not a new core dependency or permission to run paid experiments now.

Provider prices, account access and model identities require current readback at that checkpoint.
An alias does not establish reproducible weights. Implementation approval does not authorize a paid
baseline, threshold-fitting experiment or adopter test. A project keeps capture,
baselines and thresholds in its repository and adopts the pinned runtime deliberately.

## Rollback

Disable generic evaluation and restore the explicitly configured JEV route through the existing
settings owner. Keep original receipts, accounting and test evidence. A required visual assertion
without its qualified evaluator becomes unresolved; disabling it is not a pass. No downgrade,
store deletion, compatibility shim or automatic adopter change is part of rollback.

## Current action

Document authoring, Opus 5.5 medium design review, focused reconciliation and the separate
simplification pass are complete. See the [design reconciliation](../../reviews/2026-10-06-decision-providers-design-reconciliation.md)
and [simplification decisions](../../reviews/2026-10-06-decision-providers-simplification.md).
Implementation is authorized for 4.2. B1's provider seam, accounting/readers and reuse boundaries
are implemented and locally verified against frozen synthetic cases. B2's generic/image entry and
immutable accounting are also verified. B3 integration and final installed proof are complete;
independent review is reconciled. This implementation scope is complete; publication and adoption
remain separate. Live beta compatibility, visual accuracy and
ordinary accepted-task benefit remain unqualified.
