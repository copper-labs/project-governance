---
id: guide.agent-setup-instructions
title: Agent Setup Instructions
type: guide
status: current
owner: project-governance
created: 2026-02-23
updated: 2026-08-24
summary: Concise setup guide for agents working on the runtime or an adopting repository.
---

# Agent Setup Instructions

## Working On This Repository

Read, in order:

1. `AGENTS.md`
2. `docs/index.md`
3. `docs/system-spine.md`
4. `docs/specs/governance-kernel.md`
5. The policy or package component named by the task

Keep the runtime project-neutral. Do not add customer names, product paths, build commands,
credentials, adopter state, or device evidence here.

## Working In An Adopting Repository

Read its root agent instructions, `config/governance/runtime.lock.yaml`, profile, facts, and the
smallest routed documents. Bootstrap the locked runtime before invoking its hooks. Generic skills
may be read from ignored `.governance/runtime/skills/`; project skills remain tracked and
repository-owned.

For substantial governed work, resolve bounded context before editing with `context
--json-output .governance/runtime/context-result.json` and read the selected materialized skills.
The runtime records no per-skill utilization receipt.

Planning and work read the installed delegated-execution skill. At batch planning, identify useful
independent reader assignments or a brief solo rationale. Reconsider at material blockers or long
builds without inventing busywork. Keep one writer and zero to two readers, with distinct questions
and evidence. The primary may be the writer; no extra manager role is required.

Use the smallest proof that covers the changed component and one affected seam. When a governance
pack fails, use `project-governance check --pack <pack-id>` only when focused diagnosis needs it.
After the final repair, use either the enclosing Git hook or one impacted closeout as the affected
recheck; do not run both immediately against the unchanged subject.

For cross-model work, follow `.governance/runtime/skills/resources/harness-delegation.md` and use the
provided `harness-*` skills by default, even when system wrappers are available. Initialization and
bootstrap maintain thin routing pointers in host startup instructions; reload the parent session
after setup. Explicit operator route choices override the default. Use native controls for
same-model subagents. Keep the
current session primary, use at most one writer and two non-overlapping readers, and share the
current checkout. Delegation does not authorize another worktree.
For optional-helper overlap, dispatch `--writer` and `--shared` sibling jobs from the primary.
Default exclusive access retains isolation. Readers do not mutate Git or shared build/test outputs.

## Boundaries

- Markdown is the current policy authority.
- The wheel provides generic behavior; the repository provides project policy and validation.
- Hooks launch checks only; they do not download or upgrade the runtime.
- Never infer or overwrite a repository-owned configuration decision during an upgrade.
- Broader checks are release or contract-boundary work, not ordinary iteration.
- Use the current checkout for the primary, read-only specialists, and the one bounded writer.
  Delegation is not authority to create or move a worktree. An additional worktree requires a
  direct operator request and its path and disposition must be reported at closeout.
- Across active waves, one repository has at most one writer and two readers; QA assurance requires a separate
  explicit start, and builds remain deterministic harness commands.
