---
id: plan.optional-computer-use-testing
title: Optional Computer Use and Combined Visual Testing Delivery
type: exec-plan
status: active
owner: project-governance
created: 2026-10-06
updated: 2026-10-06
summary: Plans model-free integration, local Holo setup and realistic combined Decisions experiments as separate proof checkpoints.
---

# Optional computer use and combined visual testing delivery

## Final state and authorization

The [specification](../../specs/engine-optional-computer-use-testing.md) owns R1–R6. A developer can
run normal governance without Holo or OpenAI access. An explicitly selected experiment uses local
Holo4-27B grounding, a qualified project-owned browser runner and Decisions checkpoint advice.
Three realistic synthetic scenarios expose wrong actions and convincing but incorrect visual
success. Independent state assertions and visual labels own truth.

The operator authorized documentation, Opus 5.5 medium review, reconciliation, a subsequent
simplification pass and a local commit on 2026-10-06. The operator then included this plan in the
4.2 implementation on the same day. B1/B2 model-free implementation and focused local verification
are authorized. B3 model acquisition, service startup and live or paid experiments remain separately
scoped actions. Publication and adopter edits are not selected. The decision-provider/image-evaluator
delivery proceeds under its separately owned authorization.

## Dependencies and source fit

- The [evaluator plan](2026-10-06-decision-providers-and-image-evaluation.md) owns B1–B3 and its
  eventual narrow CLI/library entry. Combined integration depends on accepted B2/B3 interfaces
  and installed proof, including B3 custom-command credential forwarding. Do not invent a second
  direct OpenAI client while those are unfinished.
- Existing check/workflow execution owns command processes, cancellation and result retention.
  The project runner owns browser resources and action artifacts. No harness task-store change,
  global registry, coding-agent provider addition or copied runtime is planned.
- First delivery is entirely caller-owned: thin Holo client, runner, evaluator invocation and report
  through existing custom commands. No shared engine/package changes are planned. A named shared
  gap becomes a separately accepted change rather than an implicit part of this batch.
- First qualify a small capture/action runner for one local fixture and injected faults.
- Holo configuration stays ignored and host-owned. Weights, model/projector paths, personal machine
  details, adopter fixtures and actual runtime evidence stay outside this reusable checkout.

Resolve touched modules against the specification's owner table at implementation time.

The reusable caller example lives under `components/engine/test/fixtures/optional-computer-use/`,
with its contract tests in `components/engine/test/optional-computer-use.test.ts`. It is excluded
from the installed runtime. Browser dependencies belong to an external caller setup; the engine's
dependency list stays unchanged. One writer owns this fixture; one writer owns shared evaluator
contracts. They may develop the independent B1 fixtures in parallel, then integrate B2 against
the settled evaluator interface and reuse its installed proof.

## B1 — Optional local grounding and a qualified fixture runner

Requirements: R1–R3. No live model is needed for this batch. It can proceed against fixture responses
while the evaluator entry is delivered separately.

Implementation:

- [x] Implement the caller command/configuration using the existing custom-check seam. Map optional
  absence to warning plus an advisory not-run finding; required absence to failed plus a blocking
  finding. Never emit not-applicable or a bare warning that normalizes to passed.
- [x] Implement a bounded loopback-only grounding adapter with strict response validation,
  cancellation and configured/observed identity. Passive inspection never calls a model.
- [x] Bind scripted target/action, capture token, geometry and budgets. Keep hidden oracle data and
  labels out of model requests. Define exactly which runner generation/change events invalidate
  a capture before dispatch, rather than promise arbitrary browser freshness detection.
- [x] Qualify click/type/scroll, fresh capture, origin/network restriction, cleanup and exactly-once
  action/readback behavior in one disposable local browser runner. No external effects.
- [x] Author the local setup run book with explicit model revision/quantization/projector and serving
  version, observed-identity limits, passive/readiness/smoke commands and teardown instructions.
  Check Holo4 support for the selected llama.cpp version before presenting a tested start command.

Verification checkpoint:

- [x] Focused caller tests cover absent/disabled dependencies, invalid selected configuration,
  stopped service, model incompatibility, malformed coordinates, redirects, timeout and cancellation.
- [x] Runner fixtures prove device-scale mapping, boundary coordinates, stale capture rejection,
  overlay/delayed-render changes, restricted targets and lost acknowledgment after actual mutation.
- [x] One caller regression proves an unselected experiment leaves core startup/resume and an
  unrelated native check functional without Holo, hosted API access or optional browser/image
  dependencies, and with no model network calls; inspect the unchanged core installation boundary.
  Test selected warning/failed mapping through the real installed custom
  command owner. Do not rebuild the engine or invent installed absence fixtures for unchanged code.

## B2 — Combined scenarios and image preparation with fixture providers

Requirements: R4–R6. Depends on B1 and the accepted evaluator interface. All tests are credential-free
and use fixture transports; no model call is a prerequisite for this checkpoint.

Implementation:

- [x] Wire named checkpoint questions through the evaluator entry. Reuse disclosure, roots,
  credentials, operation/dispatch identity, accounting, native usage and partial-answer semantics.
- [x] Add the form, settings and canvas tasks from the spec with hidden state oracles, independent
  visual-label fixtures and targeted good/bad variants. Deterministic fixture assertions catch each
  intended fault without either model. Record unseen captures as unlabeled until reviewed.
- [x] Retain checkpoints from one Holo action run per trial, then evaluate those frozen images in a
  separate command. Compare native outcomes with paired Decisions advice, not two independent
  browser executions. Use a deterministic fixture test for wiring proof; advice does not alter actions.
- [x] Reuse the evaluator plan's frozen image comparison protocol. Caller-side preparation retains
  transforms and matching reference/current settings, leaves Holo capture geometry untouched and
  rejects use of crops to certify properties outside the selected region.
- [x] Produce one project experiment report from existing artifacts with the spec's R5 measures,
  unresolved actions and identities. Unknown usage/cost stays unknown.

Verification checkpoint:

- [x] Test Holo loss before action, Decisions failure/refusal after action, independent native failure,
  exhausted budgets and cancellation. Continue unrelated checks after ordinary model unavailability
  and preserve missing required proof. Existing native process-failure, dependency and fail-fast
  rules still apply; a native command exiting with failure does not promise later pack execution.
- [x] Assert request payloads exclude hidden oracle state and correctness labels. Verify a false
  success toast, wrong target and duplicate-submission risk cannot become a native
  pass because models agree. No evaluator answer can grant a new action, update a baseline or waive
  a required check. A local-only lane cannot dispatch to OpenAI.
- [x] Prove the real installed custom-command/evaluator path admits the caller artifact layout and
  retains warning/failed findings. Reuse original evaluator B3 forwarding proof; add a caller canary
  proving the browser/Holo driver never receives the OpenAI credential and artifacts never retain it.
  No archive rebuild for this project-only delivery; any shared gap needs separate package proof.
- [x] Independent QA reviews the frozen B1/B2 change and original focused/installed proof. Reconcile
  material findings before closing model-free implementation. No broad adopter rebuild or full CI
  merely for these documents.

## B3 — Explicit local setup and combined live qualification

Requirements: empirical portions of R2–R6. Depends on model-free proof and a separately authorized
invocation naming environment, model artifacts, disclosure, budgets, sample counts and evidence
location. These are distinct checkpoints, not automatic install/CI steps.

Local Holo checkpoint:

- [ ] Verify the selected runtime, model/projector revisions and quantization, endpoint, image support
  and grounding response using the documented passive/readiness/smoke separation.
- [ ] Measure setup/cold-start time, memory and steady-state grounding latency on the actual host.
  Record failed setup attempts and resource limits; weight size and vendor throughput are not proof.
- [ ] Run the selected browser smoke cases and prove observed pixel-to-action behavior and readback.
  Retain limitations for unsupported servers/quantizations. Do not claim desktop/mobile qualification.

Combined live checkpoint:

- [ ] Refresh Decisions access, model/profile and pricing; verify explicit screenshot disclosure.
- [ ] Freeze scenario seeds, budgets, written questions and quality requirements before scoring.
  Use a small development set for preparation choices and a separate held-out set for evaluation.
  Human labels are blind to model answers; newly generated evidence is labeled before quality claims.
- [ ] Repeat action trials with disclosed sample counts and evaluate each trial's frozen captures
  afterwards. Include known defects and targeted service/action failures with predeclared outcome
  classes. Keep unresolved and unavailable outcomes in the denominator; native results stay separate.
- [ ] Run the linked image comparison protocol on frozen scenario development captures. Select the
  cheapest candidate meeting predeclared quality, then validate that frozen choice on held-out
  captures. Include all follow-up costs. If it fails, retain original evidence or keep the criterion
  advisory/unresolved; no confidence-based acceptance, hidden retuning or provider fallback.
- [ ] Report per R5 with uncertainty. Small samples are exploratory; zero observed false passes
  cannot establish a broadly qualified required gate.
- [ ] Reconcile the experiment report and decide whether this narrow workflow earns adoption.
  Any required visual assertion, adaptive recovery, new runner/target or release is a later accepted
  change with its own effect and proof boundary.

## Validation cadence and future commands

Follow the [validation strategy](../../governance/validation-strategy.md). Freeze exact focused test
paths when caller source ownership is resolved. Run the caller's focused tests/typecheck once at
each completed batch. Use the pinned runtime and its supported Node version (`>=24.16.0 <25` for
current source). Prove the installed caller command boundary without rebuilding unchanged shared
code. Any named shared gap needs separate acceptance, owning tests and package proof where relevant;
reuse original evaluator evidence.

The [caller run book](../../../components/engine/test/fixtures/optional-computer-use/README.md)
records the implemented commands, explicit browser dependencies, deadlines and setup boundaries.
The retained model-free checkpoint passed 38 cases with a real disposable browser and caller-owned
image preparation, with no skipped browser cases. Its exact source hashes remain with that original.
The later advice-link correction changes the evaluator helper and its test file; five focused
current cases, whole typecheck and installed caller proof cover those changes. Real-browser cases
do not call that helper, and their owning behavior is unchanged. Grounding and evaluation answers are fixtures.
Missing answers remain in report denominators; stalled final readback remains unresolved under the
same run deadline. No model startup command is presented as tested. Local-model and combined
live lanes still need their own original commands, evidence and qualification.
Source hooks retain their existing Python owner until deliberate cutover. Documentation review and
hook validation do not establish runtime, model setup or visual accuracy.

The shared evaluator's final 20-case installed constituent proves approved artifact layout,
declared process-only credentials, warning/failed mapping and native authority. Its unselected
experiment case uses real installed startup, resume and impacted native check owners in one
synthetic workspace. Task/checkpoint identity, staged custody and package contents remain intact;
optional command, dependency and network tripwires remain untouched. Only that fixture's session
is closed normally. Five focused advice-link cases additionally bind results to the retained image
ID/type/digest. See the [implementation reconciliation](../../reviews/2026-10-07-decision-evaluation-implementation-reconciliation.md).

## Deferred onboarding follow-up

On 2026-10-06 the operator deferred onboarding improvements until after initial testing. Use the
observed setup friction to decide whether small caller-owned demo/configuration helpers earn their
cost. No onboarding guide or helper implementation is selected by this note.

When revisited, use one short guide reached from existing installation guidance and the developer
index/catalog, with an on-demand agent walkthrough. Present three optional paths: a model-free
browser demo, Decisions evaluation of existing screenshots, and local Holo setup. Normal harness
use must require none of them. Reading or routing the guide does not install tools, start services
or call models. R1 remains the availability contract; the B1 installed regression above must pass
before model-free integration closes.

Nine focused source tests passed with API keys and optional browser/image dependency bindings
removed. They cover default-off settings, zero dispatch when disabled/unconfigured, optional versus
required absence, passive inspection, and native-result independence from evaluator availability.
These tests do not close the pending installed startup/resume/custom-command proof.

## Rollback and current action

Disable the optional experiment through its requesting command. Preserve original run/action and
evaluation evidence; required proof stays unresolved until its qualified owner is available.
Do not downgrade a runtime, delete accounting/state or reinterpret a skip as success.

Documentation design review, [reconciliation](../../reviews/2026-10-06-optional-computer-use-design-reconciliation.md)
and the subsequent [simplification pass](../../reviews/2026-10-06-optional-computer-use-simplification.md)
are complete. B1/B2 model-free implementation, focused proof and installed integration are complete.
Independent implementation QA is reconciled with the 4.2 evaluator. Checkboxes distinguish
implemented behavior from proof. B3 local-model and combined live qualification remain future work.
No release or adopter migration is selected.
