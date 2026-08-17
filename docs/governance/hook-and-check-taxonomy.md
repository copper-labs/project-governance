---
id: governance.hook-and-check-taxonomy
title: Hook And Check Taxonomy
type: governance
status: current
owner: project-governance
created: 2026-07-05
updated: 2026-08-11
summary: Defines thin hooks and the package CLI stages they invoke.
---

# Hook And Check Taxonomy

Hooks are thin launchers. They do not download, upgrade, or contain governance logic. Bootstrap
installs the exact wheel named by the runtime lock; an unavailable runtime produces one actionable
bootstrap message.

| Boundary | Command | Scope |
| --- | --- | --- |
| Commit message | `project-governance check --stage commit-msg --mode impacted` | Message policy only |
| Pre-commit | `project-governance check --stage pre-commit --mode impacted` | Staged changed paths and changed-file secrets |
| Pre-push | `project-governance check --stage pre-push --mode impacted` | Branch-aware impacted checks; full tracked secret scan |
| Pre-PR / CI | `project-governance check --stage pre-pr --mode impacted` | Branch-aware changed paths; full tracked secret scan |
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
