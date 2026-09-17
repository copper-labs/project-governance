---
id: plan.test-completion-return
title: Return Test Completion To The Initiating Agent
type: exec-plan
status: active
owner: project-governance
created: 2026-09-10
updated: 2026-09-10
summary: Replace the separate provider cycle with native completion delivery and publish the authorized patch.
---

# Return Test Completion To The Initiating Agent

The released cycle moved assessment into another CLI session without returning to the initiating
Desktop task. Ordinary agents then asked operators to launch commands manually. Replace that
workflow with one deterministic batch and a host-native return path. The operator has authorized
removal, implementation, Claude Fable 5 QA at high effort, reconciliation and a patch release.

## Scope And Simplicity

Keep existing assertions, input binding, deadlines, resource claims, guardian cleanup, logs and
bounded telemetry. Remove the cycle command, preparation/assessment code and unused bindings.
Codex binds the invoking task and queues a trusted result pointer. Claude uses native Monitor
around the existing one-line terminal wait. No second agent, custom host launcher, scheduler,
hook framework, new database or settings migration. Repositories retain their own test commands.

Delivery is separate from test outcome. Deduplicate automatic attempts; preserve ambiguous sends
for explicit recovery. Report cleanup attention once while retaining the claim, then completion
after verified cleanup. Never rerun a test because delivery failed. Queue acceptance and actual
agent consumption are distinct facts. Unsupported hosts retain bounded waits and an explicit limit.

## Implementation And Proof Budget

- [x] Remove the old cycle and route installed guidance into initiating-agent completion.
- [x] Add bounded Codex delivery, deduplication, failure receipts and cleanup-attention delivery.
- [x] Run focused batch/completion tests and the installed skill materialization seam.
- [x] Prove native Codex batch delivery and Claude Monitor return after a model turn ends.
- [x] Run one Claude Fable 5 high-effort QA boundary; reconcile material findings and recheck fixes.
- [x] Run staged impacted governance and the release's existing broad/clean-wheel gates.
- [ ] Publish the authorized patch and verify its source, assets and fresh installation.

Keep live evidence outside the source checkout. The earlier queue-to-Desktop self-message proved
native delivery, but does not substitute for the batch integration. Native acceptance must bind the
exact host session and demonstrate a quiet interval and automatic result assessment. Focused tests
cover assertion failure, timeouts, duplicate observations, worker death, uncertain cleanup, failed
delivery and changed host binding. Host closure/restart and remote-session support remain outside
the verified open-local-host scope unless independently demonstrated.

## Adoption

The obsolete cycle interface is intentionally removed without a compatibility shim. Release notes
must state that change. Existing records and evidence remain readable; finish active work before
upgrading. Shared skills and their existing Plan/Work/Review routes carry the corrected workflow.
Do not edit adopter repositories or their runtime locks as part of source publication.

## Native Acceptance

The open local Codex Desktop task received a real completed batch notice and automatically resumed
after its initiating model turn ended. Result identity, successful assertions, declared-scope input
validity and cleanup were checked. Claude Code 2.1.263, Fable 5 at low effort, submitted one batch,
started native Monitor, ended its turn and then wrote the result receipt after the native event.
Its transcript has no intervening status/tool polls. These establish local open-host behavior,
not closed-host, restart, remote support or a causal token-savings benchmark.

## QA And Release Readiness

Claude Fable 5 at high effort approved the focused reconciliation. Delivery no longer runs from
status or cleanup recovery under shared locks; worker and guardian dispatch outside those locks.
Added coverage proves cleanup attention, timeout/cancellation delivery and notification-process
cleanup. The final runtime suite passed 449 tests with one existing skip, and clean-wheel verification
passed. Native host acceptance remains valid because the transport is unchanged. Publication and
asset readback remain the final delivery step, tracked by the 2.7.1 release workflow.
