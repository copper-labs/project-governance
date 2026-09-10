---
id: guide.provider-agents
title: Delegate To An Optional Provider Agent
type: guide
status: current
owner: project-governance
created: 2026-09-06
updated: 2026-09-06
summary: Start, observe, and reconcile a native Gemini, Claude, or Codex assignment from any shell-capable parent.
---

# Delegate To An Optional Provider Agent

Use this guide when an authorized parent agent needs another provider to implement, test, research,
or review a bounded task. The [owning contract](../specs/provider-agent-skills.md) defines the
capability and process boundaries. These optional helpers are available in the 2.4.0 wheel.

Gemini ships with an operator-authorized validation exception: quota prevented its live capability
and Gemini-parent routing checks. Those checks remain unverified for 2.4.0. Codex and Claude have
live capability evidence, including Claude delegating to Codex.

## Prepare The Host

Install the governance wheel through the repository's normal pinned bootstrap. It supplies
`harness-agent` and the `harness-gemini-agent`, `harness-claude-agent`, and `harness-codex-agent` skills without
requiring any provider. The helper supports macOS and Linux; native Windows is not supported in
this release. Other governance commands retain their existing platform support.

Adoption defaults cross-model work to these harness skills. Initialization and bootstrap add a
small managed routing section to `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, and an existing nonempty
`AGENTS.override.md`. Authored instructions outside that section are preserved. No system wrapper
is removed. Start a fresh parent session after setup and inspect `project-governance doctor` for
the `harness_delegation` route and any missing integration. Explicit operator route choices still
apply; missing access never silently selects another wrapper.

Install and authenticate only the provider you intend to use:

| Provider | Existing native login | Native integration |
| --- | --- | --- |
| Gemini | Start `agy` interactively; verify with `agy models` | Antigravity CLI |
| Claude | `claude auth login`; verify with `claude auth status --json` | Claude Code print mode |
| Codex | `codex login` | Local stdio app server |

Provider tools, skills, hooks, MCP servers, and credentials remain in their native installations.
The wrapper does not install accounts or copy secrets. A parent-only desktop tool is not
automatically available to another provider. Name required access in the assignment and reconcile
the provider's advertised and observed capabilities.

## Run One Assignment

Resolve the repository root. Set `agent` to its absolute
`.governance/runtime/bin/harness-agent` path, `workspace` to the authorized absolute
workspace, and `task_file` to a file describing the task and constraints. Select `model` and
`effort` from the provider's current available values.

```sh
"$agent" doctor --provider codex
"$agent" start --provider codex --workspace "$workspace" \
  --model "$model" --effort "$effort" --task-file "$task_file"
```

The first command checks the executable and version without a billable call. It does not certify
authentication or every tool. The second returns a durable job ID. All provider roles retain full
native tool capabilities; scope remains the parent's assignment. This is trusted local execution,
so the parent must actually have authority to grant that access.

A Claude parent can run the exact command above to delegate to Codex. It does not need a Codex
desktop task, a new MCP server, or a second wrapper implementation. If the parent itself is a
wrapped job, overlapping child ownership fails immediately; use a separate authorized workspace
or return control to the parent.

## Use A Writer With Bounded Readers

In 2.6.0 or later, add `--writer` to the writer's `start` command when independent readers can
help. Dispatch up to two justified reader assignments from the same primary, adding `--shared`
to each. Use the installed delegated-execution skill to choose distinct questions, evidence, and
needed-by points. Continue useful work and reconcile one concise result from each reader.

Default access remains exclusive. An overlapping second writer waits; an exclusive assignment
waits for both the writer and readers. Readers cannot bypass an earlier queued exclusive job.
Use exclusive access for a frozen approval review or an operation requiring isolation. The flags
describe cooperation, not a filesystem sandbox: readers must not edit Git or run shared-output
builds/tests. Native agents outside this helper still need primary-owned coordination.

The writer and readers must be siblings. A wrapped writer cannot start overlapping child readers,
and a wrapped reader cannot start an overlapping writer. Existing job state remains compatible;
older runners treat the new writer mode conservatively as exclusive. New follow-ups retain the
chosen access. Different provider models are optional; role names never select a model or effort.

## Observe And Reconcile

Use the returned ID and carry forward each returned cursor:

```sh
"$agent" wait "$job_id" --after 0 --seconds 60
"$agent" events "$job_id" --after "$cursor"
"$agent" result "$job_id"
```

Wait returns on new events, completion, or its time limit. A text or tool event records provider
activity. A heartbeat reports that the supervisor is alive and how long it has been since provider
activity. `run` accepts the same launch options and streams JSON through the terminal result when
the caller prefers foreground execution.

Check the final state, remaining work, observed model, artifacts, tool evidence, and cleanup.
Model-reported checks are separate from observed tool operations. Requested effort is not presented
as observed when a provider omits that field. Missing required tools, denied operations, malformed
completion, or remaining work prevent success. The parent still verifies the actual changes.

## Configure Or Recover

Pass `--config` with a host-owned or ignored personal JSON file containing `version: 1` and a
`providers` object. A provider entry accepts `model`, `effort`, and `executable`; command arguments
take precedence. No model, effort floor, role policy, or task-to-model assignment ships as a default.
Future model changes are ordinary host configuration changes, not new wheel releases, unless the
native protocol itself changes.

`--timeout` and `--idle-timeout` are caller-owned deadlines and default to disabled. Native Gemini
uses a recorded maximum print ceiling when the overall deadline is disabled, because native zero
means immediate expiry. Add `--require-tool` for each category or exact tool that must be exercised.

```sh
"$agent" follow-up "$job_id" --task-file "$next_task_file"
"$agent" cancel "$job_id"
"$agent" status "$job_id"
```

Follow-up resumes the exact completed session. Cancellation preserves partial work; confirm its
terminal result before reusing the workspace. A provider request for fresh human input produces
a blocker and cleanup rather than an indefinite wait. Resolve the missing input, then follow up
with an explicit task when the provider session remains available.

Evidence lives outside the installed wheel in a private user data directory. Set
`HARNESS_AGENT_STATE` to select another private location. The original task is retained;
keep credentials out of it. Finish or cancel queued and running jobs before upgrading. Bootstrap
refuses to replace an environment still used by workers or their cleanup guardians.

## Run Tests Without Model Polling

Use the installed Test Execution skill before a substantial build/test batch. It keeps quick checks
direct and uses project-owned assertions for external batches. The
[Test Execution contract](../specs/test-execution.md) defines the request format and recovery limits.

Submit `harness-agent batch --request-file FILE`, retain its job ID, then observe with
`harness-agent wait ID --until-terminal`. The observer produces a bounded terminal summary and does
not launch a model. Host wait/cleanup rules still apply; detachment is not proof of survival.

For a fully managed cycle, launch `harness-agent cycle` from an operator terminal outside the native
provider's tool tree. Choose `--provider codex` or `--provider claude`, workspace/task and the existing
model/effort binding. `--authorized-full-access` requires actual authority for the native adapters.
Preparation exits, the batch runs, then one exact-session follow-up assesses its result. The command
prints durable phase job IDs; interrupted cycles can use `--prepared-job ID` without another preparation.
This supports the two CLI hosts, not transparent takeover of arbitrary desktop/IDE sessions.

The feature release refreshes the existing managed instruction block. Adopt it deliberately and
start a fresh host session. Batch records use protocol 2; older harness executables sharing that
job store refuse unfamiliar records. Use the matching current helper for that store; ordinary
governance checks are unaffected. Do not delete unknown records or split a shared workspace across
independent stores to evade ownership.

`project-governance telemetry status` includes retained Test Execution use, path choices, outcomes,
durations and available token totals. It does not observe every skill read or prove savings. Data
stays in the existing bounded local file. No separate collector or background audit is installed.
