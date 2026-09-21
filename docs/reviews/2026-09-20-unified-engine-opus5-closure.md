---
id: review.unified-engine-opus5-closure
title: Unified Engine — Opus 5 Review Closure
type: review
status: current
owner: project-governance
created: 2026-09-20
updated: 2026-09-20
summary: Extra-high closure recheck resolves the remaining substantive design findings; runtime proof remains separate.
---

The reviewer output below is preserved verbatim; embedded metadata is part of that output.
See the [receipt](2026-09-20-unified-engine-opus5-closure-receipt.json) and
[current reconciliation](2026-09-20-unified-engine-reconciliation.md) for final wording dispositions.

---
title: Unified Engine — Opus 5 Closure Recheck (R1/R2 residuals)
scope: Narrow verification of the R1/R2 fixes and the R3/R4 wording fixes; contradiction check only
mode: read-only; no build, install, network, credential, runtime or adopter inspection
---

# Closure recheck — R1, R2, R3/R4

**R1 and R2 are closed at spec/plan level. No substantive blocker remains for the documented source-only E1a assignment.** Three low, non-blocking wording residuals are listed below. Production remains unqualified; N11/N12/N13 still gate their dependent work; this is not operator approval.

## Method

Read the supplied focused diff and verified its after-state against the working tree for the five touched artifacts, plus the neighbouring paragraphs each fix has to compose with (`engine-local-ci-and-merge-contract.md` §capabilities/§development-evidence, `engine-workflow-and-device-contract.md` §host-resource-authority, plan E1a/E1b/CI-pilot/E5 batch table, inventory C17 and N9/N11–N13, `measurement-and-qualification.md` §durable-evaluation-manifest, `unified-development-engine.md` D10/D11/D13, `CHARTER.md:12`). Ran one repo-wide grep for residual bare `E1` in the owning set. No re-derivation of the broad review.

## R1 — CI isolation versus same-account resource ownership: **closed**

Landed at `docs/specs/engine-local-ci-and-merge-contract.md:121-131`, cross-referenced from `docs/specs/engine-workflow-and-device-contract.md:93-96`, and mirrored in the plan's pilot step 2 (`docs/exec-plans/active/2026-09-20-unified-development-engine.md:170-172`).

The fix takes shape (a) — restrict first-pilot merge-eligible claims to those needing no host-exclusive resource — and, usefully, does not scope the prohibition to the VM shape: `:122-124` binds "a separate executor account **or** guest," which is what actually closes the R1 failure path (a second OS principal booting a simulator or binding the Metro port outside the same-account registry). The three parts compose:

- Capacity is not left unowned: the controller acquires container/VM capacity through its own authority, which is already an in-contract resource class (`inventory:66` C18 "capacity leases").
- No hidden second acquisition: `:126-129` requires a later host-device lane to delegate through the existing owner with the owner's generation/target binding retained, and `engine-workflow-and-device-contract.md:95-96` forbids "an invisible second lease."
- The blocked-claim rule at `:129-131` ("never silently downgrade the claim or weaken isolation") is the right failure mode and matches the bounded-fallback rule at `plan:180-183`.
- No narrowing of native RN development: `:125-126` and pilot step 2 keep the native lanes as development evidence, consistent with the unchanged `:80-83` (simulator on native Mac first) and D13's "simulator, VM and physical-device proof remain distinct." The macOS VM check is also already disqualified from standing in for RN by `:71-73`.

## R2 — Registry compatibility, migration owner and remediation: **closed**

Landed at `docs/specs/engine-workflow-and-device-contract.md:112-127`, with the E1a exit enumerated at `plan:101-103`.

All four things R2 asked for are now named: window (protocol 1 across the first qualified major family, capability negotiation not protocol bumping), sole migrator (the designated maintenance entrypoint invoked explicitly from a qualified pinned artifact — and explicitly *not* a new updater component), the non-upgrade rule for ordinary acquisition (`:116-118`), and the blocked-client contract (`:122-127`: stable reason, locator, observed/supported protocols, doctor/inspect route, remedy is pinned-engine update or maintenance recovery — never deleting the registry, stealing resources, or downgrading). `plan:102-103` makes "ordinary acquisition cannot upgrade the registry or silently strand a participating pinned engine" a provable E1a exit item rather than prose. Deferring exact command spelling to E1a engineering is correct and does not reopen the design question.

Two things worth recording, neither blocking:

- **Idle-participant discovery rests on a declared roster, not a mechanism.** `:119-121` requires a "declared participating-engine update/recovery plan" and forbids activation while an in-scope project still needs unsupported access, while conceding "incompatible idle clients are not made compatible by drain." The registry holds current holders, not a roster of idle pinned engines, so an unenumerated project is caught only by the `:122` blocked state. That is a fail-safe (blocked, with a route), so it is acceptable — but it is the load-bearing assumption behind "no unsupported idle project left behind" and should be stated as such rather than implied.
- **The fix makes an existing coupling visible: a major-family bump becomes a host-wide coordinated event.** `CHARTER.md:12` pins projects to exact wheels and makes adoption deliberate per project; a window scoped to one major family means the first cross-family bump blocks every other pinned project sharing that host until the declared plan runs. This is inherent to the single host-scoped registry F1 chose, not something this fix introduced — but it is now concrete enough to record as a declared limit next to `:112-114`.

## R3 / R4 wording fixes: sufficient as cited

- **R3 — sufficient.** Both cited plan rows are now split (`plan:297` manifest/fixtures E1a, RN baseline/thresholds E1b; `plan:299` E1a protocol seams / E1b runner assessment), and `measurement-and-qualification.md:135-142` now carries the schema at E1a, threshold freeze at E1b, the independent E3/CI-pilot baselines, and D10's application to the migration itself — which is the substantive part, since a reader of the measurement contract alone previously could not see it. Cross-checked against `plan:113-115`, `plan:157-158`, `plan:186-188` and D10 (`unified-development-engine.md:223-226`): the baseline → freeze → compare ordering is consistent everywhere.
- **R4 — sufficient.** `inventory:65` now records the split and goes slightly further than asked by naming the E3 comparison and E6 adoption, matching the batch-A "C17 identity seam" / batch-C "C17 JEV seam" labels at `plan:229/231` and batch A's pre-freeze acceptance clause. No conflict with E3 packaging the adapter before E5 consolidates the seam.

## Contradictions directly introduced — none; three low wording residuals

1. `engine-local-ci-and-merge-contract.md:113` still offers "separate OS principals with qualified access controls" as an example enforceable boundary one paragraph before `:121` fixes the first pilot to container/VM. The resource prohibition at `:122-124` still binds that shape, so the R1 hole stays shut; but the capacity sentence ("the host controller owns container/VM capacity") has no referent under the separate-principal shape. One clause naming which boundary the first pilot actually takes would remove the ambiguity.
2. `inventory` N9 ("begin with approved maintainer hosts and disposable CI workspaces/guests") is unchanged and still reads as permitting bare-host candidate execution. It is reconcilable — the maintainer host is the controller, and N9's "keep physical devices with their host owner initially" already agrees — but N9 is the row an operator reads when settling pilot scope, and the narrowing now lives only in the contract.
3. `components/harness/docs/specs/measurement-and-qualification.md:32,36` still says the telemetry-store choice and its receipt are "E1" — now the only bare `E1` left in the file that otherwise distinguishes E1a from E1b, so a reader cannot tell whether that decision needs the authorized adopter. Same class as R3, same file, two paragraphs above the fixed lines. The remaining bare-`E1` hits elsewhere (`engine-workflow-and-device-contract.md:60`, `unified-development-engine.md:72,280`, `plan:92,240,287`, and the S1/S3/S8 rows) genuinely span both sub-stages and need no change.

## Suggested next checks (E1a-owned, not entry conditions)

- State in the E1a compatibility matrix that the protocol/version marker's location and encoding are frozen across protocol versions. `:122-124` obliges an *incompatible* reader to report the observed protocol and locator; that is only possible if the marker is readable without the schema it cannot read. Design clarification, not implementation proof.
- Name the loser rule when two engines race to initialize a missing registry at different supported protocols (`:116-118`). Ordinary engineering under the existing atomic-acquisition rule, but it belongs in the same matrix.

## Limits

Read-only inspection of the working tree plus the supplied diff; verified the after-state for the cited contracts only. No runtime, installed product, pack YAML, host capability or adopter inspection; no commands run against any runtime. Every failure path above is constructed from cited text, not reproduced. I did not reassess F1–F12 or the declined items beyond confirming these fixes do not disturb them.
