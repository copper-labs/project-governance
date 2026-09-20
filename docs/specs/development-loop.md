---
id: spec.harness.development-loop
title: Development Loop and Proof Coordination
type: spec
status: accepted-design
owner: project-harness
updated: 2026-09-19
---

# Development loop and proof coordination

## Outcome and authority

Reduce repeated coordination, unnecessary invocations, broad reruns and log ingestion. Preserve the
required proof. Governance owns policy and selection; project runners own builds, caches, devices and
assertions. Harness remembers the current candidate, jobs and receipts. Codex reasons and edits.

This contract adopts existing governance policy; it does not invent weaker hooks. The current
public plan/batch adapter is implemented. Automatic integration with hook receipts, complete proof
plans and device workflows described below is planned work, not an existing skip cache.

## One coherent change loop

1. Resume intent, constraints, source identity, open jobs and useful prior evidence.
2. Plan an observable batch, focused checkpoints, expensive build point, required claims and review
   boundary. Reuse project runbooks; do not require a new form for each edit.
3. Edit with Codex. At a checkpoint, governance/project rules select the cheapest sufficient feedback.
   Group related fixes before expensive builds, unless compiler/integration uncertainty needs earlier proof.
4. Dispatch a declared job through the existing owner. Wait on its handle or qualified completion
   delivery; do not run both. Recovery observes the same job, including pending cleanup.
5. Return normalized findings plus bounded excerpts and full-log references. Collect independent
   findings together. Fix related issues, then recheck affected owners. Missing diagnostics stay unknown.
6. Freeze the candidate for integrated proof and applicable independent review. A review consumes
   current evidence; another broad test run needs a changed input, missing claim or concrete risk.
7. Prepare commit and PR narratives. Let the relevant hook perform its gate once. CI establishes its
   own boundary. Reconcile after merge; accept against the actual resulting candidate and required proof.

## Stage responsibilities

| Boundary | Required behavior | Avoidable cost to remove |
| --- | --- | --- |
| Edit loop | Focused owner test at planned checkpoints | Full matrix after each edit; repeated setup/review per helper |
| Device/integration checkpoint | Project-owned build/install/test for a named claim | Rebuild/reinstall without a changed relevant input or fresh-state need |
| Pre-commit | Actual staged snapshot; impacted checks and changed-file secrets | Manual identical gate immediately before `git commit` invokes it |
| Commit message | Cheap narrative preflight before expensive staged gate | Replaying source validation solely to repair message structure |
| Pre-push | One branch-aware impacted local sign-off; full tracked secret scan | Manual sign-off immediately followed by the same hook |
| Pre-PR | Shipped `pr-description` title/body check only | A second full local code sign-off labeled pre-PR |
| CI PR | Provider's candidate/environment and applicable checks | Unrelated jobs selected without project justification; never skip CI just because local passed |
| Release | Explicit required broad gate and destination readback | Reassembling known evidence; never substitute local tests for publication/device proof |

An adopter can declare additional requirements. Record that policy rather than silently rewriting it.
Git retries legitimately invoke gates again; prepare narratives first and distinguish retry cause from
unnecessary manual duplication. Bundling does not give harness permission to bypass hooks.

## Two separate optimizations

**Avoid duplicate requests now.** A known running action is observed rather than resubmitted. Normal
Git actions own their hooks. Deterministic status says which planned step is next. Existing source
identity and job receipts make this practical; cross-session automatic coordination still needs wiring.

**Reuse a finished verdict only when its owner permits it.** There is no new harness verdict cache in
slice 1. Any later reuse must establish the exact claim, check implementation and policy revision,
input/dependency closure, configuration/toolchain/environment, binary identity and expiry. Staged,
working-tree, branch and merged candidates are different subjects. If completeness is unknown, rerun
or explicitly report the proof gap. Source equality alone is insufficient. Mandatory gates still run;
any internal reuse belongs to governance or the project build system.

## Device and local-CI lane

Take one real project's existing canonical runner as the first device adopter. Prefer a project with
high observed build/setup cost; do not generalize across every ecosystem first.

- Name source/dependency/toolchain inputs, resulting binary digest, test scenario, device identity/OS,
  app state/reset requirements, external-service posture and the proof claim.
- Use the existing resource owner to serialize builds with shared outputs, installs and device runs.
  A worktree is not a new device or port. Isolated jobs may run concurrently under that owner's rules.
- Separate build, install and scenario execution receipts. Reuse the build system's artifact only
  where its owner establishes validity. A docs edit need not rebuild an unrelated binary; unknown
  dependency effects require proof, not a semantic-model guess.
- Reuse an installed app only if the runner verifies binary/device/state requirements. Sensor, acoustic,
  timing and attended acceptance claims need their actual environment. Simulator proof is distinct.
- A “local CI” wrapper must declare what it adds beyond focused proof and pre-push. Remove duplicated
  orchestration upstream; retain independent required CI trust/environment checks.
- Count build/install/scenario/queue/cleanup time separately. An empty log or long wait is not failure.

First qualify one long-running local check in slice 1; adopt one build/install/device loop in slice 2.
Runtime changes cannot make a necessary compiler or device run intrinsically faster. The attainable
win is fewer unnecessary runs and less agent/operator work around necessary ones.

## Next-proof packet

Derive one bounded packet from existing task/plan/receipt data: candidate identity, required claims,
known receipts with applicability, active jobs and the next declared operation. Refresh at meaningful
boundaries, not after each tool. No duplicate planner or scheduling service. If governance lacks a
needed fact, add it to its public contract rather than reimplement its policy in harness.

## Source of policy

Read-only governance references inspected 2026-09-19:
`docs/governance/hook-and-check-taxonomy.md` and `docs/governance/validation-strategy.md` in
`/Users/stacy/ORGANTA/project-governance`. Hook taxonomy already limits shipped pre-PR to narrative
checks. Validation strategy already forbids immediate manual/hook duplication and defines focused
proof, valid evidence reuse, device serialization and independent CI. The gap to test is adoption
and durable coordination, not whether those policies exist.
