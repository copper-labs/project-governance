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

## Batch <N>: <Observable outcome>

Size the batch to deliver a meaningful outcome while remaining easy to review and diagnose.
Combine tightly related steps when splitting them would repeat setup, context, builds, or QA.
Split unrelated outcomes or work whose uncertainty, dependencies, or failure modes make one batch
hard to assess. Use engineering judgment rather than a fixed file, line, or time quota.

The planning agent sets the default test cadence below: name what runs, when it runs, and the claim
it proves. Choose checkpoints by dependency and risk. The writer may adjust them for new evidence;
completing an internal step does not automatically trigger QA or documentation updates.

- Depends on: <batch IDs or none>
- Ownership: <related components and affected bindings; non-overlapping writers>
- Execution: sequential | parallel with <batch IDs>
- Semantic contract: settled | unresolved
- Fixed decisions: <facts workers must not revisit>
- Acceptance: <observable completion claims>
- Development checkpoints: <when focused tests run and what they prove>
- Build and integration point: <when shared changes are ready for expensive or host proof>
- Review boundary: <completed claims for one applicable independent QA review>
- Proof budget: <cheapest sufficient evidence, expected cost if known, and repeat reasons>
- Invalidates prior proof when: <relevant source, dependencies, config, toolchain, binary, environment, or expiry changes>
- Proof state: not-run | passed on <snapshot> | invalidated by <reason>
- Split early or stop when: <unresolved contract, material risk, reviewability, or authority boundary>
- Documentation: <consolidate at batch closeout; earlier contracts needed by dependent work>
- Acceptance milestone: <when attended user testing is needed, if applicable>

Use existing logs for command results. At closeout, include useful cost observations already
available from those records; leave missing metrics unknown. No per-step reporting is required.

## Stable-Candidate Proof

<On the completed batch, retain valid development proof, close the declared integration gaps, and
run one branch-aware impacted pre-push sign-off on the frozen candidate. QA consumes this evidence
instead of replaying it.>

## Rollback

<Authority-order rollback without compatibility shims.>
