---
id: skill.delegated-execution
title: Delegated Execution
stage: Plan
provenance: package-default
---

# Delegated Execution

Select and operate a safe implementation topology without changing governance semantics between
agent providers.

## Trigger

Use this skill only when the operator explicitly asks to use `delegation`, says `Delegate this
task`, or makes an equivalent direct request. `Use delegation for this task` is the standard short
trigger. Skip it otherwise, including for a trivial direct edit.

## Target Inputs

- Read the target's `AGENTS.md`, governing artifact, and execution plan when present.
- Read `.governance/runtime/skills/resources/execution-roles.yaml` only when a specialist obligation
  is selected. Other target delegation policy is optional target input.

## Workflow

1. Classify scope, uncertainty, separability, validation cost, impact, and write-conflict risk from
   repository evidence. Classify build/artifact behavior impact separately; validation cost alone
   is not build-verifier evidence.
2. Treat the semantic contract as unsettled when implementation can still discover or redefine
   shared behavior, wire tokens, failure states, platform boundaries, safety or privacy rules, or
   proof obligations. Keep that work with the primary for one consolidated architecture pass.
   Route already-decided multiplatform synthesis to balanced; use economy only after those semantics
   are settled and the remaining component or platform work is mechanical and independently proved.
3. Choose the smallest safe topology from those signals. Across active waves, one repository may
   contain at most one writer and two read-only specialists with non-overlapping scopes.
4. If the result is `solo`, keep the coordinator as writer and do not load the role catalog or
   delegation policy merely to confirm that no role was selected. Record the result in the plan.
5. If the result is non-solo, read the role catalog, verify each specialist obligation, and remove
   any role that does not have one.
6. Record the obligation, role, non-overlapping scope, implementation owner, capability tier,
   packet readiness, fallback, and any override in the implementation-plan slice.
7. Create only the selected role work packets. Resolve the smallest useful context packet, retain
   its identity in the host envelope, and project only the compact worker brief plus selected
   materialized context to the specialist.
8. Treat the operator's explicit governed-delegation request as authority for one exact launch wave.
   Handle the internal route and start commands without asking the operator to prepare JSON. Do not
   add writers, nested delegation, automatic specialist retries, or provider cascades.
9. Integrate results through the primary. Reject stale, scope-expanded, digest-mismatched, or
   unidentified output.
10. Rebaseline immediately when a clean integration snapshot advances. Retain exact subject-valid
   evidence and discard stale integration mechanics.
11. Run deterministic build commands under the harness. A selected post-integration QA review is a
    separate optional assurance wave with its own explicit start.
12. Fix or explicitly close high and medium findings and recheck only the affected evidence unless
    the patch invalidated a broader claim.
13. Stop when the plan's proof budget and stop condition are satisfied. Require a recorded reason
    before repeating an equivalent passed gate.
14. If specialist dispatch is unavailable or returns `needs_primary_decision`, let the primary
   execute the remaining work solo without another dispatch or authorization prompt.

## Validation

Run the validation packs selected by the governing plan against the integrated snapshot. Use a
target's optional context-size tooling only when relevant; it is not a hook or continuous economics
gate.

## Evidence

Report the selected tier, active roles, writer count, integration evidence, context packet digest,
verified snapshot, build results, QA findings and reconciliations, and residual risk.
