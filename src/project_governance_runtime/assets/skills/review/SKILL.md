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
- `.governance/runtime/skills/resources/peer-dispatch.yaml`
- `.governance/runtime/skills/resources/execution-roles.yaml` when review is delegated
- The changed diff or artifact under review

## Workflow

1. Select the smallest sufficient lens set and one review pass. Use an explicitly assigned model
   when the operator names one; otherwise reuse the current primary in a dedicated clean pass.
   For a repeated-failure second opinion, inspect the owning check first and follow
   `repeated_failure_consultation` in the peer-dispatch resource. Stop after the first conclusive
   response; do not skip a ladder step or escalate to max automatically.
2. Provide the review pass with scope, governing artifacts, integrated snapshot identity, validation
   results, and exact questions.
3. Require findings to use the shared severity, location, risk, and recommendation fields.
4. Keep review separate from implementation: inspect the stable candidate first, report findings,
   and prevent silent fixes. A delegated QA reviewer is a separate assurance wave with its own
   explicit operator start; otherwise the primary performs the dedicated pass.
5. Reconcile high and medium findings with code, docs, tests, or a recorded rationale, then recheck
   only the affected claim unless the patch invalidated broader evidence. Allow one primary-owned
   repair and one affected recheck. A failed recheck returns to focused diagnosis or the operator;
   it does not start a fresh general review, verifier, or broad-proof cycle.
6. When the source repository provides a review preflight, run it against the exact staged
   candidate before closing the review. Reconcile fingerprint-bound baseline and cohesion records
   at this point, before broad validation or the commit hook.
7. Reuse exact subject-valid evidence. After one complete proof cycle, require a recorded reason
   before repeating an equivalent gate.
8. Keep provider adapters as launch pointers only.

## Validation

Run the relevant validation packs before review when practical. For review-skill changes, run
template validation and ensure provider adapters remain thin.

## Evidence

Report the review model/resource, prompt role, findings by severity, reconciliations, recheck
status, and residual risk.
