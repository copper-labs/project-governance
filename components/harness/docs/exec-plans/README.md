# Harness roadmap

The [unified engine transition](../../../../docs/exec-plans/active/2026-09-20-unified-development-engine.md)
owns forward planning. The direction is accepted; review the
[architecture recommendations](../../../../docs/specs/unified-development-engine.md) before dependent
implementation. E0 settles decisions, E1 proves risky boundaries, E2 completes a provider-free workflow,
E3 evaluates JEV early, E4 qualifies RN iOS real devices before broader platforms, E5 coordinates
category replacement/release, and E6 adopts Mnemos for a concrete consumer. Memory integration needs
are designed now at E0/E1, not deferred until E6. The plan owns dependencies and exits, not this routing summary.

The [earlier S1–S9 plan](active/2026-09-19-governance-codex-adoption.md) remains an acceptance inventory.
The completed [architecture reset](active/2026-09-19-architecture-reset.md), prior reviews and research
remain historical evidence. The [decision map](../../../../docs/exec-plans/active/2026-09-19-decision-first-development-loop.md)
remains useful; no earlier sequence overrides the new review. Existing contracts govern the installed
runtime until qualified cutover. No provider account or Mnemos dependency is required for the core.

## Current boundaries and preserved requirements

SQLite is authoritative local state, in the Git common directory for linked worktrees. The host
keeps source-edit ownership. Governance keeps check selection, process supervision and resource
cleanup. There is no planned harness-owned editor. The CLI is an integration surface today; a
future front door or desktop shell can use these contracts without taking policy ownership.

Unknown measurement is not zero. Compare total tokens, elapsed time, accepted outcome and rework,
including hook overhead, context output, retries, review and warm/cold cache effects. Do not claim
savings from fixture tests. The earlier 495/624 baseline denominator is unresolved; rederive it
from raw observations before using it as a comparison. The release survey contains eight rows;
the earlier seven-row and 18-of-25 claims are not qualified results.

## Future Mnemos seam

Design the [memory boundary](../../../../docs/specs/engine-memory-boundary.md) now, including scope,
identity, provenance, freshness, withdrawals, cancellation and degradation. Adopt Mnemos later, after
the provider-free pilot, if richer cross-task retrieval earns its cost.
Start with a disposable projection of versioned task/checkpoint/evidence events; compare it with
bounded SQLite queries. Imported or retrieved memory never grants authority or acceptance. Keep
SQLite execution-critical state until a separate migration evaluation proves durability,
transactions, idempotence, portability and recovery. No Mnemos adapter is required now.

Cowork and other hosts are deferred. Kotlin/mixed ecosystems, machine-wide resources and
distributed clones each need separate proof. Do not infer device readiness from local protocol fixtures.

## Repository consolidation completed locally

The harness now lives in this governance repository under `components/harness`, and the governance
wheel embeds its runtime. The [migration receipt](../../../../docs/reviews/2026-09-19-continuity-migration.md)
records exact source and installed-artifact proof. The original monorepo proposal is historical;
do not repeat its migration or build a second artifact/lock system.

Continue with the [agent handoff](../../../../docs/exec-plans/active/2026-09-19-continuity-agent-handoff.md).
Publication and native Codex qualification remain separate from local integration.
