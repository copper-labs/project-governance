---
id: spec.harness.release-preparation
title: Release Preparation
type: spec
status: current
owner: project-harness
created: 2026-09-19
updated: 2026-09-19
summary: Current architecture-reset contract; implementation and qualification limits are explicit.
---

# Release Preparation

## Status and boundary

Read-only project-owned fact collection is a candidate adoption workflow. No deployment, promotion,
merge, tagging, publishing or approval automation is added by this runtime. Existing canonical
collectors can run as explicitly authorized batches; their receipts become referenced artifacts.

## Fact contract

Every collected fact names its project, source system, exact artifact/ref when applicable,
observation time, query/collector identity, value and what it establishes. Unavailable credentials,
undefined health criteria or unreachable endpoints produce unknowns. A dependency in package.json
is not proof that a query works or that a deployment is healthy.

Local checks, artifact publication and destination availability are different claims. Bind release
proof to the actual candidate and destination; re-read mutable external state at the relevant gate.
Approvals, ordering, remediation and acceptance remain with the host/operator and governance.

## Roadmap

Choose one adopter's existing evidence packet after defining its fact queries and acceptance
semantics. Compare operator minutes and total agent cost against the current workflow. Do not use
the original “18 of 25” survey as a verified saving: its listed categories overlap and its human
row count is inconsistent. Reconcile that inventory before using a numerical target.

## Reuse rule

No automatic verdict reuse or check narrowing at release gates. Historical facts may be referenced
with their age and applicability limits. Repeat observations and a known command do not alone
establish that external state is unchanged.
