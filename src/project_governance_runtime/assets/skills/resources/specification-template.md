---
id: spec.<slug>
title: <Title>
type: spec
status: draft
owner: <owner>
created: YYYY-MM-DD
updated: YYYY-MM-DD
summary: <One sentence describing the intended behavior.>
---

# <Title>

Save this specification as a `.md` file under `docs`, such as `docs/specs/<slug>.md`.

## Problem and Intended Behavior

<The observed problem, who needs the change, and the observable result.>

## Ownership and Boundaries

<Who owns each contract or decision. Include the data, API or lifecycle details needed to agree
on behavior. Keep rationale and unresolved judgment in readable prose.>

## Failure Cases

<Invalid inputs, unavailable prerequisites, interrupted work and the observable handling required.>

## Non-Goals

<Explicit exclusions that keep this change bounded.>

## Acceptance Criteria

Each stable ID identifies one observable claim. `mechanical` names a claim suitable for an existing
schema, compiler, lint or behavioral check; `semantic` needs judgment in the existing compliance
review. The label does not prove acceptance or choose a check.

```governance-spec
{
  "version": 1,
  "criteria": [
    { "id": "R1", "claim": "<Observable intended behavior.>", "verification": "mechanical" },
    { "id": "R2", "claim": "<Behavior or boundary requiring review judgment.>", "verification": "semantic" }
  ]
}
```

## Verification Strategy

<For each criterion, describe the conditions that distinguish success from failure and the
evidence needed. Name the existing check or review owner and any limits of that proof.>

The implementation plan references this repository-relative path and the applicable criterion IDs.
Its versioned declaration binds the definition digest returned by the 4.1 read-only inspector:
`project-governance implementation-plan inspect --specification <this-path>`.
The digest includes all unmarked prose and criteria; only explicit commentary-region contents are
excluded. Without notes it remains the entire file's SHA256. The inspector also preserves the exact
observed file digest. Update the binding deliberately when requirements change; retaining an ID
does not preserve old proof.
Implementation progress, check mappings and evidence belong in the plan. Keep this specification
focused on intended behavior, without completion boxes or execution logs.

## Related Artifacts and Open Decisions

<Source intent, related contracts, implementation plan and unresolved questions.>

<!-- governance:notes commentary -->
<Changing commentary only. Keep intended behavior, requirements and approvals outside notes.>
<!-- /governance:notes commentary -->
