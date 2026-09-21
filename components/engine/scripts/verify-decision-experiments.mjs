import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

/** Qualify the actual compiled payload with fixture inference and native owned child processes. */
export async function verifyDecisionExperiments(pkg) {
  const load = name => import(pathToFileURL(join(pkg, 'dist/engine/src', `${name}.js`)).href);
  const host = await load('host-api-v1'), { durableJson } = await load('core');
  const { workflowObservationCommand } = await load('decision-workflow-observation');
  const { decisionTelemetryCommand } = await load('decision-history');
  const { contextStateRoot } = await load('context-command');
  const { DecisionRuntime } = await load('decision-runtime'), { profileDecisionSettings } = await load('decision-settings');
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'installed-experiments-'))), database = join(root, 'ledger.sqlite');
  const oldState = process.env.XDG_STATE_HOME;
  process.env.XDG_STATE_HOME = join(root, 'state');
  const continuity = new host.Store(database), store = new host.WorkflowStore(database);
  try {
    const task = continuity.createTask('inspect fixture failure', [{ kind: 'scope', provenance: 'operator', body: root }]), policy = host.defaultPolicy();
    durableJson(join(root, 'config/governance/operations.json'), { version: 1, operations: { read: { argv: [process.execPath, '-e', "console.log('fixture observation')"], cwd: root, effect: 'read' } } });
    const profile = mode => ({ continuity: { decisions: { mode, allowed_data_classes: ['diagnostic'], consumers: { DL05: { mode, effect: 'choose-read' }, DL12: { mode }, DL06: { mode } } } } });
    durableJson(join(root, 'config/governance/profile.yaml'), profile('off'));
    const raw = { version: 1, id: 'read', workspace: root, inputs: [], resources: [], stages: [{ id: 'read', operation: 'read', deadlineMs: 2000 }], deadlineMs: 3000, policyRevision: policy.revision, claims: [] };
    const grant = operationId => {
      const request = { operation: 'check', scope: [root], targets: [], destination: null, policyRevision: policy.revision };
      const action = host.authorizeAction(continuity, host.proposeAction(continuity, task.taskId, request), request, policy, root), recipe = host.resolveWorkflowRecipe(raw);
      const binding = { taskId: task.taskId, taskVersion: task.version, actionId: action.actionId, authorityRef: 'host:installed-fixture', operationId, recipe, recipeDigest: host.recipeDigest(recipe) };
      store.authorizeWorkflow(binding); return binding;
    };
    const parent = store.submit(grant('parent')), active = store.claim(parent.id, parent.revision, 'fixture');
    store.stage(parent.id, 'fixture', 'read', 'running');
    store.stage(parent.id, 'fixture', 'read', 'failed', { state: 'failed', exitCode: 1, cleanup: 'confirmed', startedAt: 'start', endedAt: 'end', log: '', inputValidity: 'valid', detail: 'controlled failure' });
    const failed = store.transition(parent.id, 'fixture', active.revision, 'failed');
    const assignmentPath = join(root, 'assignment.json');
    const scope = { workspace: root, taskId: task.taskId, taskRevision: String(task.version) };
    durableJson(assignmentPath, { version: 1, id: 'assignment', episodeId: 'off-episode', experiment: 'installed', definitionVersion: '1', arm: 'off',
      assignedAt: new Date(Date.now() - 1000).toISOString(), groupingUnit: 'fixture', sourceRevision: 'fixture', scope });
    const observation = await workflowObservationCommand('workflow-status', ['--database', database, '--run', parent.id, '--pilot-assignment', assignmentPath]);
    assert.equal(observation.collection.status, 'recorded');
    const excerpt = join(root, 'excerpt.json'); durableJson(excerpt, { text: 'Inspected a launch issue, then ran a useful test.' });
    const excerptDigest = host.fileDigest(excerpt), manifestPath = join(root, 'outcomes.json');
    durableJson(manifestPath, { version: 2, episodes: [{ id: 'off-episode', scope, decisions: [], caller: observation.collection.episode }],
      analysis: { inputDigest: host.digest({ excerpts: [excerptDigest], procedures: [] }), excerpts: [{ episodeId: 'off-episode', path: excerpt, digest: excerptDigest }] } });
    assert.equal((await decisionTelemetryCommand(['--outcomes-manifest', manifestPath], root)).outcome_report.counts.joined, 1);
    durableJson(join(root, 'config/governance/profile.yaml'), profile('shadow'));
    let calls = 0;
    const options = { token: 'fixture', fetch: async (_url, init) => {
      calls++; const payload = JSON.parse(String(init.body)), keys = Object.keys(payload.questions['work-class'].criteria);
      return Response.json({ model: payload.model, answers: { 'work-class': { type: 'choice', choice: 'mixed', confidence: 1,
        probabilities: Object.fromEntries(keys.map(key => [key, key === 'mixed' ? 1 : 0])) } } });
    } };
    const history = await decisionTelemetryCommand(['--outcomes-manifest', manifestPath, '--classify-history'], root, options);
    assert.equal(history.history.samples[0].mode, 'shadow'); assert.equal(history.history.samples[0].workClass, 'mixed'); assert.equal(calls, 1);
    const runtime = new DecisionRuntime(profileDecisionSettings(profile('auto')), contextStateRoot(root), { token: 'fixture', fetch: async () => { throw new Error('incompatible entry reached transport'); } });
    const guard = await runtime.ask({ consumerId: 'DL05', entryKind: 'workflow-observe', eventId: 'guard', scope,
      subject: { digest: host.digest('source'), revision: '1', environment: 'fixture' }, policyDigest: host.digest('policy'),
      evidence: [{ id: 'log', text: 'fixture', sourceDigest: host.digest('fixture'), provenance: 'supplied', trust: 'untrusted' }],
      coverage: { captured: 1, omitted: [], unavailable: [], truncated: false, limits: [] },
      questions: [{ name: 'probe', definitionId: 'runtime.next-probe/2', consumerId: 'DL05', evidenceIds: ['log'], candidates: [{ id: 'read', description: 'read only' }] }] });
    assert.equal(guard.reason, 'entry-effect-incompatible');
    const episode = host.diagnosticEpisodeId(failed, 'read'), approval = grant(host.diagnosticOperationId(episode, 'inspect'));
    const probeManifest = { version: 1, parentRunId: parent.id, stageId: 'read', deadline: Date.now() + 10000,
      target: { kind: 'workspace', id: root }, baseline: { revision: 'fixture', probeOrder: ['inspect'], exact: true },
      probes: [{ id: 'inspect', description: 'Inspect fixture state', recipe: raw, binding: { actionId: approval.actionId, authorityRef: approval.authorityRef, operationId: approval.operationId } }] };
    durableJson(join(root, 'config/governance/profile.yaml'), profile('off'));
    const db = new DatabaseSync(database);
    assert.equal(db.prepare("SELECT value FROM meta WHERE key='engine_schema'").get().value, '2'); db.close();
    const diagnosis = await host.diagnoseWorkflow(database, probeManifest, { token: '', workersDirectory: join(root, 'workers'), registryPath: join(root, 'resources.sqlite') });
    assert.equal(diagnosis.children.length, 1); assert.equal(diagnosis.children[0].run.state, 'succeeded'); assert.equal(store.read(parent.id).state, 'failed');
    const replay = await host.diagnoseWorkflow(database, probeManifest, { token: '', workersDirectory: join(root, 'workers'), registryPath: join(root, 'resources.sqlite') });
    assert.equal(replay.children[0].run.id, diagnosis.children[0].run.id);
    const migrated = new DatabaseSync(database);
    assert.equal(migrated.prepare("SELECT value FROM meta WHERE key='engine_schema'").get().value, '3'); migrated.close();
    const reopened = new host.WorkflowStore(database); reopened.close();
    const preserved = new DatabaseSync(database);
    assert.equal(preserved.prepare("SELECT value FROM meta WHERE key='engine_schema'").get().value, '3'); preserved.close();
    return { status: 'passed', offCapture: true, historyShadow: true, effectGuard: true, nativeChild: true, replay: true,
      scope: 'installed fixture proof; no live JEV quality, simulator/device adoption, or benefit claim' };
  } finally {
    store.close(); continuity.close(); if (oldState === undefined) delete process.env.XDG_STATE_HOME; else process.env.XDG_STATE_HOME = oldState;
    rmSync(root, { recursive: true, force: true });
  }
}
