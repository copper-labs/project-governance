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

## Execution Rules

- The operator explicitly starts each delegated launch wave.
- Across active waves, one repository contains at most one writer and two read-only specialists.
- Ordinary specialist failure returns work to the primary without automatic re-dispatch.
- Native-host launches use the governed route, start, and finish lifecycle.
- One QA repair permits one affected recheck, not another general review or broad proof.

## Slice <N>: <Outcome>

- Depends on: <slice IDs or none>
- Ownership: <one component or non-overlapping path set>
- Execution: sequential | parallel with <slice IDs>
- Semantic contract: settled | unresolved
- Required capability: economy | balanced | primary
- Fixed decisions: <facts workers must not revisit>
- Acceptance: <observable completion claims>
- Focused proof: <cheapest sufficient commands or inspection>
- Invalidates prior proof when: <named subject or claim changes>
- Proof state: not-run | passed on <snapshot> | invalidated by <reason>
- Escalate or stop when: <bounded conditions>
- Packet ready: yes | no

## Stable-Candidate Proof

<Run once on the frozen candidate: focused owner proof, one directly affected seam only when the
change crosses it, and one branch-aware impacted pre-push sign-off. QA consumes this evidence
instead of replaying it.>

## Rollback

<Authority-order rollback without compatibility shims.>
