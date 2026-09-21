import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Fixture evidence, compiled public CLI. This proves integration, never live device readiness. */
export async function verifyDecisionObservers({ packageRoot, repo, temporary, run, write, git, environment, callsPath }) {
  const load = path => import(pathToFileURL(join(resolve(packageRoot), 'dist', path + '.js')).href);
  const { digest, durableJson, fileDigest } = await load('engine/src/core');
  const profile = { profile_id: 'fixture', continuity: { decisions: { mode: 'auto', allowed_data_classes: ['source', 'diagnostic'], allowed_source_paths: ['**'],
    consumers: Object.fromEntries(['DL03', 'DL04', 'DL05', 'DL09', 'DL13'].map(id => [id, { mode: 'auto' }])) } },
    context_router: { routes: [{ id: 'fix', match: { prompt_terms: ['fix'] }, primary_context: ['rules.md'] }] } };
  write('config/governance/profile.yaml', profile); write('config/governance/facts.lock.yaml', { profile_id: 'fixture', facts: {} });
  writeFileSync(join(repo, 'rules.md'), 'Mandatory instructions remain');
  writeFileSync(join(repo, 'a.md'), 'First optional explanation'); writeFileSync(join(repo, 'b.md'), 'Second optional explanation');
  write('config/governance/operations.json', { version: 1, operations: { inspect: { argv: [process.execPath, '-e', "require('node:fs').writeFileSync('unexpected-execution','bad')"], cwd: repo, effect: 'local' } } });
  write('config/governance/candidates.json', { version: 1, candidates: [{ id: 'inspect', description: 'Inspect the problem', recipe: {
    version: 1, id: 'inspect', workspace: repo, inputs: [], resources: [], stages: [{ id: 'inspect', operation: 'inspect', deadlineMs: 1000 }], deadlineMs: 2000, policyRevision: '1', claims: ['inspection'] } }] });
  git('add', 'config', 'rules.md', 'a.md', 'b.md');
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'Capture observer configuration');
  const routed = run(['context-route', '--task', 'fix', '--revision', 'observer-1', '--decision-task', 'observer', '--optional-path', 'a.md', '--optional-path', 'b.md', '--workflow-candidates', 'config/governance/candidates.json']);
  assert.equal(routed.ready, true); assert.equal(routed.entries[0].content, 'Mandatory instructions remain');
  assert.equal(routed.relevanceAdvice.delivered, true); assert.equal(routed.workflowAdvice.recommended.id, 'inspect');
  assert.equal(existsSync(join(repo, 'unexpected-execution')), false);
  const providerDirectory = join(temporary, 'provider'); mkdirSync(providerDirectory);
  const request = { version: 1, id: 'compiled-provider', operation: { cwd: repo }, provider: { kind: 'claude' }, assignment: { task: 'Inspect completion' }, runtime: {} };
  durableJson(join(providerDirectory, 'request.json'), request);
  const providerPath = join(providerDirectory, 'provider-result.json'), originalAnswer = 'Header\n\nRoutine chatter\n\nWarning: device proof missing\n\nEnd';
  durableJson(providerPath, { version: 1, requestDigest: digest(request), state: 'succeeded', identity: null,
    completion: { outcome: 'completed', answer: originalAnswer, artifacts: [], sources: [], remaining: [], checks: [{ description: 'All platforms passed', result: 'passed', evidence: 'Only simulator evidence' }] } });
  durableJson(join(providerDirectory, 'result.json'), { version: 1, requestDigest: digest(request), state: 'succeeded', exitCode: 0, signal: null, cleanup: 'confirmed', reason: 'completed',
    startedAt: '2026-09-21T00:00:00Z', endedAt: '2026-09-21T00:00:01Z', durationMs: 1000, log: join(providerDirectory, 'output.log'), logBytes: 0, providerResult: providerPath, providerResultDigest: fileDigest(providerPath) });
  const providerBytes = readFileSync(providerPath), nativeBytes = readFileSync(join(providerDirectory, 'result.json'));
  const providerArgs = ['--directory', providerDirectory, '--digest', digest(request)];
  const observed = run(['provider-status', ...providerArgs]);
  assert.equal(observed.decisionAdvice.claims.evidenceBasis, 'reported-only');
  assert.equal(observed.decisionAdvice.claims.scope.label, 'broader-than-evidence');
  assert.equal(observed.provider.completion.answer.includes('Routine chatter'), false);
  assert.equal(observed.provider.completion.answer.includes('Warning: device proof missing'), true);
  assert.deepEqual(readFileSync(providerPath), providerBytes); assert.deepEqual(readFileSync(join(providerDirectory, 'result.json')), nativeBytes);
  assert.equal(run(['provider-wait', ...providerArgs, '--milliseconds', '0']).decisionAdvice.output.delivered, true);

  verifyBoundClaim({ temporary, repo, run, durableJson, digest, fileDigest, providerPath, request, providerArgs, environment });

  const { Store } = await load('harness/src/store/store'), { WorkflowStore } = await load('engine/src/workflow-store');
  const { proposeAction, authorizeAction } = await load('harness/src/ops/actions'), { defaultPolicy } = await load('harness/src/ops/authority');
  const { parseRecipe, recipeDigest } = await load('engine/src/workflow-types'), { workflowOperation } = await load('engine/src/workflow-operation');
  const database = join(temporary, 'ledger.sqlite'), continuity = new Store(database), store = new WorkflowStore(database);
  try {
    const task = continuity.createTask('Inspect launch failure', [{ kind: 'scope', provenance: 'operator', body: repo }]);
    const policy = defaultPolicy(), actionRequest = { operation: 'check', scope: [repo], targets: [], destination: null, policyRevision: policy.revision };
    const action = authorizeAction(continuity, proposeAction(continuity, task.taskId, actionRequest), actionRequest, policy, repo);
    const recipe = parseRecipe({ version: 1, id: 'launch', workspace: repo, inputs: [], resources: [],
      operations: { launch: { argv: [process.execPath, '-e', 'process.exit(1)'], cwd: repo, effect: 'read' } },
      stages: [{ id: 'launch', operation: 'launch', deadlineMs: 1000 }], deadlineMs: 2000, policyRevision: policy.revision, claims: [] });
    const binding = { taskId: task.taskId, taskVersion: task.version, actionId: action.actionId, authorityRef: 'host:fixture', recipe, recipeDigest: recipeDigest(recipe), operationId: 'fixture' };
    store.authorizeWorkflow(binding); const initial = store.submit(binding), active = store.claim(initial.id, initial.revision, 'fixture');
    const commands = join(temporary, 'workflow-commands'), directory = join(commands, `${initial.id}-0`), log = join(directory, 'output.log');
    mkdirSync(directory, { recursive: true }); writeFileSync(log, 'Error: development server unavailable');
    const command = { version: 1, id: `${initial.id}:launch`, operation: workflowOperation(recipe, initial.id, recipe.stages[0], commands), deadlineMs: 1000, outputLimit: 10000, ownerDigest: 'fixture' };
    durableJson(join(directory, 'request.json'), command);
    const result = { state: 'failed', exitCode: 1, cleanup: 'confirmed', startedAt: 'start', endedAt: 'end', log, inputValidity: 'valid', detail: 'nonzero exit' };
    durableJson(join(directory, 'result.json'), { version: 1, requestDigest: digest(command), ...result, signal: null, reason: 'nonzero exit', durationMs: 100, logBytes: 37 });
    store.stage(initial.id, 'fixture', 'launch', 'running'); store.stage(initial.id, 'fixture', 'launch', 'failed', result);
    store.transition(initial.id, 'fixture', active.revision, 'failed');
    const before = store.read(initial.id), stages = store.stages(initial.id), evidencePath = join(temporary, 'device.json');
    durableJson(evidencePath, { version: 1, run: initial.id, stage: 'launch', taskRevision: task.version, target: { kind: 'simulator', id: 'fixture-target' },
      probes: [{ id: 'inspect-server', description: 'Read server status', effect: 'read' }] });
    const args = ['--database', database, '--run', initial.id];
    assert.equal(run(['workflow-status', ...args], 1).deviceAdvice.reason, 'diagnostic-envelope-required');
    const diagnosed = run(['workflow-status', ...args, '--diagnostic-evidence', evidencePath], 1);
    assert.equal(diagnosed.deviceAdvice.delivered, true, JSON.stringify(diagnosed.deviceAdvice));
    assert.equal(diagnosed.deviceAdvice.nextProbe.id, 'inspect-server');
    assert.equal(run(['workflow-wait', ...args, '--wait-ms', '0', '--diagnostic-evidence', evidencePath], 1).deviceAdvice.delivered, true);
    assert.deepEqual(store.read(initial.id), before); assert.deepEqual(store.stages(initial.id), stages);
    const previousCalls = readFileSync(callsPath, 'utf8');
    delete environment.JEV_TOKEN;
    const routeArgs = ['context-route', '--task', 'fix', '--revision', 'observer-1', '--decision-task', 'observer', '--optional-path', 'a.md', '--optional-path', 'b.md', '--workflow-candidates', 'config/governance/candidates.json'];
    const missingContext = run(routeArgs);
    assert.equal(missingContext.relevanceAdvice.delivered, false); assert.equal(missingContext.workflowAdvice.delivered, false);
    const missingProvider = run(['provider-status', ...providerArgs]);
    assert.equal(missingProvider.decisionAdvice.claims.delivered, false); assert.equal(missingProvider.decisionAdvice.output.delivered, false);
    assert.equal(missingProvider.provider.completion.answer, originalAnswer);
    assert.equal(run(['workflow-status', ...args, '--diagnostic-evidence', evidencePath], 1).deviceAdvice.delivered, false);
    environment.JEV_TOKEN = 'fixture-only';
    profile.continuity.decisions.mode = 'off'; write('config/governance/profile.yaml', profile);
    git('add', 'config/governance/profile.yaml'); git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'Freeze global disable');
    assert.equal(run(routeArgs).relevanceAdvice.delivered, false);
    assert.equal(run(['provider-status', ...providerArgs]).decisionAdvice, undefined);
    assert.equal(run(['workflow-status', ...args, '--diagnostic-evidence', evidencePath], 1).deviceAdvice, undefined);
    assert.equal(readFileSync(callsPath, 'utf8'), previousCalls, 'Missing credentials and global disable must dispatch no provider requests');
  } finally { store.close(); continuity.close(); }
  const report = run(['telemetry', 'decisions']);
  for (const id of ['DL03', 'DL04', 'DL05', 'DL09', 'DL13']) assert.ok(report.pilot.consumers[id].delivered > 0, id);
  return ['DL03', 'DL04', 'DL05', 'DL09', 'DL13'];
}


/** Installed-code proof of explicit binding and deterministic failure reporting without inference. */
function verifyBoundClaim({ temporary, repo, run, durableJson, digest, fileDigest, providerPath, request, providerArgs, environment }) {
  const directory = join(temporary, 'claim-command'); mkdirSync(directory);
  const native = { version: 1, id: 'claim-command', operation: { cwd: repo, argv: [process.execPath, '--version'], env: {} },
    deadlineMs: 1000, outputLimit: 1000, ownerDigest: `sha256:${'a'.repeat(64)}` };
  durableJson(join(directory, 'request.json'), native);
  durableJson(join(directory, 'owner.json'), { pid: 12345, fingerprint: 'captured fixture process', requestDigest: digest(native) });
  const log = join(directory, 'output.log'); writeFileSync(log, 'Only simulator evidence');
  durableJson(join(directory, 'result.json'), { version: 1, requestDigest: digest(native), state: 'failed', exitCode: 1,
    cleanup: 'unknown', endedAt: '2026-09-21T00:00:00.500Z', log });
  const manifest = join(temporary, 'claim-evidence.json');
  durableJson(manifest, { version: 1, providerRequestDigest: digest(request), providerResultDigest: fileDigest(providerPath), claims: [{
    claimIndex: 0, claimDigest: digest({ description: 'All platforms passed', result: 'passed', evidence: 'Only simulator evidence' }),
    quote: 'Only simulator evidence', directory, requestDigest: digest(native), resultDigest: fileDigest(join(directory, 'result.json')) }] });
  const token = environment.JEV_TOKEN; delete environment.JEV_TOKEN;
  try {
    const result = run(['provider-status', ...providerArgs, '--claim-evidence', manifest]);
    assert.equal(result.decisionAdvice.claimEvidence.status, 'bound');
    assert.equal(result.decisionAdvice.claims.corrections[0].label, 'native-result-not-passed');
    assert.equal(result.decisionAdvice.claims.boundEvidence[0].directory, directory);
    assert.equal(result.decisionAdvice.claims.decision.delivered, false);
  } finally { environment.JEV_TOKEN = token; }
}
