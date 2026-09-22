---
id: review.rc4-design-reconciliation
title: RC4 Decision Design Review Reconciliation
type: review
status: completed
owner: project-governance
created: 2026-09-21
updated: 2026-09-21
summary: Closes the RC4 architecture recheck conditions and distinguishes subsequent research and operator-directed category routing from the independently reviewed design.
---

# RC4 decision design review reconciliation

## Scope and evidence

This review covers the [RC4 specification](../specs/engine-decision-rc4.md),
[R0–R6 delivery plan](../exec-plans/active/2026-09-21-major-adoption-and-measurement.md#rc4-quality-routing-and-ci-batch)
and [functional proof matrix](../reference/2026-09-21-decision-layer-functional-validation.md#rc4-required-proof).
It is a design review, not implementation or host qualification.

Claude Opus 5 at high effort completed an independent read-only architecture pass with fallback
disabled. The wrapper audit records successful completion and no repository edits. The reviewer
inspected current source as well as the proposal. Raw prompts, responses, candidate hashes and
audits belong to the external review packet; they are not reusable runtime evidence.

## Finding disposition

| Finding | Reconciliation |
| --- | --- |
| B1: inherited prose is not runtime confinement | Accepted. Existing full-access workers are admission-only. Child submissions inherit constraints at the governed entry. A separate, bounded Claude Code read/search-only worker profile must prove actual denials; it does not qualify an unrestricted coordinator. |
| B2: executable/config overrides bypass the baseline | Accepted. Enforced submissions cannot supply an executable; binding realpath/content and executable identity are frozen. Registry, access, roots, tools and environment cannot broaden accepted authority. |
| B3: candidate qualification cannot bootstrap | Resolved with an explicit qualification assignment using a trusted fixed-model override through the same governed entry. Existing provider receipts/episodes retain proof. Declaration alone is not successful capability evidence. No new registry or silent paid doctor probe. |
| M1: growing question catalog silently changes defaults | Accepted. Freeze exact RC3 per-consumer `defaultQuestions`; require opt-in for new definitions and prove unchanged-profile behavior. |
| M2: decision digest excludes routing configuration | Accepted. Extend the pure profile digest with routing policy; submission separately binds config realpath/content, executable and guarded host profile. Policy drift fails admission. |
| M3: follow-up can hide new assignments | Accepted. Bind assignment ID, requirement/acceptance digest and class. New scope needs a new submission. Arbitrary prose cannot establish trusted continuation or exempt new work from exposure accounting. |
| M4: replay reroutes and spends twice | Accepted. Persisted-request replay reuses frozen pair/receipt with zero new JEV calls. An interrupted directory without a request fails before JEV; reconcile ownership before a deliberate new job and count its cost. Changed identity/policy fails instead of rerouting. |
| M5: host enforcement is unspecified and has no settings owner | Narrowed. Name Claude Code tool permissions and deterministic `PreToolUse`; begin with a bounded read-only class. Governance authors the adapter/proposal; operator adoption installs protected host settings. Full planned RC4 needs this qualified path. An advisory-only release requires an explicit scope decision, not silently abandoning the requested enforcement. |
| M6: advisory work waits on unrelated host controls | Accepted. R0a identity/exposure supports R2/R4 independently; R0b qualifies the guarded routing path. Keep one delivery plan and one writer. |
| M7: shared budget can eliminate routing exposure | Accepted concern, with a different measurement repair. Retain all assigned outcomes including exhaustion/fallback, and separately report actual exposure. Do not drop failures from primary totals or add quotas before measured demand. |
| Minor interface/provenance gaps | Reuse `providerBinding`; keep question selection separate from entry/effect admission; name workspace/assignment-scoped doctor preflight; bind provenance to existing host task/action authority; entry outage stops the enforced assignment. |

The stronger host boundary is intentionally narrow. Broad tool access in a parent or child remains
an explicit gap. A hash or prompt cannot fix it. Proof must test denial at the actual host boundary
before the pilot claims agents cannot use an alternate route.

## Additional research incorporated

The supplied routing demonstration contributes these constraints to the same design:

- Data/destination permission precedes any hosted decision call, including a privacy classifier.
  Semantic screening can restrict a route but cannot grant permission. All fallbacks retain the rule.
- Preserve useful session context and account for cached input, cold starts and context transfer.
  New-assignment routing does not imply switching a live conversation.
- Local inference competes with builds and devices for machine resources. Code owns eligibility;
  the initial CI feature remains advice, with no new placement scheduler.

The operator excluded alternate-backend investigation. Preserve the existing provider interface
without scheduling a local-classifier experiment. A local-request percentage is not accepted-task savings.

Primary sources and their limitations are linked in the
[specification's research basis](../specs/engine-decision-rc4.md#research-basis-and-limits).
No extra model server, gateway, image workflow or automatic learning system is added to RC4.

## Focused recheck and closure

Claude Opus 5 at high effort completed the focused recheck with fallback disabled and a proceed
verdict subject to the corrections below. Raw prompt, reviewed-file manifest, response and audit
remain in the external review packet. The recheck's repository audit observed a concurrent
coordinator edit to `engine-decision-use-cases.md`; it was not a reviewer patch. Do not describe
that audit as an unchanged whole repository. The principal spec/plan/proof inputs stayed frozen
during the review.

| Condition | Reconciliation |
| --- | --- |
| I1: guard the same class that is routed | Routable classes must be qualified guarded classes; release/adoption name the same class. Parent coverage remains separate. |
| I2: keep the profile parser pure | `configDigest` covers parsed routing policy; submission owns the distinct resolved `bindingDigest`. |
| I3: do not widen harness authority | Existing `record` action with `destination: null` carries provenance only. No new operation or dispatch authority. |
| I4: distinguish interrupted persistence | Test persisted replay and directory-without-request separately. The latter retains native unresolved-submission behavior, not automatic replacement. |
| I5: independent host-boundary proof | Retain engine launch settings, loaded-settings readback and observed denials. Child permission text is a drift detector. Protect the resolved hook/policy outside worker-writable roots. |
| I6: honest exposure denominator | Ratios cover governed-entry assignments. Off-entry activity on an unrestricted host is an inventory gap, not measured absence. |
| I7: avoid effect aliases | `route-model` is model selection; existing `choose-local` retains its separate local workflow/recovery meaning. |
| I8: precise RC3 migration behavior | Source confirms sibling routing data is ignored, but DL08/new decision keys/effects are rejected. Correct the review's broader suggestion that all keys are silently ignored. |
| Freeze exact defaults | Record all ten RC3 consumer question sets, including both DL05 probe versions; preserve independent entry/effect admission and legacy migration. |

These corrections close the earlier design recheck. The later
[research reconciliation](../research/2026-09-21-jev-agentic-development.md),
[simplification pass](2026-09-21-rc4-simplification.md), and operator's explicit fixed-default/category
mapping direction were reconciled by the coordinating agent after that recheck. They are not
represented as a second independently reviewed final revision. They prioritize existing DL03/DL13
delivery, replace tier guessing with simple task classification and reuse CI results for comparison.

Source implementation, actual host denials, model qualification, release proof and adopter
measurement remain R0–R6 work. The frozen implementation still needs the already planned independent
code/architecture review; design closure proves no runtime behavior.
