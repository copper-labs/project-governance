---
id: plan.harness.step-2
title: Step 2 - Assistance Inside The Host
type: exec-plan
status: draft
owner: project-harness
created: 2026-09-19
updated: 2026-09-19
summary: One deterministic context and execution tool, a task brief, and receipts, compared against the current workflow with no model in the loop.
---

> Child of [the master plan](../README.md).

# Step 2 - Assistance Inside The Host

## Final State

A tool the operator calls from inside Codex that holds what the task is, assembles bounded context,
runs work within declared authority, and returns a receipt. No decision model anywhere. Normal
investigation stays available throughout.

**Non-goals:** a classifier, worker dispatch, a second host, a second ecosystem, verdict reuse,
lane reordering.

**The harness writes nothing to a working tree in this step.** Its Actions read, run declared
checks, and record. The host performs every edit, exactly as it does today. Patch application and
its recovery machinery are Pass C.

## Delivery

- Delivery: local-only

## Batch 1: Repository bootstrap and the file store

- Depends on: Step 1
- Ownership: repository scaffolding and the store; one writer
- Execution: sequential
- Parallel support: solo
- Semantic contract: settled by [State Store](../../specs/operational-store.md)
- Model class: difficult-implementation (gpt-5.6-luna, xhigh; source: default table)
- Fixed decisions: TypeScript on Node; charter, agent instructions and governance adoption land
  here; files only; execution state durable before an action, analytics best-effort; the store
  provides a compare-and-set honoring an expected revision
- Acceptance: with the store disabled ordinary checks still run and no state-changing action does;
  a write failure injected before an action, followed by restart, leaves it neither duplicated nor
  stripped of accounting; corrupted execution state stops rather than being read as "nothing happened"
- Development checkpoints: focused tests per operation, including the compare-and-set race
- Build and integration point: none
- Review boundary: the store interface and the execution-state boundary
- Proof budget: focused tests only
- Invalidates prior proof when: the record shape changes
- Proof state: not-run
- Split early or stop when: safe transition ownership needs something the interface cannot express
- Documentation: update the spec if the interface moves
- Acceptance milestone: none

## Batch 2: The task brief and action authority

- Depends on: Batch 1
- Ownership: brief and authority; one writer
- Execution: sequential
- Parallel support: solo; these two contracts are the safety boundary and belong to one author
- Semantic contract: settled by [Task Brief](../../specs/task.md) and
  [Action Authority](../../specs/action.md)
- Model class: deep-reasoning (gpt-5.6-sol, high; source: default table) because a gap here becomes
  an unauthorized effect everywhere downstream
- Fixed decisions: briefs are versioned and never edited in place; operator instruction, observed
  fact and worker hypothesis stay distinct; scope comes from the brief and policy, never a packet;
  every effect declares operation, scope, destination and policy revision; evidence is never
  instruction
- Acceptance: an investigate-only brief refuses a write **at the action boundary**, not in prose;
  an out-of-scope write and an undeclared provider upload are both refused through existing host
  controls; a path escaping scope by traversal or symlink is refused after resolution; a tool output
  claiming approval changes nothing
- Development checkpoints: focused tests per refusal path
- Build and integration point: real use against one repository
- Review boundary: the refusal paths, exercised rather than reasoned about
- Proof budget: focused tests plus one real read-only task through a broadly capable host
- Invalidates prior proof when: policy shape or host controls change
- Proof state: not-run
- Split early or stop when: a refusal cannot be enforced at the boundary and would rely on
  instructions alone
- Documentation: consolidate at batch closeout
- Acceptance milestone: operator confirms the read-only refusal in their own host

## Batch 3: Context assembly, execution and receipts

- Depends on: Batch 2
- Ownership: packet assembly, execution seam, receipts; one writer
- Execution: sequential
- Parallel support: one bounded read-only assignment establishing what good context looks like for
  a sample of past tasks, needed as the comparison baseline
- Semantic contract: settled by [Context Packet](../../specs/artifact.md)
- Model class: ambiguous-integration (gpt-5.6-terra, high; source: default table)
- Fixed decisions: the subject-to-materialization bridge is built here and its absence is a
  blocker, not an assumption; mandatory items are never dropped by narrowing or budget; the existing
  execution owner provides resource claims and cleanup; a provenance-labelled handoff note may be
  carried as content
- Acceptance: staged and worktree bytes made to differ prove which the packet carried; mandatory
  overflow returns a blocker; a clean checkout with no diff routes by declared target; a receipt
  names the claim checked, the subject, and any obligation left open
- Development checkpoints: determinism and budget tests on change
- Build and integration point: real tasks in the TypeScript adopter
- Review boundary: packets and receipts against the hand-built baseline
- Proof budget: the baseline sample plus real use
- Invalidates prior proof when: candidate generation, budgets or the bridge change
- Proof state: not-run
- Split early or stop when: the governance runtime exposes no supported path to subject-bound
  materialization, in which case the seam is proposed upstream rather than worked around
- Documentation: consolidate at batch closeout
- Acceptance milestone: none

## Batch 4: Compare against the current workflow

- Depends on: Batch 3
- Ownership: the comparison; one writer
- Execution: sequential
- Parallel support: solo
- Semantic contract: settled
- Model class: diagnosis-review (gpt-5.6-sol, medium; source: default table)
- Fixed decisions: the measure is accepted work, not tool usage; the comparison uses Step 1's sample
  and its cost account as the baseline
- Acceptance: accepted task results, later-detected defects, rework, human intervention, elapsed
  time and total context consumed, each against the current workflow; a clear statement of whether
  the tool pays for itself with no model involved
- Development checkpoints: an interim read before the sample is exhausted
- Build and integration point: real tasks
- Review boundary: the comparison and its recommendation
- Proof budget: the existing sample; no new corpus
- Invalidates prior proof when: the tool or the workflow changes materially
- Proof state: not-run
- Split early or stop when: the tool does not pay for itself, which stops the sequence here and is
  a useful result
- Documentation: the comparison is durable
- Acceptance milestone: operator review before Step 3

## Stable-Candidate Proof

Retain the focused store, authority and packet tests, close the declared bridge gaps, and run one
branch-aware impacted sign-off on the frozen candidate.

## Rollback

Remove the marked adapter section. The host returns to working exactly as it does today; records
remain inert.
