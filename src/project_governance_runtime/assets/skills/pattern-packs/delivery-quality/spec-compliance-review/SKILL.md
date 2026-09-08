---
name: spec-compliance-review
description: Use to compare implementation against a PRD, spec, execution plan, issue, or acceptance criteria. Finds missing requirements, changed semantics, extra behavior, and validation gaps.
---

# Spec Compliance Review

## Trigger

Use this skill before closeout, PR, or release when a change claims to implement a governed artifact or acceptance criteria.

## Required Reads

- `AGENTS.md`
- governing PRD, spec, execution plan, issue, or acceptance criteria
- changed files and validation evidence
- repository profile validation packs and traceability rules

## Workflow

1. Reread the sources that govern the work: PRD, spec, or original request and approved
   clarifications. Use whichever apply; an absent document does not require creating one.
2. Compare every in-scope requirement with the finished behavior, not just changed files. When both
   PRD and spec apply, check both and identify product requirements omitted by the spec. Flag
   contradictions; do not silently choose a source or weaken requirements to fit the implementation.
3. Distinguish implemented behavior from validated behavior. Report missing, partial, or changed
   behavior separately from claims that lack sufficient evidence. Keep approved exceptions explicit.
4. Check non-goals and forbidden behaviors.
5. Assess existing candidate-valid evidence appropriate to each requirement. Run additional
   validation only for a named evidence gap; inspection, tests, or demonstrations must support the
   actual claim. Passing tests alone do not establish that all requested behavior was delivered.
6. Recommend pass, pass with follow-ups, or request changes. Do not describe unmet or unproven
   required behavior as complete. Include this comparison in the existing review and closeout,
   without adding a separate acceptance stage or reviewer.

## Validation

Consume existing target-profile proof tied to the governed artifact. Run one missing owner only for
a named uncovered criterion. Use docs-governance as that focused owner when traceability or artifact
state changed and no current proof covers it.

## Evidence

Report governing source references, supporting evidence, missing or changed behavior, extra behavior,
validation gaps, approved exceptions, and the compliance recommendation. A short conclusion is
sufficient for simple work; use a requirement matrix only when it helps explain coverage.
