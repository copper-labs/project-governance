# Harness roadmap

The [Codex/governance adoption plan](active/2026-09-19-governance-codex-adoption.md) is the active
forward sequence. Governance is required; one product/install/release is the target. Cowork is
deferred. The [process map](../architecture/development-flow.md) shows now, first release and destination.

The [architecture reset](active/2026-09-19-architecture-reset.md) replaces the old decision-first
sequence. The [current specifications](../specs/README.md) define behavior. Prior reviews and
research remain dated evidence, not current implementation instructions.

| Order | Work | Exit evidence |
| --- | --- | --- |
| 1 | Codex qualification + bundled governance installation | Actual app lifecycle and exact published-artifact receipts |
| 2 | Bounded measurement + one coordinated local-check pilot | Repaired baseline; fewer duplicate requests/context at equal proof |
| 3 | One expensive device workflow + second project on Codex | Runner-owned reuse, correct resource/claim identity, accepted-work benefit |
| 4 | Optional discovery, semantic decision or release packet | Each targets a demonstrated bottleneck and earns its cost |
| Later, explicit scope | Owned front end, Mnemos or additional hosts | Separate benefit, durability and integration evidence |

The smaller existing step files are supporting work packages. They do not supersede this sequence.
[Benefit assumptions and pilot targets](../specs/measurement-and-qualification.md) are unmeasured;
[development-loop rules](../specs/development-loop.md) preserve existing governance gates.

## Fixed boundaries

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

After the provider-free pilot, evaluate Mnemos only if richer cross-task retrieval earns its cost.
Start with a disposable projection of versioned task/checkpoint/evidence events; compare it with
bounded SQLite queries. Imported or retrieved memory never grants authority or acceptance. Keep
SQLite execution-critical state until a separate migration evaluation proves durability,
transactions, idempotence, portability and recovery. No Mnemos adapter is required now.

Cowork and other hosts are deferred. Kotlin/mixed ecosystems, machine-wide resources and
distributed clones each need separate proof. Do not infer device readiness from local protocol fixtures.

## Repository consolidation recommendation

The [monorepo action proposal](active/2026-09-19-governance-monorepo-proposal.md) recommends a one-time
import into the existing governance repository before integrated packaging, then a single-wheel
packaging proof. This is a pending refinement of the accepted installation plan, not a completed
migration or a change to supported-host scope.
