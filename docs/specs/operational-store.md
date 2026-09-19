---
id: spec.harness.operational-store
title: Operational Store
type: spec
status: draft
owner: project-harness
created: 2026-09-19
updated: 2026-09-19
summary: SQLite for operational state, Markdown for human-authored briefs, files for large artifacts, JSON export always available.
---

> Child of [Harness Core](harness-core.md).

# Operational Store

## Purpose

Hold the four objects durably enough that work resumes correctly after an interruption.

## Current Implementation

- **Posture:** planned. **Evidence:** none.
- **Known limits:** Single machine, single database file. No cross-machine view.
- **Ledger:** [Research index](../research/concept.md).

## Why SQLite, Having Chosen Files

The earlier decision was files only, to keep a clean baseline before considering a richer substrate.
That reasoning held until the contracts required concurrent transition ownership with an expected
revision, durable state before effects, remedy accounting, and recovery from partial writes.

At that point "files only" quietly became "implement transactions, indexes, locking and corruption
recovery ourselves." SQLite already provides transactional updates, in a single local file, with no
service and no dependency to operate.

Two things this does **not** mean:

- **It does not reopen the substrate question.** SQLite is a local file at the storage layer. A
  richer product substrate remains deferred and is a separate decision at a different layer.
- **It does not make effects atomic.** A transaction commits the *record*. A filesystem change or a
  deployment is still not atomic, so the prepared, in-progress and outcome-unknown machinery in
  [Action](action.md) stays exactly as it is.

## Division Of Storage

| Content | Where | Why |
| --- | --- | --- |
| Operational state: Tasks, Actions, Evidence, annotations | SQLite | Transactions, indexes, concurrent transitions |
| Human-authored briefs and prose | Markdown files | People write and review them directly |
| Large artifacts: snapshots, patches, logs | Ordinary files, referenced | Databases are bad blob stores |

**Readable JSON export is a first-class command, always available** — not an occasional
convenience. Inspectability matters most while the taxonomies and thresholds are still wrong, which
is now.

## Behavioral Requirements

- Every record declares its criticality. **Execution-critical** state is durable before the Action
  it covers; if it cannot be persisted, the Action does not run. **Analytics** is best-effort.
- The interface provides a compare-and-set honoring an expected revision. It is deliberately small
  but is not fixed at a particular operation count: safe transition ownership is a requirement, not
  something to work around.
- Writes are append-oriented. Correction supersedes; nothing is rewritten in place.
- Retention is bounded and declared. Unresolved Action references and configuration needed for
  rollback are exempt from ordinary analytics retention.
- No credentials, tokens or full source content are stored.

## Failure Modes

| Condition | Behavior |
| --- | --- |
| Store unwritable, analytics | Work continues, degraded, noted once |
| Store unwritable, execution-critical | The dependent Action does not run; control returns |
| Corrupted analytics index | Rebuilt; the event recorded |
| Corrupted execution-critical state | **Stop.** Never read as "nothing happened"; the affected Action becomes outcome-unknown and waits for a person |
| Database locked by another process | Wait or decline with the reason; never bypass |

## Validation Requirements

- With the store disabled, ordinary checks remain available and no state-changing Action runs.
- A write failure injected immediately before an Action, then a restart, leaves it neither
  duplicated nor stripped of its accounting.
- Two processes racing a transition: the second one's expected revision no longer matches and it
  does not act.
- JSON export reproduces the operational state readably for a human.

## Open Questions

- Whether the export should be a snapshot or a stream for long-running tasks.

## Change Log

- 2026-09-19: Replaces the files-only state store. SQLite adopted for operational state.
