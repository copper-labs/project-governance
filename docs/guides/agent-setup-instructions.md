---
id: guide.agent-setup-instructions
title: Agent Setup Instructions
type: guide
status: current
owner: project-governance
created: 2026-02-23
updated: 2026-08-16
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

Use the smallest proof that covers the changed component and one affected seam. When a governance
pack fails, repair it with `project-governance check --pack <pack-id>` and then run one impacted
closeout.

When the operator explicitly requests delegated execution, treat the current Codex or Claude Code
session model as primary. An explicit request such as `Use delegation for this task`, `Use governed
delegation for this task`, or `Delegate this task` is sufficient. Prepare a packet-ready slice and
bounded context first, then handle the internal `agent-route` and
`agent-dispatch` interfaces without asking the operator to prepare JSON. Review the route and run
`start` once for that exact wave. The returned entries are launch instructions for the current host;
the wheel does not start models. Finish the wave once with the authorization digest and bounded
result bundle. Missing or unsafe inputs mean continue solo.

## Boundaries

- Markdown is the current policy authority.
- The wheel provides generic behavior; the repository provides project policy and validation.
- Hooks launch checks only; they do not download or upgrade the runtime.
- Never infer or overwrite a repository-owned configuration decision during an upgrade.
- Broader checks are release or contract-boundary work, not ordinary iteration.
- Across active waves, one repository has at most one writer and two readers; QA assurance requires a separate
  explicit start, and builds remain deterministic harness commands.
