---
id: spec.harness.action
title: Action
type: spec
status: current
owner: project-harness
created: 2026-09-19
updated: 2026-09-19
summary: Current architecture-reset contract; implementation and qualification limits are explicit.
---

# Action

## Contract

An action references an exact task revision and records operation, declared scope, policy revision,
expected inputs, status and revision. Operations are read, check and record. Transmission and
product edits are outside this core; the host owns them.

A check can have side effects. Its name and working directory do not sandbox its argv. The host
must authorize commands and resource scope through its normal controls. Natural-language
constraints remain visible to the host. Only explicit `deny:read`, `deny:check` and `deny:record`
constraints have machine-enforced operation meaning; a regex does not interpret arbitrary prose.

## Lifecycle

- proposed → authorized, refused or cancelled
- authorized → prepared, refused or cancelled
- prepared → in-progress, refused or cancelled
- in-progress → completed, cancelled or outcome-unknown
- completed → verified
- outcome-unknown → completed or cancelled, only after a linked owner's result establishes it

Refused, cancelled and verified are terminal. Completed describes execution completion, including
failed assertions; Evidence records what the outcome establishes. Revision equality alone cannot
authorize an illegal transition. Current task revision and open status are checked at authorization,
preparation and dispatch. A later task correction does not rewrite historical effects.

## Execution binding

Before submission, persist the normalized batch, digest, host authority reference, executor
identity/digest and state-root identity. Persist dispatch state before calling the owner. A
returned job ID is linked immutably. A lost submission response produces outcome-unknown; do not
submit again merely to discover what happened.

The host authority reference is an attribution claim, not an independently authenticated grant.
No local caller flag can prove that a human approved an action. The host remains the trust boundary.

## Recovery

Only an authoritative linked executor result completes a dispatched action. Recovery observes
existing jobs; it neither scans files for apparent outputs nor replays work. Live jobs remain live.
An unlinked uncertain submission needs owner-side investigation. Prepared records without a job
remain pending until explicitly cancelled or otherwise reconciled; no automatic reset-to-run exists.

## Proof

Tests cover stale authorization, illegal transitions, wrong owner/job/cases, lost response,
interruption, late results after cancellation, restart and duplicate result consumption.

Only check actions are durably proposed by the CLI today. Read/record are operation checks at
context/artifact retrieval and checkpoint boundaries; administrative history inspection, task
correction and analytics are separate. Destination and the broader artifact-kind enum are reserved
compatibility fields, not implemented transmission/edit capabilities.
