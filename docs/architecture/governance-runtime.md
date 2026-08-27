---
id: architecture.governance-runtime
title: Governance Runtime Architecture
type: architecture
status: current
owner: project-governance
created: 2026-02-16
updated: 2026-08-21
summary: Architecture for a small, package-based, project-neutral governance runtime.
---

# Governance Runtime Architecture

The architecture intentionally has two owners.

| Owner | Responsibilities |
| --- | --- |
| Runtime wheel | CLI, changed-path selection, built-in generic packs, dependency ordering, process ownership and cancellation, explicit-timeout enforcement, normalized findings, minimal developer-doc installation and exact catalog routing, bounded local validation telemetry, bootstrap/update commands, generic skills, and configuration schemas |
| Adopting repository | Runtime lock, profile, facts, target packs, source mappings, tool commands, duration and retry policy, product documentation, root agent instructions, and product proof |

## Design Rules

1. Markdown is the sole current governance authority.
2. The wheel is ordinary Python package distribution, not a custom artifact system.
3. The lock names one immutable artifact and SHA256; bootstrap verifies it before installation.
4. Generic policy stays in the wheel. Project policy stays in the repository.
5. Hooks are launchers only. They never download, upgrade, or reimplement selection.
6. The planner selects applicable changed paths. Unknown paths fail once and clearly.
7. The universal 500-line threshold triggers architectural judgment only for a new or directly
   changed source unit. Language-native tools identify declaration ownership; physical-file sizing
   remains the parser-free fallback. Cohesive units may be accepted intact, and extraction is valid
   only when it creates a meaningful responsibility owner.
8. Telemetry is advisory, local, bounded, and cannot approve or weaken a check.
9. Routine installed operation treats the adopting repository as its only project authority. It
   does not discover, require, or mutate a Project Governance source checkout.
10. A target-owned pack may take repository-wide ownership of one non-supplemental built-in only
    through the explicit replacement contract. The target consumes the runtime's versioned change
    packet; the built-in remains available only when an operator names it directly for diagnosis.
11. Change-sensitive packs consume one immutable before/after packet. Each run and pack receives an
    isolated ignored evidence root. The runtime removes only empty scaffolding it created and does
    not interpret or implicitly delete product evidence stored there.
12. Comment and dependency ratchets govern changed declarations and changed coordinates, not every
    old issue encountered in a touched file.
13. Delegation uses the host agent's native controls in the current checkout. The wheel owns no
    provider routing, dispatch state, worker leases, or completion receipts.
14. Developer documentation uses one repository-owned corpus and catalog. The runtime installs its
    minimal entry structure, resolves exact authored routes, and validates deterministic defects;
    the host agent owns prose generation and permitted public research.

## V1.1 Integrity Boundary

The completed V1.1 plan tightens evidence identity without adding another orchestration layer. Changed
and staged packet-bound packs read packet materializations only and share one canonical
`subject_digest`; explicit all mode and the declared later-stage live secret surface remain honest
no-digest checkout-reading exceptions. Finding authorization is separate from process
integrity: accepted, waived, and suppressed findings may remain in a passing result, but a failed,
timed-out, interrupted, malformed, or incomplete child always blocks.

Evidence manifests, when a pack opts in, are bounded claim summaries inside that pack's isolated
run root. They are bound to the immutable subject digest; pack/run locality comes from the
runtime-owned directory rather than duplicated manifest identifiers. Artifact digests remain inert
strings: the runtime does not resolve paths or read the artifacts. Manifests are not checkpoints,
cross-pack inputs, semantic proof graphs, or reusable cached verdicts. Telemetry receives bounded
numeric counters only and remains unable to approve a result.

No V1.1 evidence-integrity component invokes a language model or carries prompts, product-risk
categories, or adopter identities. A target that wants semantic review as a validation pack still
registers an ordinary target-owned pack under existing stages.

## Local Maintenance And Upstream Feedback

Project-owned mechanical governance defects may be repaired in the adopting repository when the
active task authorizes writes. A change that weakens policy, changes ownership, or has ambiguous
ownership is proposed before it is applied. A runtime-owned defect is reported without copying or
patching the installed wheel.

No upstream artifact or source-repository action occurs by default. When an operator explicitly
requests an upstream report, an agent may prepare one redacted file under ignored local runtime
state. Direct source work requires a separate explicit request and is then governed by the source
repository's instructions. No source checkout is needed to prepare or transfer a report.

## Deliberate Adoption

The source repository may build a release candidate, but it never changes an adopter automatically.
An adopter reviews `project-governance update --dry-run`. A configuration-schema change stops there
until the repository-owned configuration is ready and an operator deliberately uses `--apply`.
The update changes only the tracked lock; Git supplies source history and retirement recovery.
Bootstrap and an explicit update may contact the configured release distribution endpoint; neither
operation discovers or edits a source checkout.

## Out Of Scope

The runtime has no product adapters, target identities, generated ownership ledger, copied runtime,
merge machinery, package cache, analyzer registry, custom resolver, signature framework, model
invocation path, or dormant implementation path. Git history remains the recovery mechanism for
retired work.
