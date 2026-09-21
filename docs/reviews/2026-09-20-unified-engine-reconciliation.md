---
id: review.unified-engine-reconciliation
title: Unified Engine Review Reconciliation
type: review
status: current
owner: project-governance
created: 2026-09-20
updated: 2026-09-20
summary: Source-checked dispositions of the Opus 5 extra-high architecture review, remaining decisions and proof limits.
---

# Unified engine review reconciliation

The [initial review](2026-09-20-unified-engine-opus5-review.md) used **Claude Opus 5, extra-high
(`xhigh`) effort**, fallback disabled and read-only permission mode. The
[wrapper receipt](2026-09-20-unified-engine-opus5-initial-receipt.json) records successful completion
and no reviewer edits. All 44 captured inputs remained unchanged during that review. Separately,
local verification matched all 352 migration-source hashes with no unassigned paths.

The reviewer reported four high, seven medium and one low finding. These are design/plan concerns,
not reproduced runtime failures. The disposition below verifies each against its owning contract;
the review is not an authority to change product scope or adopt a runtime.

## Findings and changes

| Finding | Reconciliation |
| --- | --- |
| F1: host resource owner | Accepted the missing concrete owner, not the suggested single-workspace restriction. The workflow contract now names a small host registry outside Git, a shared namespace/protocol across pinned versions, repository references instead of competing leases, fenced adapter operations and unknown-owner refusal. Existing project ownership can supply it only with equivalent proof. E1a covers races and interrupted acquisition; E1b/E2 qualify the actual path. No daemon or distributed registry is required. |
| F2: cutover benefit evidence | Accepted a plan-level traceability gap. The measurement contract already applies to every intervention, but E5 now explicitly requires declared category parity and measured workflow benefit. E1b records coverage and freezes thresholds after the baseline, before candidate evaluation. Unknown native usage prevents token-savings claims. If benefit is inconclusive, retain the installed product and refine/reconsider the intervention. A permanent mixed-language fallback contradicts the intended migration and was not adopted. |
| F3: delivery before cutover | Added an isolated compiled preview artifact, exact invocation/digests and separate experiment ledger without changing installed commands, hooks or the product lock. Effects still have one host resource owner. E5 requalifies the final package and all affected workflow claims before live activation; scenario assertions are not automatically exempt. |
| F4: post-write recovery | Accepted the need to select a concrete policy, not the claim that ordinary task exports provide reverse compatibility. N12 proposes reversible pre-write activation and no-loss forward repair after writes, with declared soak/recovery criteria and proof. It remains an operator decision before activation design closes. No old backup may overwrite new history or unresolved effects. |
| F5: stranded S-stage obligations | Replaced active S3/S4/S7 assignments in detailed contracts with E1a/E1b/E2/E3/E4 owners. Added preparation/protocol requirements, decision configuration/doctor/migration, isolated cooldown state and owned shadow evaluation to the plan. Historical S1–S9 coverage remains for provenance. |
| F6: adopter blocks all E1 work | Split E1a source-only seam/preview proof from E1b authorized runner/baseline assessment. E2 needs both; JEV implementation and CI seam work follow E1a, with their own comparison baselines. E0 decisions gate dependent work rather than every fixture. |
| F7: host wake assumed | E1a fixtures cover wake/no-wake; E1b records actual host capability. E2 accepts either a qualified return path or bounded explicit wait/inspect without a model polling loop. Benefit and observation latency are reported for the actual mode. |
| F8: publisher credentials | Added an enforceable executor/publisher boundary for ordinary builds too, canary credential-reachability and forged/replayed publication cases. Separate same-user processes alone are insufficient. Qualify the existing authorized integration; this does not require a new App or distrust the operator's local-CI authorization. |
| F9: merge execution scope | N13 proposes first-pilot publication/observation, retaining existing operator/platform merge paths. Engine initiation remains an explicit scope choice. Server-enforced freshness and destination readback remain required now, including when the engine does not issue the merge. |
| F10: ambiguous routing | Replaced the loose D8 phrase with optional intent/skill advice. Explicitly forbid model changes to `context-router`, mandatory instructions or applicable packs. |
| F11: policy authority acceptance | Added N11 for the exact D5 boundary before promoting C14's new authority. CHARTER, AGENTS and owning contracts change together with the first promoted owner after that decision. Existing Markdown authority remains unchanged; parity fixtures need no authority change. |
| F12: memory fields at schema freeze | Added projection-intent/withdrawal identity and the provider watermark contract to E1a and batch A. This preserves later integration without adopting Mnemos or forcing provider storage into critical transactions. |

The review's final sentence placing thresholds before the baseline is not adopted: baseline
variability informs thresholds, which must then be frozen before candidate comparisons. Likewise,
the current no-second-claim-manager contract is an implemented batch boundary, not a permanent ban
on the explicitly planned host owner. Those target/current distinctions are now clearer.

## Decisions still belonging to the operator

The existing [category menu and N1–N10](../reference/2026-09-20-engine-migration-inventory.md#next-operator-decisions)
remain; confirmed dual-CI direction is not reopened. Three precise choices are added there:

1. **N11, before promoting policy ownership:** accept the narrow code/declaration owner for machine
   rules, with Markdown retaining rationale, judgment and rule-change authority. Recommended because
   it removes repeated interpretation without silently changing enforcement.
2. **N12, before activation design closes:** accept no-loss forward repair after new writes, with a
   qualified pre-write rollback and declared soak; require reverse compatibility only if needed.
   Recommended because ordinary exports cannot promise downgrade, and new proof must survive failure.
3. **N13, before the CI pilot scope freezes:** begin with publication and observation of existing
   authorized merges. Recommended because it preserves local-CI value without adding an implicit merge
   controller. Engine initiation remains available as a separately selected capability.

No decision above authorizes implementation, installation, adopter mutation, paid qualification,
remote publication or a policy change in this assignment.

## Simplification balance

- **SC1, one existing local-CI integration first:** reflected in pilot scope. Both traditional remote
  CI and local CI remain required, and the other adapter shape stays supported by the contract.
  Supporting a contract is not a claim of implemented adapter qualification.
- **SC2, collapse throughput/constrained profiles:** not adopted. These are named qualification
  purposes, not a requirement for two implementations or engines. Keeping resource-sensitive proof
  distinct prevents faster local execution from being mistaken for constrained-environment proof.
- Retain the small external-operation fake and memory-port fixtures. They test core assumptions
  cheaply without pulling release orchestration or Mnemos adoption into the first iteration.

## Validation and review closure

The [first focused recheck](2026-09-20-unified-engine-opus5-recheck.md) accepted all twelve
resolutions at specification/plan level and found no blocker to starting source-only E1a. It identified
two medium refinements and two low planning references:

- R1: first CI pilot candidate processes now stay in isolated Linux/macOS-VM execution without direct
  host Metro/simulator/device/shared-output access. The controller owns host capacity. Later host-device
  CI must delegate through the qualified host resource owner. Native RN development scope is retained.
- R2: E1a now declares protocol/schema reader/writer compatibility, the first-major protocol-1 window,
  one explicitly invoked maintenance owner, no implicit upgrade during acquisition and actionable
  blocked-client remediation. Drain alone does not make incompatible idle clients safe to upgrade.
- R3/R4: the measurement manifest belongs to E1a; baseline/threshold work belongs to E1b or the relevant
  independent comparison. The C17 inventory now records its identity versus adapter batch split.

The [closure recheck](2026-09-20-unified-engine-opus5-closure.md), again Opus 5 at extra-high effort
with no fallback, closes R1/R2 at specification/plan level and reports no substantive E1a blocker.
All five focused input hashes remained unchanged during that review. Its three low wording issues
are corrected locally: the first CI pilot explicitly selects container/VM isolation, N9 matches that
scope, and telemetry-store selection names E1a. No further independent pass is required for those nits.

Additional low-risk clarifications record a declared participant inventory, fail-closed handling of
unknown idle clients, schema-independent version probing and the initialization loser rule. A new
engine major does not inherently require a resource-protocol bump; preserve protocol compatibility
where possible. Only a genuinely breaking resource protocol needs coordinated host migration.
These wording clarifications follow the closure snapshot and are not claimed as separately reviewed.

Focused documentation checks cover the changed Markdown, with final diff hygiene and migration-source
hash verification. Runtime tests, installs, device runs, CI publication and adopter changes are outside
this documentation-only assignment. The changed specifications
remain planning artifacts. Source-only E1a has a bounded entry and does not require all later decisions;
runtime implementation still needs its assignment. Production cutover requires the documented
decisions, actual qualification and installed-artifact/recovery evidence.
