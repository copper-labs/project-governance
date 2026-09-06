---
id: guide.startup-runtime-updates
title: Enable Compatible Startup Updates
type: guide
status: current
owner: project-governance
created: 2026-09-06
updated: 2026-09-06
summary: Opt a repository into top-level Codex startup updates while preserving ongoing work and ordinary Git hooks.
---

# Enable Compatible Startup Updates

## Set Up Once

Deliberately adopt and bootstrap runtime 2.5.0 or later first. Existing repositories remain on
manual updates until an operator authorizes this integration. From the repository root, run:

```sh
project-governance startup enable --provider codex
```

Review and commit the generated hook configuration, launcher, instruction pointer, and profile
change. Codex requires trust for the project and the exact native hook definitions. Use its
`/hooks` interface to review them, then start a fresh top-level task. Setup never grants trust
or commits these integration changes itself. Customized launchers or an explicit manual profile
require deliberate reconciliation.

Codex is the enabled adapter in this release. Claude remains disabled pending complete live
root/child conformance. The Antigravity Gemini route remains manual because its current hook
contract does not establish native root-task identity. A plain terminal or unsupported host never
manufactures a startup reservation.

## What Happens At Startup

The hook checks once, with a bounded metadata cache, and gives the parent agent a short result.
The parent decides whether its actual assignment permits a compatible update. Investigation,
planning, a small fix, and unrelated staged or unstaged work can already be underway. Execution
of a substantial implementation plan, independent review, release certification, and read-only
requests retain the current runtime.

For an eligible task, the parent follows the installed startup resource and runs:

```sh
project-governance startup apply --task-id <native-receipt> --work-state minor --reason "Only an independent minor fix is underway"
```

The updater prepares and verifies the candidate, checks for conflicting work or active runtime
users, and commits only the new runtime lock through normal Git hooks and signing. It never
pushes. The parent reads the new installed guidance before continuing. At normal task closeout,
run `project-governance startup finish --task-id <native-receipt>` once. Native session-end events
also release the reservation. A later operator prompt reopens it without another update check.
Positively dead host processes can be reconciled at a later check.
Unknown live ownership defers an update instead of guessing from an age limit.

Subagents, resumes, forks, and compaction do not check for releases. Delegated workers inherit
runtime access from their parent. A resumed task detects a changed lock and refreshes its context.

## Policy And Recovery

The tracked profile supports:

```yaml
runtime_updates:
  policy: compatible
  cache_seconds: 43200
  discovery_seconds: 5
  install_seconds: 180
```

The default policy is `manual`. Change it back to stop automatic adoption. The other values are
optional bounded budgets; the cache contains only distribution metadata and does not approve a
worktree. Major versions, missing compatibility declarations, migrations, changed startup
integration, and incompatible Python requirements require deliberate adoption.

A failed download or candidate check leaves the working runtime intact. If an interruption leaves
a journal, use `project-governance startup recover`. Recovery restores an uncommitted update or
finishes validation of the committed version. Independent file or Git changes are preserved for
inspection. If the initial directory-to-pointer switch stopped with the runtime path missing, run
`python3 tools/governance-bootstrap.py --recover-startup-enable`, then review and retry setup.
Manual pinned-wheel bootstrap also supports an already enabled generation pointer.

`project-governance doctor` reports startup policy and interrupted state without querying releases.
Ignored state lives in `.governance/startup`; environments live in `.governance/runtimes`. Retained
environments are rollback material, never a second version authority. Do not remove one while a
process or recovery journal still uses it.

See the [owning specification](../specs/startup-runtime-updates.md) for selection, authority, and
transaction guarantees.
