---
name: work-item-lifecycle
description: Plan or perform a governed issue or project-status change, including ownership, staging reconfirmation, review handoff, and closeout.
metadata:
  id: skill.work-item-lifecycle
  title: Work Item Lifecycle
  stage: Work
  provenance: package-default
---

# Work Item Lifecycle

Keep the configured tracker aligned with work that actually happened. The tracker coordinates
ownership and stage; repository governance remains the durable authority for design and behavior.

## Trigger

Use this workflow when creating, triaging, claiming, editing, commenting on, moving, staging,
reviewing, reopening, or closing a tracked issue.

## Required Reads

- `config/governance/profile.yaml`, limited to `work_tracking`
- `docs/governance/work-tracking.md`
- the issue or supplied issue record
- the active execution plan, change, release, or environment briefing only when it supplies a
  required evidence gate

Do not rediscover unrelated project fields or scan the full board when the profile and issue
connection answer the question.

## Workflow

1. Confirm the exact repository, issue, Project, status field, expected current state, acting
   principal, requested operation, and mutation authority.
2. Read the issue before proposing a change. Preserve its actual scope, reporter, labels,
   assignees, links, and current Project status.
3. Build a local `work-item-change-plan`. Review its repository, expected state, target state,
   evidence requirements, ordered actions, and digest.
4. For claim, take ownership before product-code edits when configured. Assign only the acting
   principal unless the operator explicitly names another person.
5. For progress, edit or comment only what the current work proves. Do not post speculative
   success, duplicate status comments, or large logs.
6. For review, require every configured evidence kind. When staging reconfirmation applies, prove
   both the deployed candidate identity and the affected behavior. A deployment alone is not
   behavior proof.
7. Run the local plan-digest/input-binding check, but do not mistake supplied values for live
   proof. The future provider adapter must re-read identity, repository, issue, current state,
   Project field, authorization validity, final-owner binding, and idempotency immediately before
   mutation. Stop on mismatch.
8. Execute at most one issue plan serially. Record the actual operations, timing, outcome, and
   remaining uncertainty. Never print or persist provider credentials or raw responses.
9. Leave terminal movement or issue closure to the configured final owner. An agent may close only
   when the profile permits it and the exact action has separate current authorization.

## GitHub Boundary

Use the GitHub API through `gh` or an approved adapter, not browser automation. Adding an issue to
a Project and setting its status are separate operations. Assignees, labels, body, comments, and
open/closed state belong to the issue; Project status belongs to the Project item.

If Projects permission is missing, report the exact blocker. Do not silently substitute a label or
comment as if it were the configured status authority. Local implementation may continue only when
the target policy allows that fallback.

## Validation

For local contract changes, run only the work-tracking schema, planner, transition, redaction, and
generation tests. For a live action, validate the one issue's observed state and recorded action.
Do not retest the full repository or enumerate the full Project merely because tracker state moved.

## Evidence

Report the repository and issue, acting principal, old and new state, operation, plan digest,
evidence refs, provider actions actually completed, duration, remote-state change, and residual
risk. Never include credential values, raw provider payloads, or sensitive issue content in the
record.
