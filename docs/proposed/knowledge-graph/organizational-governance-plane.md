---
id: proposed.organizational-governance-plane
title: Organizational Governance Content Plane
type: prd
status: deferred
owner: project-governance
created: 2026-04-17
updated: 2026-08-11
summary: Deferred product requirements for a provider-neutral governance content service.
---

# Organizational Governance Content Plane

## Status And Boundary

Markdown is the current and only governance authority. This document preserves product questions for
a future, separately approved knowledge-graph initiative. No service, runtime, migration, shadow
mode, activation, release, or implementation is active.

## Desired Outcome

If a future initiative is approved, people should be able to create and review requirements,
specifications, plans, decisions, skills, findings, and evidence while preserving their relationships,
provenance, approval state, and readable projections. Repository workers should receive small,
provider-neutral packets rather than direct access to the content store.

## Requirements To Revisit

- Preserve stable identity, version history, authorship, scope, and review decisions for governed
  material.
- Support bounded, authorized reads and deliberate writes from connected authoring tools.
- Provide human-readable views without making a UI the authority.
- Keep repository hooks and local validation able to operate from a portable snapshot.
- Define recovery, export, redaction, deletion, auditability, and least-privilege access before
  storing governed content outside the repository.
- Keep implementation workers independent of a particular graph provider, session type, or query
  language.

## Non-Goals

- Replacing Markdown now.
- Prescribing a specific provider.
- Reintroducing a parallel authority or compatibility runtime.
- Automatically importing or activating historical exploratory work.

## Success Evidence

A future proposal should show one authority at a time, portable recovery material, bounded context
reads, explicit write authority, and an independently testable repository-client contract.
