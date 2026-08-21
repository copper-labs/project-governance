---
id: skill.release-readiness-review
title: Release Readiness Review
stage: Review
provenance: package-default
---

# Release Readiness Review

Review release candidates, promotion plans, smoke checks, and post-deploy evidence.

## Trigger

Use this skill when preparing a release, publishing an artifact, promoting a build, changing release
automation, or evaluating post-release evidence.

## Required Reads

- `docs/governance/validation-strategy.md`
- `docs/governance/hook-and-check-taxonomy.md`
- `.governance/runtime/skills/review-finding.schema.yaml`
- repository validation packs that declare the release stage
- release or deployment docs for the target repository

## Workflow

1. Identify one exact publication candidate and the artifacts it will produce. For a pull request,
   bind the candidate to its proposed merge result, including the current integration base. Apply
   this boundary to every release kind the target repository supports.
2. Confirm the pinned governance runtime, required release checks, toolchain, and baselines that the
   operator will hold fixed through publication. A required change forms a new candidate; a freeze
   does not extend time-bound evidence.
3. Confirm target-owned release, smoke, and post-deploy checks plus credentials, approvals,
   signing, packaging, rollback, observability evidence or an explicit gap, and publication
   readback requirements.
4. Keep repairs on the same candidate branch or equivalent integration line. During repair, replay
   the failed owner and directly affected seam only.
5. Run the complete declared release proof once on the stable candidate before merge or tag. If
   candidate content or its integration base changes, treat the result as a new candidate.
6. At publication, verify exact candidate identity, artifact integrity, and readback. Repeat broader
   work only when the publication environment is an independent required trust boundary.
7. Run target-required smoke or post-deploy checks and record the operational evidence or gap.
8. Do not mark release-ready when required evidence is missing, expired, or bound to another
   candidate.

## Validation

Run the complete target-owned release proof on the stable candidate before integration. Confirm
that the merge or tag preserves the certified content and that publication verification binds the
released artifacts to that content.

## Evidence

Report candidate and artifact identifiers, checks run, smoke or post-deploy evidence, observability
proof or gaps, omitted proof, approvals, publication readback, residual risks, and the
release-readiness verdict using the shared review finding schema.
