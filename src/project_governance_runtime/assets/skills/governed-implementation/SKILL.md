---
id: skill.governed-implementation
title: Governed Implementation
stage: Work
provenance: package-default
---

# Governed Implementation

Implement scoped changes in a governed repository.

## Trigger

Use this skill when changing source code, scripts, generated governance files, or durable docs in a
repository generated from this template.

## Required Reads

- `AGENTS.md`
- `docs/index.md`
- The active plan or owning specification
- `.governance/runtime/skills/resources/change-narrative.md` before any commit or pull request handoff
- Route-selected packs or policies

## Workflow

1. Route the request and read the smallest required context.
2. Confirm the governing artifact, issue/work item policy, and validation packs.
3. Record delegation and its ownership boundaries only when delegation actually occurs.
4. Confirm the plan's proof budget and explicit stop condition. Treat equivalent subject-valid
   checks as substitutes and record a reason before repeating a passed gate.
5. Refuse Apple dependency writes when CocoaPods is new or expanding and the planning record has no
   current operator-approved exception. Existing CocoaPods is not permission to expand or remove it.
6. Make narrowly scoped edits using repository conventions and the selected role boundaries.
7. Add file and type comments that explain responsibility and reader context in simple language;
   keep method comments concise while preserving the same reader-first purpose.
8. During implementation, run one focused owner test. Add one directly affected seam only when the
   change crosses that seam. On the stable candidate, run one branch-aware impacted pre-push
   sign-off; do not run a separate manual pre-commit or pre-PR gate.
9. If a check fails, repair that focused owner. Use its named execution only when diagnosis needs
   narrow feedback. On the final repair, let either the enclosing Git hook or the one impacted
   pre-push sign-off serve as the affected recheck; do not immediately replay both on the unchanged
   subject. After a second failure of the same check, diagnose whether the owner is a product
   defect, evidence gap, or governance defect; do not refresh every pack or widen the loop.
10. Treat warnings as advisory evidence, not instructions to expand the task.
11. Review a new or directly changed source unit over 500 lines for cohesion, responsibility,
    coupling, navigability, readability, and testability. The threshold requires judgment, not
    extraction: a cohesive narrow unit may be accepted, and moving related code to a helper without
    creating a meaningful owner is not remediation.
12. Use independent QA or a second model only when selected risk or the operator requests it. Bound
    review to changed files, the active plan, the owning contract, and at most five directly
    relevant supporting files. Expand context only for a named uncertainty and return at most five
    actionable findings by default. Reconcile those findings with one primary-owned
    repair and one affected recheck; do not start a fresh general review after each repair.
13. Keep deep threshold remediation to the highest-risk three classes, helpful adjacent comment
    cleanup to five comments, and unrelated cleanup at zero unless explicitly added.
14. If the clean integration snapshot advances, rerun only proof invalidated by that change. A
    snapshot advance alone does not authorize a broad matrix; name the invalidated claim first.
15. Before any commit or pull request handoff, write the shared change narrative from the governing
    intent: outcome, product impact, conceptual change, code areas, and why. Do not substitute file
    paths, symbol lists, or machine validation evidence for that explanation.
16. Reconcile docs, traceability, observability proof or gap rationale, and closeout evidence
    before handoff.

## Validation

Run one branch-aware impacted pre-push sign-off on the stable candidate before publication or
handoff. Use explicit `--pack` execution for focused diagnosis and repair.

## Evidence

Report changed files, any delegation that occurred, integrated snapshot, validation commands and
results, governing artifacts used, change narrative, residual risks, and any follow-up work that
remains.
