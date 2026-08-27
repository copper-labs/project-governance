---
id: skill.implementation-quality-review
title: Implementation Quality Review
stage: Review
provenance: package-default
---

# Implementation Quality Review

Review implementation quality before pull-request handoff.

## Trigger

Use this skill when source code, scripts, build logic, or generated code changes need quality review.

## Required Reads

- `docs/governance/code-quality-policy.md`
- `docs/governance/validation-strategy.md`
- `.governance/runtime/skills/review-finding.schema.yaml`
- repository profile `quality`
- repository profile validation packs with kind `format`, `lint`, `code-quality`, `comment-quality`, or `naming`

## Workflow

1. Identify touched source roots, generated files, and language/platform profiles.
2. Review naming, comments, physical-file size, type size, function size, complexity, nesting, and
   avoidable indirection. A new or directly changed file or type over 500 lines requires a
   disposition and architectural judgment: type review
   asks whether responsibilities are mixed, while file review asks whether the physical reading
   surface remains legible and navigable. A cohesive narrow unit may be accepted. Do not demand a
   split merely to cross the threshold or save a handful of lines when cohesion and readability
   remain sound. Reject helper extraction that only relocates related code without creating a
   meaningful owner, reducing coupling, or improving independent comprehension or testing.
   For every new or materially changed public API or authority boundary, ask whether a new engineer
   can identify its responsibility, place it in the workflow, see the important boundary or
   invariant, learn something beyond the signature, trust each behavior claim because code or tests
   protect it, and read the explanation without unnecessary jargon.
3. Confirm generated-file exclusions are respected.
4. Check that tests cover the changed behavior or that residual risk is explicit.
5. Record `refactor-required`, `cohesion-accepted`, or `temporary-waiver` for each applicable
   oversized file or type finding. Accepted cohesion remains current across non-material edits;
   reopen it only when responsibility, dependency direction, public surface, or orchestration role
   changes materially. Keep temporary waivers exact-source-bound.
6. Prefer local fixes for simple quality issues before escalating.

## Validation

Consume existing subject-valid quality proof. Run one focused owner or directly affected seam only
for a named uncovered claim. After repair, use one affected recheck; do not replay the named owner
and then an unchanged impacted boundary.

## Evidence

Report findings first with file references, validation results, remaining risks, and any waivers
using the shared review finding schema.
