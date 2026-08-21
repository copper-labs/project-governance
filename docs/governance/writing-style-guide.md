---
id: governance.writing-style-guide
title: Writing Style Guide
type: governance
status: current
owner: project-governance
created: 2026-07-05
updated: 2026-08-21
summary: Source-repository writing conventions layered over the shared reader-first authoring contract.
---

# Writing Style Guide

The shared reader contract, research workflow, story spine, and editorial review live in
[Reader-First Technical Authoring](../specs/technical-authoring-harness.md). This page adds only the
source repository's local drafting conventions:

- Lead with the runtime or operator outcome, then link to the owning contract.
- Label target behavior separately from installed behavior.
- Treat every command and example output as a claim that needs safe rehearsal or an explicit
  verification boundary.
- Keep adopter identities, paths, evidence, and product language outside this checkout.
- Use exact current runtime names and keep model-specific files thin.

Source comments should explain responsibility, context, or a material tradeoff. They should not
repeat syntax.
