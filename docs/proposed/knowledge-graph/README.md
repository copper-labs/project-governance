---
id: proposed.knowledge-graph
title: Future Knowledge-Graph Direction
type: proposal
status: deferred
owner: project-governance
created: 2026-08-11
updated: 2026-08-11
summary: Deferred, provider-neutral design material for a possible governance content boundary.
---

# Future Knowledge-Graph Direction

Markdown files in this repository are the current and only governance authority. The Python runtime
reads the repository-owned configuration and does not use a graph store, remote service, or content
provider.

This directory preserves design ideas for a separately approved future initiative. It is not an
implementation plan. No knowledge-graph runtime, adapter, migration, shadow mode, activation path,
release path, feature flag, or operational dependency is active today.

Any future work must begin with a new approved specification that chooses a provider-neutral content
boundary, defines authority and recovery, and identifies the repository changes it requires. No
provider is selected, required, or treated as an architectural commitment.

## Preserved Ideas

- A content store can preserve stable identifiers, provenance, relationships, reviews, approvals,
  and history more directly than independent documents.
- Connected authoring should expose bounded, authorized reads and deliberate writes rather than a
  full-store dump into an agent context.
- Repository execution should consume portable, verified snapshots through a provider-neutral
  contract, so workers do not receive store-native sessions or handles.
- Any future transition must retain a single authority, explicit reconciliation, redaction, recovery,
  and meaningful operator control.

These proposals are reference material only. Git history retains the earlier exploratory detail.
