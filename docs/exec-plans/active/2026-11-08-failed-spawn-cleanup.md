---
id: exec-plan.failed-spawn-cleanup
title: Release build reservations after confirmed spawn failure
type: exec-plan
status: active
owner: project-governance
created: 2026-11-08
updated: 2026-11-08
summary: Recognize original failed-spawn cleanup without inventing a child process or weakening real-lock checks.
---

# Failed-spawn cleanup

One narrow batch repairs the existing local-build evidence reader. A genuine non-executable
command reproduces the failure: the supervisor confirms cleanup but the resource reader requires
a child launch. Accept only the original bound failed-spawn result and launch intent, no child or
membership evidence, fresh owner/guardian absence, and the existing real-lock/release transaction.
No public schema, approval policy, device authority or installed payload changes.

- [x] Reproduce the failure with a real synthetic failed spawn.
- [x] Implement the bounded original-evidence branch and negative cases.
- [x] Finish focused cleanup tests, typecheck and independent Opus 5.5 high review.
- [ ] Qualify the exact archive and applicable broader release proof; publish only under the existing release contract, with GitHub CI skipped.

Research: Node child-process documentation distinguishes a failed spawn from a spawned child;
an error event alone can also have other causes, so this repair requires the full original native
receipt and absent child acknowledgment. Reviewed 2026-11-08:
https://nodejs.org/api/child_process.html#event-error . This supports the failure model, not local
release qualification. Evidence and adopter identities remain outside source.

Rollback uses the prior immutable runtime package; original run receipts remain unchanged.
Adoption and recovery of active reservations belong to their existing owners after qualification.

Opus recheck found no remaining blockers after restricting failed-spawn acceptance to local-build
only and adding live-owner/guardian, contradictory evidence and busy real-lock cases. Four focused
spawn regressions pass; the initial cleanup batch passed71 with5 installed-generation skips.
Synchronous launch exceptions with no confirmed native result remain outside this repair.
