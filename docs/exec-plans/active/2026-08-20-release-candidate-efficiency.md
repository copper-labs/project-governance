---
id: exec-plan.release-candidate-efficiency
title: Release Candidate Efficiency
type: exec-plan
status: active
owner: project-governance
created: 2026-08-20
updated: 2026-08-21
summary: Certify one stable publication candidate before integration and keep repair loops focused.
---

# Release Candidate Efficiency

## Final State

Every target-supported release kind uses one operator-held publication candidate. Focused repair
stays on that candidate line. One complete declared release proof runs on the stable candidate
before merge or tag, so publication is not the first place that broad defects are discovered.

This source fix targets patch release `1.2.7`. It changes generic release authority, the source
repository's release-proof trigger, and installed review guidance. It adds no runtime command,
lifecycle state, proof cache, selector, receipt reuse, or adopter-specific CI behavior.

## Reconciled Design

1. A publication candidate is one exact integration snapshot whose content is intended for
   publication. For a pull request it includes the current integration base and proposed merge
   result, not only the branch head. The term is not limited to an `rc` version.
2. The operator holds the candidate boundary. Governance does not add a release state machine.
3. During certification, keep the pinned governance runtime, required release checks, toolchain,
   and baselines fixed. If one must change, form a new candidate; the prior complete proof no longer
   authorizes publication. A freeze never extends an expiry or other time-bound policy evidence.
4. Keep repairs on the candidate branch or equivalent integration line. During repair, run the
   failed owner and directly affected seam only. Run the complete declared release proof once after
   the replacement candidate is stable.
5. Certify before merge or tag. Integration must preserve the certified content and base. A change
   to either forms a new candidate.
6. Publication verifies exact identity, artifact integrity, and readback. It repeats broader work
   only when the publication environment is an independent required trust boundary.
7. Use existing pack, stage, affected-seam, and target-owned-check vocabulary. Do not introduce a
   release profile, platform lane, dependency graph, or another validation selector.

Claude Opus 5 challenged the initial four-document proposal at high effort. Reconciliation removes
the user-guide restatement, fictional `ci.release_profiles` vocabulary, discretionary proof reuse,
and any new runtime mechanism. It also removes a nonexistent required read from the installed
release skill. The root correction is the ordering in `release-process.md`: proof moves before
integration and tagging.

## Implementation

- Define the operator-held publication candidate in
  `docs/governance/validation-strategy.md`.
- Change `docs/governance/release-process.md` so candidate certification precedes merge and tag.
- Change `.github/workflows/source-readiness.yml` so complete candidate proof runs on the proposed
  merge result when a pull request first becomes reviewable, not on every repair push or again
  automatically after merge. A failed candidate returns to draft until its focused repairs are
  stable.
- Update
  `src/project_governance_runtime/assets/skills/release-readiness-review/SKILL.md` with the same
  candidate cycle and remove dead profile and observability references.
- Remove the same retired observability-path reference from the three remaining installed skills;
  retain target-owned observability proof or explicit gap guidance.
- Add focused assertions to `tests/test_runtime_skill_payload.py`.
- Do not change the CLI, planner, runner, schemas, telemetry, hooks, or adopter repositories.

## Proof

- Focused owner: `python3 -m unittest tests.test_runtime_skill_payload`.
- Workflow owner: `python3 -m unittest tests.test_runtime_release_versioning`.
- Direct seam: the focused test materializes package-owned skills into an installed runtime tree.
- Closeout: one branch-aware impacted pre-push sign-off on the stable candidate.
- Release proof: the existing source-readiness workflow runs the complete runtime suite, builds the
  wheel, and verifies the installed boundary before merge.

## Rollback

Restore the previous release ordering, candidate definition, skill workflow, and focused payload
assertions together. Do not add compatibility behavior or a second release path.
