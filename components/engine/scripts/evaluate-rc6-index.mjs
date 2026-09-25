import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Real paid calls require --live. All source and prompts are generated fixtures, never adopter data.
const live = process.argv.includes('--live');
const scale = process.argv.includes('--scale');
const output = process.argv.find(arg => arg.startsWith('--output='))?.slice(9);
if (!output || live && !process.env.JEV_TOKEN) throw Error('Use --output=<external path>; --live requires JEV_TOKEN');
const load = file => import(pathToFileURL(resolve('components/engine/src', file)));
const { ValidationSubject, resolveChangeScope } = await load('change-subject.ts');
const { contextMetadataCatalog, selectContextMetadata } = await load('context-metadata.ts');
const { DecisionRuntime } = await load('decision-runtime.ts');
const { profileDecisionSettings } = await load('decision-settings.ts');
const { digest } = await load('core.ts');
const { readDecisionBudget, decisionBudgetStoreStatus } = await load('decision-budget.ts');
const root = mkdtempSync(join(tmpdir(), 'rc6-full-index-eval-'));
try {
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
  git('init', '-q'); mkdirSync(join(root, 'src/zzz'), { recursive: true });
  for (let i = 0; i < (scale ? 1499 : 240); i++) writeFileSync(join(root, `src/item-${String(i).padStart(4, '0')}.ts`), scale
    ? '/** ' + 'Format display counters while keeping presentation state local to this module. '.repeat(8) + ' */\n' +
      Array.from({ length: 12 }, (_, n) => `export function displayCounterPresentationBoundary${i}_${n}() {}`).join('\n')
    : `export const displayCounter${i} = ${i};\n`);
  const expected = 'src/zzz/utility.ts';
  writeFileSync(join(root, expected), '/** Renew expired credentials before sending authenticated requests. */\nexport function refreshExpiredCredentials() { return "fixture"; }\n');
  git('add', '.'); git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'Synthetic index fixture');
  const scope = resolveChangeScope(root, { baseRef: 'HEAD' }), subject = new ValidationSubject(root, scope);
  const purpose = 'Users who stay logged in overnight receive unauthorized errors. Locate the code that renews expired credentials.';
  const catalog = contextMetadataCatalog(subject.paths(), purpose, [], [], new Set());
  const results = [], seen = new Set();
  for (const [turn, descriptions] of (scale ? Array(10).fill(true) : [false, true]).entries()) {
    const mode = descriptions ? 'source-descriptions' : 'paths-only', taskId = scale ? 'same-session' : mode;
    const settings = profileDecisionSettings({ continuity: { decisions: {
      mode: 'auto', allowed_data_classes: descriptions ? ['metadata', 'source'] : ['metadata'],
      allowed_metadata_paths: ['src/**'], allowed_source_paths: descriptions ? ['src/**'] : [],
      evidence_bytes: 16384, deadline_ms: 1000, budget: { max_calls: 256, max_request_bytes: 4194304 },
      consumers: { DL03: { mode: 'auto', questions: ['context.metadata-relevance/1'] } },
    } } });
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 3500), start = performance.now();
    let result;
    try { result = await selectContextMetadata(subject, catalog, purpose,
      new DecisionRuntime(settings, join(root, 'state'), { token: live ? process.env.JEV_TOKEN : '', signal: controller.signal }),
      { workspace: root, taskId, taskRevision: '1' }, scope.subject_digest ?? digest('fixture'), `${mode}-${turn}`, controller.signal); }
    finally { clearTimeout(timeout); }
    for (const path of result.assessed) seen.add(path);
    results.push({ mode, turn, eligible: catalog.eligibleCount, deterministicRank: catalog.candidates.findIndex(item => item.path === expected) + 1,
      selectedRank: result.order.indexOf(expected) + 1, expected, preparationMs: performance.now() - start,
      coverage: result.coverage, sourceIndex: result.sourceIndex,
      budgetFinalized: result.budgetFinalized, ordinaryBudget: readDecisionBudget(join(root, 'state'), { workspace: root, taskId, taskRevision: '1' }),
      calls: result.decisions.filter(item => item.providerCalled).length,
      decisions: result.decisions.map(item => ({ reason: item.reason, model: item.model, latencyMs: item.latencyMs,
        payloadDigest: item.payloadDigest, usage: item.usage, questions: item.coverage.captured })) });
  }
  const report = { version: 1, mode: live ? 'live-synthetic' : 'no-token', scale, createdAt: new Date().toISOString(), results,
    uniqueAssessedAcrossTurns: seen.size, budgetStore: decisionBudgetStoreStatus(join(root, 'state')),
    claim: 'Complete-index and misleading-name comparison on synthetic current source. Not an accepted development task or native host-use proof.',
    acceptedWork: null, avoidedTokens: null };
  writeFileSync(resolve(output), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ output: resolve(output), results: results.map(({ mode, selectedRank, coverage, calls, preparationMs }) => ({ mode, selectedRank, coverage, calls, preparationMs })) }));
} finally { rmSync(root, { recursive: true, force: true }); }
