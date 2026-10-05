---
id: exec-plan.<slug>
title: <Title>
type: exec-plan
status: active
owner: <owner>
created: YYYY-MM-DD
updated: YYYY-MM-DD
summary: <One-sentence final state.>
---

# <Title>

## Final State

<Observable outcome and explicit non-goals.>

## Delivery

- Delivery: local-only | PR <url> | merged <sha>

## Machine Declaration

Use this structure for a new plan. Replace the example stage/pack with its actual configured owner.
Bind applicable specification criteria to their captured full-file digest; an empty specification
list is valid only when this plan has no separately declared specification scope. Keep explanatory
prose below. IDs remain stable when wording changes. The runtime validates these declarations through
the normal documentation pack; the declaration does not prove semantic acceptance.

```governance-plan
{
  "version": 1,
  "specifications": [],
  "batches": [{
    "id": "B1", "depends_on": [],
    "items": [
      {"id": "B1.I", "kind": "implementation"},
      {"id": "B1.V", "kind": "verification", "requires": ["B1.I"], "check": {"stage": "batch", "packs": ["project-focused-check"]}},
      {"id": "B1.C", "kind": "closeout", "requires": ["B1.I", "B1.V"]}
    ]
  }]
}
```

## Batch <N>: <Observable outcome>

Size the batch to deliver a meaningful outcome while remaining easy to review and diagnose.
Combine tightly related steps when splitting them would repeat setup, context, builds, or QA.
Split unrelated outcomes or work whose uncertainty, dependencies, or failure modes make one batch
hard to assess. Use engineering judgment rather than a fixed file, line, or time quota.

The planning agent sets the default test cadence below. Finish the planned behavior and its related
source, binding and regression work before the default check point. A helper, file or internal step
finishing does not trigger tests or QA. Run earlier only for a named blocking uncertainty, focused
defect reproducer, failed proof or new risk; record the reason in this plan. Required hooks remain
effective. Follow `docs/governance/validation-strategy.md` for scope, repeats and broad-proof rules.

- Depends on: <batch IDs or none>
- Ownership: <related components and affected bindings; one writer in this repository>
- Execution: sequential | parallel with <batch IDs>
- Parallel support: <zero to two bounded read-only assignments, expected outputs and needed-by points; or a brief solo rationale>
- Semantic contract: settled | unresolved
- Fixed decisions: <facts workers must not revisit>
- Acceptance: <observable completion claims>
- Development checkpoints: <fill the focused execution table below; default to batch completion>
- Build and integration point: <when shared changes are ready for expensive or host proof>
- Review boundary: <completed claims and prerequisite results for one applicable independent QA review; consume existing evidence>
- Proof budget: <cheapest sufficient evidence, expected cost if known, and repeat reasons>
- Invalidates prior proof when: <relevant source, dependencies, config, toolchain, binary, environment, or expiry changes>
- Proof state: <claim/check, not-run | passed on input/snapshot | failed | invalidated by reason, and existing evidence reference>
- Split early or stop when: <unresolved contract, material risk, reviewability, or authority boundary>
- Documentation: <plan checkboxes at every seam; consolidate explanatory docs at closeout; earlier contracts needed by dependent work>
- Acceptance milestone: <when attended user testing is needed, if applicable>

| Trigger | Exact command or runbook | Affected scope and claim | Rerun only when |
| --- | --- | --- | --- |
| <batch complete, or named dependency/risk requiring earlier feedback> | <runnable command or exact existing procedure> | <owner and affected dependents; input identity and behavior proved> | <failed result or relevant invalidation> |

Use the plan's existing steps as checkboxes; the compact defaults below can cover a small batch.
Keep implementation and proof distinct. At each completed batch, checkpoint, material blocker or
handoff, update boxes and current/next action before dependent work. Leave unproved claims unchecked;
mark failed/invalidated evidence without deleting prior results. An abrupt interruption is reconciled
on resume. Checkbox updates do not trigger another check or QA round.

<!-- governance:item B1.I -->
- [ ] Implement <the batch behavior, related bindings and regression cases>.
<!-- governance:evidence B1.I -->[]<!-- /governance:evidence -->
<!-- governance:item B1.V -->
- [ ] Verify <declared claims using the checkpoints above; retain evidence references and limits>.
<!-- governance:evidence B1.V -->[]<!-- /governance:evidence -->
<!-- governance:item B1.C -->
- [ ] Prepare closeout <required review and documentation ready for commit>.
<!-- governance:evidence B1.C -->[]<!-- /governance:evidence -->

Read one batch with `project-governance implementation-plan inspect --path <plan> --batch B1`.
Record explicit implementation completion with the typed updater. The declared check command can
record verification automatically using `--implementation-plan <plan> --batch B1`, after native
completion. Otherwise pass its original run ID to the updater. Do not flip verification boxes from
a summary or model judgment. Retain failed/invalidated proof, and leave product acceptance to its owner.

Current/next: <next action; blocker or deferred work if any>.

Commit each completed, verified batch with its plan update when local commits are authorized.
Inspect staged ownership and keep normal hooks enabled. A pause or failed checkpoint may retain
uncommitted work with its reason recorded. Git and existing command evidence record commit success
and identity; do not add a second bookkeeping commit to record the first. Remote publication retains
its own authorization.

Use existing logs for command results. At closeout, include useful cost observations already
available from those records; leave missing metrics unknown. No per-step reporting is required.
For long-running proof, include command/prerequisites, wait strategy, estimate versus explicit
deadline, and evidence location within the proof budget, preferably by runbook reference. Follow
`.governance/runtime/skills/resources/efficient-execution.md`; do not add another checklist.
Parallel support should replace investigation the primary or writer would otherwise perform.
Each reader needs a distinct question and enough context to answer it without repeating discovery.
Follow the installed delegated-execution skill; parallel batches do not authorize another writer.

## Stable-Candidate Proof

<On the completed batch, retain valid development proof, close the declared integration gaps, and
run one branch-aware impacted pre-push sign-off on the frozen candidate, counting an invoked hook
as that sign-off. QA consumes this evidence instead of replaying it. Repair and recheck affected
owners; repeat broader proof only for relevant invalidation or a named required coverage gap.>

## Rollback

<Authority-order rollback without compatibility shims.>
