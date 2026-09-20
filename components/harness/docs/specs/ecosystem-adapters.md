---
id: spec.harness.ecosystem-adapters
title: Ecosystem Adapters
type: spec
status: current
owner: project-harness
created: 2026-09-19
updated: 2026-09-19
summary: Current architecture-reset contract; implementation and qualification limits are explicit.
---

# Ecosystem Adapters

## Boundary

Projects own canonical test commands, dependency completeness, native assertions, device locks,
cleanup and release fact queries. Governance owns unit selection and applicable requirements.
The harness consumes their public command and receipt surfaces.

A repository can contain several ecosystems. A workspace is a checkout instance, not an ecosystem
or resource boundary. Kotlin, npm, Python and mixed projects all submit the same versioned batch
request; their tools supply different argv, manifests, expected codes and result receipts.

## Current implementation

One generic public governance CLI adapter exists. No toolchain plugin registry or per-language
scheduler exists. Source fixtures establish protocol behavior. Successful TypeScript/Node fixtures
do not qualify KMP builds, Apple devices, simulators or public consumer artifacts.

## Extension rule

When a missing fact or assertion belongs to an existing project runner or governance CLI, add it
upstream rather than import private code or fork behavior here. Register an ecosystem-specific
adapter only after more than one consumer demonstrates a shared need. Mandatory release checks
cannot be narrowed by domain code.

## Required evidence

An adoption names its exact runtime/artifact, toolchain, input manifest/completeness limits,
assertion contract, resource owner and cleanup receipt. No cache hit or exit code alone certifies
an unexercised platform boundary.

## First adoption scope

Stay on Codex while moving from one local check to one measured project-owned device workflow.
Follow [Development Loop](development-loop.md); do not expand to another host as part of ecosystem
qualification. Existing caches, resource owners and canonical runners remain authoritative.
