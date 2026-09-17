---
id: resource.startup-runtime-updates
title: Top-Level Startup Runtime Updates
provenance: package-default
---

# Top-Level Startup Runtime Updates

Only a new top-level task may use a native startup receipt to update governance. Subagents and
cross-provider workers inherit the parent's exact version and never discover, bootstrap, or apply
updates. Resumes, forks carrying existing work, clear, and compaction do not create a new update
opportunity. Return a version mismatch to the parent.

When a supported startup hook reports a compatible candidate, assess the current request and
existing work. Minor edits, investigation, planning, and small fixes already underway remain
eligible. Defer a substantial implementation plan under execution, a candidate under review or
certification, or a read-only request. A plan document alone does not establish a freeze.

Use the receipt supplied by the hook and the repository-local command:

```sh
.governance/runtime/bin/project-governance startup apply --task-id <receipt> --work-state minor --reason "Only an isolated small fix is underway; no substantial plan or reviewed candidate depends on this version"
```

`not-started` also permits application. `substantial-plan`, `review`, and `read-only` defer it.
Runtime code checks actual worktree overlap, release compatibility, active users, and commit
isolation. Do not bypass a deferral, stash unrelated work, broaden the commit, or start a retry loop.
Unrelated edits made while discovery ran can be reassessed without repeating artifact proof.

After `updated`, read the needed versioned governance guidance again before continuing. Preserve
minor work already done and reassess only proof affected by the changed rules. A required host
instruction refresh remains deliberate; reading a file does not rebuild the host's startup chain.

Report one concise update, concrete deferral, or required operator action. Normal current results
need no announcement. At normal top-level task closeout release its reservation once:

```sh
.governance/runtime/bin/project-governance startup finish --task-id <receipt>
```

This is housekeeping at task closeout, not a per-step test or documentation boundary. A native
SessionEnd hook also releases the reservation. A later operator prompt reopens the reservation
without discovering releases or creating another update opportunity. Never release another task to force an update.
Only the operator may deliberately enable host integration, recover an interrupted update, or
approve a major upgrade or migration. Automatic local commits never authorize remote pushes.
