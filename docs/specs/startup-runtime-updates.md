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
forks of existing work, clear, and compaction never discover releases or apply an update. A worker
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

## Results And Proof

Normal outcomes are current, updated, deferred, and approval-required. Inconsistent installation
state reports recovery-required and prevents work against an ambiguous runtime. Report one useful
reason and the local commit when applicable. Do not produce repeated notices or permission prompts.

Runtime releases receive independent QA and the existing broad release proof. Each adopting
compatible lock update uses deterministic installation proof and its ordinary commit hooks; it
does not add another independent agent review or application-wide test run. Development and
acceptance cadence follow the approved
[implementation plan](../exec-plans/completed/2026-09-06-top-level-startup-updates.md).
