---
id: skill.delegated-execution
title: Delegated Execution
stage: Work
provenance: package-default
---

# Delegated Execution

For cross-model assignments, follow the repository's default in
`.governance/runtime/skills/resources/harness-delegation.md` before choosing a system-level wrapper.
Use the supplied `harness-*` skill unless the operator explicitly chooses another route.

Use the smallest team that removes a meaningful delay or uncertainty. Single-writer ownership
does not serialize discovery, analysis, or verification preparation. Use the host's native
delegation, or the optional provider skills, within the operator's and host's actual authority.
Higher-priority restrictions still apply; this skill does not authorize bypassing them.

## Rules

1. The primary remains accountable for planning, integration, and closeout. It may be the writer;
   do not create a separate manager or coding agent merely to fill a role.
2. At batch planning, and when a material blocker or long-running operation creates an opportunity,
   identify independent investigation that can replace necessary work or prevent material rework.
   Delegate when that benefit outweighs briefing and reconciliation. Do not reassess every step.
3. Use one writer and zero to two non-overlapping read-only specialists at a time, including any
   delegated reviewer. Two is a ceiling, not a target. A second reader needs a second independent
   justification. The primary coordinates all active assignments, including native agents outside
   the optional helper. Keep agents idle or finish them when no useful assignment exists.
4. Use the current checkout for every role. Delegation never authorizes another worktree; only a
   direct operator request does. The primary must not edit concurrently with its assigned writer.
5. Give each reader a concrete question, scope, governing references, fixed decisions, file or
   snapshot references, expected output, and the point at which the answer is needed. Include
   necessary constraints and evidence; avoid copying unrelated conversation or forcing rediscovery.
   Name what work the primary or writer will no longer need to repeat. Reuse a compatible existing
   agent when its context remains useful, but refresh changed references before a follow-up.
6. Continue useful work while readers investigate. Return one concise evidence-backed result;
   send an earlier message only for a blocker, material change, or finding that would cause
   avoidable rework. The primary checks findings against their sources and gives the writer one
   prioritized handoff. No peer debate, polling chatter, duplicate searches, or speculative tasks.
7. Readers must not edit project files, stage or commit, change branches or Git state, or run
   builds/tests that mutate shared outputs or interfere with active work. Analyze existing logs
   and proof first. Use external scratch only for authorized analysis artifacts. A command labeled
   a test is not automatically read-only. New shared-state execution belongs to the writer or an
   explicitly coordinated validation checkpoint.
8. Use a commit, unchanged staged snapshot, or identified file contents for evidence. Findings on
   changing files are provisional; reread affected evidence before acting. Never certify the final
   candidate from a reader's earlier inspection. Approval review uses the frozen candidate, and
   any changed input invalidates the affected review claim.
9. Preserve substantial implementation batches, planned test cadence, grouped native rebuilds,
   and batch-level documentation. Investigation does not create an approval gate. Use one
   applicable independent approval review per coherent batch and consume existing valid proof.
   A reader supplies evidence for its question; it need not run a test merely to complete a role.
   One finding permits one focused repair and one affected recheck, not another broad QA cycle.
10. Do not introduce nested delegation, automatic retries, provider cascades, or a second QA wave
    without operator scope. Only the primary dispatches the small team. Use the optional helper's
    explicit writer/shared modes for cooperating jobs; retain exclusive mode when inspection must
    not overlap mutation. Access flags are coordination contracts, not filesystem sandboxes.

## Choose Useful Assignments

Source and contract discovery, requirement coverage, test planning, compatibility analysis, and
diagnosis of existing failures are useful when they answer distinct questions needed by the batch.
For example, while the writer implements a settled API, one reader can identify affected callers
and another can examine an independent platform constraint. Two agents broadly reviewing the same
unfinished patch are usually duplicated work.

Choose roles before models. Use a faster, less expensive model for bounded discovery only when it
can reliably perform that assignment; use sufficient reasoning capability for complex risk and
verification questions. Follow explicit operator and host model/effort choices. Do not hard-code
brands, silently substitute models, or presume that cheaper tokens mean lower total token use.
Different evidence and questions matter more than superficial role names or model variety.

## Cost Discipline

Readers should replace work, not add another complete pass over it. End assignments when their
question is answered, retain usable evidence, and avoid repeated context transfer. Reconcile at
meaningful work boundaries instead of continuously supervising progress.
Use existing batch evidence for available elapsed time, all-agent token use, and rework. Do not
invent a solo baseline or add per-step accounting. A small matched evaluation may compare zero,
one, and two readers at equal acceptance quality. The initial target is less than 25% median total
token premium with meaningful speed improvement; this is a calibration target, not a measured
guarantee, hard runtime cutoff, or research-established optimum. Count cached input, output, and
reasoning according to the provider's accounting without double-counting; keep dollars separate
and leave missing usage unknown.

## Evidence

At batch closeout, report the roles used, their scopes, the integrated subject, useful evidence,
unresolved findings, and any operator-authorized worktree path plus whether it was
retained or removed. Use the existing plan and evidence summary, not a new delegation ledger.
