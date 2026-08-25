---
id: governance.hook-and-check-taxonomy
title: Hook And Check Taxonomy
type: governance
status: current
owner: project-governance
created: 2026-07-05
updated: 2026-08-24
summary: Defines thin hooks, their package CLI stages, and the narrative inputs they validate.
---

# Hook And Check Taxonomy

Hooks are thin launchers. They do not download, upgrade, or contain governance logic. Bootstrap
installs the exact wheel named by the runtime lock; an unavailable runtime produces one actionable
bootstrap message.

| Boundary | Command | Scope |
| --- | --- | --- |
| Commit message | `project-governance check --stage commit-msg --mode impacted --commit-message-file <path>` | Commit change narrative only |
| Pre-commit | `project-governance check --stage pre-commit --mode impacted` | Staged changed paths and changed-file secrets |
| Pre-push | `project-governance check --stage pre-push --mode impacted` | Branch-aware impacted checks; full tracked secret scan |
| Pre-PR | `project-governance check --stage pre-pr --mode impacted --pr-body-file <path> --pr-title <title>` | Branch-aware changed paths, full tracked secret scan, and PR change narrative |
| CI PR | `project-governance check --stage ci-pr --mode impacted --pr-body-file <path> --pr-title <title>` | Provider-supplied PR title and body plus CI changed-path boundary |
| Release | `project-governance check --stage release --mode all` | Explicit broad boundary |

The normal commands are:

```sh
project-governance check --stage pre-commit --mode impacted
project-governance check --pack <pack-id>
project-governance plan --stage pre-pr --mode impacted --json
project-governance doctor
project-governance telemetry status
```

`--mode all` is an explicit broad boundary, not a repair shortcut. `--pack` runs one named pack
against the relevant changed scope so a repair loop stays small.

The commit hook supplies Git's commit-message path. A pre-PR command may supply `--pr-body-file`
with `--pr-title`; when it does not, the PR-description checker reads `PR_DESCRIPTION.md` and
`PR_TITLE` from Git's metadata directory so linked worktrees do not share drafts. Provider CI
materializes its live PR body and supplies the live title. The normative fields and editorial
boundary live in the
[Change Narrative Contract](../specs/change-narrative-contract.md).
