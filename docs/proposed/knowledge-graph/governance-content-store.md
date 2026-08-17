---
id: proposed.governance-content-store
title: Governance Content Store Boundary
type: spec
status: deferred
owner: project-governance
created: 2026-04-17
updated: 2026-08-11
summary: Deferred provider-neutral requirements for a possible governance content store.
---

# Governance Content Store Boundary

Markdown remains the current authority. This is a future design reference only; no content-store
runtime, adapter, migration, shadow mode, activation, release, or implementation exists.

## Provider-Neutral Contract

A future store should hold governed content, relationships, provenance, approval state, review
comments, baselines, and evidence using stable identifiers. It should expose content and snapshots
through application-owned ports, not through provider-native sessions, storage paths, or graph
handles.

## Boundaries

- The service layer owns authentication, authorization, schema compatibility, lifecycle, and
  availability.
- Repository clients and workers receive only verified, bounded snapshots and typed outcomes.
- The store never becomes an unbounded agent-context source.
- A provider change must be possible behind the boundary without changing repository behavior.

## Assurance Questions

Any approved future design must specify snapshot comparison and export, retention and deletion,
failure behavior, privacy controls, audit records, and evidence that the selected provider implements
the required relationship and version semantics.

No provider is selected for this boundary, and no content-store dependency is active.
