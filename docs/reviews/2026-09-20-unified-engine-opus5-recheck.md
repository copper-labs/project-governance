---
id: review.unified-engine-opus5-recheck
title: Unified Engine — Opus 5 Focused Recheck
type: review
status: current
owner: project-governance
created: 2026-09-20
updated: 2026-09-20
summary: Extra-high focused recheck of F1–F12 and two residual boundary refinements.
---

The reviewer output below is preserved verbatim; its embedded metadata is part of that output.
See the [receipt](2026-09-20-unified-engine-opus5-recheck-receipt.json) and
[current reconciliation](2026-09-20-unified-engine-reconciliation.md).

---
title: Unified Engine — Opus 5 Focused Recheck (post-reconciliation)
scope: Verification pass over F1–F12 dispositions, contradiction check, and readiness verdict
mode: read-only; no build, install, network, credential or adopter inspection
---

# Focused recheck — unified engine reconciliation

**Recommendation: proceed with the documented source-only E1a assignment. No blocker remains for it.** Two medium residual issues should be closed before the CI pilot scope freezes and before E1a's seam decisions are declared final; neither blocks starting E1a fixtures. This is not a statement of production readiness or of operator approval.

## Method

Read `docs/reviews/2026-09-20-unified-engine-opus5-review.md`, `docs/reviews/2026-09-20-unified-engine-reconciliation.md`, and the supplied focused before/after diff. Verified the after-state against the working tree for the owning contracts I needed: `docs/specs/engine-workflow-and-device-contract.md`, `docs/specs/engine-local-ci-and-merge-contract.md`, `docs/specs/unified-development-engine.md`, `docs/exec-plans/active/2026-09-20-unified-development-engine.md`, `docs/reference/2026-09-20-engine-migration-inventory.md`, and `components/harness/docs/specs/{concurrency,execution,operational-store,decision-interface,development-loop,host-integration,repository-discovery,measurement-and-qualification}.md`. Ran two repository-wide greps (residual `S1`–`S9` active assignments; residual `N1–N10` and `single-workspace` phrasing). Everything below cites observed text; failure scenarios remain inference.

## F1–F12 disposition

| # | Landed where (observed) | Verdict |
|---|---|---|
| F1 host resource owner | `docs/specs/engine-workflow-and-device-contract.md:85-113` names a host-scoped registry outside Git, one namespace across pinned versions, repository ledgers holding references not leases, fenced adapter operations and unknown-owner refusal. Reconciled in `components/harness/docs/specs/concurrency.md:37-41`, `execution.md:65-68`, `development-loop.md:176-180`, `operational-store.md:67-70`; `inventory:66` C18 row updated; fixtures at `plan:77-82`. | **Resolved at SPEC/PLAN level** (see R1, R2) |
| F2 cutover benefit evidence | `docs/specs/unified-development-engine.md:221-228` extends D10 to the migration itself; `plan:111-117` freezes thresholds in E1b *after* baseline and *before* candidate comparison; `plan:246-253` makes activation require measured benefit with a named non-adoption path (retain installed product, repair or reduce the intervention). | **Resolved** |
| F3 delivery before cutover | `plan:121-133` adds an isolated compiled preview with exact entrypoint, digests and a separate ledger, explicitly "not a second editable product lock or an updater"; D11 updated at `unified-development-engine.md:238-241`; `plan:255-259` names final-artifact requalification. Scenario reruns are conditioned on changed inputs, not exempted. | **Resolved** |
| F4 post-write recovery | `inventory:210` N12; `plan:261-269` recommended policy with soak, abort criteria, recovery owner and exercised post-write defect; `operational-store.md:67-70` states exports are inspection/quarantine, not downgrade proof — consistent with declining `exportTask`-as-rollback. | **Resolved as an explicit gated decision** |
| F5 stranded S-stage obligations | Grep finds no active `S3`/`S4`/`S7` assignments left in the owning contracts; only the provenance line "prior S1–S9 references are acceptance inventory" and the plan's historical table. `decision-interface.md:109,115,117` now assign schema/doctor/config-migration, cooldown storage *outside critical ledger transactions*, and shadow-execution choice to E3; `development-loop.md:168` assigns `prepare`; `plan:94-97` adds the C16 preparation/protocol item. | **Resolved** (see R3 nit) |
| F6 adopter blocks all E1 | `plan:64/102` splits E1a/E1b with separate exits (`plan:99-100`, `plan:118-119`); propagated to `development-flow.md:84-88`, `decision-interface.md:48-49`, `repository-discovery.md:53-57`, `plan:139` (E2), `plan:186-188` (E3), `plan:157-158` (CI pilot). | **Resolved** |
| F7 host wake assumed | `host-integration.md:52-56` adds E1a fixtures for both modes and "explicit waits do not prove unattended wake"; `plan:141-147` restates E2's exit against the measured actual mode. | **Resolved** |
| F8 publisher credentials | `engine-local-ci-and-merge-contract.md:111-119` extends the boundary to ordinary maintainer builds, rejects "separate process or filtered environment alone", adds canary reachability and forged/replay attempts; pre-activation list at `:195-197`; E1a fixture at `plan:85`. No new App required. | **Resolved at contract level** (see R1) |
| F9 merge execution scope | `inventory:211` N13; `engine-local-ci-and-merge-contract.md:142-146` sets publication+observation as recommended initial scope while keeping freshness and destination readback mandatory either way; `:195-198` reassigns ambiguous-merge-response recovery to the actual merge owner. | **Resolved as an explicit gated decision** |
| F10 "routing" collision | `unified-development-engine.md:184-186` replaces the phrase with intent/skill advice and forbids any JEV answer changing `context-router`, mandatory instructions or applicable packs. | **Resolved** |
| F11 policy-authority acceptance | `inventory:209` N11; `plan:46-48` conditions the charter/AGENTS amendment on N11 and says it is "not editorial cleanup or a prerequisite to pure parity fixtures"; batch A acceptance at `plan:229` adds "N11 before promoting policy authority"; `unified-development-engine.md:145-149`. | **Resolved, correctly gating promotion only** |
| F12 memory fields at freeze | `plan:71-73` adds projection-intent/withdrawal identity and the provider watermark contract before freezing core records, without provider storage in the critical transaction; batch A row `plan:229` adds "C17 identity seam". | **Resolved** (see R4 nit) |

## Contradictions introduced? — checked, none found

- The previously conflicting statements are now labelled current-vs-target rather than silently overwritten: `execution.md:65-68` keeps "no second claim manager… **to this current batch adapter**" and names the registry as a later owner cutover; `concurrency.md:37-41` keeps "existing owners **today**". `concurrency.md:49-50` ("filesystem-based local identity is not a cross-machine identity scheme") and `operational-store.md:26` ("network-shared databases are unsupported") remain true — the registry is explicitly single-host and `engine-workflow-and-device-contract.md:112-113` forbids a network-shared copy.
- No residual "single-workspace" safety claim exists in the governed set (the one grep hit is an unrelated imported research artifact under `docs/research/`).
- All `N1–N10` references were updated to `N1–N13`; none stale.
- The declined items are consistently declined in text, not just in the reconciliation prose: no permanent mixed-runtime wrapper is sanctioned (`plan:251-252`), no categorical scenario-rerun exemption (`plan:257-259`), no export-as-rollback (`plan:267`), both profile classes retained (`engine-local-ci-and-merge-contract.md:75-78`).
- The "thresholds before baseline" reading is correctly not adopted: `plan:113-115` and `unified-development-engine.md:223-224` both order it baseline → freeze → compare.

## Remaining substantive issues

### R1 — Medium. The F8 isolation fix and the F1 registry scope do not compose for host-exclusive claims

**Evidence.** `engine-workflow-and-device-contract.md:91-92`: the registry "coordinates participating processes under the same OS account. Other accounts, uninstrumented processes and remote machines remain outside that scope," and `:108-109`: activity that cannot join "must be drained or reported as a conflict." But `engine-local-ci-and-merge-contract.md:111-113` requires merge-eligible execution to sit behind an isolated guest *or* "separate OS principals," and `:81-82` puts the first RN simulator qualification on the native Mac with the device under its host owner.

**Failure scenario.** A merge-eligible macOS check runs under a separate executor principal on the maintainer host and boots a simulator or binds the Metro port. The engine, under the maintainer account, holds that resource through the registry and sees no conflict; both proceed, and the published required result is bound to a target the executor did not exclusively own — the F1 failure class re-entering through the F8 fix.

**Fix (one paragraph, cheap).** In `engine-local-ci-and-merge-contract.md` after `:119`, state which of two shapes the first pilot takes: (a) merge-eligible local checks are restricted to claims needing no host-exclusive resource (containerised Linux; a self-contained macOS VM with its own simulator runtimes), recorded as a declared limit; or (b) the same-account engine acquires through the registry and hands the isolated executor a bound, non-renewable handle it cannot release. Cross-reference it from `engine-workflow-and-device-contract.md:91-92` so the scope sentence is not read as sufficient.

### R2 — Medium. Registry protocol-version remediation has a rule but no owner or path

**Evidence.** `engine-workflow-and-device-contract.md:104-106`: unknown protocol/schema "blocks the affected resource," and upgrades "require compatible readers or drained holders and explicit migration, never automatic replacement by whichever project starts next." Nothing names who performs that migration, what the minimum-compatible-reader window is, or what the blocked older engine tells the user. `CHARTER.md` pins projects to exact versions, so divergent pinned engines on one host is the normal case, not the edge case.

**Failure scenario.** One project upgrades its pinned engine; the newer engine writes registry schema v2. A second project's older pinned engine now blocks every device/port lane on that host, with no documented remediation and no component authorised to migrate or drain.

**Fix.** E1a is already chartered to "fix the platform path resolver and protocol" (`engine-workflow-and-device-contract.md:89-90`) and its exit already says "owner/protocol decisions" (`plan:99`) — so this needs no new scope, only enumeration. Add to that exit: declared registry protocol version, minimum compatible reader window, which component writes/migrates, and the required actionable message plus named remediation when an older pinned engine meets a newer registry.

### R3 — Low. `E1` used where the split now matters

`plan:291` ("S2 telemetry/evaluation | Baseline E1…") and `plan:293` ("S4 runner reliability/coordination | E1 assessment…") are forward assignments inside the retained S1–S9 coverage table; both belong to E1b. `components/harness/docs/specs/measurement-and-qualification.md:135,139` assigns the evaluation-manifest schema and its validation to "E1" without distinguishing the schema (E1a) from threshold freezing (E1b, per `plan:113-115`). Two-word fixes; left alone, a reader of the owning measurement contract alone would not see that D10 now covers the migration itself.

### R4 — Low. C17 is split across two batches without the inventory saying so

`plan:229` puts "C17 identity seam" in batch A and `plan:231` puts "C17 JEV seam" in batch C. The split is deliberate and the labels are distinct, but `inventory:65` (C17 row) does not record it, so the inventory read alone implies one later owner. Add the batch split to that row's treatment column.

## Operator-decision gating — explicit and correctly scoped

`plan:54-58` states gating per decision rather than as a blanket precondition: N11 gates promoting C14's new authority; N1/N2/N3/N5 and category dispositions gate their replacements; N4 gates physical scope; N8–N10/N13 gate the selected CI pilot; N12 gates activation/recovery design; N7 gates real memory scope in E6, not fake-port proof. Each of N11/N12/N13 has a stated "needed before" in `inventory:209-211`, a recommended position, and a matching hook in the dependent artefact (`plan:46-48`/`plan:229` for N11; `plan:232`/`plan:261-269` for N12; `engine-local-ci-and-merge-contract.md:142-146` for N13). N11 explicitly leaves existing Markdown authority effective during fixtures. Pending choices therefore constrain dependent work only; they do not leave the docs assignment incomplete and do not authorise implementation.

## Readiness

**Source-only E1a — no blocker.** Its inputs are internally consistent and its exit is obtainable without an adopter, device, provider account or credential (`plan:99-100`). The prerequisites the original review attached to E1 are now either landed (F1's owner, F12's fields, F7's dual-mode fixtures, F5's E-stage owners) or converted into decisions that gate later work rather than fixtures (N11/N12/N13). R1 and R2 are refinements to seam declarations E1a already owns, not entry conditions.

**Adopter / production cutover — not ready, and deliberately so.** Distinct and unchanged by this reconciliation: the installed-adoption audit remains unchecked (`plan:44-45`, "source inventory is not proof of installed adoption"); E1b's baseline and instrumentation coverage do not exist; N12's recovery policy is unselected; the final-artifact and workflow requalification at `plan:255-259` has not been performed; and the R1 composition question sits directly on the merge-eligible local-CI path. Nothing here constitutes operator approval, qualification of a runtime, or authorisation to implement, install, publish or mutate an adopter.

## Limits of this recheck

Read-only inspection of the working tree plus the supplied diff. I verified the diff's after-state against the tree for the contracts cited above and did not re-derive the broad review. I did not open pack YAMLs, runtime sources, the snapshot entries or their hashes, and I inspected no adopter, installed configuration, host capability or runtime evidence. Every failure scenario is a constructed path from cited text, not a reproduced defect. I did not reassess the declined items (F1 single-workspace, F2 permanent Python fallback, F3 assertion exemption, F4 export-as-rollback, SC2) beyond confirming the text is internally consistent with declining them.
