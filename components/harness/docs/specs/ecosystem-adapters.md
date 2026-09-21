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

Target evolution: [unified engine](../../../../docs/specs/unified-development-engine.md) and
[migration categories C10/C18](../../../../docs/reference/2026-09-20-engine-migration-inventory.md) own
target-owned assertions, resources and platform qualification. Current behavior below remains effective until qualified cutover;
prior S1–S9 references are acceptance inventory, mapped by the new transition plan.

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
adapter when a required platform exposes a concrete gap in the shared request/result boundary.
One required consumer can justify support; extract shared implementation when common behavior is
proven. Native, React Native and Flutter expansion is a delivery requirement qualified progressively,
not a reason to build a speculative plugin framework. Mandatory release checks cannot be narrowed
by domain code.

## Required evidence

An adoption names its exact runtime/artifact, toolchain, input manifest/completeness limits,
assertion contract, resource owner and cleanup receipt. No cache hit or exit code alone certifies
an unexercised platform boundary.

## First adoption scope

Stay on Codex while moving from one local check to one measured project-owned device workflow.
Follow [Development Loop](development-loop.md); do not expand to another host as part of ecosystem
qualification. Existing caches, resource owners and canonical runners remain authoritative.

## Simulator and physical targets

A project runner may target simulators/emulators or attached/connected physical devices. Return target
kind, stable identity, OS, connection/readiness, exact binary and scenario evidence; local telemetry
uses pseudonymous identities. Resource acquisition and cleanup belong to the runner, including shared
simulator instances and wireless devices. The harness does not infer that another worktree is isolated.

Qualification follows [the development loop](development-loop.md): simulator, physical-device and
transport recovery claims are separate. Report missing devices or unattended prerequisites as blocked
coverage. Do not turn a simulator success, app launch or device reconnect into physical scenario proof.

Existing runners must pass the [runner-reliability checkpoint](development-loop.md#runner-reliability-before-integration)
before integration. Reuse is a decision, not a constraint to retain unreliable implementation.
Framework/runtime, OS, simulator/physical target, transport and scenario are independent coverage axes;
expand the named adopter matrix progressively rather than treating one iOS lane as all-client proof.
The initial order is RN iOS simulator, then RN iOS physical devices. Native iOS/other platforms follow;
the [workflow contract](../../../../docs/specs/engine-workflow-and-device-contract.md) owns detailed cases.
