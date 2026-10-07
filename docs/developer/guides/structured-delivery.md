---
id: developer.structured-delivery
title: Update Delivery Plans Without Model Bookkeeping
type: guide
status: current
owner: project-governance
created: 2026-10-05
updated: 2026-10-05
summary: Uses stable plan items, exact specification references and original native check receipts at coherent batch boundaries.
---

# Update delivery plans without model bookkeeping

The compiled runtime provides a typed progress updater. It reads a selected batch and edits only
its marked checkboxes and evidence arrays. It never runs a check, stages files, commits or accepts
a product requirement. Installed older runtimes retain their existing commands until adoption.

## Prepare one coherent batch

Start with the packaged implementation-plan template. Keep the readable rationale and test cadence.
The `governance-plan` fence gives each batch and implementation, verification and closeout item a
stable ID. A verification item names the actual configured stage and pack IDs, not a guessed command.
Use item prerequisites and batch dependencies to keep unproved downstream work visibly incomplete.

For a separately owned specification, start with the specification template. Declare criteria in
its `governance-spec` fence. Add its repository-relative `docs/**.md` path, definition digest and
in-scope criterion IDs to the plan, then reference those criteria from its items. In 4.1, obtain both
the binding digest and exact observed file digest deterministically:

```sh
project-governance implementation-plan inspect --specification docs/specs/feature.md
```

Without marked commentary, the definition digest remains the whole-file SHA256. Code validates
references and coverage; tests and review still judge whether the behavior meets the requirement.

Put changing commentary or current/next notes inside an explicit region:

```markdown
<!-- governance:notes progress -->
Current/next: the narrow checks passed; complete the declared review.
<!-- /governance:notes progress -->
```

Only the region's contents are excluded from plan/specification definition identity. Its markers,
unmarked rationale, requirements and check declarations stay bound. Each region needs a unique
matching ID; malformed or nested regions and concealed machine declarations refuse. Fenced examples
are literal. Requirements and approvals must never go in notes. Exact file digests, compare-and-swap
updates and native input captures still detect edits; existing check results do not certify new source.

The existing documentation pack checks deliberately structured plans when a plan or bound spec
changes. Older unstructured documents stay exempt. A completed verification records historical
execution, not a promise that every later candidate or release remains qualified.
The reference binds the item and complete specification declarations. If another clone lacks the
original local receipts, the normal documentation check reports historical proof as unavailable.
It still rejects malformed references, changed declarations and conflicting retained originals.
Fresh completion always needs qualifying originals. A required pack that did no applicable work,
including lint with zero checked files, cannot mark verification complete.

## Inspect and record the batch

Bind the selected plan batch when creating or revising the task. Supply both flags together:

```sh
project-governance harness task create --outcome "Repair reconnect" --scope src --plan-path docs/exec-plans/active/feature.md --plan-batch B1
```

The runtime validates the exact batch before writing the task. The reference preserves its normalized
definition digest, so checkbox updates keep the association while requirement changes make it stale.
Replace an existing reference through the normal authorized task revision. A task fork does not
silently inherit this worktree's active plan reference.

For a progress question, every normal prompt packet includes a read-only snapshot from the exact
session and worktree. No wording classifier is needed. To inspect the same facts directly:

```sh
project-governance task-facts --session <exact-session-id>
```

The snapshot separates caller-declared progress, historical checks and acceptance. Blocked or
terminal tasks remain readable without becoming executable. Missing or stale associations stay
explicit; the reader never guesses a sibling task or changes a binding. Required guidance takes
priority when packet space is limited. A repeated delivery of the same native entry replays the
original snapshot; a new turn observes current progress. Moving a plan to the completed directory
requires an explicit task revision replacing its path. A missing plan stays `plan-missing`; no search
guesses its new location. The prompt shows compact original outcomes and defers full historical
check qualification to the explicit reader, keeping progress preparation within the existing operation.

```sh
project-governance implementation-plan inspect --path docs/exec-plans/active/feature.md --batch B1
```

Use the returned exact `plan_digest` in a typed request. This example is an implementation declaration;
it says the caller completed the work, without pretending to independently prove that fact.

```json
{
  "version": 1,
  "expected_digest": "sha256:<exact digest returned by inspection>",
  "batch": "B1",
  "updates": [{"id": "B1.I", "completed": true}]
}
```

```sh
project-governance implementation-plan update --path docs/exec-plans/active/feature.md --request /tmp/feature-progress.json --base-ref HEAD
```

At the planned checkpoint, bind the existing check command to the batch. It runs its normal selected
checks once, then qualifies their original receipt and updates matching verification slots. No new
check loop is introduced.

```sh
project-governance check --stage batch --mode impacted --base-ref HEAD --implementation-plan docs/exec-plans/active/feature.md --batch B1 --summary
```

For a detached run, observe its original run ID, then use the updater with a verification update:
`{"id":"B1.V","completed":true,"run_id":"<original UUID>"}`. The comparison must identify
the actual checked candidate; use `--staged` for staged proof. All-mode and incomplete custom-command
input evidence cannot prove candidate freshness. A compact summary cannot replace native evidence.

## Handle failure without churn

A failed check, changed source/spec/plan, wrong task or stage, missing pack, unresolved cleanup or
conflicting writer leaves the verification box unchanged. Inspect the named batch and original run.
Do not restart checks merely because the progress write failed. Identical update requests are harmless.

Invalidate affected items with `completed:false` and a short `reason`. Include completed dependents
in the same invalidation, preserve their earlier evidence, and repair the owning cause before reproof.
Narrative updates remain authored work. Parsed bookkeeping slots alone can be normalized; changed
requirements and other source bytes remain part of candidate identity.

After a completed, verified batch, update closeout and make the owned local seam commit when
authorized. Keep normal hooks enabled and preserve other writers' work. Git records commit identity;
do not add a second bookkeeping commit merely to record the first.
