---
id: guide.cowork
title: Use Governance from Cowork
type: guide
status: current
owner: project-governance
created: 2026-11-10
updated: 2026-11-10
summary: Register a Mac checkout and use its pinned native runtime through the distributable Cowork plugin.
---

# Use Governance from Cowork

The plugin connects Cowork to the real project on your Mac. Tasks, edits, checks and local commits
use that project's pinned Governance installation. No Codex installation is required.

Use Governance 4.6.0 and the matching plugin ZIP. The
[owning specification](../../specs/cowork-host-plugin.md) defines the integration and its boundaries.

## Set up a project

Install a Governance release that includes the Cowork command using the normal installation process.
From the intended project root, register it:

```sh
printf '%s\n' '{"label":"My project"}' | .governance/runtime/bin/project-governance cowork register
```

Registration records this Mac's paths outside the repository. It grants the plugin access to this
checkout. Checks and Git hooks execute project code on the Mac, and returned project text enters
Claude. Existing provider settings remain in effect. Registration does not publish anything or change
a runtime pin.

Install the matching Cowork plugin ZIP through Claude Desktop's plugin interface. The ZIP is the same
for teammates; each teammate registers their own projects. Never distribute the machine-local
registration files. Claude's own permission controls still apply.

After an intentional Governance upgrade or a checkout move, rerun registration. An unchanged worktree
keeps its project ID. A recreated worktree has a different identity and needs fresh registration.

## Work through the plugin

Ask Cowork to select the registered project and start or resume its task. The plugin reads and edits
the Mac files directly, so edits to a separate sandbox copy do not change the authoritative candidate.
Run checks at logical batch boundaries. The returned run ID lets Cowork reconnect to the same result.

Local commits use normal hooks. They include whole selected files, replace partial staging on those
files, and preserve unrelated staged work. Keep the commit request ID to inspect its outcome after
reconnection. Never repeat an uncertain commit or check just because the connection dropped.

A stale file hash means another edit intervened. Read the file and reconcile it. An unknown commit
outcome means inspect the retained native result. Neither condition calls for disabling hooks or
resetting unrelated work.

## Compatibility and limits

The plugin's supported Node bundle runs through Claude Desktop. The native Governance runtime still
requires its own declared Node version. Setup captures its location; it does not depend on the GUI
app finding the user's shell configuration.

The native host journey was verified on Claude Desktop 4.23118.1 on Apple Silicon (arm64).
Intel Macs and other Desktop versions are not yet qualified. Alternate-home, Node and project-path
fixtures, including spaces, demonstrate portable configuration, not testing on a second physical Mac. The plugin does
not expose arbitrary shell commands, credential reads, deployment or remote publication.

Check run IDs and harness evidence IDs are different. Checkpoints may describe retained runs in their
summary with an empty evidence array; this release does not import check runs into harness evidence.
Use only evidence IDs actually returned by task status.

Signing credentials are not forwarded by registration. A project that requires interactive Git
signing may report a signing failure through its hook output. Semantic context retrieval uses the
native provider settings; the adapter does not add its own provider timeout. Retain the task handle
and inspect native status after a host timeout rather than repeating a mutation.
