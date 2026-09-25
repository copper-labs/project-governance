import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Frozen synthetic prompts and Git fixtures only. --live shares paths, never source bodies.
const live = process.argv.includes('--live');
const output = process.argv.find(arg => arg.startsWith('--output='))?.slice(9);
if (!output) throw new Error('Use --output=<external report path>; add --live for bounded synthetic JEV calls');
if (live && !process.env.JEV_TOKEN) throw new Error('JEV_TOKEN is required for a live evaluation');
const source = resolve('components/engine/src');
const { contextMetadataCatalog, selectContextMetadata } = await import(pathToFileURL(join(source, 'context-metadata.ts')));
const { DecisionRuntime } = await import(pathToFileURL(join(source, 'decision-runtime.ts')));
const { profileDecisionSettings } = await import(pathToFileURL(join(source, 'decision-settings.ts')));
const { digest } = await import(pathToFileURL(join(source, 'core.ts')));
const { ValidationSubject, resolveChangeScope } = await import(pathToFileURL(join(source, 'change-subject.ts')));
const cases = [
  { id: 'exact', purpose: 'Fix src/network/retry.ts', expected: 'src/network/retry.ts', exact: true },
  { id: 'symptom', purpose: 'Requests fail after a brief loss of connectivity. Find the retry logic.', expected: 'src/network/retry.ts' },
  { id: 'specification', purpose: 'Update the specification for starting apps on simulators.', expected: 'docs/specs/device-startup.md' },
  { id: 'review', purpose: 'Review authentication session expiry and refresh behaviour.', expected: 'src/auth/session-refresh.ts' },
  { id: 'test-discovery', purpose: 'Locate automated tests for simulator startup failures.', expected: 'tests/device-startup.test.ts' },
  { id: 'failure-to-code', purpose: 'The API returns 401 after a user stays logged in overnight.', expected: 'src/auth/session-refresh.ts' },
  { id: 'change-ripple', purpose: 'A release now requires a signed approval. Find the release policy owner.', expected: 'docs/policy/release-approval.md' },
  { id: 'follow-up', purpose: 'Continue. Bound task: Repair authentication session expiry and refresh.', expected: 'src/auth/session-refresh.ts' },
  { id: 'late-candidate', purpose: 'Where does the system publish completion notifications?', expected: 'src/zzz/completion-notifications.ts' },
  { id: 'misleading-name', purpose: 'Find the implementation of credential refresh; filenames may be misleading.', expected: 'src/misc/utility.ts', limitation: 'Metadata alone cannot establish the contents of utility.ts.' },
  { id: 'no-match', purpose: 'Change the physical camera focus mechanism, absent from this repository.', expected: null },
  { id: 'fresh-project', purpose: 'Start implementing app.ts in this new project.', expected: 'app.ts', exact: true, fresh: true },
];
const common = [...new Set(cases.flatMap(item => item.expected ? [item.expected] : [])), ...Array.from({ length: 90 }, (_, i) => `src/catalog/item-${String(i).padStart(3, '0')}.ts`)];
const settings = profileDecisionSettings({ continuity: { decisions: {
  mode: 'auto', deadline_ms: 3000, allowed_data_classes: ['metadata'], allowed_metadata_paths: ['**'],
  evidence_bytes: 16000, budget: { max_calls: 4, max_request_bytes: 131072 },
  consumers: { DL03: { mode: 'auto', questions: ['context.metadata-relevance/1'] } },
} } });
const temporary = mkdtempSync(join(tmpdir(), 'rc6-context-evaluation-'));
const results = [];
let summary;
const git = (...args) => execFileSync('git', args, { stdio: 'ignore' });
function fixture(name, paths) {
  const root = join(temporary, name);
  mkdirSync(root);
  git('init', '-q', root);
  for (const path of paths) {
    const absolute = join(root, path);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, path.endsWith('.md')
      ? `# Synthetic ${path}\n`
      : '/** Synthetic RC6 source fixture. */\nexport const fixture = true;\n');
  }
  git('-C', root, 'add', '-f', '--', ...paths);
  // The all-files subject reads the real fixture worktree without a fixture commit.
  const subject = new ValidationSubject(root, resolveChangeScope(root, { all: true }));
  const inventory = subject.paths();
  assert.deepEqual(inventory, [...paths].sort());
  return { subject, paths: inventory };
}
try {
  const commonFixture = fixture('common', common);
  const freshFixture = fixture('fresh', ['app.ts', 'README.md']);
  for (const item of cases) {
    const { subject, paths } = item.fresh ? freshFixture : commonFixture;
    const catalog = contextMetadataCatalog(paths, item.purpose, item.exact ? [item.expected] : [], [], new Set());
    const runtime = new DecisionRuntime(settings, join(temporary, 'state', item.fresh ? 'fresh' : 'common'),
      { token: live ? process.env.JEV_TOKEN : '' });
    const selection = await selectContextMetadata(subject, catalog, item.purpose, runtime,
      { workspace: subject.root, taskId: item.id, taskRevision: '1' }, digest(paths), item.id);
    const rank = order => item.expected ? order.indexOf(item.expected) + 1 || null : null;
    const result = { id: item.id, expected: item.expected, limitation: item.limitation ?? null, catalogCount: catalog.candidates.length,
      baselineRank: rank(catalog.candidates.map(value => value.path)), selectedRank: rank(selection.order), topEight: selection.order.slice(0, 8),
      reason: selection.reason, assessedCount: selection.assessed.length,
      calls: selection.decisions.filter(value => value.providerCalled).length,
      decisions: selection.decisions.map(value => ({ model: value.model, reason: value.reason, delivered: value.delivered,
        latencyMs: value.latencyMs, usage: value.usage, payloadDigest: value.payloadDigest })),
      sourceBodiesTransmitted: selection.sourceBodiesTransmitted };
    assert.equal(selection.sourceBodiesTransmitted, false);
    assert.equal(selection.sourceIndex.transmittedCount, 0);
    assert.equal(selection.metadataPermittedCount, paths.length);
    if (item.exact) assert.equal(result.selectedRank, 1);
    results.push(result);
  }
  const report = { version: 1, mode: live ? 'live-synthetic' : 'no-token', createdAt: new Date().toISOString(),
    scope: 'Synthetic Git fixtures and path-only disclosure. No real tasks, first-read proof, full RC5 replay or savings measurement.',
    cases: results, calls: results.reduce((sum, item) => sum + item.calls, 0),
    responseIntegration: live ? results.every(item => item.decisions.length && item.decisions.every(value => value.reason === 'answered')) : 'not-attempted',
    avoidedTokens: null, acceptedWork: null };
  if (!live) assert.equal(report.calls, 0);
  writeFileSync(resolve(output), JSON.stringify(report, null, 2) + '\n');
  summary = { output: resolve(output), cases: results.length, calls: report.calls,
    responseIntegration: report.responseIntegration, fixtureRoot: temporary };
} finally { rmSync(temporary, { recursive: true, force: true }); }
assert.equal(existsSync(temporary), false);
console.log(JSON.stringify({ ...summary, fixtureCleaned: true }));
