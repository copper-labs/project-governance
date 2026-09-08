---
id: exec-plan.evidence-first-efficiency
title: Diagnose Repeated Work Before Adding Controls
type: exec-plan
status: completed
owner: project-governance
created: 2026-09-07
updated: 2026-09-07
summary: Expose bounded repeated-run examples on demand and make evidence-led simplicity a project design principle.
---

# Diagnose Repeated Work Before Adding Controls

## Final State

The existing telemetry status view supplies concrete run pairs for diagnosis. Normal execution
does not consult history, skip checks, retry, or emit extra events. A compact charter principle
asks future changes to earn their operational and maintenance cost.

## Delivery

- Delivery: source implementation, focused proof, and independent review complete. The operator
  authorized patch release 2.6.1; candidate CI and immutable publication remain the delivery gates.
  No adopter mutation is included.

## Batch 1: Useful Diagnosis With No New Execution Control

- Depends on: none
- Ownership: primary writer; telemetry projection, owning specification, work guidance, charter.
- Execution: sequential
- Parallel support: solo implementation of one small owner; independent review at the frozen batch.
- Semantic contract: settled
- Fixed decisions: existing bounded records only, no schema change, cache, retry engine, new hook,
  mandatory batch contract, model call, or lookup in normal check execution.
- Acceptance: at most five repeated-run pairs, grouped by known runtime version, stage, trigger,
  mode, scope and subject; outcomes and run references remain observations, never proof of reuse.
  Missing identities and explicitly labeled tests do not produce diagnostic pairs. Existing filters
  apply before pairing. Every selected repeated group retains its latest pair; the view prioritizes
  the longest observed repeated executions. Unknown durations remain unknown.
- Development checkpoints: focused telemetry tests for identity isolation, bounds, filtering,
  privacy, and non-mutation; CLI fixture for the directly affected reporting seam.
- Build and integration point: no native build; existing skill-payload checks cover delivered guidance.
- Review boundary: one independent review of the completed diff and focused evidence.
- Proof budget: one focused owner suite, affected skill payload suite, and source impacted check;
  measure on-demand status against the parent implementation on the same bounded fixture.
- Invalidates prior proof when: grouping, filtering, projection, or delivered guidance changes.
- Proof state: 18 telemetry tests and seven skill-payload tests passed, including the CLI seam;
  independent review found no actionable findings and impacted source validation passed.
- Split early or stop when: diagnosis requires a new collector or intercepting arbitrary commands.
- Documentation: owning contract, validation strategy, charter and plan closeout together.
- Acceptance milestone: explain what is implemented versus the future field comparison.

## Field Evaluation

Use existing traces from representative completed tasks to distinguish unavailable prior evidence,
mechanical hook duplication, and overly frequent agent review decisions. Compare one intervention
at a time with the current behavior at equal acceptance quality. Preserve actual defects, rework,
elapsed time, and available all-agent token use. Do not infer command savings from repeat pairs or
require every batch to run an experiment. Direct commands outside the runtime remain unobserved.

## Rollback

Remove the diagnostic projection if its usefulness does not justify its cost. No persisted schema,
execution behavior, or adopter integration needs migration.

## Local Closeout

The diagnostic projection adds 43 lines to the existing telemetry module. It runs only on an
explicit status request and reuses the already-loaded bounded records. Collection, record schema,
normal checks, retries, and command routing are unchanged. Shared work guidance points to this
view when diagnosing reported repetition, not before every execution. The charter owns the
project-wide simplicity principle, with one short entry-point reminder in AGENTS.md.

A local comparison used the same 1,000-record fixture and 30 alternating trials per implementation.
Median status time was 10.652 ms for the parent implementation and 12.366 ms for the candidate.
The fixture was unchanged after inspection. This measures the on-demand report only; it neither
establishes field benefit nor claims token or delivery-time savings. Field diagnosis and a matched
behavioral comparison remain the next evidence boundary before proposing execution controls.

The design follows targeted trace analysis and removal of unnecessary structure described in
[Anthropic's harness study](https://www.anthropic.com/engineering/harness-design-long-running-apps)
and [LangChain's harness experiments](https://www.langchain.com/blog/improving-deep-agents-with-harness-engineering).
Neither establishes an ideal cadence for this project. Existing build systems remain responsible
for valid reuse; the diagnostic output provides observations rather than an additional authority.
