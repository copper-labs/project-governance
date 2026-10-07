import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Installed qualification uses original producer captures, never injected execution stamps. */
export async function verifyEvaluationProducers(generationDirectory, temporaryRoot) {
  const generation = realpathSync(generationDirectory), packageRoot = join(generation, 'node_modules/@organta/project-governance');
  const source = join(packageRoot, 'dist/engine/src');
  const load = name => import(pathToFileURL(join(source, `${name}.js`)).href);
  const [{ runtimeExecutionIdentity }, { DecisionRuntime }, { profileDecisionSettings }, { recordEntryExposure },
    { runChecks }, { mergePacks }, { buildPlan }, { resolveChangeScope, ValidationSubject }, { PackagedCheckerAssets },
    { readReleaseEvaluation, releaseEvaluationMarkdown }, { digest, durableJson, fileDigest }, { captureReleaseEvaluation },
    { indexPromptEntry, observeContextHostUsage }, { contextStateRoot }, { Store }, { defaultDbPath, workContext }] = await Promise.all([
      load('runtime-execution-identity'), load('decision-runtime'), load('decision-settings'), load('decision-episodes'),
      load('check-run'), load('pack-configuration'), load('planning'), load('change-subject'), load('checker-assets'),
      load('release-evaluation'), load('core'), load('release-evaluation-capture'), load('context-observations'), load('context-command'),
      import(pathToFileURL(join(packageRoot, 'dist/harness/src/store/store.js')).href),
      import(pathToFileURL(join(packageRoot, 'dist/harness/src/store/location.js')).href)]);
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
      sourceDigest: frozen, profileDigest: settings.configDigest, questionDigest: null, permissionsDigest: frozen, environmentDigest: frozen,
      budgetDigest: frozen, model: 'fixed-fixture', effort: 'medium', cacheState: 'cold', arm: 'code-only' }],
    population: { eligiblePrompts: null }, discovery: { scanComplete: true, projectionEvicted: 0 }, comparison: null } });
  const report = readReleaseEvaluation(join(root, 'unrelated-default-store'), manifestPath);
  assert.equal(report.episodes[0].generation, 'matched'); assert.equal(report.episodes[0].generationIncomplete, 0);
  assert.equal(report.dimensions.find(row => row.dimension === 'checks').successes, 1);
  assert.equal(report.execution.knownSummedProcessMs, checked.duration_ms);
  assert.equal(report.episodes[0].acceptance, 'unknown'); assert.equal(report.efficiencyComparison.medianSavingsFraction, null);
  // Exercise ordinary-cycle shapes through their installed owners. All requests, responses and acceptance remain synthetic.
  const priorState = process.env.XDG_STATE_HOME, owner = new Store(defaultDbPath(workspace));
  process.env.XDG_STATE_HOME = join(root, 'collector-state');
  let cycle;
  try {
    const where = workContext(workspace); owner.workspace(where.locator, workspace);
    const task = owner.createTask('Synthetic completed implementation slice', [
      { kind: 'scope', provenance: 'operator', body: join(workspace, 'docs') },
      { kind: 'acceptance', provenance: 'operator', body: 'Fixture decisive guidance remains available' },
    ], { worktree: workspace, branch: where.branch, session: 'fixture-session', authorityRef: 'fixture-oracle:request' });
    const binding = { workspace, taskId: task.taskId, taskRevision: '1' }, entryId = digest('synthetic ordinary-cycle entry').slice(7);
    const context = contextStateRoot(workspace), promptPath = join(context, 'prompt-entries', `${entryId}.json`);
    durableJson(promptPath, { version: 1, ...runtimeExecutionIdentity(), entryId, workspace, worktreeLocator: where.locator,
      session: 'fixture-session', turn: 'fixture-turn', scopeKind: 'bound-task', status: 'prepared',
      binding: { taskId: task.taskId, revision: '1', status: 'bound', source: 'session' } });
    indexPromptEntry(workspace, entryId, 'fixture-session', 'fixture-turn');
    const exposure = recordEntryExposure(context, { caller: 'prompt-context', entryKind: 'prompt-delivery', scope: binding,
      native: { entryId, provider: 'codex', session: 'fixture-session', turn: 'fixture-turn' },
      exposure: { configuredMode: 'off', mode: 'off', reason: 'off', delivered: true, used: null }, decisions: [] });
    assert.equal(exposure.status, 'recorded');
    const transcript = join(root, 'synthetic-native.jsonl');
    writeFileSync(transcript, JSON.stringify({ type: 'token_usage_record', payload: { thread_id: 'fixture-session', root_turn_id: 'fixture-turn',
      response_id: 'fixture-response', usage: { input_tokens: 100, output_tokens: 20, cached_input_tokens: 40, reasoning_output_tokens: 5 },
      thread_token_usage: { input_tokens: 100000, output_tokens: 10000 } } }) + '\n');
    const observed = observeContextHostUsage(workspace, { session_id: 'fixture-session', turn_id: 'fixture-turn', transcript_path: transcript });
    assert.equal(observed.state, 'observed'); assert.equal(observed.recorded, 1); assert.equal(observed.cursor.state, 'advanced');
    const usage = readdirSync(join(context, 'context-observations')).flatMap(name => {
      const path = join(context, 'context-observations', name);
      return JSON.parse(readFileSync(path, 'utf8')).kind === 'usage' ? [{ kind: 'usage', path, digest: fileDigest(path) }] : [];
    });
    const accepted = owner.reviseTask(task.taskId, [], { status: 'accepted', authorityRef: 'fixture-oracle:accepted' });
    const cycleRequest = { version: 2, evaluation: JSON.parse(readFileSync(manifestPath, 'utf8')).evaluation, episodes: [{
      id: JSON.parse(readFileSync(exposure.episode.path, 'utf8')).id, scope: binding, caller: exposure.episode,
      decisions: [], native: [], labels: [], observations: {}, taskLineage: { fromRevision: 1, throughRevision: accepted.version },
      evaluation: { conditionId: 'candidate', caseId: 'ordinary-cycle-shape', trialId: 'synthetic', inputDigest: frozen,
        expectedLabelDigest: frozen, lifecycle: 'terminal', expected: [{ dimension: 'whole-task', unitId: task.taskId, outcome: 'accepted' }],
        evidence: [{ kind: 'prompt-entry', path: promptPath, digest: fileDigest(promptPath) }, ...usage], providerJobs: [],
        usagePopulation: [`native-response:codex:${digest(['fixture-session', 'fixture-response'])}`] }
    }] };
    const requestPath = join(root, 'capture-request.json'); durableJson(requestPath, cycleRequest);
    const before = readFileSync(defaultDbPath(workspace)), originalTask = owner.readTask(task.taskId), cursor = owner.latestCursor(task.taskId);
    const capture = captureReleaseEvaluation(workspace, requestPath, join(root, 'captured-cycle'));
    assert.deepEqual(readFileSync(defaultDbPath(workspace)), before, 'Read-only capture cannot change the task owner');
    assert.deepEqual(owner.readTask(task.taskId), originalTask); assert.equal(owner.latestCursor(task.taskId), cursor);
    const cycleReport = readReleaseEvaluation(context, capture.manifest.path);
    assert.equal(cycleReport.episodes[0].generation, 'matched'); assert.equal(cycleReport.episodes[0].acceptance, 'accepted');
    assert.equal(cycleReport.allArmSpending.knownSubtotalTokens, 120); assert.equal(cycleReport.episodes[0].usageComplete, true);
    assert.equal(cycleReport.population.eligiblePrompts, null); assert.equal(cycleReport.population.deliveredPacketUse, 'unknown');
    assert.equal(cycleReport.episodes[0].additionalReads, null); assert.equal(cycleReport.efficiencyComparison.medianSavingsFraction, null);
    const reportPath = join(root, 'capture-report.json'), markdownPath = join(root, 'capture-report.md');
    durableJson(reportPath, cycleReport); writeFileSync(markdownPath, releaseEvaluationMarkdown(cycleReport));
    cycle = { manifest: capture.manifest, report: { path: reportPath, digest: fileDigest(reportPath) }, markdownPath,
      acceptance: 'synthetic host-authored task transition only', providerCalls: 0, ordinaryDevelopmentBenefit: 'not-evaluated' };
  } finally {
    owner.close();
    if (priorState === undefined) delete process.env.XDG_STATE_HOME; else process.env.XDG_STATE_HOME = priorState;
  }
  return { manifestPath, identity, runId: checked.run_id, generation: report.episodes[0].generation, capture: cycle, providerCalls: 0 };
}
