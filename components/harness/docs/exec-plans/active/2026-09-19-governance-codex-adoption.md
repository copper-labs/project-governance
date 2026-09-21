# Governance + Codex adoption

Status: retained acceptance inventory; forward ordering superseded on 2026-09-20 by the
[unified engine transition](../../../../../docs/exec-plans/active/2026-09-20-unified-development-engine.md).
Source consolidation and single-wheel packaging are complete locally; remaining slices are pending.
Do not start S1–S9 as a separate sequence. E0 maps these criteria before any retirement; current
runtime contracts stay effective until explicit owner/contract cutover.
The [decision-first design](../../../../../docs/exec-plans/active/2026-09-19-decision-first-development-loop.md)
records the full decision map and rationale; current specifications own behavior. Historical proposals
and supporting step files do not override this sequence. No completed migration is reopened.

## Completed foundation

- [x] Consolidate the module into governance with preserved source history.
- [x] Embed canonical TypeScript sources and the generation-bound launcher in one wheel.
- [x] Establish local installed-wheel task/resume and executor evidence in the migration receipt.

Local packaging does not establish unified setup/repair, native hooks, simulator/device behavior or
published-artifact adoption. Prior test counts certify their recorded source, not future changes.

## Dependency and priority map

`S1 → S2 → S3 → S4 → S5 → S6`

`S3 → S7` (optional JEV lane; independent of S4–S6)

`S3 → S8` (conditional index experiment; independent of JEV)

S9 closes any selected release scope after its applicable slices. Default effort follows S1–S6;
S7 can follow S3 when the context baseline supplies a useful experiment. Device work never waits
for a JEV account or result. S8 requires evidence, not merely elapsed roadmap progress. These are
work dependencies, not authorization to spawn agents or change adopters.

## S1 — One usable installation and explicit host lifecycle

- [ ] Unify init/repair/doctor with continuity payload, Node/SQLite, workspace/store and instruction status.
- [ ] Preserve existing delegation registrations and authored instructions; setup/repair is idempotent.
- [ ] Qualify explicit Codex task binding, checkpoint/reopen, interrupted-check recovery, linked
  worktrees and cooperating sessions against the exact installed wheel.
- [ ] Exercise interrupted update/recovery and active executor generations through existing machinery.

Exit: one installed product supports the provider-free explicit loop, explains readiness gaps and
recovers the same job without resubmission. Native hooks are a later qualification substep, not a
blocker for explicit operation. Proof: focused installer/owner fixtures and clean installed-wheel
lifecycle; actual host exercise reported separately. No automatic adopter rollout.

## S2 — Small measurement baseline

Depends on S1's observable lifecycle; local instrumentation development need not wait for attended proof.

- [ ] Compare existing telemetry extension and separate storage against coverage, joins, retention,
  frozen evaluation, isolation and maintenance cost; record the selected option and rationale.
- [ ] Validate the frozen evaluation manifest and declare baseline-derived benefit/uncertainty thresholds
  before evaluating an intervention; remove guessed savings forecasts from release expectations.
- [ ] Implement bounded, best-effort local observations and on-demand aggregates under the measurement spec.
- [ ] Deduplicate usage and run events; distinguish missing data, wall time and summed execution time.
- [ ] Establish matched task categories, native usage coverage and existing reading/build/test cost.
- [ ] Repair historical denominators before reuse; keep project-specific data outside this checkout.

Exit: a report explains outcome cost and coverage with versioned configuration, without raw source
collection or required operational-state loss. Proof: bounded retention/off/full/locked/failure and
aggregation fixtures; small cold/warm overhead measurement. No benchmark framework or recurring report.

## S3 — Deterministic working packet and decision seam

Depends on S1–S2. First broad reduction in repeated reading/reasoning.

- [ ] Assemble task, mandatory context, relevant candidates, source identity, open jobs and required proof.
- [ ] Reuse governance routing and exact artifact retrieval; show omissions and bounded expansion.
- [ ] Implement the narrow internal decision interface, off mode and fake-adapter failure fixtures.
- [ ] Compare deterministic packets with current host discovery across fresh/resumed bug and feature work,
  including implementation, investigation and review. Keep retries/variants together and reserve fresh
  task families. Establish required facts through independent task review and final correctness;
  historical reads are not a gold set, and unknown relevance remains unknown.

Exit: fewer avoidable reads/reconstruction where measured, with decisive evidence retained and no
claimed token savings beyond native coverage. Proof: required/stale/dirty/source-budget/expansion tests,
module typecheck and installed CLI seam. No provider is needed and no relevance index is presumed.

## S4 — One local build/test workflow

Depends on S3; independent of JEV. Use existing governance and project execution owners.

- [ ] First assess the named adopter runner under cold/warm, stale service/cache, interrupted process,
  conflicting port/target, changed input and repeated recovery conditions. A reuse/repair/replace
  decision with observed failures is the first S4 checkpoint. Existing code is not presumed reliable.
  Repair confirmed causes in the authorized owner before relying on end-to-end automation; do not
  conceal failures with another supervisor, more retries or model-driven process management.
- [ ] Link the packet to current required proof and declared next operations.
- [ ] Assess target/stage facts against existing batch requests and project receipt artifacts. Add
  missing owner fields through the public Python executor/TypeScript adapter contract only where
  artifacts cannot express the required binding. Specify version negotiation, old-protocol behavior
  and rejection of missing required target facts; test the installed cross-language seam. Do not
  invent a new protocol version or duplicate scheduler before establishing the gap.
- [ ] Observe existing jobs, normalize results and avoid observed manual-then-hook duplicates.
- [ ] Carry stage dependencies, input identity, failure state and cleanup through one real local workflow.
  Provide one entry point with inspectable stages and owner-supported cancellation/retry/recovery.
  Test partial capabilities and explicit unsupported responses; do not duplicate the runner state machine.
- [ ] Compare against the packet-only workflow, separating deterministic coordination gains from JEV.
- [ ] Qualify minimal native host integration where supported; retain explicit operation if unavailable.

Exit requires explicit terminal/blocked results and bounded progress with full evidence references;
normal service startup, waiting and permitted recovery do not require repeated LLM decisions.
Then edit → focused feedback → repair → required validation → review works without duplicate dispatch
or relaxed proof. Proof: pass/fail/pending/interruption/same-job resume and one real runner exercise.
Report unsupported host actions precisely; do not infer hooks from CLI fixtures.

## S5 — One simulator/emulator workflow

Depends on S4. Choose one explicitly authorized project and platform using observed cost.

- [ ] Name the authorized pilot project/platform and verify its runner actually owns simulator/device
  acquisition, shared outputs/ports and release. Governance root-overlap claims alone do not establish
  this. If absent, block this lane pending an explicit owner/implementation decision in the authorized
  project; core work continues. No device/resource manager is silently added here.
- [ ] Use its canonical build, target acquisition, install, launch, scenario and cleanup runner.
- [ ] Bind exact binary, simulator/emulator identity/OS and initial app state to native assertions.
- [ ] Exercise unavailable/ambiguous targets, contention, interrupted runner, recovery and cleanup.
- [ ] Measure queue/build/install/launch/test costs and owner-approved reuse after a changed input.

Exit: one actual simulator/emulator scenario has attributable results and resumable owner state.
Fixtures alone do not close this slice. No physical-device or all-platform claim follows.

## S6 — One connected physical-device workflow

Depends on S4 and reuses S5's workflow contract; initial qualification follows S5 to bound risk.

- [ ] Verify the S5 runner also owns physical-device acquisition/release; qualify one named target/transport.
  Missing physical ownership is a lane blocker pending an explicit project-owned solution.
- [ ] Expose pairing/trust, unlock, provisioning and connection prerequisites without bypassing prompts.
- [ ] Prove exact binary install, launch, automated assertions, disconnect/recovery and confirmed cleanup.
- [ ] Record wired and wireless qualification separately; a second transport is added only if required.

Exit: actual physical-device evidence for the declared scenario and transport. No silent simulator
substitution. If hardware/attendance is unavailable, mark that proof pending and continue independent
work. No new device manager is implied. Maintain the authorized adopter's required framework/OS/
target/transport matrix outside this checkout. Repeat S4–S6 qualification for each prioritized native,
React Native, Flutter or other supported lane. Broader platform support is required progressively;
it does not need a second consumer to justify a concrete integration gap, and first release need not
wait for the whole matrix.

## S7 — Optional JEV context ranking

Depends on S3 and a measured candidate use case; not on device completion.

- [ ] Ship the adapter through the same wheel with explicit off/auto/shadow configuration.
- [ ] Implement immediate missing-token fallback, deadline/abort, cooldown and validated response identity.
- [ ] Choose shadow execution placement from live-workload coverage, lifecycle ownership and overhead;
  preserve comparison capability rather than assume offline replay is equivalent. Qualify bounded
  cancellation/accounting and ensure shadow cannot replace the delivered deterministic result.
- [ ] Choose reused advisory storage or a small health file; prove cross-process suppression, reset,
  contention and storage-failure fallback. A simpler mechanism must preserve these behaviors.
- [ ] Compare ranking on identical candidate evidence and final packet budgets; measure full costs,
  candidate-generation misses, ranking misses and corrections. Include late decisive evidence,
  misleading candidates/quoted instructions, ambiguous ownership and insufficient data.
- [ ] Use approved data for offline/shadow evaluation, then an enabled pilot that actually replaces reads.

Exit: either qualify this bounded question or retain the deterministic path with an explicit no-benefit
or inconclusive finding. Proof: zero-network off/no-token tests, provider-fault fixtures, held-out quality and actual
host outcome comparison. Failure triage is a later candidate chosen from the full decision map.
No paid calls or project-data export is authorized merely by this plan.

## S8 — Conditional source map

Depends on S3 evidence of repeated navigation cost or candidate misses.

- [ ] Compare on-demand shallow map with direct search; include dirty/untracked worktree overlays.
- [ ] Prove stale-map fallback, exact-byte validation and bounded refresh/storage cost.

Exit: retain only if useful-file retrieval or total preparation cost improves. Preserve the discovery
interface so direct search, maps and later indexes can be compared or replaced independently of JEV.
Symbols/imports and
embeddings each require a separate observed need. No required index service, watcher or model summary.

## S9 — Release qualification and progressive adoption

Release scope names exactly which slices/hosts/targets are qualified. A provider-free release can
close after S4; S5–S8 ship incrementally with their own claims. Core release does not require JEV,
a physical device, every transport or every planned experiment.

- [ ] Freeze candidate, reconcile documentation and perform applicable independent QA once per batch.
- [ ] Run broad wheel/release proof once at release boundary, including source/archive payload parity.
- [ ] Verify artifact identity and install/update/repair against the exact candidate.
- [ ] After separate publication authorization, verify published artifact identity and named adopter readback.

Exit: release claims match actual artifact/host/target evidence. Published-artifact proof cannot be
claimed before publication. Remote push/tag/release and writes to other repositories remain explicitly
authorized actions. S1–S8 local receipts are not public rollout receipts.

## Batch closeout and later scope

Every slice delivers code, focused tests, current contracts and one compact receipt with source,
actual claims, overhead, omissions and next action. Use the validation strategy: no broad proof for
every small slice, no replay of a gate immediately before Git invokes it. A review consumes the
candidate's existing evidence and adds checks only for an identified gap.

Other decision questions, release fact packets, Mnemos, additional hosts and an owned front end are
conditional future work. Do not build them just because an interface exists. Runtime changes are
not authorized by a documentation-only assignment; this plan describes subsequent implementation.
