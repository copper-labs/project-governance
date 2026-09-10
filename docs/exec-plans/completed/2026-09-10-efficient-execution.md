---
id: exec-plan.efficient-execution
title: Supervise Long-Running Proof With Less Repeated Work
type: exec-plan
status: completed
owner: project-governance
created: 2026-09-10
updated: 2026-09-10
summary: Close missing agent guidance for waiting, process recovery, and compact diagnostic output.
---

# Supervise Long-Running Proof With Less Repeated Work

## Final State

The validation policy owns efficient supervision of long-running commands. Its portable resource
reaches agents through the existing Plan, Work, Review, and provider-operation guidance. Existing
test selection, dependency failure semantics, evidence reuse, and delivery gates remain in force.
No new runner, cache, telemetry collector, retry engine, configuration, or approval gate is added.

## Diagnosis And Review

An operator-supplied execution handoff reports five-second polling, turn endings with tests still
active, repeated context gathering, and a failed consumer type check while a build regenerated its
dependency declarations. The report establishes a concrete workflow problem, not a measured token
attribution. Adopter identities, original records, and review receipts remain outside this source
checkout. Current guidance covers batching and evidence reuse but leaves direct-command waiting,
process handoff, and tool-output discipline unspecified. The provider example requests a shorter
wait than its supported maximum.

Pre-implementation independent review approved with revisions: extend existing owners, fold
execution details into the proof budget only for long-running work, preserve full diagnostic
inventory, correct the provider wait example, and distinguish wheel delivery from adoption.
The parent accepts those corrections. Matched field measurement remains deferred; this patch
adds agent guidance, not a mechanically enforced execution control or a savings claim.

## Delivery

- Delivery: source implementation and independent review complete; operator authorized a patch release.
  Candidate CI, merge, tagged proof,
  and immutable publication readback remain required. Adopter lock changes are outside scope.

## Batch 1: Portable Supervision Guidance

- Depends on: none
- Ownership: primary writer; validation policy and packaged agent guidance.
- Execution: sequential
- Parallel support: requested independent proposal review, then one frozen-batch QA; no extra readers.
- Semantic contract: settled
- Fixed decisions: existing runners and findings remain authoritative; no host-specific enforcement.
- Acceptance: installed planning, work, and review routes reach the new resource; waiting respects
  host/tool limits; timeout estimates never authorize process replacement; interruption retains
  recoverable identity and evidence; compact output never conceals failures or missing inventory.
- Development checkpoints: skill-payload materialization and routing suite, plus existing package
  execution and diagnostic-collection fixtures for the reused runner/summary seam.
- Build and integration point: wheel construction and clean installation in candidate CI and release.
- Review boundary: one independent QA on the completed diff and focused evidence; reconcile the
  proposal findings in that pass.
- Proof budget: one focused suite batch, one hook per applicable stage, candidate source-readiness
  and tagged publication proof. Keep logs in external release evidence; use completion-aware waits
  up to the host/tool limit and retain each process handle. Estimates are advisory; provider review
  has an explicit 900-second deadline. Retry only after a named repair or diagnostic reason.
- Invalidates prior proof when: relevant policy, routing, installed payload, execution inputs, or
  publication candidate content/base changes.
- Proof state: eight installed skill-payload tests, 25 package execution tests, and six diagnostic
  collection tests passed. The reused fixtures cover success, failures, timeout cleanup, compact
  findings, retained command output, and blocking only dependent checks after ordinary failures.
  Independent batch QA approved the staged implementation and closed all six proposal findings.
  Candidate CI and tagged publication remain the delivery gates.
- Split early or stop when: a required fix needs runtime execution changes or host interception.
- Documentation: consolidate policy, guidance, release notes, and plan at batch closeout.
- Acceptance milestone: publication confirms packaged guidance; field adoption and behavior are
  separate observations, not release claims.

## Field Follow-Up

At the first representative adopter batch, inspect existing records for unjustified short polls,
turn endings solely because tests remain active, unexplained duplicate runs, and documentation
churn. Report observed exceptions and missing records honestly. Use available all-agent usage,
elapsed time, defects, and rework for a matched comparison before claiming savings. This is a
one-time evaluation of the change, not a per-batch reporting ceremony or an adopter release gate.

## Local Closeout

The source policy and its portable resource agree on host precedence, explicit cancellation,
process recovery, and the soft output target. Installed routes resolve to the exact packaged
resource. Independent review confirmed the provider wait limit against its implementation and
found no actionable issue. Runtime execution and configuration did not change; the focused proof
was not rerun for this narrative closeout. Commit and PR narrative preflights passed. Full review
receipts and test logs remain in operator-owned release evidence outside this checkout.

## Rollback

Remove or revise guidance that fails to earn its cost. Existing execution and configuration need
no migration; adopters deliberately select their next compatible wheel.
