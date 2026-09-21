---
id: review.next-rc-experiments-reconciliation
title: Next RC Experiments Review Reconciliation
type: review
status: completed
owner: project-governance
created: 2026-09-21
updated: 2026-09-21
summary: Source-checked reconciliation of Claude Opus 5 extra-high review of attention, diagnostic and history experiments.
---

# Next RC experiments review reconciliation

## Scope and evidence

The operator requested a detailed specification and implementation plan, Claude Opus 5 at extra-high
effort, reconciliation, then simplification. The reviewed documents are the
[experiment specification](../specs/engine-decision-experiments.md), the
[N0–N6 delivery batch](../exec-plans/active/2026-09-21-major-adoption-and-measurement.md#next-rc-experiment-batch)
and their shared decision/consumer contracts. No runtime implementation is included in this change.

The reviewer used `claude-opus-5`, effort `xhigh`, with fallback disabled and read-only permissions.
The wrapper audit confirms successful completion and no repository edits by the reviewer. Raw review,
audit, prompts and validation receipts are retained in the external review packet. Review claims were
checked against the source owners; agreement alone does not establish correctness.

## Design decisions after review

1. **History and read-only diagnostic execution precede attention observation.** The current worker
   already handles structured stage events. DL06 ships shadow/advice only, without a new delivery
   effect or queue. Actual residual ambiguous traffic is required before live routing is proposed.
2. **Each probe has its own authorized action.** A bounded manifest carries full reviewed recipes
   and host-approved bindings. The parent action cannot be rebound. The diagnostic command selects
   existing authority; it cannot create authority from a model answer.
3. **The baseline has a real writer.** An explicitly assigned caller records an episode even when
   the provider or consumer is off. The report can retain failures, missing capture and zero calls.
4. **Keep a small transactional diagnostic reservation.** Child uniqueness alone cannot enforce
   the shared three-probe bound under concurrent coordinators. Accept an explicit schema-3 migration,
   older-reader refusal and forward repair after writes rather than pretending rollback is free.
5. **Reuse existing native decision aggregates.** One reviewer finding missed the already implemented
   version-2 pilot summary. No replacement collector is planned.

These are implementation choices within the requested scope. No new user permission is needed to
author them. Publication, device work and host activation retain their existing separate boundaries.

## Finding disposition

| Finding | Disposition and source-based resolution |
| --- | --- |
| EXP-01 | Accepted. Enumerated current event kinds; N0 measures the residual after code filtering. No residual means no inference. |
| EXP-02 | Accepted. Named the existing observation boundary after `workflowWaitCommand`; next RC is shadow/advice only. No speculative push adapter. |
| EXP-03 | Accepted. `WorkflowStore.authorizeWorkflow` binds one exact workflow per action. Host prepares a distinct local-check action and binding for each candidate before diagnosis. |
| EXP-04 | Accepted. `workflow-catalog.ts` resolves operations, not recipe inventory. Defined an engine-owned, digest-bound manifest of at most eight full recipes with host-approved bindings. |
| EXP-05 | Accepted. N1 adds an assignment-aware episode writer before off early returns in workflow observation and diagnosis. V2 reports join empty decision lists to those artifacts. |
| EXP-06 | Accepted with narrower repair. Freeze the existing 16-call/131072-byte allowance in both arms; cap diagnostic selections at three and attention calls at one per run. Count exhausted/partial cases; no new budget allocator. |
| EXP-07 | Accepted. Specify atomic schema 1/2 to 3 migration, old-binary refusal, reader draining and post-write forward repair. Copied-ledger proof protects adopter history. |
| EXP-08 | Accepted. Add diagnostic write admission and argument-sensitive admission for classification-enabled telemetry; ordinary reports remain read-only. |
| EXP-09 | Accepted with shadow clarification. Only explicit diagnostic entry with `choose-read` may instantiate `/2`; advice profiles cannot. Auto can execute; shadow scores that same question but executes only the baseline. Caller enforcement is required. |
| EXP-10 | Rejected as factually incorrect. `decisionTelemetry` already returns `pilot: decisionPilotTelemetry(...)`; that helper opens `decisions/`, validates version 2 and counts reasons/reservations. Reuse it and add episode joins only. |
| EXP-11 | Resolved by scope. No live timing change in this RC; native wait/status semantics remain. A future promotion must explicitly revise the timing contract. |
| EXP-12 | Accepted. The future wait boundary is capped at the existing 30000 ms; longer suppression is not implicitly available. |
| EXP-13 | Simplified. DL12 supports only advice/report behavior in this slice, matching the shared omitted default. No observe/advice alias pair. |
| EXP-14 | Accepted. New consumer profile keys are unreadable by the old RC; document profile and ledger downgrade limits and test them. |
| EXP-15 | Clarified. Only genuine input/question changes justify a new declared analysis revision. Exhaustion, timeout or rerun does not refill the scope. |
| EXP-16 | Accepted. A blocked submitted probe consumes a slot and stops the episode. |
| EXP-17 | Accepted. Persist an absolute deadline before dispatch; resume does not renew it. Clamp child deadlines, settle on expiry and preserve cleanup ownership through any overrun. |
| EXP-18 | Accepted. Deduplicate native costs report-wide by command request/check result digest; preserve links without summing children twice. |
| EXP-19 | Accepted. Measure execution and returned probe evidence without another orchestration turn; advisory probe selection already exists. |
| EXP-20 | Accepted. Pin the adopter-owned baseline runbook digest in the external pilot record. |
| EXP-21 | Accepted and simplified. The existing v2 outcomes manifest carries an analysis block; add cancellation wiring, not another scope-flag family. |
| EXP-22 | Accepted. Missing host usage/timestamps make avoided-turn or delay claims inconclusive. This RC measures attention reach/quality only. |
| EXP-23 | Superseded by scope. Do not add `route-attention` to the effect vocabulary until a live caller is qualified. |
| EXP-24 | Accepted. Updated catalog rows for advisory `/1`, executable `/2` and attention observation. |
| EXP-25 | Accepted. Old readers cannot read v2 manifests; both comparison arms use the same new RC. Keep v1 reading intact. |

## Focused recheck and closure

Claude Opus 5/xhigh completed a second read-only pass with fallback disabled. The audit again
records success and no repository edits. It confirmed the initial repairs and upheld rejection of
EXP-10. Its verdict was conditional closure after four specific contract clarifications, with no
further review requested. The author applied and source-checked each closure condition:

| Recheck item | Final clarification |
| --- | --- |
| N-1 | Stamp schema 3 on the first diagnostic episode/reservation write, not ordinary store open. Preserve 3 on later opens; old binaries refuse it. Existing generation write markers remain independent rollback constraints. |
| N-2 | Register entry kinds on asks/receipts/episodes and enforce entry/question/effect compatibility before transport. Advisory observation remains advice under a choose-read profile; diagnostic `/2` cannot masquerade as observation. Distinguish configured, applicable and delivered effects. |
| N-3 | Use one fixed run/question event ID through existing SQLite reservation deduplication. Only the first eligible attention observation can spend; later changed excerpts are counted as unassessed. Remove the unused attention-cursor requirement. |
| N-4 | Derive the fixed analysis task and content/question/model-bound revision in code; reject caller-minted identities. Close reserved scopes on terminal reports, reuse retained receipts and preserve crash-resume accounting. |

Minor notes were also incorporated: give episode capture its own failure status outside the broad
advice catch; use the shared argument parser for write admission; reuse `durableJson`. A deadline
clamp is an execution limit, not a mutation of the host-approved recipe digest.

The design review is closed after these specified edits. This is not a claim that Claude reviewed
an implementation or that the final edits received an additional model pass. Runtime behavior and
performance remain unproved until the plan's implementation checkpoints execute.

## Final simplification pass

The [simplification record](2026-09-21-next-rc-experiments-simplification.md) distinguishes applied
choices, retained flexibility and later candidates. It preserves the three experiments while
avoiding unqualified live attention infrastructure, duplicate reporting and a general workflow engine.
