# Using Project Harness

These commands describe the current development CLI. The accepted deployment is governance with its
continuity module, targeting Codex only. Bundled installation is not implemented yet. Standalone
adoption and Cowork support are outside the current product scope.

Use the absolute path to `bin/harness`, or put that directory on PATH. Run it from the target
workspace. The default SQLite store lives under the Git common directory, so linked worktrees
share task history. Never put the live database in Git. `--db` selects a different local store.

## Start and resume

```sh
harness task create --outcome "Fix the failing parser check" --scope .
harness resume --task TASK_ID --session HOST_SESSION_ID
harness context get --task TASK_ID --path src/parser.ts --mandatory AGENTS.md
harness checkpoint --task TASK_ID --summary "Failure isolated to empty input" --next "Add the boundary fix"
```

Replace placeholders with returned IDs. `CODEX_THREAD_ID` or `HARNESS_SESSION` may provide session
identity; otherwise pass it. Without a stable session, concurrency coverage is unknown. Resume
never guesses which open task belongs to you. Missing mandatory context blocks delivery.
Use `--at staged` or `--at REV` for an immutable Git tree. Default reads actual worktree bytes.
Without paths, context returns bounded candidate names. It does not dump the repository.

Context bytes have a cumulative task ceiling. A new CLI invocation does not reset it.
`budget set --task TASK_ID --bytes 524288 --authority-ref HOST_REQUEST` changes that ceiling.
Large artifacts support bounded `artifact read --task TASK_ID --artifact ID --offset 0 --length 16000`.

## Check through governance

```sh
harness governance plan --task TASK_ID --staged
harness check run --task TASK_ID --authority-ref HOST_REQUEST --request-file batch.json
harness check result --action ACTION_ID --wait 10
```

The project needs governance's `project-governance` and `harness-agent` public executables, normally
in `.governance/runtime/bin`. `--executor` selects an explicit executable. Harness does not install
or fork governance. Use the governance version-1 batch request contract: workspace, input roots
or manifest, output roots, deadlines, cleanup requirement, host and ordered cases with exact argv
and expected exit codes. A convenience `-- /absolute/check-command args` declares only root scope;
it does not prove exact input contents. A check command is not sandboxed. The host must authorize
its effects. `--authority-ref` is a traceable host assertion, not a forged capability or approval.

Wait is bounded to 30 seconds. Check run/result exit codes are 0 success, 1 established failed assertions,
2 refused/invalid/unconfirmed, and 3 pending. `recover` observes existing owners; uncertain submission is never
replayed. Inspect the original governance job when a response is lost. Full logs stay with its
owner and are referenced by the receipt. Passing checks do not accept the task.

## Cooperate across workspaces

```sh
harness paths --task TASK_ID --session SESSION --mode write --path src/parser.ts
harness status --task TASK_ID --session SESSION
harness task revise --task TASK_ID --expected-version 1 --scope /absolute/new/worktree
harness resume --task TASK_ID --session NEW_SESSION --parent-attempt ATTEMPT_ID
harness task fork --task TASK_ID
harness reconcile --task TARGET_TASK --target MERGE_COMMIT --source SOURCE_TASK@VERSION
```

A continuation uses the same task and a new attempt. Inspect `task show` for the current revision;
explicitly add the new workspace scope before reading or checking there. A fork is a separate task
with pinned parent task/checkpoint lineage; it carries context, not accepted status or executable
actions. Read/write intentions are advisory. They cover declared paths and cooperating hosts,
not arbitrary editor writes, Git index operations, ports or devices. The host coordinates those.

Reconciliation compares tree-bound evidence and declared manifest files with the merged source.
Root-only checks and live snapshots remain unknown; matching declared files does not prove input
completeness or environment validity. Full observations are stored as a linked receipt artifact. It never changes the
old receipt or authorizes omitted checks. Ask governance to plan proof for the combined change.
`export --task ID [--include-artifacts]` produces a selected bundle. `import --file bundle.json`
stores inert historical context; it does not activate imported tasks, authority, acceptance or jobs.

## Host entry and measurement

`init` previews concise routing instructions; `init --apply` explicitly installs the marked block
in AGENTS.md or CLAUDE.md. It preserves surrounding text and refuses symlinks/malformed markers.
`host hook` accepts SessionStart JSON on stdin and returns a bounded resume for an already-bound
session. Installation into real Codex lifecycle configuration remains a separate qualification.
CLAUDE.md output is a legacy development capability, not a support claim. Cowork and Claude Code
qualification are deferred. Codex manual entry is the current qualification path.

`usage` reports known subtotals and missing coverage. `usage record --task ID --file usage.json`
accepts incremental native observations with a stable source and measurementId. Missing data is
unknown, not zero. Cached input and reasoning counts are subsets, never added twice.

SQLite remains the local operational store. JEV, Mnemos, automatic gate caching, distribution and
release publishing are not dependencies. See the roadmap for their evidence gates.

Use `check cancel --action ID --authority-ref HOST_REQUEST` to request owner cancellation.
Unknown owner state stays visible; cancellation is not an invented cleanup receipt. Resume returns
its attempt ID and workspace-scope status. Forked findings carry their original task revision.

`check cancel` reports the cancellation request, not a test verdict: 0 acknowledged/terminal,
3 pending, 2 refused/unknown. Manifest reconciliation compares stored Git blob bytes with the
original worktree hashes. EOL/clean-smudge/LFS transformations can produce a conservative stale
classification; inspect that representation difference before concluding the source changed.
