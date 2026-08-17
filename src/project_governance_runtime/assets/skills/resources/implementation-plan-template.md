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

## Slice <N>: <Outcome>

- Depends on: <slice IDs or none>
- Ownership: <one component or non-overlapping path set>
- Execution: sequential | parallel with <slice IDs>
- Semantic contract: settled | unresolved
- Required capability: economy | balanced | primary
- Fixed decisions: <facts workers must not revisit>
- Acceptance: <observable completion claims>
- Focused proof: <cheapest sufficient commands or inspection>
- Escalate or stop when: <bounded conditions>
- Packet ready: yes | no

## Stable-Candidate Proof

<One impacted pre-commit boundary, one impacted pre-PR boundary, and any risk-selected proof.>

## Rollback

<Authority-order rollback without compatibility shims.>
