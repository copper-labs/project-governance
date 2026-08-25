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
journey: outcome, product impact, nature of change, code areas impacted, and why. Commit subjects
and pull request titles carry the outcome. The runtime blocks structurally incomplete narratives
locally, and this repository validates its live GitHub pull request title and body in CI. Check
results remain machine-visible evidence outside the narrative. Editorial quality stays with the
author and reviewer.

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
3. Commit subjects and pull request titles carry the outcome. Obvious generic labels, placeholders,
   and ticket-only titles fail deterministic checks.
4. Commit bodies use required labels for product impact, nature of change, code areas, and why.
   Pull request bodies use the same fields as ordered sections, with bullets for product and code
   areas; they do not duplicate an Outcome section.
5. Blocking checks enforce deterministic structure and known placeholders only. They do not grade
   clarity, infer intent, or invoke a model.
6. Git-generated merge, revert, fixup, squash, and amend messages retain a narrow exemption.
7. Local pre-PR validation reads an explicit `--pr-body-file` plus `--pr-title`, or the Git metadata
   title and body drafts. CI validates the live provider title and body with checker code from the
   trusted base snapshot.
8. No changed-file map, sequence diagram, review estimate, reviewer suggestion, or deep-review
   subsystem is added.
9. Dedicated Validation and Risks or required action fields are excluded and rejected. Check
   results stay in machine evidence; material user-facing consequences belong in Product impact.

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
- Proof state: portable resource and delivery guidance passed skill-payload and materialization
  tests; staged documentation proof remains in the implementation checkpoint

## Slice 2: Enforce Commit Messages

- Ownership: commit checker, existing commit pack, checker dispatch, and focused fixtures
- Work:
  - Require the ordered body labels and authored values for ordinary commits.
  - Require the subject to be a useful outcome rather than an obvious generic label, placeholder,
    or ticket identifier alone.
  - Reject legacy Validation and Risks or required action labels so agents do not append generic
    boilerplate.
  - Preserve the subject check and narrow Git-generated exemptions.
  - Resolve the default commit-message path through Git so linked worktrees behave correctly.
  - Return normalized, actionable findings without reading changed source.
- Acceptance:
  - Valid narratives pass; missing, duplicate, out-of-order, empty, placeholder, and short-subject
    cases fail with stable rule identifiers.
  - Merge, revert, fixup, squash, and amend messages pass without a labeled body.
  - The existing commit hook remains a thin runtime launcher.
- Focused proof: change-narrative checker tests and commit-pack execution seam
- Proof state: focused fixtures passed valid, missing, duplicate, ordering, placeholder,
  Git-generated, and linked-worktree cases

## Slice 3: Enforce Pull Request Bodies

- Ownership: PR checker, built-in pack, checker dispatch, local draft resolution, source template,
  GitHub workflow, and focused fixtures
- Work:
  - Add a blocking `pr-description` pack at `pre-pr` and `ci-pr`.
  - Require one useful outcome in the pull request title and avoid a duplicated Outcome body
    section.
  - Require ordered sections, meaningful non-placeholder content, list-shaped product and code
    areas, and area-plus-impact product bullets.
  - Reject legacy Validation and Risks or required action sections.
  - Resolve an explicit title and body, provider environment, or Git metadata drafts without
    copying provider logic into the runtime.
  - Validate the live pull request title and body on open, edit, synchronization, reopening, and
    readiness.
  - Run provider validation from trusted base code so a pull request cannot weaken its own gate.
- Acceptance:
  - Local agents can prepare title and body drafts, run pre-PR validation, and supply the same
    values to their provider command.
  - Missing or malformed local drafts fail with an actionable path.
  - The GitHub workflow safely materializes event content without shell interpolation.
  - The initial landing becomes CI-enforced only after the trusted base contains the checker; it
    does not self-attest with code from the pull request head.
  - Draft pull requests remain outside the blocking workflow until marked ready.
- Focused proof: change-narrative checker tests, pack planning/execution tests, and workflow contract
  tests
- Proof state: focused fixtures passed PR structure, template, Markdown fence, worktree, environment,
  pack-selection, argv, and GitHub event-safety cases

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

## Independent Review Reconciliation

The first frozen candidate at `63c6ee1080c2` received an audited read-only Claude Opus 5 review at
high effort with fallback disabled. The wrapper audit recorded `repo_changed: false`, no changed
files, and no artifact write.

- Retained missing-draft failure as intentional fail-closed enforcement. Removed the pre-PR command
  from generic upgrade verification, allowed only paired narrative overrides through the hook, and
  moved installed-wheel proof through the actual pre-PR stage.
- Narrowed Git-generated subject exemptions so human outcomes beginning with “Merge” do not bypass
  the contract.
- Made commit validation honor Git comments and scissors, including a configured comment marker.
- Made PR section and bullet parsing ignore fenced examples and report the offending bullet line.
- The first repair temporarily checked out the pull request head so the introducing candidate could
  find its checker. The final reconciliation restores the trusted base snapshot: a pull request
  cannot weaken its own gate, and the initial landing explicitly does not self-attest. The workflow
  retains read-only contents permission, passes provider text as environment data, and exposes no
  secrets.
- Kept the built-in checker's fail-closed default metadata inputs. This intentionally differs from
  target command templates, whose omitted placeholder arguments make the command inapplicable.

After that review, operator feedback simplified the public narrative further: Validation and Risks
or required action were removed and are now rejected as legacy fields. Commit subjects and pull
request titles now carry the outcome, obvious non-outcome titles fail, and the PR body no longer
duplicates an Outcome section. The affected title, parser, hook, CLI, workflow, skill, and wheel
seams received a second audited Opus 5 recheck at frozen commit `857e3716a01b`. The audit again
recorded high effort, fallback disabled, `repo_changed: false`, no changed files, and no artifact.

The recheck reported one high and four medium findings. All five were accepted and repaired:

- Recognize Git's `Reapply "..."` and nested older revert subjects without exempting ordinary
  human-authored “Reapply” outcomes.
- Reject common indented, bulleted, case-varied, and Markdown-heading forms of the removed fields.
- Reject Outcome in commit bodies as well as pull request bodies.
- Run the GitHub gate from the trusted base snapshot rather than checker code supplied by the pull
  request.
- Add the fail-closed title and body draft workflow to the adopter-facing user guide.

The five low findings were also closed with more precise placeholder and inline-value diagnostics,
provider-title finding paths, an isolated installed empty-body assertion, and direct `ci-pr` stage
execution coverage. Per the bounded QA rule, these primary-owned repairs receive focused and broad
source proof rather than a third general model review.

## Rollback

Revert the narrative specification, portable guidance, checker changes, new PR pack, template, and
provider workflow as one feature boundary. Existing pack selection, hooks, and source-readiness
proof then remain authoritative. Do not preserve a copied checker or compatibility path.
