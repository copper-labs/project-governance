---
id: exec-plan.governance-v1.1-evidence-integrity
title: Governance V1.1 Evidence Integrity
type: exec-plan
status: completed
owner: project-governance
created: 2026-08-15
updated: 2026-08-15
summary: Tighten generic evidence identity, finding lifecycle, waivers, telemetry, and wheel-boundary proof without creating another runtime authority.
---

# Governance V1.1 Evidence Integrity

## Outcome

Make a governance result explain exactly what bytes were inspected, which findings affected the
verdict, and which bounded evidence belongs to each pack. This source-repository plan is complete:
all seven slices are implemented, independently reviewed, and release-proven.

## Fixed Boundaries

- Keep the existing command stages: `commit-msg`, `pre-commit`, `pre-push`, `pre-pr`, `ci-pr`, and
  `release`. Do not add lifecycle profiles or a second selection vocabulary.
- Keep `replaces_builtin_packs` as the explicit repository-wide ownership mechanism. Do not add a
  capability registry, implicit replacement, or path-precedence system.
- Changed and staged checks read file bytes only through the immutable packet. Each packet has a
  deterministic `subject_digest` over its sorted logical record identities. A checker does
  not substitute the checkout file, invoke Git, or choose another comparison.
- `--mode all` is the deliberate checkout-wide exception: packs may read the current checkout
  because the operator selected exhaustive scope. The result identifies all mode explicitly and
  reports no `subject_digest`, because live checkout bytes are not one immutable subject.
- Secret scanning deliberately includes staged-only bytes at the pre-commit boundary. Later
  branch-aware stages retain their currently declared live publishable worktree-and-index secret
  surface and report no pack `subject_digest`. V1.1 does not mislabel those bytes as the changed
  packet or blur the two inputs into a generic changed-file promise.
- Finding lifecycle states are `blocking`, `advisory`, `accepted`, `waived`, and `suppressed`.
  A process failure, malformed result, unknown state, unavailable required detector, timeout, or
  missing required evidence is always blocking and cannot be waived or suppressed by output data.
  A check may pass with a nonempty findings list when every finding is `accepted`, `waived`, or
  `suppressed`; the findings remain visible and counted.
- Detector IDs are stable public contract identifiers. Renaming or repurposing one requires an
  explicit migration; messages and locations are not identities.
- Semantic review remains an ordinary target-owned pack selected by the target's paths and stages.
  The core never invokes a model, selects a provider, stores prompts, or knows product risks.
- Optional evidence indexing is per pack and digest-bound only. V1.1 does not add checkpoints,
  resume, cross-pack evidence composition, a proof graph, or a persistent result cache.
- Keep adopter identities, product vocabulary, target paths, target evidence, and model-invocation
  instructions outside the wheel and this checkout's generic runtime contract.

## Slices

### A. Packet-only subjects and digest

- Add `subject_digest` to changed and staged packet/result identity using a documented canonical
  serialization of sorted logical records: path status, normalized path, previous path,
  before/after content identity, and changed ranges. Do not hash temporary materialization paths.
  Git-backed identities may use the repository's object format while worktree identities use
  SHA256, so this is an exact run-subject identity rather than a cross-repository content digest.
- Require change-sensitive built-ins and packet-contract target packs to read packet materialized
  bytes only. Validate missing, changed, or mismatched packet inputs before execution.
- Preserve `all` as the explicit checkout-reading exception and identify it distinctly in output.

Focused proof: partially staged divergence, renamed/deleted records, equivalent canonical packets,
tampered materializations, target packet consumers, and all-mode checkout reads.

### B. Finding lifecycle and fail-closed execution

- Normalize findings to the five lifecycle states and derive the verdict from both process outcome
  and finding state. `blocking` blocks; `advisory` is visible but does not block; `accepted`,
  `waived`, and `suppressed` remain visible without keeping an otherwise clean run in warning.
- Permit `passed` with nonempty accepted, waived, or suppressed findings. Preserve counts and
  detector identity in JSON and human output.
- Make the process invariant dominant: nonzero exit, timeout, interruption, malformed JSON,
  missing required output, or an unknown lifecycle state blocks regardless of finding content.

Focused proof: each state, mixed findings, passed-with-nonempty accepted findings, malformed child
output, timeout, signal termination, and a child attempting to label its process failure waived.

### C. Test-quality severity split

- Keep deterministic lexical test-quality observations advisory. They can guide review but cannot
  claim semantic test weakness or expand implementation scope.
- Keep detector/configuration failure, unreadable required inputs, malformed output, and process
  failure blocking as infrastructure defects.
- Do not invoke a model from the built-in pack. A target may register a semantic reviewer as an
  ordinary pack and may replace the built-in only through `replaces_builtin_packs`.

Focused proof: advisory lexical findings pass visibly; scanner/configuration/process failures block;
target semantic packs use normal planning and receive no special core behavior.

### D. Exact secret waivers and stable detectors

- Give every secret detector a stable ID and emit it on every finding.
- Bind a waiver to detector ID, normalized path, exact after-image SHA256, owner, rationale, and
  expiry. Never store or echo the secret itself.
- Reject wildcard detector/path waivers, digest-only records without detector identity, expired
  waivers, unknown detector IDs, and a waiver reused for different bytes or location.
- Preserve the deliberate staged-index scan at pre-commit and the declared later-stage surfaces.

Focused proof: exact waiver acceptance, byte/path/detector mismatch, expiry, unknown ID, redacted
output, staged-only detection, and detector-ID stability fixtures.

### E. Optional per-pack evidence-manifest index

- Let a pack optionally emit one bounded, versioned `evidence-manifest.json` under its isolated
  evidence root. Bind it to `subject_digest` and index only bounded claim IDs, outcomes, and inert
  SHA256 artifact-digest strings.
- Treat invalid declared manifests as blocking for that pack. Evidence without a declared manifest
  remains uninterpreted runtime-local output.
- Do not resolve artifact paths or read artifact contents. Per-run/per-pack directory isolation
  supplies locality; the manifest is a summary index, not another artifact authority.
- Do not reuse manifests across runs, combine evidence across packs, infer dependencies between
  manifests, or introduce checkpoint/resume semantics.

Focused proof: absent optional manifest, valid bounded index, duplicate keys and claim IDs,
malformed/oversized input, subject mismatch, all-mode rejection, and proof that artifact contents
are never read.

### F. Numeric telemetry counters

- Add bounded numeric counts for lifecycle states, process and runtime-integrity failures, waiver
  outcomes, and indexed evidence entries. Keep existing privacy constraints: no paths, detector
  messages, commands, prompts, source, evidence contents, or target vocabulary.
- Define counter names and integer semantics as a versioned telemetry contract; reject booleans,
  strings, negative values, and unbounded label maps. Telemetry remains advisory and fail-open.

Focused proof: exact counters for mixed outcomes, passed-with-findings, process failure, malformed
telemetry input, concurrency, retention, and absence of sensitive fields.

### G. Authority, guard, and wheel proof

- Reconcile the kernel specification, runtime architecture, validation strategy, and only the
  operator guidance directly changed by the implemented contract.
- Extend the wheel-boundary negative guard for concrete adopter/product identities and explicit
  model-invocation instructions. Do not ban generic words such as `model`, `semantic`, `product`,
  `Claude`, or `agent` that legitimately occur in generic documentation and vendored notices.
- Prove the focused modules and one affected integration seam per slice. At the stable release
  candidate, run the runtime suite, reproducible wheel build, clean-wheel verifier, and one staged
  impacted governance check exactly once.

Focused proof: documentation checks, targeted boundary-guard tests, wheel reproducibility, archive
inspection, clean installation, and the declared release-quality boundary.

## Acceptance Criteria

- Every packet-bound changed/staged pack is traceable to one `subject_digest`; deliberate live
  exhaustive surfaces report no digest.
- Process integrity fails closed independently of finding lifecycle data.
- Accepted, waived, and suppressed findings remain visible and may coexist with a passed verdict.
- Lexical test-quality advice is not presented as semantic judgment.
- Secret waivers match one stable detector finding exactly and never expose the secret.
- Evidence indexing is optional, pack-local, digest-bound, and non-compositional.
- Telemetry exposes bounded numeric counters without retaining governed content.
- The wheel contains no adopter identity, product policy, target evidence, or instruction to invoke
  a semantic model.

## Progress

- [x] Slice A: packet-only changed/staged reads and `subject_digest`
- [x] Slice B: lifecycle states and fail-closed process invariant
- [x] Slice C: advisory lexical test-quality and blocking infrastructure
- [x] Slice D: exact secret waivers and stable detector IDs
- [x] Slice E: optional per-pack evidence-manifest indexing
- [x] Slice F: numeric telemetry counters
- [x] Slice G: authority reconciliation, negative guard, and wheel proof

## Closeout Proof

- Runtime suite excluding the separately exercised wheel boundary: 164 passed, 1 skipped.
- Reproducible wheel boundary: 2 passed.
- Clean built-wheel verifier: passed against the implementation candidate at `91c08ea`.
- Staged impacted governance: passed with three explicit cohesion decisions and no active warning
  or blocking finding.
- Independent Codex QA and Claude Opus 5 high-effort re-review: approved with no remaining finding.
