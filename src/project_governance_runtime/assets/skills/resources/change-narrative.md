# Change Narrative Field Guide

Use this field guide before every ordinary commit and ready pull request. Repository instructions,
the governing issue or plan, and current validation evidence remain authoritative. Commits use a
compact subject and paragraph; pull requests carry the complete structured reader journey.

## Orient Before The Diff

Write for a reader who has not followed the implementation. Give them this journey:

`outcome -> product impact -> conceptual change -> code areas -> why`

- **Outcome:** what the change accomplishes at this scope. Put it in the commit subject or pull
  request title as useful plain language—not a generic activity, ticket identifier alone, or path
  summary.
- **Product impact:** each top-level product area and how people, operators, or dependent systems
  will notice the change. Say explicitly when behavior is intentionally unchanged and why that
  matters.
- **Nature of change:** how responsibilities, relationships, contracts, data flow, boundaries, or
  coupling changed. Keep symbol-level mechanics in the diff.
- **Code areas impacted:** stable capability or subsystem names a teammate will recognize, not a
  list of file paths.
- **Why:** the problem, constraint, decision, or opportunity behind the work.

Keep validation in machine-visible checks and governed evidence instead of repeating it in the
narrative. Put a material user-facing limitation or rollout consequence under Product impact; do
not add a generic risk or action catch-all.

Use the adopting repository's product and code-area vocabulary. Do not invent an area from a folder
name. When intent is unclear, return to the issue, specification, plan, or operator instead of
guessing from the diff.

## Commit Shape

The subject is the outcome. Say what becomes possible, changes, or is prevented; do not title the
commit with the act of editing code. Follow it with a compact paragraph that helps a teammate
understand the commit without opening the diff.

Explain the problem or intent, the conceptual change, and any consequence, constraint, or decision
that matters. Name recognizable capabilities or components when useful, but do not inventory files,
symbols, or individual edits. Use complete sentences and connect the ideas into a coherent
explanation rather than a checklist. Do not repeat the subject, reproduce test output, narrate the
implementation process, or copy the pull request description. For a small mechanical change, one
informative sentence may be enough. If the explanation becomes long or covers unrelated ideas,
split the work into separate commits.

```text
<Outcome>

<Short explanation of what changed or why it matters.>
```

Example:

```text
Detect outdated governance launchers

Older installations could retain outdated hook launchers after an upgrade and continue using the
previous lifecycle. This change detects drift in runtime-owned launchers and provides an explicit
refresh path while preserving project-owned customizations.
```

Validate the prepared commit message before attempting the commit:
`project-governance check --pack commit-message --stage commit-msg --commit-message-file <path>`.
Then let `git commit --file <path>` run the staged hook once. Prepare and check the PR narrative
before the final push so narrative repair does not force another source-validation cycle.

## Pull Request Shape

Use one compact outcome as the pull request title. Do not repeat it in an Outcome section. Use the
rest of the journey in the body:

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

Keep the body current when scope, product behavior, or conceptual design changes.

For local pre-PR validation, save the title and authored body at the paths returned by:

```sh
git rev-parse --git-path PR_TITLE
git rev-parse --git-path PR_DESCRIPTION.md
```

The ordinary narrative-only pre-PR hook reads those worktree-local drafts without replaying code
validation. An explicit command may instead use `--pr-body-file <path> --pr-title <title>`. Supply
those same values to the pull request provider so the validated draft and the visible pull request
do not diverge.

## Review Questions

- Can a teammate understand the outcome and purpose without opening the diff?
- Does the subject or title state the result rather than “updates,” a ticket, or a path?
- Does the commit body connect intent, conceptual change, and relevant consequences without
  becoming a checklist or implementation diary?
- Does each product-impact entry say how the change surfaces, rather than naming changed code?
- Does the nature of change explain a system relationship or responsibility rather than reciting
  edits?
- Are code areas recognizable to teammates and free of file-path inventory?
- Does the reason preserve information that cannot be recovered from the diff?

The runtime blocks a missing commit body, missing pull request structure, and explicit
placeholder-only content. It does not score writing quality or infer product areas. It does not
perform code review. The author and reviewer own those judgements.
