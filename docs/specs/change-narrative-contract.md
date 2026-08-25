---
id: spec.change-narrative-contract
title: Change Narrative Contract
type: spec
status: current
owner: project-governance
created: 2026-08-24
updated: 2026-08-24
summary: Defines the plain-language context that commits and pull requests must provide before a reader opens the diff.
---

# Change Narrative Contract

A reader should be able to understand the outcome, affected experience, conceptual system change,
and reason for a commit or pull request before opening the diff. File lists and generated diff
summaries do not provide that orientation on their own.

This specification defines one shared narrative for commits and pull requests. The runtime enforces
its deterministic shape. Authors and reviewers remain responsible for whether the words are
accurate, conceptual, and useful.

## Implementation State

This approved contract is current. The source runtime installs the portable guidance, validates
commit messages through the `commit-message` pack, and validates local and CI pull request titles
and bodies through the `pr-description` pack. This repository also checks the live GitHub pull
request title and body.
The active
[implementation plan](../exec-plans/active/2026-08-24-change-narrative-enforcement.md) records the
remaining review, reconciliation, and closeout work.

## Goals

- Lead with what the change accomplishes, not the files or symbols it edits.
- Name each top-level product area affected and explain how the change surfaces there.
- Describe implementation work conceptually through responsibilities, relationships, contracts,
  data flow, or coupling.
- Name stable, human-recognizable code areas without turning the narrative into a path inventory.
- Preserve the reason for the change without duplicating machine evidence in the narrative.
- Give commits and pull requests the same mental model at different levels of scope.
- Keep the shared runtime project-neutral while allowing each adopter to own its vocabulary.

## Non-Goals

- Deep code review, correctness scoring, or semantic approval by a model.
- Changed-file maps, sequence diagrams, review-effort estimates, or reviewer suggestions.
- Replacing issues, specifications, plans, diffs, or test evidence.
- Inferring intent from a diff when the governing issue or plan does not explain it.
- Encoding adopter product names, source paths, or organizational language in the wheel.
- Requiring one commit-subject convention such as Conventional Commits.

## Narrative Fields

The following fields form one reader journey. The commit subject or pull request title supplies the
outcome; the body supplies the remaining context without repeating it.

| Field | Reader question | Expected content |
| --- | --- | --- |
| Outcome | What does this accomplish? | One plain-language result at the scope of the commit or pull request |
| Product impact | Where and how will people, operators, or dependent systems notice it? | Each affected top-level product area plus its behavior change, visible surface, or explicit unchanged behavior |
| Nature of change | What changed in the system conceptually? | Responsibility, relationship, contract, data-flow, boundary, or coupling changes rather than symbol-level mechanics |
| Code areas impacted | Which recognizable parts of the codebase carry the change? | Stable capability or subsystem names rather than file paths |
| Why | Why was this work necessary? | The problem, constraint, decision, or opportunity that motivated it |

Product impact is not a synonym for changed code. For example, a refactor may have no intended
user-visible behavior change while still improving the reliability or evolvability of a named
product area. State that boundary and explain why it matters.

The nature of change stays conceptual even when the work is internal. Prefer “separated policy
selection from execution so either can evolve independently” over a list of renamed classes or
helper functions.

## Commit Message Contract

Every ordinary commit uses this shape:

```text
<Outcome>

Product impact: <top-level area and how the change surfaces>
Nature of change: <conceptual system change>
Code areas impacted: <stable capability or subsystem names>
Why: <problem, constraint, or decision>
```

The subject states the useful result, not a generic activity such as “updates,” a ticket identifier
alone, or the files touched. The required labels appear once and in the order shown. Each label and its compact value share one
line. Values must contain authored content, not a known placeholder-only value. Additional
explanatory paragraphs and standard Git trailers may follow the required narrative.

Git-generated merge, revert, fixup, squash, and amend messages are exempt from the labeled body so
Git workflows remain usable. Their subject must still be present and readable. A human-authored
commit is not exempt merely because it changes only documentation, tests, or internal structure.

## Pull Request Contract

Every ready-for-review pull request title states one useful outcome for the complete change. It is
not a generic activity, placeholder, ticket identifier alone, or path summary. The body uses these
sections in order:

```markdown
## Product impact

- <Top-level area>: <behavior change, visible surface, or explicit unchanged behavior>

## Nature of the change

<Conceptual responsibility, relationship, contract, data-flow, boundary, or coupling change.>

## Code areas impacted

- <Stable capability or subsystem name>

## Why

<Problem, constraint, decision, or opportunity.>
```

Product impact and code areas use bullets so multiple areas remain easy to scan. Each
product-impact bullet uses an area followed by a colon and an explanation of how the change
surfaces. Validation evidence stays in repository checks, build results, and governed evidence
rather than being repeated as prose in the reader-orientation narrative. A material user-facing
limitation or rollout consequence belongs in Product impact; the contract does not add a generic
risk or action section.

The body evolves with the pull request. When scope, behavior, or conceptual design changes materially, the
author updates the relevant section rather than leaving the opening narrative stale.

## Enforcement Boundary

Blocking checks enforce only facts the runtime can determine consistently:

- required labels or headings exist once and in the expected order;
- the commit subject and pull request title are one-line outcomes rather than obvious generic or
  placeholder values;
- required content remains after comments and surrounding whitespace are removed;
- list-shaped fields contain the required bullets;
- product-impact bullets name an area and an explanation;
- duplicate Outcome, dedicated Validation, and Risks or required action body fields are rejected;
- known placeholder-only values are rejected; and
- ordinary commit subjects satisfy the existing minimum-length rule.

Automation does not decide whether prose is plain enough, whether a product area name is correct,
or whether a conceptual description is sufficiently insightful. The installed authoring workflow
guides those judgements, and the author or reviewer owns them. The wheel invokes no model and does
not perform code review.

## Runtime And Adopter Ownership

| Concern | Owner |
| --- | --- |
| Narrative fields, ordering, and generic examples | This specification |
| Deterministic commit and pull request checks | Runtime wheel |
| Portable templates and authoring workflow | Installed change-narrative resource and delivery skills |
| Product-area and code-area vocabulary | Adopting repository |
| Issue, plan, and local intent | Adopting repository |
| GitHub or another provider's CI integration | Adopting repository |
| Accuracy, clarity, and approval | Author and reviewer |

An adopter may add stricter deterministic policy through a target-owned pack. It must not copy the
runtime checker or create a second shared narrative authority.

## Acceptance Criteria

| Criterion | Evidence | Verifier |
| --- | --- | --- |
| Ordinary commits provide the required narrative and Git-generated flows remain usable. | Checker fixtures exercise valid, missing, duplicate, placeholder, ordering, and generated-message cases. | Focused runtime test |
| Ready pull requests provide the same reader journey at PR scope. | Local pre-PR and GitHub event fixtures exercise valid and invalid titles and bodies. | Focused runtime and workflow tests |
| The installed guidance explains product impact, conceptual change, and stable code areas without adopter vocabulary. | Skill payload inspection and clean-wheel verification. | Focused skill and wheel tests |
| Semantic review is not disguised as deterministic enforcement. | Manual comparison of checker behavior with the enforcement boundary. | Source maintainer and independent reviewer |
| No deep-review subsystem is introduced. | Changed-source inspection finds only narrative guidance, structural checkers, pack wiring, and thin provider integration. | Source maintainer and independent reviewer |
