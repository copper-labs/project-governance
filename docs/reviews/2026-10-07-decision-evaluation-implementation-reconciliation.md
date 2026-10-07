---
id: review.decision-evaluation-implementation-reconciliation
title: Decision Evaluation Implementation Reconciliation
type: review
status: current
owner: project-governance
created: 2026-10-07
updated: 2026-10-07
summary: Records the implementation findings, smallest corrections and qualification limits for the 4.2 evaluator and optional computer-use caller.
---

# Decision evaluation implementation reconciliation

Owners: the [evaluator specification](../specs/engine-decision-providers-and-image-evaluation.md)
and [delivery plan](../exec-plans/active/2026-10-06-decision-providers-and-image-evaluation.md), plus
the [optional caller specification](../specs/engine-optional-computer-use-testing.md) and
[plan](../exec-plans/active/2026-10-06-optional-computer-use-testing.md).
Original commands, failed reproducers, source hashes, archives, reports and reviewer audits remain
outside this reusable checkout. No adopting project was changed.

## Findings and corrections

Claude Opus 5.5 reviewed the implementation at medium effort with fallback disabled. The initial
read-only review completed successfully without changing source. It found two material defects,
two smaller defects and three nits. Each correction extends its existing owner.

| Finding | Correction and proof |
| --- | --- |
| HIGH1 — Installed launcher rejects `evaluate` | Admit it in the existing managed writing-command set. A real verified staged generation exercises the pinned launcher, reaches the evaluator's local-only denial, records the generation as written and releases the invocation reader. The original installed rejection and 16 passing focused cases are retained. |
| MED2 — Unrelated configuration edits invalidate paid replay | Bind generic identity to provider, exact requested model and adapter version. Recheck current enablement, disclosure, roots and local-only admission before replay. Daily allowance expansion and unrelated registered settings preserve the original answer and charge; provider/model/input changes conflict. Registered decisions retain their original full digest. Original failures and 44 distinct correction cases are retained. |
| LOW3 — Version-one stores cannot reach migration | Read-only claim lookup returns no claim for the recognized old schema. The existing reservation transaction owns migration and preserves task counters. Unknown schemas still fail closed. |
| LOW4 — Advice can describe different captured bytes | Caller interpretation requires an exact retained checkpoint ID, image type and SHA256 digest. Missing or mismatched evidence stays unavailable without redispatch. Five focused cases include a real evaluator replay/replacement reproducer. |
| NIT5 — Symlinked absolute image aliases fail admission | Document canonical absolute or workspace-relative paths. Keep the existing root and symlink checks. |
| NIT6 — Interrupted claims remain outcome-unknown | Keep the specified conservative behavior. An uncertain or unavailable original never becomes permission to repeat a paid operation. |
| NIT7 — Unregistered API-key values can enter durable overrides | Reject embedded `*_API_KEY` fields through the existing guard. Do not broaden name-only credential forwarding. Thirty-one focused cases preserve native startup coordination and command behavior. |

The targeted recheck closed the original material findings and finished the initially unreviewed
provider codecs, retained reader, optional browser/runner and catalog scope. It found only smaller
issues. The JEV distribution helper now defines own data properties, retaining prototype-like
choice values and rejecting contradictory answers. Its failing reproducer and focused
schema/provider/runtime proof are retained. This preserves the existing ordinary-object result
shape; it adds no rejected choice vocabulary or new provider authority.

The guide and skill now name adapter-version changes as a replay conflict, the developer catalog
includes identity/replay/schema/accounting owners, and upgrade guidance notes rejection of embedded
API-key placeholders. The browser proof record explicitly separates its earlier 38-case source
cohort from the five later current advice-link cases, typecheck and installed integration. Unchanged
real-browser cases do not call the changed advice helper. No new broad browser run is claimed.

The source checkpoint also exposed rejection of the existing native startup coordination identity.
The correction permits that exact identity only in the existing native maintenance environment;
the unchanged hook admission still verifies its lease, owner, workspace and event. Provider,
ordinary environment and credential-reference paths do not gain that exception. Twenty-three
focused cases cover the corrected boundary. A separate Python-path failure was corrected by using
the existing source environment, without changing the checker.

## Requirement coverage and claim boundaries

| Evaluator requirement | Mechanical proof and remaining limit |
| --- | --- |
| R1 — Shared typed providers | Provider codecs, native answer/usage preservation and unchanged registered consumers are fixture-tested. Live beta compatibility is unqualified. |
| R2 — Explicit configuration and admission | Disabled defaults, disclosure, capabilities, provider/account pacing and provider-free fallback are covered. No automatic provider switch is introduced. |
| R3 — Immutable evidence, accounting and replay | Identity-bound reads, static container validation, byte limits, immutable operation claims, atomic daily charges, migration and current-grant checks are covered. Replays retain native usage without a new charge. Container checks do not pixel-decode or prove visual quality. |
| R4 — Honest typed answers | Native distributions and weighted scores, malformed/partial/refused/unknown answers and CLI result/exit distinctions are covered. Missing observed usage stays unknown; advice cannot become a native assertion. |
| R5 — Public entry | CLI, narrow versioned export and packaged skill are installed-package boundaries. Standalone evaluation does not create or bind a task. |
| R6 — Project integration | Detached checks forward declared credentials only to their owning command. Missing values remain ordinary blocking findings. Native process failure, dependencies and fail-fast retain their existing authority. |
| R7 — Qualification and adoption | Source and installed mechanical proof are separate from live service compatibility, visual accuracy, required-gate adoption, accepted development and savings. Those empirical claims remain unqualified. |

The optional caller's model-free B1/B2 cover bounded loopback requests, real disposable-browser
mechanics with injected coordinates, durable action intent, lost acknowledgment, restricted targets,
native oracles and paired evaluation of frozen captures. Missing and unlabeled answers remain in
coverage; a stalled final readback stays unresolved under the existing run deadline. The caller is
excluded from the runtime archive. It adds no core browser or model dependency. Actual Holo
setup, loaded-model identity, grounding accuracy and combined paid qualification remain optional B3.

The initial broad source checkpoint passed 1,107 of 1,109 cases. Its two failures and subsequent
focused corrections are retained separately, rather than described as one later all-green run.
Replacement cohorts are not added to their earlier overlapping counts. Synthetic successes are
not ordinary accepted development.

## Review closure

Both Opus invocations used `claude-opus-5-5`, medium effort, fallback disabled and read-only mode.
Their audits report successful completion, no timeout and no source changes. The targeted recheck
closed HIGH1/MED2 and completed the named previously unreviewed scope. The subsequent Low/Nit
corrections are resolved locally with focused proof; no further whole-workspace review is required.
The final package proof and normal source hooks qualify the closed candidate separately.

The normal commit hook found an oversized installed-proof coordinator. It now uses cohesive case
groups around one shared fixture, account, canary scan and cleanup lifecycle. No waiver or state
reset was added. All 20 case definitions and their order remain unchanged, including the final
outage. Sixteen focused helper cases and the current 20-case installed constituent pass against the
same qualified archive; this script-only correction does not change the shipping payload.

The managed-launcher case deliberately stops at local-only admission. Positive hosted evaluation
and its credentials/accounting are covered by the installed direct CLI, detached native command
and library fixtures; no hosted dispatch through that launcher is separately claimed. Image-reader
and transport internals were reviewed in the initial pass and not surveyed again in the recheck.
Publication and adopter installation remain separate actions.
