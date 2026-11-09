---
id: plan.streamed-diff-context
title: Bounded diff header capture
type: exec-plan
summary: Preserve exact change identity without buffering entire Git patch bodies.
status: active
owner: project-governance
created: 2026-11-09
updated: 2026-11-09
---

# Bounded diff header capture

Goal: valid large text changes can supply required context without overflowing the child-output
buffer. Keep source identity, all changed paths, exact ranges, staged selection and drift checks.
No baseline edits, excluded paths, task authority changes or provider behavior changes.

One batch: reproduce with a synthetic patch larger than 32 MiB, stream and discard source-body
lines while retaining bounded path/hunk metadata, test byte/range parity and negative bounds,
then independent review and exact installed archive proof. The synchronous capture API remains;
a small Node child drains Git asynchronously, with its own deadline and Git termination.

- [x] Implementation: original fails; streamed reader passes the large-patch reproducer.
- [ ] Verification: subject/packet/parser tests, context regressions, independent review and package proof.
- [ ] Closeout: qualified stable patch and supported adopter transition.

Current evidence: 16 subject/packet tests and build pass. Next: parser/context regression batch and
independent review. No installed payload modified and no ordinary development acceptance inferred.
