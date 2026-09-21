---
id: spec.startup-runtime-updates
title: Top-Level Startup Runtime Updates
type: spec
status: current
owner: project-governance
created: 2026-09-06
updated: 2026-09-06
summary: Define once-authorized compatible runtime adoption early in top-level tasks without disturbing existing implementation or unrelated work.
---

# Top-Level Startup Runtime Updates

## Unified engine migration boundary

This remains the current runtime contract. The [migration inventory](../reference/2026-09-20-engine-migration-inventory.md)
assigns C05/C12 to preserve task hooks, reader ownership and update recovery. The
[transition plan](../exec-plans/active/2026-09-20-unified-development-engine.md) replaces implementation
only after category proof and accepted changes. It does not silently remove this contract's obligations.

## Authority

An adopting repository may authorize compatible automatic updates in its tracked profile. The
default is manual adoption. This authority permits an isolated local lock commit, never a push,
major upgrade, migration, weakening of checks, or changes to another worktree. Explicit current
operator restrictions take precedence, including read-only tasks.

Markdown owns policy. The runtime implements deterministic guards and installation. The parent
agent judges whether the current task permits an update. Minor fixes, investigation, planning,
and unrelated edits already underway remain eligible. A substantial implementation plan under
execution, independent review, or release certification retains its current version. Mere file
counts, timestamps, or the existence of a plan are not a freeze.

## Startup Boundary

Supported host adapters accept native startup events, record one task identity, and present an
update result to the parent. Native subagent events, delegated harness ancestry, resumed tasks,
forks of existing work, clear, and compaction never discover releases or apply an update. A later operator prompt reopens a closed reservation without release discovery, so subsequent
work in the same conversation remains visible to other tasks. An initial prompt preserves its
already-open startup opportunity. A worker
inherits the parent's runtime identity and reports a mismatch or missing installation to it.

The startup hook does not decide whether a user request allows edits. Before application the
parent supplies its assessment of the work: not started, minor work, substantial plan, review,
or read-only. Only the first two permit application. An assessment cannot waive failed runtime,
Git, provenance, or integration checks. Unknown identities and unsupported hosts remain manual.

Codex is the enabled host adapter. Claude remains disabled pending complete live parent/child
conformance; the Antigravity Gemini route lacks the required native root identity. Exact host
conformance evidence stays outside the reusable checkout.
Host setup is deliberate, local to the adopting repository, and preserves authored hook entries
and instructions. Required native hook trust is never bypassed by production code. The thin
startup pointer stays stable; versioned guidance is read after installation. Updates requiring
changes to loaded startup instructions or hook configuration remain deliberate.

## Release Selection

The profile selects `runtime_updates.policy: manual` or `compatible`. Automatic selection uses
published immutable stable releases from the lock's GitHub distribution owner, within its current
major version. Drafts, prereleases, downgrades, source builds, and unverified identities are excluded.
No current-major result may be inferred from an incomplete bounded release listing.

`runtime-update.json` is immutable release metadata. Version 1 binds an exact target version and
lock SHA256 to an automatic source-version range, the expected configuration schema, and startup
contract version. An absent declaration, unsupported contract, migration, startup integration
change, or incompatible Python environment requires deliberate adoption. Metadata is data, never
an executable migration. Source ranges must account for skipped intermediate releases.

Metadata caching reduces startup requests. It never caches a worktree-safety judgment. The profile
owns explicit discovery and installation budgets. Discovery failure leaves the current runtime
usable. Children and continuations perform no network discovery. No retry loop, scheduler, or
additional model call belongs in this operation.

Compiled preparation persists one installation deadline. Download, staging, activation, commit and
readback consume the remaining allowance; reopening preparation does not renew it. Check the deadline
at phase boundaries and bound subprocess timeouts by the remaining time. Expiry does not establish
process cleanup. Retain any mutation journal and maintenance obligation for explicit recovery; that
separately invoked recovery may use its own bounded allowance.

Compiled `startup prepare` stages a candidate without activation. `startup apply` composes that
preparation with maintenance handoff, backup, activation, lock-only commit and verified completion.
Both require the task identity, receipt store, external operation directory, work state and assessment
reason. Application revalidates the recorded native parent and tracked opt-in; a delegated worker
cannot supply the parent's authority. Native observation hooks do not invoke application themselves.

## Worktree And Runtime Ownership

Resolve the worktree through Git and canonicalize its filesystem identity. The lock, profile,
relevant packs, entry files, and hook configuration must match their committed content. Unrelated
tracked, staged, and untracked changes may remain when the isolated commit preserves them.
Conflicts, sequencer operations, a detached or unborn branch, active Git locks, unsafe paths,
and a source checkout prevent automatic adoption.

Only one updater may mutate a worktree. Existing runtime readers and provider jobs hold shared
runtime access; replacement requires exclusive access. Native startup reservations protect other
participating tasks. Missing lifecycle evidence does not prove another task has finished. Do not
kill processes, delete their locks, or age out active ownership to make an upgrade possible.

Refresh the assessment if unrelated edits or a commit appeared while discovery ran. Reuse verified
artifacts. Recheck the actual mutation snapshot immediately before activation and commit. Changes
inside the transaction or to its authority footprint require recovery or deferral, not silent reuse
of an earlier assessment. A resumed task with a different current runtime must refresh its context
before proceeding; it does not start another upgrade.

## Installation And Local Commit

Create candidate environments at their final digest-specific location, since Python environments
are not relocatable. Keep the exact runtime lock as durable authority and the stable runtime path
as an installation pointer. Initial conversion of an older real-directory installation is a
deliberate bootstrap operation. Retained environments have no independent policy authority.

Verify wheel identity, digest, target metadata, installation, and target configuration before
activation. Materialize ignored skills without altering live root instructions. Ordinary automatic
adoption changes only `config/governance/runtime.lock.yaml`; a wider tracked footprint is manual.

An ignored journal records the prior lock, environment, branch/HEAD, identities, and transaction
phase. Runtime entry guards prevent ordinary readers from observing partial activation. Validation
and Git hooks started by the updater join that transaction explicitly. Hooks and signing remain
enabled. The commit contains only the prepared lock change, and readback verifies its parent,
tree, installed identity, and preservation of unrelated index and worktree content.

Before a commit exists, rollback restores only updater-owned bytes still matching the journal.
After a commit exists, recovery follows that committed lock; it never resets or amends HEAD. An
ambiguous mutation preserves evidence and requires recovery rather than claiming success. No
automatic rollback may discard user changes. Retain the previous environment until it is no
longer needed or in use.

A task closing during an update does not cancel the update's ownership obligation. Keep its saved
binding while maintenance owns the transferred reservation. Committed recovery may finish for a
closed task, but must retire the successor reservation without reopening that task. Owner recovery
must not erase this binding while update recovery is pending.

Compiled `startup cancel-update` is limited to an updater proven stopped before activation and before
commit dispatch. It requires the original Git snapshot, installed generation and launcher, then
restores the transferred reservation without rewriting project files. A closed task's reservation
is retired instead. Cancellation is durable and replayable; it does not authorize another automatic
attempt. Activated or command-bearing journals require their corresponding recovery path.

Compiled `startup restore-update` handles activation before runtime writes. It requires the stopped
coordinator and confirmed cleanup for any dispatched commit, checks the original Git snapshot with
only the journaled lock transition allowed, and reuses the installation's pre-write restoration.
Independent edits and post-write generations refuse restoration. Readback of the original installed
runtime precedes restored task ownership; the closed-task rule and durable replay apply here too.

Compiled `startup retry-update` is an explicit forward commit recovery for an unchanged, valid active
candidate after runtime writes. It preserves all evidence and records one separate retry after the
original updater and command have stopped. Hooks and signing remain enabled. Repeating the command
observes that retry rather than dispatching another one; another failed retry retains maintenance.
Recovery checks both attempts' cleanup before completing. A changed or broken candidate requires
deliberate runtime repair, not a bypass of failed checks or restoration of pre-write evidence.

## Results And Proof

Normal outcomes are current, updated, deferred, and approval-required. Inconsistent installation
state reports recovery-required and prevents work against an ambiguous runtime. Report one useful
reason and the local commit when applicable. Do not produce repeated notices or permission prompts.

Runtime releases receive independent QA and the existing broad release proof. Each adopting
compatible lock update uses deterministic installation proof and its ordinary commit hooks; it
does not add another independent agent review or application-wide test run. Development and
acceptance cadence follow the approved
[implementation plan](../exec-plans/completed/2026-09-06-top-level-startup-updates.md).

## Compiled candidate compatibility

The compiled engine uses startup contract version 2; wheel contract version 1 does not authorize a
compiled update. Compatibility metadata retains schema version 1 and the existing exact field set,
including `lock_sha256` over the candidate lock's literal JSON bytes. The lock itself uses compiled
schema version 2. Automatic candidates must be stable, strictly newer, in the current major, and
explicitly cover the current version through the inclusive `from_version` and exclusive
`before_version` bounds. Configuration schema and Node contract remain unchanged.

Both artifact URLs must identify the same GitHub owner/repository and their respective exact version
tags. Local archives and other distribution locations remain deliberate adoption. Compatibility
validation alone does not prove immutable publication, artifact integrity, native host identity,
repository opt-in, safe worktree state or activation authority. Those checks remain mandatory before
an automatic update. The initial compatibility component performs no network access or mutations.

### Compiled preview observer installation

The compiled preview exposes `startup hooks` for a read-only configuration proposal and
`startup install-hooks` for explicit project-local installation, using the launcher's workspace and
registry scope plus `--receipts <absolute-path>`. Installation preserves authored handlers and file
permissions, refuses conflicting or legacy startup handlers, and leaves an already-current file
unchanged. Installation does not enable compatible updates or edit user-level host configuration.

Codex host enablement (`features.hooks`), project trust and managed restrictions remain separate
requirements. The installer reports them without claiming they have been satisfied. See the
[Codex configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference).
Native event delivery must be qualified separately from writing the configuration file.

Short observation readers record the hook process identity in the registry at acquisition, including
local host, canonical workspace, PID, process fingerprint and nonce. Explicit `recover-observation`
may release the exact reader only after a successful process inventory proves that PID absent.
PID reuse refuses recovery. Recovery never signals processes, repeats discovery or releases the
parent task reservation. An absent reader reports no inferred observation outcome. This mechanism
does not recover legacy readers or a parent reservation lacking its separate native owner binding.
New parent reservations persist that native binding and the intended exact reader token before
registry acquisition. Acquisition verifies the planned generation and reuses only that token.
An interruption before acquisition therefore leaves recoverable intent, not an unowned reader.
If the native process cannot be identified, observation defers without reserving a parent task.

Native stdin observations return Codex's `hookSpecificOutput` context envelope only for actionable
initial discovery. Internal evidence stays in the receipt store; routine child/continuation/close
observations return an empty object. SessionEnd uses the host-supported three-second timeout.
Exact hook definitions must also be reviewed and trusted using Codex `/hooks`; project trust alone
is insufficient. These constraints follow the [Codex Hooks contract](https://learn.chatgpt.com/docs/hooks).

Compiled discovery caches a complete successful metadata-response snapshot beside the external task
receipt store, keyed by current lock, startup settings and authentication mode. It honors
`cache_seconds`, rejects future timestamps, and never combines a cached partial inventory with new
network pages. Cached responses traverse the same inventory, metadata and digest validation as fresh
responses. Oversized snapshots are not persisted; failures never publish a partial cache. The cache
contains neither credentials nor archive bytes nor worktree/activation judgments. Preparation still
verifies candidate identity and package bytes independently.

During compiled host-instruction migration, only the exact shipped wheel startup block is replaced
with the packaged `startup-help` route. Customized or malformed startup sections require deliberate
reconciliation. The migration backup preserves the original and verifies original or fully intended
content during recovery; surrounding authored guidance remains unchanged. This instruction transition
does not migrate legacy executable hooks, enable updates or establish native host trust.

### Backed legacy hook transition

A compiled `update` request may declare `startupReceipts` when migrating the shipped Codex startup
handlers. The coordinated host transition requires the original hook file in its verified backup,
recognizes only the exact complete legacy handler set, and binds the new receipt-store path and intended
hook bytes into host completion identity. Replacement requires drained pre-write activation; authored
handlers and file permissions survive. A partial write or changed input leaves maintenance held for
reconciliation. Lock-only finalization refuses legacy startup commands in project Codex hooks, Claude settings
(including local settings), and Gemini settings. The automatic backed replacement remains Codex-specific;
other provider handlers require their own deliberate migration. Descriptions mentioning retired files
do not count as executable handlers.

The lower-level `runtime-complete --host-plan` surface accepts `--startup-receipts` for the same bound
transition. Neither path changes host trust or compatible-update policy. New definitions still require
native review. The unreferenced legacy script and old installation are retired only after the remaining
migration/readback obligations are qualified; replacing hook configuration alone does not prove delivery.
