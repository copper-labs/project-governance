---
id: skill.review
title: Review
stage: Review
provenance: package-default
---

# Review

Run a dedicated QA/review pass with a shared finding schema.

## Trigger

Use this skill before handoff for substantial architecture, policy, source, security, release,
authoring, or migration changes.

## Required Reads

- `AGENTS.md`
- `docs/index.md`
- `.governance/runtime/skills/catalog.yaml`
- `.governance/runtime/skills/review-finding.schema.yaml`
- The changed diff or artifact under review
- `.governance/runtime/skills/resources/efficient-execution.md` when the batch used long-running commands
- `.governance/runtime/skills/test-execution/SKILL.md` when assessing the batch's proof choice, results, and cleanup; reuse its existing receipts

## Workflow

1. Select the smallest sufficient review skill from the catalog and run one review pass. Use an
   explicitly assigned model when the operator names one; otherwise reuse the current primary in a
   dedicated clean pass.
   A repeated failure returns to the owning check or operator; there is no automatic model ladder.
2. Provide the review pass with scope, governing artifacts, integrated snapshot identity, validation
   results, and exact questions.
   Within this same pass, reread the governing PRD, spec, or original request and approved
   clarifications. Check every in-scope requirement against the finished behavior and existing
   evidence, not just the diff. When both PRD and spec apply, check that both are satisfied and flag
   omissions or contradictions between them. If neither exists, use the original request; no new
   document is required. Report missing behavior separately from unproven claims. Do not weaken
   requirements to match the implementation or add another review cycle for this comparison.
3. Require findings to use the shared severity, location, risk, and recommendation fields.
4. Keep review separate from implementation: inspect the stable candidate first, report findings,
   and prevent silent fixes. A delegated QA reviewer is a separate host-native assignment;
   otherwise the primary performs the dedicated pass.
   Earlier read-only investigation is provisional advice, not approval. Reuse valid evidence from
   it, but assess the frozen candidate independently; changed inputs invalidate affected claims.
   A delegated reviewer counts within the two-reader ceiling, not as an additional permanent role.
5. Reconcile high and medium findings with code, docs, tests, or a recorded rationale, then recheck
   only the affected claim unless the patch invalidated broader evidence. Allow one primary-owned
   repair and one affected recheck. A failed recheck returns to focused diagnosis or the operator;
   it does not start a fresh general review, verifier, or broad-proof cycle.
6. When the source repository provides a review preflight, run it against the exact staged
   candidate before closing the review. Reconcile fingerprint-bound baseline and cohesion records
   at this point, before broad validation or the commit hook.
7. Reuse exact subject-valid evidence. After one complete proof cycle, require a recorded reason
   before repeating an equivalent gate.
   Within this pass, use available execution records to assess efficient-execution compliance.
   Report concrete exceptions or unknowns; do not add a separate audit or rerun work to reconstruct
   missing observations.
8. Keep provider adapters as launch pointers only.

## Validation

Consume the candidate's existing subject-valid validation before review. Run one relevant pack
only for a named uncovered claim. For review-skill changes, use template validation as that focused
proof and ensure provider adapters remain thin.

## Evidence

Report the review model/resource, prompt role, findings by severity, reconciliations, recheck
status, and residual risk.
Include a concise requirements conclusion with governing source references, supporting evidence,
and gaps or explicitly approved exceptions. A requirement matrix is optional for simple work.
