---
id: plan.linting-mvp
title: Deterministic Focused Linting MVP Delivery
type: exec-plan
status: active
owner: project-governance
created: 2026-10-05
updated: 2026-10-05
summary: Orders language-neutral lint adaptation, two real backends, safe setup, narrow enforcement and installed proof for the next major.
---

# Deterministic focused linting MVP delivery

## Scope and current state

The [specification](../../specs/engine-linting-mvp.md) is the requirements owner. The operator authorized
implementation of the outstanding plans and the next-major follow-up on 2026-10-05. The
[major delivery plan](2026-10-04-major-verification-feedback.md#v3--earlier-checks-and-reusable-mechanical-rules)
retains integration/release ownership. Its already agreed plan-updater and specification-template
workstreams remain separate; lint delivery does not depend on inventing a new plan store.

Use existing packs, captured subjects, managed commands, findings and check evidence. Preserve dirty
parallel work and existing tools/rules. Do not upgrade or modify adopters during source implementation.
Real-project examples, paths and telemetry remain outside this checkout. Runtime implementation and source proof are in progress. Independent review corrections and
installed real-tool proof remain open; publication and adoption are not complete.

## Interfaces and source owners

| Concern | Existing owner to extend |
| --- | --- |
| Setup and retained required coverage | Installed initialization/profile writer; inspect the compiled owner before editing; preserve the preceding wheel owner until deliberate cutover |
| Selection and required stages | `components/engine/src/pack-configuration.ts`, `planning.ts` and target packs under `config/validation/packs` |
| Exact source/configuration | `change-subject.ts`, `change-packet.ts` and existing evidence manifests |
| Supervision, deadline and result | `check-run.ts`, `native-check-command.ts`, `checker-results.ts` and `process-owner.ts` |
| Passive readiness | `runtime-doctor.ts` and its existing output/exit contract |
| Guidance and tests | Existing packaged skills, validation strategy, owning engine tests and package scripts |

Package thin backend adapters at the existing engine command boundary. Generated custom commands use
the existing `run` argv shape and packet environment. They are helpers of the check runner, not another
user workflow. Keep supported backend identities and input declarations small; do not add arbitrary
shell evaluation or an unbounded plugin loader. Freeze the exact additive setup/profile fields in L0
after inspecting their current owner. That schema must be included in the normal schema/package proof.

## Delivery order and check cadence

Each L slice is one coherent implementation batch. Write its tests alongside the implementation, then
run the listed focused suites at its checkpoint. Internal files/helpers finishing do not trigger QA.
An earlier run needs a named blocking uncertainty or reproducer. Inspect all failures, group repairs
and rerun the failed/invalidated owners. Broad package proof occurs once at L5, plus any rerun justified
by a changed boundary. Required normal hooks remain enabled.

Update implementation, verification and closeout boxes separately at each seam. Record one current/next
action and original evidence links. This existing unstructured plan remains a Markdown
work record. The updater applies only to deliberately adopted versioned plan declarations. Local commits, when authorized, contain only the
verified owned batch and its plan update. A commit is not a reason for another QA cycle or a push.

### L0 — Freeze the small adapter and adoption contract

Requirements: R1–R9. This is the first implementation seam after approval.

Implementation:

- [x] Inspect actual compiled setup/profile/package owners and record the smallest additive interfaces.
- [x] Define typed backend input declarations, required-root coverage and findings/evidence fields.
- [x] Specify supported tool-version ranges and explicit starter rule lists; existing setups retain rules.
- [x] Define file-local exact-input support and refusal for unqualified project-aware input modes.
- [x] Freeze setup proposal/apply semantics, idempotence and ambiguous/unsupported/empty-repository states.

Verification:

- [x] Schema/contract fixtures reject duplicate owners, unsafe roots, missing inputs and invalid stage maps.
- [x] Review confirms no model clients, second runner, baseline engine, generic cache or hidden acquisition.

Closeout:

- [x] Contract, source owners and exact later test commands are recorded; no unresolved implementation blocker.

Checkpoint: run the owning configuration/pack contract tests after the interface batch is complete.
An input-contract uncertainty may get one earlier disposable spike; retain its result and do not ship it
as a parallel authority. Do not run adopter checks or broad integrated QA for this design seam.

### L1 — Shared exact-input adapter boundary

Requirements: R1, R4, R5, R6, R9. Depends on L0.

Implementation:

- [x] Read and verify the normal captured-packet inputs; filter declared roots and preserve logical names.
- [x] Capture candidate configuration/import/ignore/baseline inputs through the existing subject owner.
- [x] Bridge declared extra inputs from that resolved subject to verified helper snapshots; never recapture scope.
- [x] Implement file-local stdin/path-preserving preparation without touching the index or worktree.
- [x] Normalize ordinary violation exits separately from infrastructure failures; retain raw tool evidence.
- [x] Carry version/input/scope/count/widening fields into existing results, with no duplicate receipt store.
- [x] Use subject-bound manifests for changed/staged mode and ordinary result-linked artifacts for all-mode.
- [x] Keep child execution inside the existing managed group, deadline and cleanup lifecycle.

Verification:

- [x] Adapter-boundary fixtures cover staged/live opposition, config drift, malformed output and cleanup.
- [x] All-mode enumerates declared roots; empty or ignored expected files cannot produce false coverage.
- [x] A non-Python/non-JavaScript project fixture uses the same existing pack contract.

Closeout:

- [x] Shared behavior is qualified once; backend slices reuse it rather than duplicate execution code.

Checkpoint: shared adapter/subject/result/process fixtures together. No external model or provider test.

### L2 — Real Ruff and ESLint starters

Requirements: R1, R3–R6, R8. Depends on L1.

Implementation:

- [x] Implement Ruff invocation/output mapping using an explicit project-local version and captured config.
- [x] Implement ESLint mapping with logical paths, explicit config, supported parser and declared dependencies.
- [x] Add qualified high-confidence presets; preserve stronger existing project rules and severity.
- [x] Handle rename/deletion, native ignores and config/lock changes with declared root widening.
- [x] Support a qualified existing debt mechanism or visibly scoped clean adoption; never auto-baseline.
- [x] Reject unsupported typed/project-aware claims; preserve existing separate compile/typecheck packs.

Verification:

- [x] Pin real development-test tool versions and run clean/seeded-fault fixtures for both backends.
- [x] Confirm normal native violation exits yield structured failures and dependent review blocking.
- [x] Prove staged source and config inputs with each real tool, not only the synthetic helper.
- [x] Confirm legacy exclusions/debt behavior and same-count replacement claims are honest.

Closeout:

- [x] Both real backends meet the contract; supported versions, exclusions and limits are documented.

Checkpoint: run both backend suites once the combined adapter/preset batch is complete. Fetching test
dependencies, if needed, is explicit development setup before execution; fixtures must not fetch on run.
Do not turn tool qualification into a Kotlin/Swift/compiler installation project.

### L3 — Setup, first source and doctor coverage

Requirements: R2, R3, R8, R9. Depends on L2.

Implementation:

- [x] Inspect existing manifests/configuration deterministically and produce a reviewable setup proposal.
- [x] Generate accepted project packs/configuration with conflict protection and idempotent repeat setup.
- [x] Retain adopted required coverage in the profile; pack/config removal becomes visible drift.
- [x] Validate captured profile obligations in normal plan/check selection; doctor alone cannot enforce them.
- [x] Expose missing tools, unsupported starters, mixed-stack gaps and deliberate exclusions in doctor.
- [x] Detect first source in an empty repository at the normal gate and require setup or explicit exclusion.
- [x] Keep startup and check paths free of installation, discovery script execution and provider calls.

Verification:

- [x] Setup fixtures cover empty/first-source, existing strong config, ambiguous and mixed repositories.
- [x] Snapshot conflicting dirty files, index entries and other worktree configuration before/after setup.
- [x] Doctor distinguishes setup readiness, historical execution and current-candidate proof without linting.

Closeout:

- [x] New and existing installs have explicit readiness; no silent success with absent coverage.

Checkpoint: setup/profile/doctor suites at the completed batch. No tests/builds in real adopters.

### L4 — Narrow normal-path enforcement and agent guidance

Requirements: R1, R4, R7–R9. Depends on L3.

Implementation:

- [x] Wire adopted required packs into batch/commit and project integration stages using existing selection.
- [x] Make declared code-review workflows depend on required checks; keep standalone design review independent.
- [x] Update shared packaged guidance once: coherent batches, narrow repairs, normal gates and original findings.
- [x] Record rerun/widening reasons using existing check/plan evidence; do not add per-edit hooks or a scheduler.
- [x] Report unqualified host paths and bypassed/missing integration evidence without declaring enforcement.

Verification:

- [x] Normal CLI/hook fixtures reject a seeded fault, preserve source/index and pass its correction.
- [x] Source/config/dependency/rename selection invokes the right owners; unrelated roots stay untouched.
- [x] Ordinary violation collects independent results; infrastructure failure and unknown cleanup stay failures.
- [x] Code workflow blocks dependent review; document-only review does not run unrelated application checks.
- [x] Spy/fixture wiring confirms zero LLM/JEV/provider calls in the lint lane.

Closeout:

- [x] Gate and guidance claims match observed entry points; uncovered host behavior stays explicit.

Checkpoint: normal selection/check/hook/workflow suites after the complete enforcement batch. Check
frequency comes from receipts and declared triggers; do not add tests after every patch or tool call.

### L5 — Installed proof and major integration handoff

Requirements: R1–R10. Depends on L1–L4.

Implementation:

- [x] Build the actual candidate package and include helpers, presets, schema and developer documentation.
- [x] Assemble requirement-to-test/evidence mapping and an honest coverage summary.
- [x] Reconcile any review findings only in their affected owners; preserve valid passing evidence.

Verification:

- [x] Install the frozen package in disposable greenfield, existing and linked-worktree fixtures.
- [x] Exercise setup, first source, batch check, normal commit, correction and declared review prerequisite.
- [x] Run each real backend through the installed helper and verify native output/result/cleanup linkage.
- [x] Prove independent linked-tree source/config/receipts and no mutation of other writers or staged bytes.
- [x] Run the affected package boundary/typecheck and major-required integrated proof once on the frozen candidate.

Closeout:

- [x] All in-scope requirements have passing proof or an explicit unresolved blocker; none are closed by examples.
- [x] Hand off verified lint scope and evidence to the major plan; publication/adopter updates are not claimed here.

Checkpoint: one installed-package qualification batch. Lint work does not require device QA, hosted
GitHub CI or model calls unless a separately authorized changed boundary makes them necessary. The major
release owner retains its actual release requirements and authorized local/hosted proof decisions.

## Minimum regression matrix

These are required boundaries, not a cross-product of every language/tool/version/repository.
Use each real tool for its parsing/exit/config behavior; use small shared fixtures for lifecycle faults.

| Case | Expected result | Primary slice |
| --- | --- | --- |
| Clean and one seeded real lint fault, then correction | Pass, intended rule failure, pass through the same entry | L2, L5 |
| Missing binary/parser; invalid config | Execution/setup failure; no download or weaker fallback | L2, L3 |
| Staged bad/live good and staged good/live bad | Exact staged outcome; source/index unchanged | L1, L2 |
| Opposing staged/live config or imported config drift | Candidate configuration used or explicit refusal | L1, L2 |
| Logical path, native ignore and fully ignored expected scope | Correct parser/ignore mapping; no silent clean coverage | L1, L2 |
| Rename across owners and deletion | Correct owner selection and remaining source coverage | L2, L4 |
| Config/lock change, unrelated module | Declared owner widens; unrelated module does not | L2, L4 |
| Empty/all-mode packet and first source before first commit | Enumerate declared scope; setup gap visible; no false pass | L1, L3 |
| Existing rules, old debt, new/same-count replacement | Stronger rules preserved; qualified debt claims only | L2, L3 |
| Mixed Python/JS plus other-language custom pack | Shared contract; uncovered language not described as ready | L1, L3 |
| Native exit 1, warnings, malformed/truncated output | Violations/warnings differ from infrastructure failure | L1, L2 |
| Cancellation, orphaned child, unknown cleanup | Existing supervised refusal/recovery; no successful proof | L1, L5 |
| Repeated/conflicting setup and concurrent worktrees | Idempotent setup or refusal; other work stays intact | L3, L5 |
| Required pack removed or wrong stage mapping | Visible coverage failure; no silent disablement | L3, L4 |
| Required check before review; doc-only consult | Code prerequisite enforced; no unrelated build added | L4 |
| Model/provider spy and read-only check-mode snapshots | Zero model calls and no source/baseline/dependency mutation | L1, L4 |

## Measurement and stopping rule

Use existing receipts: checked versus expected paths, gaps, infrastructure failures, lint findings,
duration, triggers, scope widening, repairs and repeated unchanged executions. Compare a small frozen
task sample with and without early lint, preserving accepted outcomes. Do not use install probes to
claim ordinary development savings. Native tool caches require separate invalidation qualification;
the MVP does not depend on enabling them.

Stop expanding after the two starters, generic extension, setup/doctor, normal gates and installed proof.
Defer additional backends, typed-lint closure discovery, new formatting standards, broad legacy cleanup,
universal baselines and automatic repository-wide fixes. A limitation must stay visible, not become a
last-minute platform project or an implicit exception to required lint.

## Template commitments this plan relies on

Implemented and qualified: coherent implementation batches, narrow checkpoints, separate
implementation/verification/closeout boxes, stable machine-readable IDs, compact inspection and
receipt-backed deterministic updates. Local commits remain owned actions at verified seams.
The updater neither runs checks nor stages/commits. Specification templates carry stable acceptance
IDs and whole-content evidence links. Mechanical proof and acceptance judgment remain distinct.
There is no second requirements store or duplicate completion state.

## Current / next

Current: L0–L5 are implemented and qualified. Real pinned Ruff 0.15.14 and ESLint 9.39.1 with
TypeScript parser 8.46.4 pass installed clean, seeded-fault and corrected runs. The same native
pre-commit entry uses exact staged source/configuration, preserves opposing live bytes and index
entries, and retains confirmed cleanup and original tool evidence. Setup remains passive until
explicit digest-bound apply; no checking path acquires tools or calls a model.

Source tests qualify narrow selection, required root/stage coverage, portable linked-worktree
commands, retained stronger rules and normal workflow prerequisites. The final installed package
also passes first-source coverage refusal, setup/apply/repeat, specification/plan proof and
batch-before-review. Unsupported stacks keep existing project-owned custom packs; typed project
closure and automatic debt baselines remain deferred.

Next: the major release owner completes exact provenance, continuation and publication. Adoption
in a real project is separate and deliberate. No adopter files or active native sessions were changed.
