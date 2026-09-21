---
id: governance.hook-and-check-taxonomy
title: Hook And Check Taxonomy
type: governance
status: current
owner: project-governance
created: 2026-07-05
updated: 2026-08-27
summary: Defines thin hooks, their package CLI stages, and the narrative inputs they validate.
---

# Hook And Check Taxonomy

Git hooks are thin launchers. They do not download, upgrade, or contain governance logic. Bootstrap
installs the exact wheel named by the runtime lock; an unavailable runtime produces one actionable
bootstrap message.

| Boundary | Command | Scope |
| --- | --- | --- |
| Commit message | `project-governance check --stage commit-msg --mode impacted --commit-message-file <path>` | Useful subject and authored body only |
| Pre-commit | `project-governance check --stage pre-commit --mode impacted` | Staged changed paths and changed-file secrets |
| Pre-push | `project-governance check --stage pre-push --mode impacted` | Branch-aware impacted checks; full tracked secret scan |
| Pre-PR | `project-governance check --pack pr-description --stage pre-pr --mode all --pr-body-file <path> --pr-title <title>` | Pull-request title and body only; no branch comparison or code-validation replay |
| CI PR | `project-governance check --stage ci-pr --mode impacted --pr-body-file <path> --pr-title <title>` | Provider-supplied PR title and body plus CI changed-path boundary |
| Release | `project-governance check --stage release --mode all` | Explicit broad boundary |

The normal commands are:

```sh
project-governance check --stage pre-commit --mode impacted
project-governance check --pack <pack-id>
project-governance plan --stage pre-push --mode impacted --json
project-governance doctor
project-governance telemetry status
```

`--mode all` without a named pack is an explicit broad boundary, not a repair shortcut. With
`--pack`, it supplies only that pack an all-subject envelope; it does not expand pack selection.
`--pack` can otherwise retain the failed stage and relevant changed scope while selecting only the
named pack and its dependencies.

The commit hook supplies Git's commit-message path. The shipped pre-PR hook deliberately names only
`pr-description` and uses no branch comparison; it may supply `--pr-body-file` with `--pr-title`,
or the checker reads
`PR_DESCRIPTION.md` and `PR_TITLE` from Git's metadata directory so linked worktrees do not share
drafts. The generic `pre-pr` stage remains available for a deliberate adopter-owned boundary, but
it is not the normal second local sign-off. Provider CI materializes its live PR body and supplies
the live title. The normative fields and editorial boundary live in the
[Change Narrative Contract](../specs/change-narrative-contract.md).

Git invokes pre-commit again when a commit is retried and pre-push again when a push is retried.
That automatic invocation is the affected recheck for the repaired candidate. Do not run the same
stage manually immediately before the Git operation. Use a named pack first only when focused
diagnosis needs faster or narrower feedback.

Native task lifecycle hooks are a separate opt-in boundary under the
[startup update contract](../specs/startup-runtime-updates.md). They report a candidate to the parent,
which assesses the task before asking the runtime to apply it. The native adapter contains no
release-selection policy. Commit hooks invoked by an updater can join its validation transaction;
they never initiate another update.

## Unified engine transition

The [migration inventory](../reference/2026-09-20-engine-migration-inventory.md) carries this contract's
intent into the proposed TS engine and accounts for every hook/check category. Current behavior remains
in force until the relevant category change and cutover are accepted. The workflow engine must remove
routine coordination without reintroducing duplicate gates or per-tool compliance paperwork.

### Compiled preview hook installation

The compiled preview exposes `project-governance hooks` to inspect the four managed launchers.
`hooks --apply` creates missing launchers or repairs their executable mode; `--configure` additionally
selects `.githooks` in Git configuration. Existing custom launchers, a different configured hook
directory, and authored hooks in Git's default directory require reconciliation before any changes.
A linked worktree needs `extensions.worktreeConfig` enabled before this command can configure its
hooks without changing sibling worktrees. The command does not enable that extension itself.

Migration code may supply exact prior templates from a verified installation to replace known old
launchers. The public command does not guess ownership from comments or overwrite arbitrary hooks.
This is preview behavior; the current wheel installation remains authoritative until qualified cutover.
