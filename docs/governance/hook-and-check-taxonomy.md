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
