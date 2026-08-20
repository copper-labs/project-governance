---
id: exec-plan.single-affected-signoff
title: Single Affected Sign-Off
type: exec-plan
status: completed
owner: project-governance
created: 2026-08-20
updated: 2026-08-20
summary: Make one branch-aware affected validation pass the normal local completion boundary.
---

# Single Affected Sign-Off

## Final State

An ordinary change is complete after focused implementation checks and one branch-aware affected
sign-off on the stable candidate. A pass ends validation. Governance does not require a manual
pre-commit closeout, a second local pre-PR pass, or a QA replay of the same proof.

This work continues on `codex/governance-execution-efficiency` from commit `704a7f6`. It changes
only this reusable source repository and does not authorize publication, release, remote writes,
or adopter changes.

## Approved Design

1. Reuse `project-governance check --stage pre-push --mode impacted` as the single local sign-off.
   Pre-push is branch-aware and is already the real Git hook, so a separate manual pre-PR run would
   only duplicate it.
2. Keep pre-commit as its existing staged changed-file hook. It is not the completion boundary.
   Target-owned expensive validation should call the repository's native affected-test mechanism
   from its branch-aware sign-off pack rather than register the same proof at multiple local stages.
3. The repository build or test system owns affected target and test selection. Governance owns
   only changed-path-to-pack selection. Do not add another selector, semantic dependency graph,
   validation schema, proof database, CLI mode, or cross-stage receipt reuse.
4. Independent QA consumes the stable candidate and its existing evidence. It runs one focused
   check only when it identifies a named changed seam with no evidence.
5. A failed check returns to the failing test or pack. Recompute affected validation only when the
   repair expands or otherwise invalidates the previously tested subject.
6. Broad proof runs once only when impact cannot be bounded, repository-wide build or selection
   behavior changes, a migration or security boundary changes, a release is being certified, or
   the operator requests it.
7. CI may run its own affected gate because it is an independent environment and trust boundary;
   local review and closeout do not replay the already passed local sign-off.

## Reconciled Review Findings

Claude Opus 5 and Jarvis independently identified the same blockers: the draft did not name a
branch-aware owner, it treated the hook taxonomy as a source of duplication when the duplicate
mandate actually lives in installed skills, and the packaged-skill test required the old two-gate
wording. Both also found that the QA skill still directs reviewers to rerun validation.

The reviewers proposed pre-PR as the branch-aware owner. Reconciliation selects pre-push instead:
the taxonomy gives both stages branch-aware scope, while pre-push is the actual automatic Git
boundary. Selecting pre-PR would still cause a later pre-push replay or require new receipt reuse.

The final simplification pass deletes the draft's semantic change-type table, hook-taxonomy edit,
open-ended documentation sweep, extra skill sweep, new runtime state, and new selection behavior.
The implementation is limited to one authority paragraph, three installed skills, the existing
plan template that contains the two-gate wording, and one focused payload test.

## Implementation

### Slice 1: Name the one local sign-off

- Change `docs/governance/validation-strategy.md` so the normal closeout is one branch-aware
  impacted pre-push sign-off. Preserve the documented staged-index versus branch-aware secret
  distinction and the existing broad-proof exceptions.
- Change `src/project_governance_runtime/assets/skills/governed-implementation/SKILL.md` and
  `src/project_governance_runtime/assets/skills/work/SKILL.md` so they no longer require both an
  impacted pre-commit closeout and impacted pre-PR boundary.
- Change `src/project_governance_runtime/assets/skills/resources/implementation-plan-template.md`
  because it contains the same two-gate closeout instruction.

### Slice 2: Make QA evidence-consuming

- Change `src/project_governance_runtime/assets/skills/qa-review/SKILL.md` so review consumes the
  frozen candidate's existing evidence and adds one focused check only for a named uncovered seam.
- Do not alter the broader review workflow, add another review wave, or clean up unrelated required
  reads.

### Slice 3: Prove the packaged contract

- Change `tests/test_runtime_skill_payload.py` to remove the required pre-commit-plus-pre-PR
  wording and require one branch-aware pre-push sign-off instead.
- Focused proof: `python3 -m unittest tests.test_runtime_skill_payload`.
- Affected seam: the focused suite materializes the package-owned skills into a temporary installed
  runtime tree, so a separate installation test would duplicate that seam.
- Closeout: run `tools/run-source-governance.sh check --stage pre-push --mode impacted` once on the
  stable candidate. Do not run the broad wheel/release suite because runtime selection, schema,
  hooks, and process isolation do not change.

## Completed Proof

- `python3 -m unittest tests.test_runtime_skill_payload`: three tests passed.
- The focused suite crossed the skill-materialization seam.
- The single branch-aware impacted pre-push sign-off passed eight selected packs with no findings.
- The broad wheel/release suite was intentionally omitted.

## Explicit Exclusions

- No change to `docs/governance/hook-and-check-taxonomy.md`.
- No change to planner, runner, configuration, schemas, generated hooks, or CLI.
- No governance-owned test taxonomy, dependency graph, cache, receipt store, retry budget, or
  circuit-breaker state machine.
- No adopter write, publication, push, tag, release, or wheel adoption.

## Rollback

Restore the prior two-stage wording in validation strategy, installed skills, plan template, and
the focused payload assertion together. Do not add compatibility shims or a second runtime path.
