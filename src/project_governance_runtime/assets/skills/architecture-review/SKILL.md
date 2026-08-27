---
id: skill.architecture-review
title: Architecture Review
stage: Review
provenance: package-default
---

# Architecture Review

Review architecture, public surface area, module boundaries, platform boundaries, or shared
contracts before handoff.

## Trigger

Use this skill when a change touches architecture docs, public API surfaces, module boundaries,
platform source sets, contracts, dependency direction, or cross-product behavior.

## Required Reads

- `AGENTS.md`
- `docs/index.md`
- The active plan or owning architecture contract
- `.governance/runtime/skills/review-finding.schema.yaml`
- repository profile `architecture_preferences`
- repository profile `quality.platform_profiles`
- repository profile validation packs with kind `architecture` or `boundary`

## Workflow

1. Identify the smallest architecture surface affected by the request or diff.
2. Check whether a governing architecture artifact already authorizes the change.
3. Compare changed paths against platform profiles, boundary packs, and public API globs.
4. Review dependency direction, ownership, naming, observability contract alignment, and whether
   the change widens the public surface.
5. Review each new or directly changed source unit over 500 lines for cohesion, responsibility
   count, coupling, navigability, readability, and testability. The threshold requires judgment,
   not extraction. A cohesive narrow unit may be accepted. Reject helper extraction that merely
   relocates related code without creating a meaningful owner, reducing coupling, or improving
   independent comprehension or testing.
6. For Apple work, confirm SwiftPM remains the default and any CocoaPods addition, expansion, or
   removal has an operator-approved exception or compatibility decision from the planning phase.
7. Write the review record with work id, exact source snapshot, reviewed paths, findings, and
   disposition. It records evidence, not reviewer independence or semantic truth.
8. Bound review to changed files, the active plan, the owning contract, and at most five directly
   relevant supporting files. Expand context only to resolve a named uncertainty and return at most
   five actionable findings by default. Use independent QA or a second model only
   when selected risk or the operator requests it.
9. Escalate to a spec or decision update when the code changes architecture policy.

## Validation

Consume existing subject-valid proof. Run one focused architecture owner or affected seam only for
a named uncovered claim. If repair changes the candidate, use one affected recheck; do not run the
named owner and an unchanged enclosing gate as additive ceremonies.

## Evidence

Report findings first, ordered by severity, with file paths and the governing artifact used. Include
validation commands run, residual risks, and any required doc or decision update using the shared
review finding schema.
