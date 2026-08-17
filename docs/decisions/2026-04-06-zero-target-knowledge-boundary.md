---
id: decision.zero-target-knowledge-boundary-2026-04-06
title: Zero-Target-Knowledge Boundary
type: decision
status: approved
owner: project-governance
created: 2026-04-06
updated: 2026-08-11
summary: Keeps adopter identities, paths, and evidence outside the reusable runtime source.
---

# Zero-Target-Knowledge Boundary

`project-governance` provides generic behavior but does not store which repositories adopt it.
Product names, source paths, worktrees, branches, credentials, local evidence, and rollout state
belong either in the adopting repository or private operator state.

The shared source may contain generic schemas, synthetic fixtures, and reusable policies. It must
not contain a customer roster, target-specific runtime output, or private path inventory. This keeps
the wheel safe to share and makes the runtime's ownership boundary testable.
