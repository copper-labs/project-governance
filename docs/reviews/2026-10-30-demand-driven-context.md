---
id: review.demand-driven-context
title: Demand-driven context design reconciliation
type: reference
status: current
owner: project-governance
created: 2026-10-30
updated: 2026-10-30
summary: Resolves independent design review findings before implementation.
---

# Review reconciliation

Opus 5.5 high and Gemini 4 Argon high independently inspected the proposed specification, plan
and source. Both support proceeding after boundary corrections. Original answers, model identities,
usage and wrapper receipts remain in the external release evidence directory.

| Finding | Resolution |
| --- | --- |
| Native no-retrieval still indexes/captures under localOnly | Separate retrieval mode from degraded-storage localOnly; bypass optional work and preserve required routing and warm index. |
| Missing step zero prevents later semantic admission | Open original family at first semantic request; semantic-only step numbering begins at zero. Keep consecutive cursor checks rather than weakening predecessor validation. Local requests consume no semantic steps. |
| Standalone or delegated hidden paid paths | Default all route callers to local. Native semantic requests attach to current entry; standalone requires task scope. Gate injected, legacy relevance and workflow advice too. Provider jobs stay local. |
| Alphabetical/dirty-file backfill | Require actual local signals or applied positive metadata advice. A changed file or uncertain judgment alone cannot admit it. Preserve exact inputs. |
| Skipped index presented as empty execution | Bypass index owner, null timing and explicit skipped workload. Do not call maintainContextProjection with an empty list. |
| Missing joined coverage/null accounting | Bounded entry population separate from child records; expose linked/missing routes, usage, reads, outcomes, collection gaps, per-field null counts and cache-aware subtotals. |
| Host/model consumption and dollar estimates | Codex response collector only; unsupported hosts and delegated coverage remain unknown. Estimate money only with external price snapshot. No implicit acceptance. |
| Three-arm/cross-generation evaluation unsupported | Preserve strict existing comparator; start with matched same-runtime local versus semantic. Passage-only execution and cross-generation treatment schema remain a separately qualified study. Add skipped workload only now. |
| Stale native/documentation instructions | Update emitted host guidance, help, command docs and historical contract pointers in this batch. |

Gemini's summary mentioned Claude native usage and an unrelated version number; these are not
supported by the inspected source and are rejected. The target is stable 4.5.0 from 4.4.3.
Its runner reported missing `read` tool evidence despite 58 observed read_file operations. The
original review is retained with that runner limitation; source claims are reconciled here, not
promoted solely from runner status. No review was replaced or silently rerun.

Implementation review will verify the actual diff and meaningful regression results. This document
records design reconciliation, not implementation acceptance or measured economic benefit.

## Implementation reconciliation

Both requested reviewers inspected the implementation read-only. Opus identified workspace-alignment
and steering-binding regressions, weak local term filtering, continuation and telemetry defects, and
paid-path fixtures that still depended on the old default. Gemini independently identified the
continuation collision, missing skipped-workload counts, orphan/duplicate telemetry and missing marker
handling. These are accepted and corrected with targeted regressions; no review result is test proof.

The correction retains native workspace pauses, checks steering identity at delivery, uses canonical
initial/continuation requests, and shares explicit workflow-advice spending with the native family.
Local route-declared procedures remain valid configured relationships. Common words no longer admit
unrelated files through FTS. Native history is explicitly not requested.

Telemetry now distinguishes native routes, explicit retrieval and provider attempts. Entry, route and
child scans have separate capacity. Orphan usage is separate; conflicting counters and mixed outcome
dispositions remain unknown. Immutable originals, rather than projection references alone, establish
observed coverage. The reviewer's suggestion to infer a verified route from an entry reference was
rejected because the original might be unavailable.

Paid-path permissions, large original capture, source freshness, symlink exclusion, recipe non-execution
and concurrent admission retain explicit semantic tests. Provider-job preparation is deliberately local;
its tests cover local delivery, while semantic permission proof belongs to the context route owner.
No new account-wide dollar budget, automatic model switching or acceptance authority was introduced.
Gemini's runner again reported a required-tool naming mismatch despite recorded read_file calls;
its review text is retained as independent advice, not a successful runner qualification.

The focused follow-up closed the original findings. Gemini reported no blocking findings. Opus
found two residual paths: literal camelCase/snake_case identifiers lost their symbol seed under
split-term filtering, and native staged semantic requests could avoid the family attachment.
The final correction preserves filtered raw identifiers alongside split terms and refuses staged
semantic retrieval in a native session, with exact regressions. Native DL04 remains conditional on
eligible metadata selection; this limit is explicit rather than a new independent spending pool.
Unready anchors now report `entry-anchor-unready`.

Final Opus closure found no remaining blockers. Added assertions name the unready-anchor reason,
verify the staged refusal code without dispatch, and preserve both identifier matching and its
priority over split-word noise. Reviews establish independent inspection, not passing tests or live
benefit. Exact review artifacts, provider identities, effort, source bindings and runner limits remain
in the external release evidence record.
