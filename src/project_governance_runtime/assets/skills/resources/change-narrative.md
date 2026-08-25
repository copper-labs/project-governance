# Change Narrative Field Guide

Use this field guide before every ordinary commit and ready pull request. Repository instructions,
the governing issue or plan, and current validation evidence remain authoritative.

## Orient Before The Diff

Write for a reader who has not followed the implementation. Give them this journey:

`outcome -> product impact -> conceptual change -> code areas -> why -> validation`

- **Outcome:** what the change accomplishes at this scope.
- **Product impact:** each top-level product area and how people, operators, or dependent systems
  will notice the change. Say explicitly when behavior is intentionally unchanged and why that
  matters.
- **Nature of change:** how responsibilities, relationships, contracts, data flow, boundaries, or
  coupling changed. Keep symbol-level mechanics in the diff.
- **Code areas impacted:** stable capability or subsystem names a teammate will recognize, not a
  list of file paths.
- **Why:** the problem, constraint, decision, or opportunity behind the work.
- **Validation:** the checks run and observed result, or the specific reason a check was not run.
- **Risks or required action:** include only when a reader needs to watch, migrate, roll out, or
  follow up on something.

Use the adopting repository's product and code-area vocabulary. Do not invent an area from a folder
name. When intent is unclear, return to the issue, specification, plan, or operator instead of
guessing from the diff.

## Commit Shape

The subject is the outcome. Keep the required body fields compact and in this order:

```text
<Outcome>

Product impact: <top-level area and how the change surfaces>
Nature of change: <conceptual responsibility, relationship, contract, data-flow, boundary, or coupling change>
Code areas impacted: <stable capability or subsystem names>
Why: <problem, constraint, decision, or opportunity>
Validation: <checks and observed result, or reason not run>
Risks or required action: <optional>
```

Example:

```text
Make delivery checks explain their impact

Product impact: Contributor workflow — authors see missing change context before review; application behavior is unchanged.
Nature of change: Unified commit and pull request orientation around one shared narrative while keeping editorial judgment outside automation.
Code areas impacted: Delivery governance, agent authoring workflows.
Why: Reviewers had to reconstruct purpose and impact from file changes.
Validation: Narrative checker fixtures and affected delivery checks passed.
```

## Pull Request Shape

Use the same journey at the scope of the complete pull request:

```markdown
## Outcome

<One plain-language result for the pull request.>

## Product impact

- <Top-level area>: <behavior change, visible surface, or explicit unchanged behavior>

## Nature of the change

<Conceptual responsibility, relationship, contract, data-flow, boundary, or coupling change.>

## Code areas impacted

- <Stable capability or subsystem name>

## Why

<Problem, constraint, decision, or opportunity.>

## Validation

- <Check and observed result, or explicit reason not run>
```

Add `## Risks or required action` after validation only when it has authored content. Keep the body
current when scope, product behavior, conceptual design, or evidence changes.

For local pre-PR validation, save the authored body at the path returned by:

```sh
git rev-parse --git-path PR_DESCRIPTION.md
```

The ordinary pre-PR hook reads that worktree-local draft. An explicit command may instead use
`--pr-body-file <path>`. Supply the same authored file to the pull request provider so the validated
draft and the visible body do not diverge.

## Review Questions

- Can a teammate explain the outcome and affected experience without opening the diff?
- Does each product-impact entry say how the change surfaces, rather than naming changed code?
- Does the nature of change explain a system relationship or responsibility rather than reciting
  edits?
- Are code areas recognizable to teammates and free of file-path inventory?
- Does the reason preserve information that cannot be recovered from the diff?
- Does validation state both the check and its observed result?

The runtime blocks missing structure and explicit placeholder-only content. It does not grade plain
language, infer product areas, or perform code review. The author and reviewer own those judgements.
