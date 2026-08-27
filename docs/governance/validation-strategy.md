---
id: governance.validation-strategy
title: Validation Strategy
type: governance
status: current
owner: project-governance
created: 2026-07-05
updated: 2026-08-21
summary: Defines focused, impact-aware validation for the package runtime and its adopters.
---

# Validation Strategy

Validation should prove the change just made. It should not repeatedly run unrelated checks merely
because they exist.

## Normal Change Loop

1. Change one owning component.
2. Run its focused unit or behavior test.
3. Run one directly affected integration seam only when the change crosses that seam.
4. Commit the coherent result.

For a failed governance check, use the named pack at the same lifecycle stage and subject only when
focused diagnosis needs it:

```sh
project-governance check --pack <pack-id> --stage <failed-stage> --mode impacted
```

After the final repair, freeze the candidate and run one branch-aware local sign-off as the affected
recheck:

```sh
project-governance check --stage pre-push --mode impacted
```

Do not automatically run the named pack and then replay it immediately inside an unchanged
enclosing gate. If retrying `git commit` or `git push` will invoke that gate, the hook is the one
affected recheck; do not run the same stage manually first. A named pack remains available when its
faster feedback is useful during diagnosis, but that deliberate extra execution needs a concrete
diagnostic reason.

Pre-commit remains the staged changed-file hook; it is not a second completion boundary. The shipped
pre-PR hook names only the `pr-description` pack so authors can check the title and body without
replaying code validation. Do not run a separate full local pre-PR gate after the branch-aware
pre-push sign-off. CI may run its own affected gate as an independent environment and trust
boundary.

The adopting repository owns its local-feedback objective and every command or job deadline. The
runtime records duration but does not infer failure from elapsed time or impose a generic default
timeout. A target or operator may supply an explicit deadline; expiration fails closed with timeout
evidence. When recurring local proof materially impairs the target's workflow, its owner decides
whether product builds, platform, device, or external-service execution belongs in CI or a
scheduled lane while preserving the required proof.

Freeze one candidate before a broad or cross-platform proof. An independent QA pass consumes that
candidate and its existing proof; it does not replay the matrix. It adds one focused check only for
a named changed seam with no evidence. One QA repair permits one affected deterministic recheck. If
that recheck fails, return to focused diagnosis or the operator instead of starting another general
QA, verifier, or broad-proof cycle.

## Publication Candidate

A publication candidate is one exact integration snapshot whose content is intended for release.
For a pull request, that snapshot is the proposed merge result: candidate content plus its current
integration base, not the branch head alone. An adopting repository applies this boundary to every
release kind it supports; `candidate` does not mean that the version must contain an `rc` suffix.
This runtime's own public releases retain the exact stable semantic versions defined by the
[release process](release-process.md).

The stable review candidate above becomes the publication candidate when release certification
begins. The one-recheck limit bounds an independent QA wave; it does not prevent focused release
repair on the candidate line.

The candidate boundary is operator-held, not runtime state. From candidate certification through
publication, keep the pinned governance runtime, required release checks, toolchain, and baselines
fixed. If one must change, form a new candidate. A freeze does not extend a waiver, dependency
freshness record, or other time-bound policy evidence beyond its real expiry.

Keep repairs on the candidate branch or equivalent integration line. During repair, replay the
failed owner and directly affected seam only. When the replacement candidate is stable, run the
complete declared release proof once before merge or tag. Integration must preserve the certified
content and base. If either changes, the integrated snapshot is a new candidate.

## Selection Rules

| Input change | Selected work |
| --- | --- |
| Applicable source file | Formatting, naming, maintainability, comments, test quality, and target-owned packs for that path |
| Governed documentation | Documentation governance |
| Context routes, skill catalog, root instructions, or provider adapters | Context routing and adapter-reference validation |
| Runtime lock, bootstrap, hooks, profile, facts, or extension registration | Installation validation |
| Enabled documentation profile or capability catalog | Existing documentation validation |
| Telemetry implementation or telemetry policy | Telemetry verification |
| Pack definitions, schemas, selectors, or extension registration | Validation conformance |
| Source file at commit time | Secret detection for changed files |

An unmapped path fails with one selector finding. It never causes all packs to run. Project build
systems retain responsibility for compilation, test caching, and device evidence.

Change-sensitive packs consume one runtime-resolved packet. Comment enforcement is full for new
files and new public or authority-boundary declarations; an existing declaration is reopened only
when its header or signature changes. Dependency freshness evaluates only coordinates added or
updated between the packet's before- and after-images. Existing comment debt and unchanged
dependency tuples do not become implementation scope.

Pre-commit secret proof deliberately includes bytes present only in the staged index. When the
secrets pack is selected, pre-push, deliberate full pre-PR, CI-PR, and release retain their declared
live publishable worktree-and-index secret surfaces and report no pack digest. The shipped narrow
pre-PR hook does not select the secrets pack. This difference is an explicit stage and selection
contract, not an inconsistency to normalize away.

## V1.1 Proof Rules

The completed V1.1 evidence-integrity plan's focused proof establishes:

- changed/staged checkers cannot substitute checkout bytes for packet materializations, while
  explicit all mode can read the checkout across declared scope;
- canonical `subject_digest` identity survives temporary-path changes and detects subject or
  materialization mismatch;
- process failure blocks even when child output claims an accepted, waived, or suppressed finding;
- a passed result may retain nonempty accepted, waived, or suppressed findings and exact numeric
  counts;
- lexical test-quality findings are advisory, while detector and process infrastructure failures
  block;
- a secret waiver matches one stable detector ID, path, after-image SHA256, owner, rationale, and
  expiry without exposing the secret;
- an optional evidence manifest is bounded, binds the immutable subject, rejects ambiguous input,
  and never resolves an artifact path or reads artifact content; no checkpoint or cross-pack
  composition behavior exists; and
- wheel inspection rejects concrete adopter/product identities and explicit model-invocation
  instructions without banning generic documentation vocabulary.

## Broad Proof

Run the complete suite only for a runtime release, a configuration-schema migration, a hook or
selection-contract change, a security/process-isolation boundary, scheduled reconciliation, or an
explicit operator request.

Delegation behavior belongs to the host agent. Runtime validation proves only repository checks,
process ownership, explicit deadlines, and the bounded local telemetry it actually owns.

## Evidence

Report the focused test, affected seam, selected packs, any intentionally omitted proof, and
residual risk. The JSON result contains normalized findings, status, execution duration, and
termination reason. The optional `--summary` projection keeps active findings while omitting
successful command detail and changed-path inventories. Bounded local telemetry adds changed-path
and selected-pack counts, total and slowest-pack durations, and one opaque digest for eligible
content-bound subjects without retaining paths, commands, output, prompts, or source content.
`project-governance telemetry status` summarizes unmatched starts, runtime
overhead, retained repeated scopes, same-subject repetition, broad runs, and slow packs as advisory
observations. It does not prove a repeat was unnecessary because invalidation reasons are not
retained. It also excludes direct commands and
native-host launches outside the runtime, so missing telemetry is never evidence that no work ran.

Run deterministic builds through a target pack or the governed harness when one exists. If a
necessary command has no governed execution surface, report that coverage gap with the evidence
instead of silently treating runtime telemetry as complete.
