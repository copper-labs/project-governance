---
id: spec.harness.host-integration
title: Codex Host Integration
type: spec
status: current
owner: project-harness
updated: 2026-09-19
---

# Codex host integration

## Supported target

Codex app on macOS is the sole first-adoption target. Governance is required. Cowork, Claude Code,
other hosts and a custom front end are deferred; they are not release blockers. Portable internal
contracts are useful, but do not require a general host framework or lowest-common-denominator API.
See [installation](installation.md) for the accepted bundled-product contract.

## Existing implementation and limits

The host calls the JSON CLI from a known project root. Existing `init` previews routing and
`init --apply` can write AGENTS.md or CLAUDE.md marked blocks while preserving surrounding content.
That legacy CLAUDE.md capability is not supported-host qualification. The integrated installer targets
AGENTS.md only. Malformed markers and symlinked instruction files are refused by this prototype.

Adapters work at task boundaries rather than wrapping every native read. Codex owns reasoning,
edits, permissions, acceptance and external effects. It registers important dependencies and records
coherent checkpoints. Native tools remain available.

`resume --task` may bind a stable host session. Without an explicit task, only an existing session
binding can resume; never choose an arbitrary open task. `host hook` currently accepts a bounded
SessionStart fixture and emits additional context. It does not install or certify native hooks.
Real Codex session/compaction/completion behavior remains unqualified.

## First qualification recipe

Prove stable session/task identity, root/worktree mapping, process access and the installed generation.
Create/checkpoint/reopen/resume a task, repeat across linked worktrees and concurrent sessions, interrupt
a declared harmless check, then recover its original owner result without resubmitting. Confirm bounded
context, mandatory constraints, changed-scope handling and original full-log access.

Then qualify native lifecycle hooks, compaction timing, tool-result capture and native usage semantics
on the installed app version. Install one handler per operation, preserve host trust review and make
handlers idempotent. A missing optional hook can use explicit task-boundary commands; missing critical
state blocks dependent execution. `doctor` distinguishes available, qualified and unknown.

Use existing completion-aware waits, or a qualified completion return, never both for one job. No model
polling loop. Hook output carries attributed history, not new authority. No private transcript scraping.

## Model policy

Governance owns task-category model guidance. Precedence is operator choice, project policy, governance
defaults, subject to actual Codex capabilities. This guidance neither switches a running parent nor
authorizes delegation. Record requested model/effort/policy source and observed execution when available.
Apply choices only through supported host controls at appropriate task/authorized delegation boundaries.
No duplicate model table or compulsory semantic classifier belongs in harness.

## Future front door

An owned CLI/app may apply the same governance contracts with tighter lifecycle control. This remains
a later option, not a second agent loop for the first release. Additional host adapters require an
explicit new scope decision; they do not automatically follow the first pilot.
