---
id: guide.decision-experiments
title: Run optional decision experiments
type: guide
status: current
owner: project-governance
created: 2026-09-21
updated: 2026-09-21
summary: Configure bounded diagnostic probes, attention advice and selected history analysis without changing native authority.
---

# Optional decision experiments

The compiled runtime adds three independently enabled consumers. Normal development needs no JEV
account. Record an `off` baseline, then enable a qualified bounded effect with `auto` when the operator
wants active experimentation. Use `shadow` for an unqualified caller or a comparison that needs it;
it is not a mandatory waiting period for every consumer.
The [experiment specification](../specs/engine-decision-experiments.md) owns the limits and comparison.

## Configuration

Declare consumers in the existing project profile:

```yaml
continuity:
  decisions:
    mode: shadow
    allowed_data_classes: [diagnostic]
    consumers:
      DL05: {mode: shadow, effect: choose-read}
      DL06: {mode: shadow}
      DL12: {mode: shadow}
```

Set `JEV_TOKEN` through the existing credential environment only when using the provider. The global
mode is a ceiling. Omitted consumers remain off; omitted effects remain advice. DL06 and DL12 support
advice only. Existing DL05 advice never becomes executable merely because its mode is `auto`.
`workflow-status` and `workflow-wait` stay non-dispatching under every profile.

## Capture comparable observations

Pass `--pilot-assignment <file>` to `workflow-status`, `workflow-wait`, or `workflow-diagnose`.
The host writes this JSON before treatment:

```json
{
  "version": 1,
  "id": "assigned-iteration-1",
  "episodeId": "iteration-1",
  "experiment": "diagnostic-pilot",
  "definitionVersion": "1",
  "arm": "off",
  "assignedAt": "2026-09-21T12:00:00Z",
  "groupingUnit": "task-identity",
  "sourceRevision": "captured-source-revision",
  "scope": {"workspace": "/absolute/workspace", "taskId": "task-identity", "taskRevision": "1"}
}
```

Use a new assigned episode ID for a new observation, including a retry after changing configuration
or target availability. A diagnostic workflow episode and an experimental observation ID are different:
the former is reused for execution safety; the latter names one immutable capture. Reusing a capture ID
with different evidence returns `collection.reason: episode-id-already-used`; retain the earlier capture
and assign a new observation ID instead of overwriting it. The response's `collection` field identifies
an immutable episode artifact or a collection failure. An empty decision list is valid when no
provider call occurred. A recording failure cannot replace the native workflow outcome. Keep every
assignment, including missing captures and failed/cancelled work, in the comparison manifest.

Version-2 outcome manifests use `{version: 2, episodes: [...]}`. Each episode supplies `id`, `scope`,
`decisions` (possibly empty), and `caller: {path, digest}` pointing to the returned episode artifact.
Optional `native` references and independent `labels` retain the version-1 format. A reference digest
is the SHA-256 of the file bytes, prefixed with `sha256:`. Conflicting scopes are invalid. Unknown usage
stays null; repeated native command/check identities and decision reservations are marked for cost
deduplication. Version-1 reports remain readable.

## Read-only diagnosis

The trusted host imports the versioned `@organta/project-governance/host/v1` API. It prepares a distinct
local `check` action for each candidate through the existing action policy, resolves each recipe, and
calls `WorkflowStore.authorizeWorkflow` for that exact binding. Installing this consumer grants nothing.

Use `diagnosticEpisodeId(parentRun, stageId)` and `diagnosticOperationId(episodeId, probeId)` to prepare
stable operation identities. The parent must be failed, its selected stage failed, and its cleanup and
resource obligations reconciled. The task must remain open at the bound version.

A version-1 probe manifest contains:

- `parentRunId`, `stageId`, and an absolute Unix-millisecond `deadline` that includes queue and inference time;
- `target: {kind: "workspace", id: <canonical workspace>}` or a parent-bound `ios-simulator` ID;
- one to eight `probes`, each with `id`, `description`, a full unresolved `recipe` document and
  `binding: {actionId, authorityRef, operationId}`;
- `baseline: {revision, probeOrder, exact?}`: up to three reviewed fallback probe IDs. `exact: true`
  means the supplied deterministic runbook already decides the sequence and needs no model selection.

Recipes select the existing project operation catalog. They cannot embed commands. Every selected
operation must be declared read-only and reviewed by its host; a label alone is not a sandbox.
Each candidate has a separate grant, including unused candidates. The host retires unused grants
through its normal lifecycle after the diagnostic episode. A model cannot supply executable text.

```sh
project-governance workflow-diagnose --database /absolute/ledger.sqlite --probe-manifest probes.json
```

The typed host entry is `diagnoseWorkflow(database, manifest, options)`. It uses the same coordinator
and native child workers as the CLI. At most three child submissions are reserved atomically in the
existing workflow ledger, including blocked submissions. Recipes cannot repeat within an episode.
Shadow executes the baseline, not a model-selected probe. Missing credentials use the reviewed
baseline or return a compact handoff. Cancellation and unknown cleanup retain native ownership.

Before the first reservation, an advice-only profile, cancelled/expired entry or unobservable target
returns `persisted: false` with `refusalReason`. It consumes no episode and leaves the ledger schema
unchanged, so the operator can correct configuration or target availability and try again. Once an
episode exists, its children still reconcile even if configuration changes or its deadline expires.

Repeated invocation observes the same persisted episode. Changing its deadline or catalog cannot reset it.
The current command does not create a new episode for the same failed parent/stage; new work requires
its normal new workflow identity. This also applies to a previously claimed episode interrupted before
its first probe: a later unavailable target closes that persisted episode without resetting its allowance.
The coordinator rechecks source, grants, configuration and supported
target facts before submitting a child. A diagnostic report preserves the failed parent, and the CLI
retains a non-success exit status: diagnosis is not app repair or verification.

The simulator observer verifies the exact parent-bound simulator is shut down after cleanup. It does
not infer the historical app state from that current observation. Probe output can inspect captured
failure artifacts or current read-only facts. Live app recovery, Metro restart, rebuild, install and
relaunch are outside this experiment. Adopter-owned scenario/target observation still needs qualification.

## Attention observations

DL06 annotates `workflow-wait` only. Without an eligible supplied observation, structured native
events require no model call. Terminal, failed, cancelled and uncertain outcomes remain protected.
No event is hidden and no completion wake is suppressed.

An optional `--attention-evidence <file>` supplies `version: 1`, `runId`, `eventSequence`, `excerptDigest`,
`purpose`, and `procedure`. It must bind an actual successful-stage event in the returned event window
and the engine's bounded native stage-log excerpt. Protected log patterns bypass classification.
Only the first eligible observation in a run can reserve a provider call; later changed excerpts
remain unassessed. Shadow labels stay in receipts. Advice mode can return a disposition, but never
changes the native wait result, event cursor or cleanup. Missing host-turn measurements remain unknown.

## Selected history

Ordinary reporting is provider-free even when DL12 is enabled:

```sh
project-governance telemetry decisions --outcomes-manifest outcomes.json
project-governance telemetry decisions --outcomes-manifest outcomes.json --classify-history
```

Classification requires a version-2 manifest `analysis` block. It contains `inputDigest`, `excerpts`
(one `{episodeId, path, digest, sourcePaths?}` per selected episode), and optional reviewed `procedures`
with `id`, `description` and `reviewRef`. Each excerpt is a bounded JSON file containing `text`.
Declare source paths for excerpts that include source code; the profile must permit their source
class and paths. These declarations are host-owned, not model-generated classifications.

Compute `inputDigest` with the host API `digest` over an object containing `excerpts` (the sorted unique
excerpt file digests) and `procedures` (the supplied IDs/descriptions sorted by ID). Procedure review
references, report filenames and assignment labels are excluded from this budget identity.
The optional declared `taskId` must be `decision-history`; optional `taskRevision` must match the
runtime-derived input/question/preparation/model revision. They cannot mint a fresh retry allowance.

Reports retain native aggregates, proposed classes (including mixed), an explicit unclassified reason
histogram (including unknown), representative episode references, and frequency/known-native-cost
rankings. Missing durations and usage remain unknown. Cost is observed work, not avoided work. No procedure is
installed and no policy changes. Spent analysis scopes close on terminal reports. Repeated analysis
reuses retained receipts; cancellation or partial results do not refill the budget. `scopeClosed: false`
exposes a failed closure rather than claiming clean accounting.

## Upgrade and qualification limits

Both comparison arms must use this same RC. New consumer keys and version-2 manifests are not readable
by rc.2. The workflow ledger becomes engine schema 3 atomically on its first diagnostic write; ordinary
opening preserves schema 2. Older binaries refuse schema 3. Drain old runtime readers before adopting;
after new writes, disable the experiment and repair forward rather than restoring an old database over
new history.

The installed-package fixtures prove wiring, bounds and fallback. They do not prove live JEV quality,
SDK simulator/device integration, or performance improvement. SDK adoption and real-work measurement
follow publication. Required checks and release authority remain deterministic.

## Bind ordinary work once

The [task entry contract](../specs/engine-task-context-entry.md) connects the continuity store to
normal context and check commands. This is post-RC4 behavior; install a release containing it before
using the automatic path. Do not patch a pinned runtime.

```sh
project-governance harness task create --outcome "Repair the request retry behavior" \
  --acceptance "Preserve errors and pass the focused regression" --scope src/request.ts --scope docs/specs/retries.md
project-governance context-route
project-governance check --stage pre-commit --mode impacted --staged
```

Use `harness resume --task <id>` to continue known work. Task creation binds the existing host session;
normal context/check commands and Git children then resolve it. Revising a task in its bound session
atomically advances that session's binding to a new attempt; other sessions must deliberately resume
the new revision. Root-wide scope preserves required changed-path guidance but does not request
automatic optional source discovery. Choose specific files or directories, and preserve
one task/version through ordinary retries. Explicit changed-path flags narrow retrieval when needed.

The native Codex thread environment is recognized by the continuity owner. Other hosts should be
launched with a stable `HARNESS_SESSION` set, with task creation/resume under the same value. Setting
it in a short-lived startup subprocess cannot change the parent host environment. Missing session,
stale intent, closed task and missing store are visible fallback reasons, not grounds to choose
another active task. A custom `harness --db` store is not automatically discovered; use the default
store or a validated explicit decision-context file for that integration.

Candidate discovery examines changed paths first, then exact scope files, then an alphabetical prefix.
This bounds work before JEV; it does not promise to find every relevant file. Inspect exclusions and
omitted counts, and narrow task scopes when the prefix misses useful context. Mixed required routes
use the largest declared budget envelope; required overflow remains a blocker.
Directory scopes match every captured file beneath them, including unchanged files. Prefer specific
task paths to avoid pulling in unrelated required owners. Failed inventory is a named context blocker.
Explicitly scoped files remain available in the baseline packet without classifier sharing; automatic
directory discovery needs approved source patterns before loading optional contents.
Use `consumers.DL03` for the current relevance selector, which assesses permitted files individually.
The older `allowed_questions` context adapter retains its whole-request fallback when any candidate
is outside the sharing allowlist. Do not declare both forms for the same consumer.

The returned `selection.binding`, candidate/exclusion summary and linked exposure receipt show which
path actually ran. Required guidance remains deterministic; JEV only ranks optional approved text.
Missing credentials use the same bounded baseline packet. No candidates and no source permission are
different from successful ranking. Ordinary check execution remains available when optional intent
is unavailable. A workflow's existing explicit action/task authority still owns workflow execution.

Host instruction updates ship with the package. The host must invoke task entry and consume its
packet before reading source; the runtime cannot intercept unrelated native file reads. Receipt
coverage names that limit. Use an actual assigned task after immutable adoption to qualify the host
and compare accepted work before making savings claims.
