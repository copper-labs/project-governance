# Operate An Optional Provider Agent

Use these helpers when the user authorizes delegation. The parent remains responsible for scope,
integration, verification, and delivery. Keep its permission limits and relevant conversation
context in the task: a child does not inherit the parent's conversation or in-memory tools.

## Prepare The Assignment

Resolve the repository root and its exact `.governance/runtime/bin/harness-agent`
executable. Use that absolute path for every operation; a same-named global command might belong
to another wheel. The helper supports macOS and Linux with Python 3.9 or later. Provider CLIs and
authentication are optional prerequisites, not installed by governance.

The adapters enable full native tools for every role. Launch only within the parent's actual
authority. Do not use the wrapper to cross a sandbox or permission boundary. Full-access execution
is not a filesystem sandbox, and an additional root or shared-workspace flag does not make it one.
Use an appropriately authorized host when the current parent cannot grant native full access.

Give the child the outcome, workspace, existing authorization, constraints, relevant references,
and required evidence. Select the exact model and effort from the user's instructions or host
configuration. Never infer a cheap fallback. Inspect current work before assigning edits.

Pass required tool names or categories when the task requires observed use. Native categories
include `read`, `edit`, `command`, `web`, and `browser`; their availability varies by provider.
An agent may read or edit through a shell, which is recorded as `command`, not invented evidence
of a native file tool. Reconcile artifacts and commands against the actual acceptance criteria.

## Start And Follow

Use the resolved absolute command in place of `$agent` and supply actual values:

```sh
"$agent" doctor --provider codex
"$agent" start --provider codex --workspace "$workspace" \
  --model "$model" --effort "$effort" --task-file "$task_file"
"$agent" wait "$job_id" --after 0 --seconds 30
"$agent" events "$job_id" --after "$cursor"
"$agent" result "$job_id"
```

`start` returns a durable job ID. Continue useful independent work and use waits of at most 60
seconds. Carry forward the returned cursor to avoid replaying output. `run` streams normalized
JSON events through completion when foreground execution is more appropriate. Meaningful public
text and tool events indicate provider activity. A supervisor heartbeat reports liveness and time
since provider activity; it is not a new model response.

`--timeout` sets an overall deadline including queue time. `--idle-timeout` bounds provider
inactivity. Both default to zero (disabled); respect the host's task-duration policy.
`--require-tool` is repeatable. `--shared` asks for no project edits while keeping native tools.
`--add-dir` adds another authorized root. `--context-file` supplies bounded extra evidence.

An optional JSON file selected with `--config` provides `version: 1` and a `providers` object.
Each provider entry can set `model`, `effort`, and `executable`. Explicit arguments override it.
Keep credentials in the provider's existing authentication, not this file. The host chooses its
location; personal bindings can stay outside Git. There is no task-to-model policy in this helper.

## Finish, Continue, Or Recover

Read the terminal result. Check observed model, capabilities, completed tool evidence, artifacts,
reported checks, remaining work, and cleanup. A model's claim or exit zero alone is not success.
Provider effort observation may be unavailable; do not represent the requested value as observed.
Workspace snapshots can include pre-existing work and do not attribute every change to the child.

```sh
"$agent" follow-up "$job_id" --task-file "$next_task_file"
"$agent" cancel "$job_id"
"$agent" status "$job_id"
```

Follow-up uses the completed job's exact session, model, effort, roots, and constraints. A missing
session requires a new explicit assignment, never the most recent ambient conversation. Cancel
is a request; confirm a terminal state and cleanup before reusing its workspace. Partial edits
remain. Requests requiring new human input or unavailable parent-only tools produce a blocker.

The runner coordinates only its own jobs. Conflicting nested jobs fail before queueing, including
conflicts with earlier ancestors. Return control to the parent or use a separately authorized
workspace. Do not remove ancestry metadata to bypass that check. Native parents outside this
runner can delegate normally; a Claude parent can invoke the Codex skill directly.

Job evidence is private local state under the user's `harness-agents` data directory,
or `HARNESS_AGENT_STATE`. It is separate from governance telemetry and includes the
original task. Preserve evidence and partial work. Finish or cancel active jobs before replacing
their installed governance environment; bootstrap refuses replacement while it remains in use.
