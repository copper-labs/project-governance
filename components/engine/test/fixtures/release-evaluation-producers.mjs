import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Installed qualification uses original producer captures, never injected execution stamps. */
export async function verifyEvaluationProducers(generationDirectory, temporaryRoot) {
  const generation = realpathSync(generationDirectory), packageRoot = join(generation, 'node_modules/@organta/project-governance');
  const source = join(packageRoot, 'dist/engine/src');
  const load = name => import(pathToFileURL(join(source, `${name}.js`)).href);
  const [{ runtimeExecutionIdentity }, { DecisionRuntime }, { profileDecisionSettings }, { recordEntryExposure },
    { runChecks }, { mergePacks }, { buildPlan }, { resolveChangeScope, ValidationSubject }, { PackagedCheckerAssets },
    { readReleaseEvaluation }, { digest, durableJson, fileDigest }] = await Promise.all([
      load('runtime-execution-identity'), load('decision-runtime'), load('decision-settings'), load('decision-episodes'),
      load('check-run'), load('pack-configuration'), load('planning'), load('change-subject'), load('checker-assets'),
      load('release-evaluation'), load('core')]);
  const root = join(realpathSync(temporaryRoot), 'evaluation-producers');
  mkdirSync(root, { mode: 0o700 });
  const workspace = join(root, 'workspace'), state = join(root, 'state'), runs = join(root, 'runs');
  for (const directory of [workspace, state, runs]) mkdirSync(directory, { mode: 0o700 });
  execFileSync('git', ['init', '-q'], { cwd: workspace });
  execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-qm', 'Fixture'], { cwd: workspace });
  const identity = runtimeExecutionIdentity();
  assert.equal(identity.archiveDigest, fileDigest(join(generation, 'runtime.tgz')));
  assert.equal(identity.runtimeVersion, JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')).version);
  const scope = resolveChangeScope(workspace, { all: true });
  const packs = mergePacks([{ source: 'fixture', origin: 'target', value: { id: 'fixture', enforcement: 'blocking', stages: ['batch'],
    commands: [{ run: [process.execPath, '-e', 'console.log(JSON.stringify({status:"passed",findings:[]}))'] }] } }]);
  const plan = buildPlan(packs, { stage: 'batch', mode: 'all', changedPaths: [] });
  const checked = await runChecks(packs, plan, { scope, subject: new ValidationSubject(workspace, scope),
    assets: new PackagedCheckerAssets(), packIds: new Set(['fixture']), stage: 'batch',
    asOf: '2026-10-05T00:00:00Z' }, { root: runs, deadlineMs: 10000, trigger: 'test', expectedStatus: 'passed' });
  assert.equal(checked.status, 'passed');
  assert.equal(checked.runtimeVersion, identity.runtimeVersion); assert.equal(checked.archiveDigest, identity.archiveDigest);
  const command = checked.results[0].commands[0].command_receipt;
  assert.equal(command.runtimeVersion, identity.runtimeVersion); assert.equal(command.archiveDigest, identity.archiveDigest);
  const commandRequest = JSON.parse(readFileSync(join(checked.run_directory, digest('fixture').slice(7), 'command-0/request.json'), 'utf8'));
  assert.deepEqual(commandRequest.executionIdentity, identity);
  const settings = profileDecisionSettings({}), runtime = new DecisionRuntime(settings, state);
  const decision = await runtime.ask({ consumerId: 'DL03', eventId: 'original-generation', scope: null,
    subject: { digest: digest('fixture source'), revision: 'fixture', environment: 'fixture' }, evidence: [],
    coverage: { captured: 0, omitted: [], truncated: false, unavailable: [], limits: [] }, questions: [], policyDigest: settings.configDigest });
  assert.equal(decision.providerCalled, false); assert.ok(decision.receiptId);
  const decisionPath = join(state, 'decisions', `${decision.receiptId}.json`);
  const originalDecision = JSON.parse(readFileSync(decisionPath, 'utf8'));
  assert.equal(originalDecision.runtimeVersion, identity.runtimeVersion); assert.equal(originalDecision.archiveDigest, identity.archiveDigest);
  const caller = recordEntryExposure(state, { caller: 'check', entryKind: 'check-completion', scope: null,
    native: { runId: checked.run_id, resultDigest: digest(checked), resultFileDigest: fileDigest(join(checked.run_directory, 'result.json')), status: checked.status },
    exposure: { reason: 'global-off', used: null }, decisions: [decision.receiptId] });
  assert.equal(caller.status, 'recorded');
  const originalCaller = JSON.parse(readFileSync(caller.episode.path, 'utf8'));
  const metricPath = join(checked.run_directory, 'metrics.json'), metric = JSON.parse(readFileSync(metricPath, 'utf8'));
  assert.equal(metric.archive_digest, identity.archiveDigest);
  const frozen = digest('frozen producer case'), manifestPath = join(root, 'manifest.json');
  durableJson(manifestPath, { version: 2, episodes: [{ id: originalCaller.id, scope: null, caller: caller.episode,
    decisions: [decision.receiptId], decisionEvidence: [{ receiptId: decision.receiptId, path: decisionPath, digest: fileDigest(decisionPath) }],
    native: [{ kind: 'check', path: metricPath, digest: fileDigest(metricPath) }], labels: [], observations: {}, evaluation: {
      conditionId: 'candidate', caseId: 'producer-case', trialId: 'first', inputDigest: frozen, expectedLabelDigest: frozen, lifecycle: 'terminal',
      expected: [{ dimension: 'checks', unitId: checked.run_id, outcome: 'passed' }], evidence: [], providerJobs: [], usagePopulation: []
    } }], evaluation: { version: 1, metricContract: 'release-evaluation-1', suite: { version: 'producer-shape-1', digest: frozen }, view: 'field',
    conditions: [{ id: 'candidate', runtime: { version: identity.runtimeVersion, archiveDigest: identity.archiveDigest },
      sourceDigest: frozen, profileDigest: settings.configDigest, questionDigest: frozen, permissionsDigest: frozen, environmentDigest: frozen,
      budgetDigest: frozen, model: 'fixed-fixture', effort: 'medium', cacheState: 'cold', arm: 'code-only' }],
    population: { eligiblePrompts: null }, discovery: { scanComplete: true, projectionEvicted: 0 }, comparison: null } });
  const report = readReleaseEvaluation(join(root, 'unrelated-default-store'), manifestPath);
  assert.equal(report.episodes[0].generation, 'matched'); assert.equal(report.episodes[0].generationIncomplete, 0);
  assert.equal(report.dimensions.find(row => row.dimension === 'checks').successes, 1);
  assert.equal(report.execution.knownSummedProcessMs, checked.duration_ms);
  assert.equal(report.episodes[0].acceptance, 'unknown'); assert.equal(report.efficiencyComparison.medianSavingsFraction, null);
  return { manifestPath, identity, runId: checked.run_id, generation: report.episodes[0].generation, providerCalls: 0 };
}
