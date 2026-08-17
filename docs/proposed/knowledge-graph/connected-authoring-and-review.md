---
id: proposed.connected-authoring-and-review
title: Connected Authoring And Review
type: spec
status: deferred
owner: project-governance
created: 2026-04-17
updated: 2026-08-11
summary: Deferred requirements for authorized connected authoring and review of governed content.
---

# Connected Authoring And Review

Markdown remains the current authority. Connected authoring is not active: no MCP surface, runtime,
adapter, migration, shadow mode, activation, release, or implementation exists.

## Future User Experience

Authorized people may need to discover a bounded set of governed artifacts, inspect exact revisions,
compare proposed changes, add review feedback, and request deliberate writes. Rich visual views are
optional projections; a structured fallback must remain usable.

## Design Requirements

- Tools expose product-shaped operations, not arbitrary store queries or filesystem mutation.
- Every write names its authority, scope, expected version, and review state.
- Reads are bounded by purpose and never copy an entire graph into model context.
- Tool registries are discoverable, versioned, and integrity checked.
- Identity, authorization, privacy, audit records, errors, and recovery are explicit.

These are future design constraints, not a commitment to a particular protocol, host, or provider.
