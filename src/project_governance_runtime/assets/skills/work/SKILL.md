---
id: skill.work
title: Work
stage: Work
provenance: package-default
---

# Work

Complete the approved implementation batch with focused checks at the planned checkpoints.

## Trigger

Use this skill when making implementation, docs, script, generated-template, or governance edits
after the work has been framed and scoped.

## Required Reads

- `AGENTS.md`
- `CHARTER.md`
- `docs/index.md`
- The active plan or governing artifact
- `.governance/runtime/skills/delegated-execution/SKILL.md`
- `.governance/runtime/skills/resources/change-narrative.md` before any commit or pull request handoff
- Route-selected pack manifests or policies

## Workflow

1. Inspect current files before editing and preserve unrelated user changes.
2. Follow the plan's `Parallel support` decision. At a material blocker or long-running build,
   reassess whether bounded independent investigation can replace necessary work; do not repeat
   this assessment after every internal step. Continue useful work while readers investigate.
   Record delegation and its ownership boundaries only when delegation occurs. Across active waves,
   one repository may contain one writer and up to two non-overlapping readers; do not expand a scope
   after authorization. All roles use the current checkout by default. Delegation does not
   authorize creating or moving a worktree; each additional worktree requires a direct operator
   request.
3. Follow the plan's proof budget and stop condition. Reuse checks that prove the same claim on the
   same digest-bound subject; record a reason before deliberately repeating an equivalent passed
   gate. Confirm relevant dependencies, configuration, toolchain, binary, environment, and expiry
   remain valid; an unchanged test file alone does not establish reusable evidence.
   When repeated work is reported or observed, inspect existing results before another broad run.
   Use `project-governance telemetry status` with version, stage, trigger, or time filters as needed
   to locate repeat examples; do not call it before every check. Distinguish missing evidence,
   mechanical hook duplication, and premature QA boundaries before changing the workflow.
   Telemetry references locate observations, not reusable proof; inspect the original result and
   relevant inputs. Direct commands outside the runtime require existing host or build logs.
4. If a clean integration snapshot advances, rebaseline immediately, discard stale integration
   mechanics, and retain only subject-valid evidence.
5. Complete the agreed batch without helper-by-helper approval or review handoffs. Adjust test
   checkpoints for a concrete failure or new risk; escalate unresolved contracts or authority
   changes before dependent work. Coordinate delegated work on blockers, material changes, and
   completed batches.
6. Keep source of truth changes in shared docs, skills, manifests, or generated policy before
   provider adapters.
7. Run the planned focused checks during implementation. A narrow repair normally needs
   one focused owner test and one directly affected seam only when it crosses that seam. Group
   shared changes before expensive builds, bringing compilation or integration forward when risk
   requires it. On the stable candidate, run one branch-aware impacted pre-push sign-off;
   do not run a separate manual pre-commit or pre-PR gate.
8. Repair a failed focused owner. Use its named execution when diagnosis needs narrow feedback; on
   the final repair, let either the enclosing Git hook or the one impacted pre-push sign-off serve
   as the affected recheck. Do not run both immediately on the unchanged subject. If the same check
   fails twice, diagnose its owner instead of refreshing every pack or widening the loop. Warnings
   do not create implementation scope.
9. Review each new or directly changed source unit over 500 lines. The threshold requires
   architectural judgment, not mechanical extraction: accept a cohesive narrow unit when justified,
   and reject helper extraction that only relocates related code without creating a meaningful owner.
10. Run deterministic build commands under the harness and bind build evidence to the integrated
    snapshot. Any delegated QA remains an explicit host-native assignment.
11. Use one applicable independent QA review on the completed batch and its existing proof. Review
    earlier only for a named risk or unresolved decision. Reconcile QA with one primary-owned
    repair and one affected recheck. If it fails, return to focused diagnosis instead of
    starting another general QA, verifier, or broad-proof cycle.
    Reader findings on work in progress are provisional advice, not approval of the final candidate.
    Before declaring completion, reread the governing PRD, spec, or original request and approved
    clarifications. Compare every in-scope requirement with the delivered behavior and existing
    validation evidence. When both PRD and spec govern the work, check both, including product
    requirements omitted by the spec; flag contradictions rather than silently choosing one or
    weakening requirements to match the code. If neither exists, use the original request without
    creating another document. Distinguish missing behavior from unproven claims, and run additional
    validation only for a named evidence gap. Include this check in the existing review and
    closeout: cite the governing sources, supporting evidence, and any gaps or approved exceptions.
    A short statement is sufficient for simple work; this adds no separate review or acceptance stage.
12. Before any commit or pull request handoff, write the shared change narrative from the governing
    intent: outcome, product impact, conceptual change, code areas, and why. Do not derive product
    intent from file names alone or copy machine validation evidence into the narrative.
13. Capture command results in existing logs as work proceeds. Consolidate plan checkboxes, status,
    evidence summaries, and explanatory docs at batch closeout. Update governing contracts earlier
    when dependent work needs them; keep commit/delivery documentation current. Report completed
    milestones and blockers. Note useful cost observations from existing records without adding
    per-step bookkeeping.

## Validation

Use `project-governance check --pack <pack>` only when focused repair needs it. Run one
branch-aware impacted pre-push sign-off on the stable candidate before publication, counting an
automatically invoked pre-push hook as that sign-off.

## Evidence

Report changed files, active role and scope, integrated snapshot, validation results,
source-of-truth updates, change narrative, residual risk, and any deferred work. If the operator
authorized an additional worktree, report its path and
whether it was retained or removed.
