---
id: developer-guide.release-evaluation
title: Compare Releases From Existing Evidence
type: guide
status: current
owner: project-governance
created: 2026-10-05
updated: 2026-10-05
summary: Builds a read-only release scorecard from explicit existing captures while preserving missing outcomes, usage and comparison limits.
---

# Compare releases from existing evidence

Use this guide to compare a frozen candidate with an older release, or to inspect field evidence.
The report reads existing receipts. It does not run checks, call models, change task acceptance or
create another evidence store. The [evaluation contract](../../specs/engine-release-evaluation.md)
owns the measurement rules; the [delivery plan](../../exec-plans/active/2026-10-04-release-evaluation.md)
owns release qualification. The command is qualified through the installed package with original
producer receipts; adopting projects still need their own observation and outcome evidence.

## Run a minimal example

This example creates a synthetic version-two outcome manifest in a temporary directory. It declares
one expected delivery but supplies no observed delivery or accepted task. Its result must remain
unknown. Synthetic archive identities demonstrate the format; they cannot establish release quality.
Use a runtime containing the command and Node.js, then run:

```sh
evaluation_manifest="$(node --input-type=module <<'JS'
import { createHash } from 'node:crypto';
import { mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const directory = realpathSync(mkdtempSync(join(tmpdir(), 'governance-evaluation-')));
const hash = value => 'sha256:' + createHash('sha256').update(value).digest('hex');
const capture = (name, value) => {
  const path = join(directory, name), bytes = JSON.stringify(value, null, 2) + '\n';
  writeFileSync(path, bytes); return { path, digest: hash(bytes) };
};
const caller = capture('caller.json', {
  version: 1, id: 'example', scope: null, entryKind: 'prompt-delivery',
  runtimeVersion: 'synthetic-candidate', archiveDigest: hash('synthetic archive'),
  native: { entryId: 'd'.repeat(64), provider: 'codex', session: 'synthetic-session', turn: 'synthetic-turn' },
  decisions: [], exposure: { configuredMode: 'off', mode: 'off', delivered: false, reason: 'off' }
});
const manifest = capture('manifest.json', {
  version: 2,
  episodes: [{
    id: 'example', scope: null, caller, decisions: [], native: [], labels: [], observations: {},
    evaluation: {
      conditionId: 'candidate', caseId: 'entry-case', trialId: 'trial-1',
      inputDigest: hash('synthetic input'), expectedLabelDigest: hash('frozen expected delivery'),
      lifecycle: 'assigned', expected: [{ dimension: 'entry', unitId: 'entry-case', outcome: 'delivered', critical: true }],
      evidence: [], providerJobs: [], usagePopulation: null
    }
  }],
  evaluation: {
    version: 1, metricContract: 'release-evaluation-1',
    suite: { version: 'synthetic-suite-1', digest: hash('frozen synthetic suite') },
    view: 'field',
    conditions: [{
      id: 'candidate', runtime: { version: 'synthetic-candidate', archiveDigest: hash('synthetic archive') },
      sourceDigest: null, profileDigest: null, questionDigest: null, permissionsDigest: null,
      environmentDigest: null, budgetDigest: null, model: null, effort: null, cacheState: 'unknown', arm: 'field'
    }],
    population: { eligiblePrompts: null },
    discovery: { scanComplete: null, projectionEvicted: null }, comparison: null
  }
});
console.log(manifest.path);
JS
)"
project-governance release-evaluation report --manifest "$evaluation_manifest" --format json
project-governance release-evaluation report --manifest "$evaluation_manifest" --format markdown
```

The manifest and its captures stay in the printed report's directory for inspection. Reporting does
not edit them. JSON includes source references, exclusions and detailed counts; Markdown gives the
short scorecard. A successful command means it produced a report, not that the evaluated release passed.

## Replace synthetic captures with real evidence

Keep the manifest outside source checkouts. Declare eligible cases and expected outcomes before
running them. Include assigned and unfinished attempts, not only successful receipts. Give every
capture its original path and byte SHA256 digest; the reader verifies these references with a shared
bounded allowance. Never copy credentials or private prompt text into the manifest or summary.

| Field | What it establishes |
| --- | --- |
| Episode `scope` and `caller` | Exact canonical workspace, task ID/revision and the caller's native identity. A null scope stays unbound. |
| `decisions` and optional `decisionEvidence` | Structured caller-linked decision IDs. Explicit `{receiptId, path, digest}` references support isolated old/new stores without copying them. |
| `native` | Existing command/check captures with verified caller and task links. Expected application failure can be correct harness behavior. |
| Episode `evaluation` | Condition, stable case/trial IDs, frozen input/label digests, lifecycle and predeclared expected units. |
| `evaluation.evidence` | Explicit captures for `prompt-entry`, `task-switch`, `usage`, `task`, `outcome`, `read`, `route`, `assessment` or `context-evaluation`. Each has `kind`, `path` and `digest`. |
| `evaluation.providerJobs` | Existing `{directory, requestDigest, request: {path, digest}, result: {path, digest}}` handles, including custom directories. Failed attempts remain in spending. |
| `evaluation.usagePopulation` | Complete declared native cost identities, or null when coverage is unknown. An empty list means verified no usage; it cannot erase a missing capture. |

The default decision store follows the command's current checkout. Run from the owning checkout for
legacy decision references. For isolated capture sets, supply `decisionEvidence` for every referenced
decision instead. Explicit captures must still match the episode's caller links and exact task scope.
The reporter does not search sibling worktrees to guess a missing reference.

Only a matching task-owner snapshot with `status: accepted` establishes acceptance. A passed check,
successful consultation or manifest review label does not. Reopen observations remain visible.
Acceptance creates a new task version. Supply the captured version chain back to the episode's
revision; the outcome and active scope, constraints and acceptance items must remain unchanged.
Missing ancestry or changed authority stays unknown. The owner's acceptance remains host-reported;
the report does not independently authenticate that authority or judge the product's correctness.
Native usage must match a captured prompt entry's session, turn and response identity. Usage from a
turn that switches tasks stays unallocated. Resumed cumulative usage needs a qualified prior baseline;
without one, that job's token cost stays unknown.

For selection quality, reference the existing context evaluation with
`kind: context-evaluation` and `variant: candidate`, `baseline`, `lexical` or `shadow`. It must contain
independent frozen labels matching the case input and label digests. The scorecard separates finding
a file from delivering its complete decisive passage. Unlabelled optional content cannot establish
precision. Boundary observations that the host never captured remain unknown.

An opted-in DL03 passage assessment can omit an automatic optional file when the existing packet
owner verifies a negative answer over its exact complete current body. The omission reason is
`whole-file-negative-passage`; an empty optional result is `complete-passage-no-match`. Required
instructions and explicit, task-declared or changed-path pins remain protected. A negative description
or clipped passage does not exclude its original. Partial, uncertain, shadow, unavailable or stale
advice keeps local fallback. The [passage contract](../../specs/engine-rc9-parallel-context.md)
owns this narrow rule and its unchanged threshold.

A false negative can still hide useful optional material. Keep the original file references and
decision receipts available for a fuller read. Score that loss against independent decisive-span
labels; provider confidence and successful report generation cannot turn it into a pass. An offline
transport fixture qualifies wiring, while actual model accuracy, host consumption and accepted-task
savings need their own observed evidence.

The source verifier `components/engine/scripts/verify-context-quality.mjs` freezes its independent
labels before running the installed inventory, metadata, passage and packet route. Supply
`--package=<staging-owner-package>` and `--archive=<candidate.tgz>`; an optional comparison also needs
`--baseline-package` and `--baseline-archive`. It launches each archive's verified inactive stage and
records its archive SHA256, installation receipt and installed-tree identity. The supplied package
directory is only the staging helper and expected package manifest, not proof that its files match
the archive. Its synthetic staging `source_commit` does not establish release provenance.
`--freeze-only` requires no archive or inference. Controlled transport fixtures make no external
calls; `--live` uses the caller's environment token against the same frozen synthetic cases.

An `assessment` capture may describe a fixture oracle or explicit host/operator observation. Its
version-one record uses `kind: release-evaluation-assessment`, the same `caseId`, `inputDigest` and
`labelDigest`, plus `dimension`, `unitId`, `outcome` and `provenance`. Allowed provenance values are
`fixture-oracle`, `host-observer` and `operator-source`. This records the stated observer; a file hash
alone does not make that observation trusted host proof or accept the task.

## Compare without inventing savings

Use `view: controlled` and declare `comparison: {baseline, candidate, kind, minimumChange}`. Use the
same frozen cases/trials, source, profile, questions, permissions, environment, budgets, coding model,
effort and cache condition in both arms. `kind: release` changes the exact runtime archive while keeping
the selection arm fixed. `kind: jev` keeps that archive fixed and compares `code-only` with `jev-active`.
Shadow advice cannot prove changed development outcomes. Set the practical change threshold first.

Execution captures need their original runtime version and archive digest. A current installation
lock cannot stamp older work as current. Installed producers capture the executing package's verified
generation before dispatch. Command requests bind that identity into their hash; terminal and recovery
receipts retain it. Source runs and plain npm payloads without an original verified generation keep the
archive unknown. Historical unstamped receipts remain unstamped. Mixed or unstamped execution costs stay in all-arm spending
and unattributed spending; they cannot qualify a release comparison. Repeated trials remain grouped
within their case. Small paired results describe those cases, not general production savings.

Link an original `route` capture through the context caller's receipt/input digest, or through the
captured prompt entry's route receipt/input digest. Its `contextTiming` report exposes preparation,
index, selection and final packet assembly separately. Index identity, freshness, cache,
extraction and publication phases remain separate. Metadata HTTP/admission work and passage
preparation/packing are also reported when the original receipt contains them. Missing or malformed
fields remain unknown; repeated route IDs do not add samples, and conflicting captures lose qualification.

The condition declares a cold or warm trial. Original extracted/reused counts report extraction-only,
reuse-only or mixed index work; they do not prove this was the first build or a completely warm run.
Index time overlaps preparation. Metadata decision/HTTP/admission work can overlap across parallel
requests and does not include all passage-provider work. Do not add these phases or provider-job
durations to task elapsed time. Route delivery measures post-selection assembly and validation before
receipt capture; it does not measure receipt persistence. Native hook
delivery latency and when the main model consumed the packet remain unobserved.

Read gray as unknown, not success or failure. Expected refusals count as successes only when the
declared refusal is observed. Critical violated expectations stay red. Keep observed counts beside
eligible populations so missing entry coverage cannot produce an adoption percentage.

Token savings require matched accepted tasks and complete declared usage in both arms, including
failed retries. Cached input and reasoning subsets are not added twice. Native per-model entries are
diagnostics, not extra usage or inferred delegation. Concurrent process durations do not become
wall time. Partial field evidence cannot prove savings, bypass, packet consumption or complete extra
read coverage. The report exposes these gaps; it does not add a host collector or fill them by guesswork.
