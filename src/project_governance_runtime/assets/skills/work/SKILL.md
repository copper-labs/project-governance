---
id: skill.work
title: Work
stage: Work
provenance: package-default
---

# Work

Execute the approved slice with narrow edits and early validation.

## Trigger

Use this skill when making implementation, docs, script, generated-template, or governance edits
after the work has been framed and scoped.

## Required Reads

- `AGENTS.md`
- `CHARTER.md`
- `docs/index.md`
- The active plan or governing artifact
- The selected role contract when delegation is active
- Route-selected pack manifests or policies

## Workflow

1. Inspect current files before editing and preserve unrelated user changes.
2. Record delegation and its ownership boundaries only when delegation occurs. Across active waves,
   one repository may contain one writer and two non-overlapping readers; do not expand a scope
   after authorization.
3. Follow the plan's proof budget and stop condition. Reuse checks that prove the same claim on the
   same digest-bound subject; record a reason before deliberately repeating an equivalent passed
   gate.
4. If a clean integration snapshot advances, rebaseline immediately, discard stale integration
   mechanics, and retain only subject-valid evidence.
5. Make the smallest coherent edits that advance the approved final state.
6. Keep source of truth changes in shared docs, skills, manifests, or generated policy before
   provider adapters.
7. Run one focused owner test and one directly affected seam during implementation. Before
   publication, run one impacted pre-commit closeout and one impacted pre-PR boundary.
8. Repair and replay a failed focused owner. If the same check fails twice, diagnose its owner
   instead of refreshing every pack or widening the loop. Warnings do not create implementation
   scope.
9. Review each new or directly changed source unit over 500 lines. The threshold requires
   architectural judgment, not mechanical extraction: accept a cohesive narrow unit when justified,
   and reject helper extraction that only relocates related code without creating a meaningful owner.
10. Run deterministic build commands under the harness and bind build evidence to the integrated
    snapshot. Any delegated QA is a separate explicitly started assurance wave.
11. Update evidence artifacts as part of the slice, not after memory fades.

## Validation

Use `project-governance check --pack <pack>` for focused repair. Run the impacted pre-commit and
pre-PR boundaries once at closeout before publication.

## Evidence

Report changed files, active role and scope, integrated snapshot, validation results,
source-of-truth updates, residual risk, and any deferred work.
