/** Synthetic operator callbacks qualify plumbing, never approval for an adopter's real task. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { loadHost, bindReviewedWorkflow } from './workflow-host-binding.mjs';

const packageDirectory = process.env.GOVERNANCE_HOST_TEST_PACKAGE ?? fileURLToPath(new URL('../../../', import.meta.url));
const host = await loadHost(packageDirectory);
function fixture() {
  const workspace = mkdtempSync(join(tmpdir(), 'operator-workflow-'));
  execFileSync('/usr/bin/git', ['init', '-q', '-b', 'main', workspace]);
  for (const dir of ['config/governance', '.governance/runtime/bin', '.git/harness']) mkdirSync(join(workspace, dir), { recursive: true });
  writeFileSync(join(workspace, 'config/governance/runtime.lock.yaml'), JSON.stringify({ package: '@organta/project-governance', version: host.version }));
  writeFileSync(join(workspace, '.governance/runtime/bin/project-governance'), `#!/bin/sh\nexec '${process.execPath}' '${host.root}/dist/engine/src/cli.js' "$@"\n`, { mode: 0o755 });
  const database = join(workspace, '.git/harness/harness.db'), store = new host.api.Store(database);
  const task = store.createTask('Synthetic operator workflow', [{ kind: 'scope', provenance: 'operator', body: workspace }], { worktree: workspace, branch: 'main', session: 'fixture-session' });
  store.close();
  const catalog = join(workspace, 'config/governance/operations.json');
  writeFileSync(catalog, JSON.stringify({ version: 1, operations: { probe: { argv: [process.execPath, '--version'], cwd: workspace, effect: 'read' } } }));
  const input = join(workspace, 'input.txt'); writeFileSync(input, 'fixture input');
  const recipe = { version: 1, id: 'probe', workspace, inputs: [{ path: 'input.txt', digest: host.api.fileDigest(input) }], resources: [],
    stages: [{ id: 'probe', operation: 'probe', deadlineMs: 3000 }], deadlineMs: 5000, policyRevision: host.api.defaultPolicy().revision, claims: ['node version probe'] };
  const recipeFile = join(workspace, 'recipe.json'); writeFileSync(recipeFile, JSON.stringify(recipe));
  const request = { workspace, taskId: task.taskId, taskVersion: task.version, sessionId: 'fixture-session', operationId: host.api.digest(workspace), recipeFile };
  const receipt = join(workspace, 'receipt.json');
  const actions = () => { const s = new host.api.Store(database, { readOnly: true }); try { return s.listActions(task.taskId); } finally { s.close(); } };
  return { workspace, database, task, catalog, input, recipe, recipeFile, request, receipt, actions, clean: () => rmSync(workspace, { recursive: true, force: true }) };
}

test('missing approval and mismatched session/task/worktree authorize nothing', async () => {
  const f = fixture();
  try {
    await assert.rejects(bindReviewedWorkflow(host, f.request, f.receipt, async () => false), /did not approve/);
    for (const patch of [{ sessionId: 'another-session' }, { taskVersion: 99 }]) {
      await assert.rejects(bindReviewedWorkflow(host, { ...f.request, ...patch }, f.receipt, async () => true), /mismatch|stale/);
    }
    assert.equal(f.actions().length, 0);
  } finally { f.clean(); }
});

test('one approval binds without dispatch; lost acknowledgement replay preserves one action', async () => {
  const f = fixture(); let confirmations = 0;
  try {
    const receipt = await bindReviewedWorkflow(host, f.request, f.receipt, async () => { confirmations++; return true; });
    assert.equal(receipt.status, 'bound'); assert.equal(f.actions().length, 1);
    writeFileSync(f.receipt, JSON.stringify({ ...receipt, status: 'binding-pending' }));
    const replay = await bindReviewedWorkflow(host, f.request, f.receipt, async () => { throw new Error('Unexpected second prompt'); });
    assert.equal(replay.status, 'bound'); assert.equal(replay.replayed, true); assert.equal(replay.binding.actionId, receipt.binding.actionId); assert.equal(confirmations, 1);
    const w = new host.api.WorkflowStore(f.database);
    try { w.validateWorkflowBinding(receipt.binding); const run = w.submit(receipt.binding); assert.equal(run.state, 'queued'); assert.equal(w.submit(receipt.binding).id, run.id); }
    finally { w.close(); }
  } finally { f.clean(); }
});

test('changed catalog, inputs, resource, operation, policy and runtime pin refuse replay', async () => {
  for (const change of ['catalog', 'input', 'resource', 'operation', 'policy', 'pin']) {
    const f = fixture();
    try {
      await bindReviewedWorkflow(host, f.request, f.receipt, async () => true);
      if (change === 'catalog') writeFileSync(f.catalog, readFileSync(f.catalog, 'utf8').replace('--version', '--help'));
      if (change === 'input') writeFileSync(f.input, 'changed');
      if (change === 'resource') { f.recipe.resources = ['device:other']; writeFileSync(f.recipeFile, JSON.stringify(f.recipe)); }
      if (change === 'operation') f.request.operationId += '-other';
      if (change === 'policy') { f.recipe.policyRevision = 'other'; writeFileSync(f.recipeFile, JSON.stringify(f.recipe)); }
      if (change === 'pin') writeFileSync(join(f.workspace, 'config/governance/runtime.lock.yaml'), JSON.stringify({ package: '@organta/project-governance', version: '0.0.0' }));
      await assert.rejects(bindReviewedWorkflow(host, f.request, f.receipt, async () => { throw new Error('Must refuse before approval'); }));
      assert.equal(f.actions().length, 1);
    } finally { f.clean(); }
  }
});

test('input or task changes while operator reviews leave zero actions', async () => {
  for (const change of ['input', 'task']) {
    const f = fixture();
    try {
      await assert.rejects(bindReviewedWorkflow(host, f.request, f.receipt, async () => {
        if (change === 'input') writeFileSync(f.input, 'changed');
        else { const s = new host.api.Store(f.database); try { s.reviseTask(f.task.taskId, [{ kind: 'handoff', provenance: 'observed', body: 'fixture revision' }], { expectedVersion: f.task.version }); } finally { s.close(); } }
        return true;
      }), /Stale|stale|changed/);
      assert.equal(f.actions().length, 0);
    } finally { f.clean(); }
  }
});

test('forged bound receipt cannot create authority; interrupted creation never duplicates an action', async () => {
  const f = fixture();
  try {
    const receipt = await bindReviewedWorkflow(host, f.request, f.receipt, async () => true);
    const forged = structuredClone(receipt); forged.binding.authorityRef = 'forged'; writeFileSync(f.receipt, JSON.stringify(forged));
    await assert.rejects(bindReviewedWorkflow(host, f.request, f.receipt, async () => true), /binding/);
    writeFileSync(f.receipt, JSON.stringify({ status: 'creating-action', snapshotDigest: receipt.snapshotDigest, snapshot: receipt.snapshot }));
    await assert.rejects(bindReviewedWorkflow(host, f.request, f.receipt, async () => true), /reconciliation/);
    assert.equal(f.actions().length, 1);
  } finally { f.clean(); }
});

test('concurrent entry refuses while the original operator prompt owns the receipt', async () => {
  const f = fixture(); let release;
  try {
    const pending = bindReviewedWorkflow(host, f.request, f.receipt, () => new Promise(resolve => { release = resolve; }));
    await assert.rejects(bindReviewedWorkflow(host, f.request, f.receipt, async () => true), /EEXIST/);
    release(true); await pending; assert.equal(f.actions().length, 1);
  } finally { f.clean(); }
});

test('installed public CLI dispatches the approved harmless workflow once and replays its run', async () => {
  const f = fixture(); let completed = false;
  try {
    const receipt = await bindReviewedWorkflow(host, f.request, f.receipt, async () => true);
    const b = receipt.binding;
    const command = ['workflow-submit', '--database', f.database, '--task', b.taskId, '--task-version', String(b.taskVersion),
      '--action', b.actionId, '--recipe', f.recipeFile, '--authority', b.authorityRef, '--operation-id', b.operationId];
    const invoke = args => {
      const result = spawnSync(process.execPath, [join(host.root, 'dist/engine/src/cli.js'), ...args],
        { cwd: f.workspace, encoding: 'utf8', timeout: 15000, env: { ...process.env, XDG_STATE_HOME: join(f.workspace, 'state') } });
      if (![0, 2].includes(result.status)) throw new Error(`Installed CLI failure: ${result.stdout} ${result.stderr}`);
      return JSON.parse(result.stdout);
    };
    const submitted = invoke(command), replayed = invoke(command);
    const id = submitted.run.id;
    assert.equal(replayed.run.id, id);
    let latest;
    for (let attempt = 0; attempt < 10; attempt++) {
      latest = invoke(['workflow-wait', '--database', f.database, '--run', id, '--wait-ms', '1000', '--after-event', String(attempt ? latest.events?.at(-1)?.sequence ?? 0 : 0)]);
      if (['succeeded', 'failed', 'blocked', 'cancelled', 'unknown'].includes(latest.run.state)) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    completed = ['succeeded', 'failed', 'blocked', 'cancelled'].includes(latest.run.state);
    assert.equal(latest.run.state, 'succeeded', JSON.stringify(latest));
    assert.equal(f.actions().length, 1);
  } finally { if (completed) f.clean(); else console.error('Retained uncertain fixture:', f.workspace); }
});
