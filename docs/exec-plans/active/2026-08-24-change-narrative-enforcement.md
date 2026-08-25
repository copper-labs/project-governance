---
id: exec-plan.change-narrative-enforcement
title: Commit And Pull Request Change Narratives
type: exec-plan
status: active
owner: project-governance
created: 2026-08-24
updated: 2026-08-24
summary: Install and enforce one plain-language, conceptual change narrative across commits and pull requests.
---

# Commit And Pull Request Change Narratives

## Target State

Agents and people explain each ordinary commit and ready pull request through one predictable reader
journey: outcome, product impact, nature of change, code areas impacted, why, and validation. The
runtime blocks structurally incomplete narratives locally, and this repository validates its live
GitHub pull request body in CI. Editorial quality stays with the author and reviewer.

## Baseline

- Source baseline: `canonical/main@d496199aedab4f24c9311aa0ad26800db96496b6`
- Working branch: `codex/change-narrative-contract`
- Isolated worktree: `/Users/stacy/ORGANTA/project-governance-change-narrative-contract`
- Publication boundary: local commits only; no push, pull request, tag, or release is authorized

## Fixed Decisions

1. The shared narrative begins with product and behavior impact, then explains the conceptual system
   change; implementation trivia stays in the diff.
2. Product impact names adopter-owned top-level product areas and how a change surfaces. Code areas
   name stable human-recognizable capabilities or subsystems.
3. Commit subjects carry the outcome. Required labeled body fields carry product impact, nature of
   change, code areas, why, and validation.
4. Pull requests use the same fields as ordered sections, with bullets for product and code areas.
5. Blocking checks enforce deterministic structure and known placeholders only. They do not grade
   clarity, infer intent, or invoke a model.
6. Git-generated merge, revert, fixup, squash, and amend messages retain a narrow exemption.
7. Local pre-PR validation reads an explicit `--pr-body-file` or the Git metadata draft path. CI
   validates the live provider body.
8. No changed-file map, sequence diagram, review estimate, reviewer suggestion, or deep-review
   subsystem is added.

## Execution Rules

- Preserve the active work in the primary checkout; all writes remain in the isolated worktree.
- Establish this specification and plan as a local checkpoint before runtime implementation.
- Change one owner and run its focused test before crossing the pack, hook, skill, or CI seam.
- Freeze one candidate before the requested independent review.
- Run Claude Opus 5 at high effort with fallback disabled and audited read-only permissions.
- Reconcile verified critical, high, and medium findings with focused proof. Do not ask Claude to
  write repository files.
- Do not push, open a pull request, merge, tag, publish, or change another repository.

## Slice 1: Establish Authority And Portable Guidance

- Ownership: change-narrative specification, indexes, source instruction link, hook taxonomy,
  installed resource, delivery skills, and source pull request template
- Work:
  - Define the field meanings, commit format, pull request format, exemptions, and enforcement
    boundary.
  - Add one portable authoring resource with generic examples and author/reviewer questions.
  - Route commit, pull request, work, and governed-implementation workflows through that resource.
  - Keep product vocabulary and source paths with the adopting repository.
- Acceptance:
  - One specification owns the narrative and one resource carries its operational form.
  - Guidance leads with behavior and conceptual change, not file lists or code-review tooling.
  - Package-owned resource references resolve after materialization.
- Focused proof: documentation, format, prose, and skill-payload tests

## Slice 2: Enforce Commit Messages

- Ownership: commit checker, existing commit pack, checker dispatch, and focused fixtures
- Work:
  - Require the ordered body labels and authored values for ordinary commits.
  - Preserve the subject check and narrow Git-generated exemptions.
  - Resolve the default commit-message path through Git so linked worktrees behave correctly.
  - Return normalized, actionable findings without reading changed source.
- Acceptance:
  - Valid narratives pass; missing, duplicate, out-of-order, empty, placeholder, and short-subject
    cases fail with stable rule identifiers.
  - Merge, revert, fixup, squash, and amend messages pass without a labeled body.
  - The existing commit hook remains a thin runtime launcher.
- Focused proof: change-narrative checker tests and commit-pack execution seam

## Slice 3: Enforce Pull Request Bodies

- Ownership: PR checker, built-in pack, checker dispatch, local draft resolution, source template,
  GitHub workflow, and focused fixtures
- Work:
  - Add a blocking `pr-description` pack at `pre-pr` and `ci-pr`.
  - Require ordered sections, meaningful non-placeholder content, list-shaped product and code
    areas, and area-plus-impact product bullets.
  - Resolve an explicit body, environment-provided body, or Git metadata draft without copying
    provider logic into the runtime.
  - Validate the live pull request body on open, edit, synchronization, reopening, and readiness.
- Acceptance:
  - Local agents can prepare one draft file, run pre-PR validation, and supply the same file to their
    provider command.
  - Missing or malformed local drafts fail with an actionable path.
  - The GitHub workflow safely materializes event content without shell interpolation.
  - Draft pull requests remain outside the blocking workflow until marked ready.
- Focused proof: change-narrative checker tests, pack planning/execution tests, and workflow contract
  tests

## Slice 4: Review, Reconcile, And Close

- Ownership: frozen candidate, review packet, repairs, validation evidence, and plan closeout
- Work:
  - Run focused owners and directly affected seams, then the complete runtime suite and clean-wheel
    proof because pack selection and hook behavior changed.
  - Run one impacted pre-push sign-off on the stable candidate.
  - Ask Claude Opus 5 high effort to review the specification, implementation, tests, provider
    integration, false-positive risk, worktree behavior, and adopter boundary.
  - Reconcile verified critical, high, and medium findings and rerun only affected proof.
  - Move this plan to completed and record exact local commits and residual risks.
- Acceptance:
  - All focused and broad source proof passes on the final local candidate.
  - Wrapper audit proves Claude made no repository writes.
  - No verified critical, high, or medium Claude finding remains open.
  - The branch is clean and contains local commits only.

## Rollback

Revert the narrative specification, portable guidance, checker changes, new PR pack, template, and
provider workflow as one feature boundary. Existing pack selection, hooks, and source-readiness
proof then remain authoritative. Do not preserve a copied checker or compatibility path.
