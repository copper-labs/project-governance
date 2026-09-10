---
id: spec.provider-agent-skills
title: Optional Provider Agent Skills
type: spec
status: current
owner: project-governance
created: 2026-09-06
updated: 2026-09-06
summary: Defines optional Gemini, Claude, and Codex delegation with full native capabilities, durable jobs, and observable progress.
---

# Optional Provider Agent Skills

## Purpose And Release Boundary

A parent agent can delegate an authorized assignment to Gemini, Claude, or Codex, keep working,
observe progress, and collect a result. The same commands work from any parent with shell access.
For example, Claude can start Codex, then wait for its code changes and test evidence.

This contract defines the standalone 2.4.0 capability release. Implementation-plan templates,
task-to-model planning, role presets, model rankings, and price comparisons are separate work.
They are not prerequisites for these wrappers.

For 2.4.0, the operator explicitly waived Gemini live capability and Gemini-parent routing
acceptance because provider quota prevented execution. Deterministic coverage remains required;
the waived live checks remain unverified and deferred. Codex/Claude live proof and automated
release gates are not waived. The release notes disclose this scoped exception.

## Architecture Decision

Use one Python job runner and three small adapters around the installed native provider agents.
Use Antigravity's headless stream for Gemini, Claude Code's headless stream for Claude, and Codex's
local stdio app server for Codex. Preserve each native agent's tools, instructions, authentication,
skills, hooks, and configured MCP connections. Do not rebuild the agent loop around a model API.

The runner owns requests, process supervision, workspace coordination, events, cancellation, and
completion records. Each adapter owns its command, wire protocol, session identity, tool-event
translation, and provider-specific errors. Provider roles describe the assignment; they do not
remove tools or select a cheaper model.

The wheel ships the optional helper under `project_governance_runtime.provider_agents` and exposes
`harness-agent`. Three thin skills explain its use. The governance CLI, doctor, hooks,
checkers, and context selector neither import this helper nor launch a provider. Installing or
updating governance does not authenticate, install, or probe any provider.

This is a narrow addition to the existing [runtime boundary](../architecture/governance-runtime.md).
It does not restore the removed provider control plane: no model router, generic scheduler, review
ladder, remote worker, nested-delegation policy, or governance check that calls an agent. The parent
owns coordination and reconciliation; the helper supervises only jobs explicitly submitted to it.

Implementation amends the runtime architecture, kernel specification, and delegated-execution skill
to give this helper that ownership explicitly. The existing prohibitions remain for governance
check execution, model selection, and automatic delegation.

## Ownership

| Concern | Owner |
| --- | --- |
| Shared lifecycle, provider adapters, and thin skill instructions | Governance wheel |
| Assignment, permitted actions, model, effort, deadlines, and required capabilities | Parent and host repository |
| Optional provider defaults and local executable locations | Host or operator configuration |
| Account access, credentials, native tools, hooks, and MCP servers | Existing provider installation |
| Whether work satisfies the task and may be published | Parent and existing host policy |

The runner accepts explicit model and effort values or a caller-selected JSON configuration file.
Arguments override that file. No personal model mix ships as a default. Configuration contains
provider bindings only; it does not prescribe which model a future implementation-plan task uses.
Model IDs and effort names remain provider-specific. Unsupported selections fail visibly.

## Repository Default And Host Activation

Adopting repositories use `harness-gemini-agent`, `harness-claude-agent`, and `harness-codex-agent`
by default for cross-model work. The command is `harness-agent`; helper environment variables use
`HARNESS_AGENT_`, and private job data defaults to `harness-agents` under the user data directory.
The existing wheel identity and `.governance/runtime` installation layout remain unchanged.

Initialization and deliberate wheel bootstrap install thin, marked routing sections in root
`AGENTS.md`, `CLAUDE.md`, and `GEMINI.md`. An existing nonempty `AGENTS.override.md` receives the same
pointer because Codex can load it instead of `AGENTS.md`. Empty overrides remain empty, preserving
Codex's [documented instruction discovery](https://learn.chatgpt.com/docs/agent-configuration/agents-md).
One wheel-owned Markdown resource,
`resources/harness-delegation.md`, owns the shared route. This is the adoption default, not a
separate opt-in or an ambient global-skill precedence assumption.

Only managed sections change. Preserve surrounding authored text, file permissions, and safe
in-repository symlinks. Reject external or replaceable runtime destinations, including case aliases,
and malformed markers before writing any section. Setup does not
rewrite this source checkout's own instruction files. Existing bootstrap launchers gain the route
through the installed `materialize_skills` entry point, without requiring a separate launcher refresh.

The parent resolves the exact repository-local command and does not silently fall back to a global
plugin, legacy script, or another model when the route is unavailable. Explicit operator choices
can override the default. Same-model native subagents remain available. Conflicting higher-priority
or custom instructions must be surfaced and reconciled; file placement cannot guarantee behavioral
enforcement. Restart the parent session after setup so startup instructions are loaded again.

Core `doctor` reports the configured default, startup-file drift, missing installed resources,
and command location. It never runs a provider or claims to detect every global instruction
conflict. Release proof includes native-parent route selection while ambient wrappers are present.

## Full Capabilities And Authority

All three adapters start in the provider's noninteractive full-access mode. They retain native
file reads, edits, commands, tests, network tools, and configured integrations. A QA or architecture
assignment has the same available tools as a coding assignment. Deliverable instructions can ask
for a review without edits; that is task scope, not a reduced tool profile.

The parent must carry its actual authority and constraints into the assignment. Full access is
trusted local execution, not a filesystem sandbox. A root list coordinates known workspaces; it
does not prevent access elsewhere. The skill must not use a full-access launch to exceed a parent
sandbox, permission boundary, or user's authorization. Missing full-access authority is a reported
blocker, not a reason to silently run a weaker consultation.

Preserve native user and project configuration. Do not use bare, restricted, safe, or text-only
modes. Do not replace the provider's system prompt or disable its configured tools globally.
Provider policy or account restrictions still apply and must be reported when they block work.

Parent-only in-memory tools and desktop connectors cannot automatically be cloned across
providers. Expose equivalent access through existing native tools or operator-configured MCP
servers where available. Record the provider's advertised inventory and observed tool calls.
Never claim exact parity merely because full-access flags were passed. The parent names any
required tool categories or exact tools; missing successful use blocks successful completion.
The result distinguishes advertised, exercised, denied, and unknown access.

## Public Interface

The supported entry point is the installed `harness-agent` command. Selected context
packets may relocate a skill body; examples resolve the command from the installed environment,
not a scripts directory relative to that body. No global provider configuration is rewritten.

| Operation | Contract |
| --- | --- |
| `doctor --provider NAME` | Explicit local availability/version check; no billable model request and no claim that every tool works |
| `start --provider NAME --workspace PATH --model ID --effort VALUE --task-file PATH` | Return a durable job ID after its worker has started |
| `run` with the same arguments | Start and follow normalized events to a terminal result |
| `status JOB` | State, identity, activity, current tool, and artifact paths |
| `events JOB --after CURSOR` | Bounded events after an opaque byte cursor |
| `wait JOB --after CURSOR --seconds N` | Return on events, completion, or a caller-selected wait of at most 60 seconds |
| `result JOB` | Final completion record, or an explicit not-ready response |
| `follow-up JOB --task-file PATH` | New job using that completed job's exact provider session and binding |
| `cancel JOB` | Idempotent cancellation request; poll to confirm terminal cleanup |
| `list` | Bounded local job inventory |

A caller can supply context, additional roots, constraints, required tools, a request idempotency
key, an overall deadline, and an inactivity deadline. Zero disables a deadline. The runner imposes
no generic task deadline. CLI waits are bounded independently of job execution.

Antigravity treats a zero native print timeout as immediate expiry. With no overall deadline, its
adapter uses the native duration type's maximum ceiling and records that value; the supervisor
still owns cancellation. An explicit overall deadline is also passed as the native print ceiling.

The interface is usable from a shell-capable Claude, Codex, Gemini, or another parent. An additional
MCP transport is not needed for this release. If introduced later, it must call this runner rather
than maintain its own process or state implementation.

## Lifecycle And Process Ownership

Jobs move from queued to running, then exactly one terminal state: succeeded, blocked, failed,
cancelled, or timed_out. The state records whether the provider is still initializing or actively
working. A detached worker owns each job. A guardian cleans up its recorded provider descendants
if the worker disappears. Signals use checked process identities, not a PID alone.

Both worker startup and native execution wait behind a pipe gate until their process identity is
durably recorded. Parent death or failed publication closes the gate without starting that work.
The worker and guardian serialize descendant-record updates so one scan cannot lose a process
that the other observed before it detached.

Cancel and deadline expiry preserve partial work and observed evidence. They stop owned provider
processes before reporting terminal completion. The wrapper cannot promise cleanup of unobserved
remote or daemonized work; assignments must name any intentionally retained background services.
The result does not imply that cancelling a process rolls back edits or remote actions.

Workspace coordination covers this runner's jobs only. Default exclusive jobs serialize all
overlapping roots. The explicit `--writer` mode, added in 2.6.0, permits shared readers beside one
writer; overlapping writers still serialize. `--shared` readers carry a no-project-edits assignment
constraint but retain tools. The flags are mutually exclusive and do not grant authority to edit.
Every continuation serializes access to its exact provider session, including when workspaces
differ. Earlier queued exclusive jobs retain their place rather than being starved by new readers.
Ownership remains held until process cleanup is confirmed. The parent still coordinates native
agents outside the helper and the policy ceiling of one writer and up to two readers; the runner
does not add agent-count scheduling.

The new writer mode retains protocol 1 and is stored as `access: exclusive` with the strictly
boolean `allow_readers: true`. Only exclusive records may set that flag. An absent flag means the
original behavior. New runners recognize compatible sibling readers; older runners see an
exclusive claim and serialize conservatively. They cannot launch a second overlapping writer.
New follow-ups preserve the flag. An older runner may continue the job as fully exclusive, but
cannot broaden its authority. No migration or separate registry is introduced.

Read-only scope excludes Git changes, delegated writes, and build/test commands that alter shared
outputs or interfere with the writer. Use existing evidence and identify its snapshot. Work-in-
progress advice is provisional and cannot approve a later candidate. The constraint is enforced
through the host assignment, not filesystem isolation; before/after snapshots may contain the
writer's changes and do not attribute them to a reader.

The parent-independence example uses a native parent outside this runner. A wrapped parent may
start a child in a separate workspace, but conflicting nested ownership is rejected before
queueing. Propagate and inspect the full enclosing-job ancestry, including a grandparent's roots;
never let a parent wait behind its own claim.
Reader/writer overlap is restricted to sibling jobs dispatched by the primary. Overlapping nested
jobs involving the new writer flag fail before queueing, including a writer requested by a shared
parent. Otherwise a child can wait behind an exclusive sibling that itself waits for the parent.
This release does not implement ownership handoff or suspend a parent's active assignment.

A repeated idempotency key returns the original job only when the normalized request matches.
It never repeats a billable call silently. Follow-up requires a terminal job and a recorded provider
session. Never resume the most recent ambient session. Preserve workspace, binding, and constraints;
record the parent job. A missing or incompatible session is a failure, not a new conversation.

The helper holds a shared environment-use lock before loading its executable support and passes
that lock to detached workers and guardians until owned-process cleanup is confirmed. The lock
lives outside the replaceable virtual environment.
Governance bootstrap takes the exclusive lock before replacing that environment and fails clearly
if it is in use. It checks only the lock, never provider job state. Operators must finish or cancel
jobs before upgrading, including queued jobs. Direct external replacement of a Python installation
is outside this guarantee. No copied runtime cache or eager-import survival promise is introduced.

Every state reader, cancellation, continuation, and workspace-coordination operation validates the
stored protocol version. Unknown active state blocks conflicting new work; it is never treated as
free ownership. Preserve unsupported state for diagnosis instead of rewriting it.

## Provider Contracts

| Provider | Launch and completion |
| --- | --- |
| Gemini | Antigravity headless JSON stream; fresh project with explicit roots; exact conversation on follow-up; verify init model and full-access mode; consume terminal result and process exit |
| Claude | Claude Code print mode with partial-message JSON stream; preserve normal discovery; exact resume ID; disable inherited model fallback per invocation; verify emitted model identities and terminal result |
| Codex | Local stdio app-server handshake, explicit thread start/resume and turn start; full-access policy and exact model/effort; verify returned settings; consume item deltas and turn completion, then close the owned server |

The adapters retain provider differences. A terminal Codex turn does not require an app server to
exit by itself; a terminal headless Gemini or Claude result still requires a clean provider exit.
Reject malformed or truncated events, invalid initialization, unexpected sessions, model switches,
and successful exits without a valid completion. Preserve startup failures that occur before init.

Codex server-initiated requests always receive their defined decline, cancel, or unavailable
response, or an explicit unsupported-method error. Fresh input, connector approval, or missing
client tool execution is recorded as a blocker; interrupt and clean up the turn. Handle requests
during initialization as well as execution. Full-access mode is not authority to invent user input
or silently grant additional permissions.

Record requested and observed model separately. Record requested and observed effort separately;
when a provider does not emit effort, mark observation unavailable rather than copying the request.
There is no automatic model or provider fallback. Native transient retries can continue within
the caller's deadlines, with visible progress. Provider-internal usage or auxiliary models are
reported separately from the assignment model where identifiable.

## Streaming And Completion Evidence

Stream public response deltas, tool milestones, initialization, diagnostics, and terminal results
when the provider exposes them. Never emit private reasoning as a progress substitute. Native
buffered content is labeled as buffered. A periodic supervisor heartbeat means the worker is
alive; it must include time since provider activity and must not pretend the provider responded.

Events have a sequence, timestamp, type, and provider attribution. Readers reconnect with byte
cursors, receive bounded pages, and ignore a torn trailing line until complete. Streamed answer
text and the final answer are reconciled without duplicating an ordinary complete response.
Malformed or excessively large frames fail visibly rather than exhausting memory.

The completion record includes job/session identity, wrapper code identity, provider version,
requested and observed settings, final answer, remaining work, artifacts, model-reported checks
and sources, observed tool events, denials, provider outcome, process exit, and available usage.
Before/after Git snapshots describe workspace state; they do not attribute every change to this job.

Success requires a provider terminal success, valid structured completion with no remaining work,
successful required tool evidence, existing reported artifacts, and completed process cleanup.
Exit zero, a heartbeat, or the model's claim alone is insufficient. Intermediate recoverable tool
errors do not automatically fail a completed assignment. Unresolved denied required actions do.
Native structured denials are authoritative. A text fallback accepts a standalone denial diagnostic;
it must not infer an access denial from quoted source or mixed command output.

Provider inactivity starts at native launch, after workspace/session queueing and preflight. Those
earlier phases still consume an explicitly configured overall deadline. If process cleanup remains
pending, retain the completed answer and observed evidence durably before the worker exits. The
guardian and reader recovery preserve that receipt and publish a terminal outcome only after cleanup.
A signal permission failure retains process ownership, reports pending cleanup, and leaves status,
events, result polling, and cancellation usable. It never grants permission or counts as confirmed exit.

Requests and job evidence live in a private, configurable user state directory outside the
replaceable governance environment. Use private files and directories, atomic state writes,
bounded event reads, and secret redaction in exported diagnostics. Original task text is sensitive
local data; do not copy credentials into it or send job evidence to governance telemetry. Do not
silently delete artifacts, logs, or partial work as part of an upgrade.
The [Test Execution contract](test-execution.md) reuses this lifecycle for deterministic batches;
only its explicitly allowlisted aggregate observations enter local telemetry. Batch records use
protocol 2 with kind test-batch while live or awaiting cleanup, so older runners refuse them rather
than release unfamiliar resource claims. Confirmed terminal publication restores protocol 1, with
terminal status written last so interruption cannot expose an active claim to old recovery code.
Existing provider records retain protocol 1. Both share the same registry and process owner.
Redact recognizable credential fields inside JSON and Python dictionary text as well as structured
objects, including public tool events and terminal receipts. Repeated redaction is idempotent.

## Compatibility And Migration

Keep the wheel's Python 3.9 minimum. The optional support code uses the standard library and has
no provider SDK dependency. POSIX process supervision is the initial supported environment;
native Windows reports unsupported before launching. Linux and macOS require release evidence.
Provider CLIs and their account access remain optional operator prerequisites.

Extract the useful Gemini lifecycle and replace provider-specific coupling with the shared
contract. Adapt Claude's native invocation and stream handling; retire its role-based capability
restrictions in this new route. Add Codex through its native app-server protocol. Preserve source
provenance and tests, without personal paths or defaults in the wheel.

This repository becomes the source owner of the new harness route. Existing externally installed
wrappers and active jobs are not overwritten or deleted by a wheel release. Adopting or upgrading
a repository installs the harness default; external retirement is a separate explicit migration. Do not add
old-command compatibility shims or maintain two implementations inside governance.

## Acceptance And Release Proof

| Claim | Required evidence |
| --- | --- |
| Optional installation | Clean installed wheel works without provider binaries or credentials; core checks do not import or launch optional helpers |
| Full capabilities | Live job for each provider reads a fixture, changes it, runs a command and test, and uses network access with observed evidence |
| Parent independence | A Claude assignment invokes the installed Codex wrapper and consumes its result |
| Exact selection | Fixtures reject wrong model, session drift, unsupported settings, fallback, and pre-init errors; live receipts identify actual selections |
| Progress | Partial text or tool activity arrives before terminal completion; reconnect and cursor limits preserve event boundaries |
| Lifecycle | Tests cover detached return, queueing, shared/exclusive roots, idempotency, exact-session follow-up, cancellation, deadlines, worker death, and PID reuse |
| No hidden waits | Fixtures cover conflicting nested launches and Codex server requests before and during a turn |
| Upgrade boundary | Bootstrap refuses to replace an environment used by a queued or running job; cancellation releases it; all readers reject unsupported state versions |
| Honest outcomes | Tests cover malformed frames, denial, missing tool evidence, unfinished work, missing artifacts, nonzero exit, and success without completion |
| Distribution | Skill catalog and context materialization discover three thin skills; installed helper has one code owner; Python minimum and wheel boundary remain valid |

Before implementation, obtain an independent architectural review of this contract and reconcile
material findings. Before release, freeze a candidate, obtain independent QA, run the prescribed
source-readiness and wheel proof, and follow the [release process](../governance/release-process.md).
Provider-boundary changes need live evidence in addition to deterministic fake-provider tests.

## Source Basis

Native integration contracts were checked on September 6, 2026. The installed CLI's generated
schema and help remain the compatibility check for its version.

- [Antigravity headless CLI](https://antigravity.google/docs/cli/headless/) documents streamed
  init, steps, results, exact conversations, and permission denials.
- [Claude Code headless use](https://code.claude.com/docs/en/headless) documents native tools,
  partial-message streaming, structured output, and the capabilities omitted by bare mode.
- [Claude Code CLI reference](https://code.claude.com/docs/en/cli-reference) documents exact
  resume, model fallback, per-invocation settings, and permission modes.
- [Codex app server](https://developers.openai.com/codex/app-server) documents stdio lifecycle,
  settings readback, turn events, tools, and session continuation.

## Startup-Managed Runtime Inheritance

For a repository that opts into [startup updates](startup-runtime-updates.md), an assignment
records the parent installation and exact lock digest. Workers and follow-ups verify that binding
before invoking a provider and retain shared runtime ownership through cleanup. A wrapper launched
from another worktree or an external installation rejects the mismatch instead of bootstrapping
the destination. Run it through that destination's own installed runtime after the parent reconciles
its version. Standalone provider work without startup-managed governance retains its existing route.
