/** Synthetic operator callbacks qualify plumbing, never approval for an adopter's real task. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
const adapter = process.env.GOVERNANCE_HOST_TEST_PACKAGE
  ? pathToFileURL(join(process.env.GOVERNANCE_HOST_TEST_PACKAGE, 'dist/engine/assets/host/workflow-host-binding.mjs')).href
  : new URL('./workflow-host-binding.mjs', import.meta.url).href;
const { loadHost, bindReviewedWorkflow, bindConfiguredWorkflow, workflowBindingRefusal } = await import(adapter);

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

for (const route of ['operator', 'task']) test(`installed public CLI dispatches the ${route} harmless workflow once and replays its run`, async () => {
  const f = fixture(); let completed = false;
  try {
    if (route === 'task') taskPolicy(f);
    const receipt = route === 'task' ? await bindConfiguredWorkflow(host, f.request, f.receipt, noPrompt) : await bindReviewedWorkflow(host, f.request, f.receipt, async () => true);
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

const setPolicy = (f, declaration) => writeFileSync(join(f.workspace, 'config/governance/profile.yaml'), JSON.stringify({ schema_version: 1, workflow_authorization: declaration }));
const taskPolicy = (f, extra = {}) => setPolicy(f, { mode: 'task', ...extra });
const noPrompt = () => { throw new Error('Unexpected governance prompt'); };
function nextRun(f) {
  writeFileSync(f.input, 'changed driver');
  f.recipe.inputs[0].digest = host.api.fileDigest(f.input);
  writeFileSync(f.recipeFile, JSON.stringify(f.recipe));
  f.request.operationId += '-next';
  return join(f.workspace, 'next-receipt.json');
}

test('legacy binding prompts again for an edited driver despite an adopted project policy', async () => {
  const f = fixture(); let prompts = 0;
  try {
    taskPolicy(f);
    const confirm = () => { prompts++; return true; };
    await bindReviewedWorkflow(host, f.request, f.receipt, confirm);
    await bindReviewedWorkflow(host, f.request, nextRun(f), confirm);
    assert.equal(prompts, 2); // Existing path reproduces the friction; no ordinary work is accepted here.
  } finally { f.clean(); }
});

test('configured binding gives edited drivers fresh exact actions without enrollment or prompts', async () => {
  const f = fixture();
  try {
    taskPolicy(f);
    const first = await bindConfiguredWorkflow(host, f.request, f.receipt, noPrompt);
    const replay = await bindConfiguredWorkflow(host, f.request, f.receipt, noPrompt);
    assert.equal(replay.binding.actionId, first.binding.actionId);
    assert.equal(first.approvalRoute, 'task-policy');
    assert.equal(first.binding.authorityRef, f.task.taskId);
    assert.equal(first.approvedAt, undefined);
    assert.ok(first.boundAt && first.policyDigest);
    const second = await bindConfiguredWorkflow(host, f.request, nextRun(f), noPrompt);
    assert.notEqual(second.binding.actionId, first.binding.actionId);
    assert.notEqual(second.binding.recipeDigest, first.binding.recipeDigest);
    assert.equal(f.actions().length, 2);
    const workflows = new host.api.WorkflowStore(f.database);
    try {
      workflows.validateWorkflowBinding(second.binding);
      assert.equal(workflows.submit(second.binding).state, 'queued');
    } finally { workflows.close(); }
  } finally { f.clean(); }
});

test('missing policy keeps native consent; invalid policy never silently opts in', async () => {
  const f = fixture(); let prompts = 0;
  try {
    await assert.rejects(bindConfiguredWorkflow(host, f.request, f.receipt, () => { prompts++; return false; }), /did not approve/);
    assert.equal(prompts, 1);
    for (const declaration of [null, {}, {mode:'trust'}, {mode:'task', typo:true}, {mode:'operator', resources:['x']},
      {mode:'task', resources:['x','x']}, {mode:'task', credential_env:['PATH']}, {mode:'task', credential_env:['TEST_TOKEN','TEST_TOKEN']}]) {
      setPolicy(f, declaration);
      await assert.rejects(bindConfiguredWorkflow(host, f.request, f.receipt, noPrompt), /workflow authorization|workflow resources|Invalid credential|Duplicate workflow|Operator mode|project profile/i);
    }
    assert.equal(f.actions().length, 0);
  } finally { f.clean(); }
});

test('resource and credential additions require explicit policy coverage', async () => {
  for (const capability of ['resource', 'credential']) {
    const f = fixture();
    try {
      taskPolicy(f);
      if (capability === 'resource') { f.recipe.resources = ['fixture-device']; writeFileSync(f.recipeFile, JSON.stringify(f.recipe)); }
      else { const catalog = JSON.parse(readFileSync(f.catalog, 'utf8')); catalog.operations.probe.credentialEnv = ['FIXTURE_TOKEN']; writeFileSync(f.catalog, JSON.stringify(catalog)); }
      await assert.rejects(bindConfiguredWorkflow(host, f.request, f.receipt, noPrompt), /outside the configured/);
      assert.equal(f.actions().length, 0);
      taskPolicy(f, capability === 'resource' ? {resources:['fixture-device']} : {credential_env:['FIXTURE_TOKEN']});
      const result = await bindConfiguredWorkflow(host, f.request, f.receipt, noPrompt);
      assert.equal(result.approvalRoute, 'task-policy');
    } finally { f.clean(); }
  }
});

test('task policy preserves current task revision, session and explicit constraint checks', async () => {
  for (const change of ['revision', 'session', 'constraint']) {
    const f = fixture();
    try {
      taskPolicy(f);
      if (change === 'session') f.request.sessionId = 'other-session';
      else {
        const store = new host.api.Store(f.database);
        try {
          const task = store.reviseTask(f.task.taskId, [{kind:'constraint', provenance:'operator', body:change === 'constraint' ? 'deny:check' : 'new scope'}], {session:'fixture-session'});
          if (change === 'constraint') f.request.taskVersion = task.version;
        } finally { store.close(); }
      }
      await assert.rejects(bindConfiguredWorkflow(host, f.request, f.receipt, noPrompt), /stale|mismatch|denied|constraint/i);
      assert.equal(f.actions().length, 0);
    } finally { f.clean(); }
  }
});

test('an existing operator receipt is not relabelled as project policy authority', async () => {
  const f = fixture();
  try {
    await bindReviewedWorkflow(host, f.request, f.receipt, () => true);
    taskPolicy(f);
    await assert.rejects(bindConfiguredWorkflow(host, f.request, f.receipt, noPrompt), /authority differs/);
    assert.equal(f.actions().length, 1);
  } finally { f.clean(); }
});

test('installed workflow-bind uses its own selected package and the current worktree', async () => {
  const f = fixture();
  try {
    taskPolicy(f);
    const requestFile = join(f.workspace, 'request.json');
    writeFileSync(requestFile, JSON.stringify(f.request));
    const invoke = (cwd = f.workspace) => spawnSync(process.execPath, [join(host.root, 'dist/engine/src/cli.js'), 'workflow-bind', '--request', requestFile, '--receipt', f.receipt], {cwd, encoding:'utf8', timeout:15000});
    const result = invoke();
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).approvalRoute, 'task-policy');
    assert.equal(f.actions().length, 1);
    assert.equal(JSON.parse(invoke().stdout).replayed, true);
    assert.match(invoke(tmpdir()).stderr, /current worktree root/);
    writeFileSync(requestFile, JSON.stringify({...f.request, runtimePackage:tmpdir()}));
    assert.match(invoke().stderr, /invoked runtime package/);
    assert.equal(f.actions().length, 1);
  } finally { f.clean(); }
});

test('policy edits during binding refuse before creating authority', async () => {
  const f = fixture(); let reads = 0;
  try {
    taskPolicy(f);
    const racingHost = {...host, api: {...host.api, workflowAuthorization(workspace) {
      if (++reads === 2) setPolicy(f, {mode:'operator'});
      return host.api.workflowAuthorization(workspace);
    }}};
    await assert.rejects(bindConfiguredWorkflow(racingHost, f.request, f.receipt, noPrompt), /policy changed/);
    assert.equal(f.actions().length, 0);
  } finally { f.clean(); }
});

test('new current task and catalog revisions bind without reviving stale actions', async () => {
  const f = fixture();
  try {
    taskPolicy(f);
    const first = await bindConfiguredWorkflow(host, f.request, f.receipt, noPrompt);
    const store = new host.api.Store(f.database);
    try { f.request.taskVersion = store.reviseTask(f.task.taskId, [{kind:'handoff',provenance:'operator',body:'Continue local checks'}], {session:'fixture-session'}).version; }
    finally { store.close(); }
    const workflows = new host.api.WorkflowStore(f.database);
    try { assert.throws(() => workflows.validateWorkflowBinding(first.binding), /stale|version/i); }
    finally { workflows.close(); }
    const catalog = JSON.parse(readFileSync(f.catalog, 'utf8'));
    catalog.operations.probe.argv = [process.execPath, '--help'];
    writeFileSync(f.catalog, JSON.stringify(catalog));
    const next = await bindConfiguredWorkflow(host, f.request, nextRun(f), noPrompt);
    assert.notEqual(next.binding.actionId, first.binding.actionId);
    assert.equal(next.binding.taskVersion, f.request.taskVersion);
  } finally { f.clean(); }
});

test('opt-out stops new policy binding and does not pretend to revoke already bound work', async () => {
  const f = fixture();
  try {
    taskPolicy(f);
    const first = await bindConfiguredWorkflow(host, f.request, f.receipt, noPrompt);
    setPolicy(f, {mode:'operator'});
    assert.equal((await bindConfiguredWorkflow(host, f.request, f.receipt, noPrompt)).binding.actionId, first.binding.actionId);
    const workflows = new host.api.WorkflowStore(f.database);
    try { workflows.validateWorkflowBinding(first.binding); } finally { workflows.close(); }
    await assert.rejects(bindConfiguredWorkflow(host, f.request, nextRun(f), () => false), /did not approve/);
    assert.equal(f.actions().length, 1);
  } finally { f.clean(); }
});

const olderHost = process.env.GOVERNANCE_LEGACY_HOST_TEST_PACKAGE ? await loadHost(process.env.GOVERNANCE_LEGACY_HOST_TEST_PACKAGE) : null;
test('older engines retain the ordinary exact binding contract for task-policy records', {skip: !olderHost}, async () => {
  const f = fixture();
  try {
    taskPolicy(f);
    const bound = await bindConfiguredWorkflow(host, f.request, f.receipt, noPrompt);
    const older = new olderHost.api.WorkflowStore(f.database);
    try {
      older.validateWorkflowBinding(bound.binding);
      assert.equal(older.submit(bound.binding).state, 'queued');
    } finally { older.close(); }
  } finally { f.clean(); }
});

test('older pinned hosts still use operator consent, never automatic task policy', {skip: !olderHost}, async () => {
  const f = fixture(); let prompts = 0;
  try {
    taskPolicy(f);
    writeFileSync(join(f.workspace, 'config/governance/runtime.lock.yaml'), JSON.stringify({package:'@organta/project-governance',version:olderHost.version}));
    writeFileSync(join(f.workspace, '.governance/runtime/bin/project-governance'), `#!/bin/sh\nexec '${process.execPath}' '${olderHost.root}/dist/engine/src/cli.js' "$@"\n`, {mode:0o755});
    await assert.rejects(bindConfiguredWorkflow(olderHost, f.request, f.receipt, () => {prompts++; return false;}), /did not approve/);
    assert.equal(prompts, 1); assert.equal(f.actions().length, 0);
  } finally { f.clean(); }
});

test('crash after binding preserves task-policy provenance on readback', async () => {
  const f = fixture();
  try {
    taskPolicy(f);
    class LostAcknowledgement extends host.api.WorkflowStore {
      authorizeWorkflow(binding) { super.authorizeWorkflow(binding); throw new Error('synthetic lost acknowledgement'); }
    }
    const interrupted = {...host, api:{...host.api, WorkflowStore:LostAcknowledgement}};
    await assert.rejects(bindConfiguredWorkflow(interrupted, f.request, f.receipt, noPrompt), /lost acknowledgement/);
    const pending = JSON.parse(readFileSync(f.receipt, 'utf8'));
    assert.equal(pending.status, 'binding-pending'); assert.equal(pending.approvalRoute, 'task-policy');
    const recovered = await bindConfiguredWorkflow(host, f.request, f.receipt, noPrompt);
    assert.equal(recovered.binding.actionId, pending.binding.actionId);
    assert.equal(recovered.policyDigest, pending.policyDigest);
    assert.equal(recovered.approvalRoute, 'task-policy'); assert.ok(recovered.boundAt);
    assert.equal(recovered.approvedAt, undefined); assert.equal(f.actions().length, 1);
  } finally { f.clean(); }
});

test('task policy never clears an interrupted action-creation journal', async () => {
  const f = fixture();
  try {
    taskPolicy(f);
    const result = await bindConfiguredWorkflow(host, f.request, f.receipt, noPrompt);
    writeFileSync(f.receipt, JSON.stringify({status:'creating-action',snapshot:result.snapshot,snapshotDigest:result.snapshotDigest}));
    await assert.rejects(bindConfiguredWorkflow(host, f.request, f.receipt, noPrompt), /requires reconciliation/);
    assert.equal(f.actions().length, 1);
  } finally { f.clean(); }
});

test('CLI refusal diagnoses policy and custody while keeping private file excerpts out', async () => {
  for (const failure of ['resource','credential','lock','request-json','profile-yaml','missing-workspace']) {
    const f = fixture();
    try {
      taskPolicy(f);
      const requestFile = join(f.workspace, 'request.json');
      writeFileSync(requestFile, JSON.stringify(f.request));
      const marker = 'SYNTHETIC_PRIVATE_MARKER';
      if (failure === 'resource') {f.recipe.resources=['other-resource'];writeFileSync(f.recipeFile, JSON.stringify(f.recipe));}
      if (failure === 'credential') {const catalog=JSON.parse(readFileSync(f.catalog,'utf8'));catalog.operations.probe.credentialEnv=['FIXTURE_TOKEN'];writeFileSync(f.catalog,JSON.stringify(catalog));}
      if (failure === 'lock') writeFileSync(f.receipt+'.lock', String(process.pid));
      if (failure === 'request-json') writeFileSync(requestFile, `{"private":"${marker}",broken}`);
      if (failure === 'profile-yaml') writeFileSync(join(f.workspace,'config/governance/profile.yaml'), `private: ${marker}\nworkflow_authorization: [broken`);
      if (failure === 'missing-workspace') writeFileSync(requestFile, '{}');
      const result = spawnSync(process.execPath,[join(host.root,'dist/engine/src/cli.js'),'workflow-bind','--request',requestFile,'--receipt',f.receipt],{cwd:f.workspace,encoding:'utf8',timeout:15000});
      assert.equal(result.status,1); assert.doesNotMatch(result.stderr,new RegExp(marker));
      const refusal=JSON.parse(result.stderr); assert.equal(refusal.status,'refused');
      const expected={resource:/resource is outside/,credential:/credential is outside/,lock:/lock retained.*no lock was removed/, 'request-json':/Invalid JSON/, 'profile-yaml':/Invalid workflow authorization profile/, 'missing-workspace':/requires a workspace path/};
      assert.match(refusal.error, expected[failure]); assert.equal(f.actions().length,0);
    } finally {f.clean();}
  }
  assert.doesNotMatch(JSON.stringify(workflowBindingRefusal(new Error('unknown SYNTHETIC_PRIVATE_MARKER'))), /SYNTHETIC_PRIVATE_MARKER/);
});

test('managed launcher binds through its selected generation and releases its write reader', {skip: !process.env.GOVERNANCE_HOST_TEST_GENERATION}, async () => {
  const f=fixture();
  try {
    taskPolicy(f);
    const generation=process.env.GOVERNANCE_HOST_TEST_GENERATION;
    const {RuntimeGenerations}=await import(pathToFileURL(join(host.root,'dist/engine/src/runtime-generations.js')).href);
    const {runtimeLauncher}=await import(pathToFileURL(join(host.root,'dist/engine/src/runtime-launcher.js')).href);
    const registry=join(f.workspace,'.governance/generations.sqlite');
    const state=new RuntimeGenerations(registry);
    try {state.activate(generation,0);} finally {state.close();}
    const installation=JSON.parse(readFileSync(join(generation,'installation.json'),'utf8'));
    writeFileSync(join(f.workspace,'config/governance/runtime.lock.yaml'),JSON.stringify(installation.lock));
    const launcher=join(f.workspace,'.governance/runtime/bin/project-governance');
    writeFileSync(launcher,runtimeLauncher(process.execPath,join(host.root,'dist/engine/src/cli.js'),registry,f.workspace),{mode:0o755});
    writeFileSync(join(f.workspace,'request.json'),JSON.stringify(f.request));
    const result=spawnSync(launcher,['workflow-bind','--request','request.json','--receipt','receipt.json'],{cwd:tmpdir(),encoding:'utf8',timeout:30000});
    assert.equal(result.status,0,result.stderr); assert.equal(JSON.parse(result.stdout).approvalRoute,'task-policy');
    assert.equal(f.actions().length,1);
    const observed=new RuntimeGenerations(registry);
    try {assert.equal(observed.state().written,true);assert.equal(observed.state().readers.length,0);} finally {observed.close();}
  } finally {f.clean();}
});

test('fixed host and operator refusals stay useful without exposing parser excerpts', () => {
  for (const message of ['This operator entry is qualified only for macOS', 'Review exceeds native dialog size; reduce workflow scope',
    'Selected approval authority changed', 'Cycle authority changed before binding', 'Workflow profile must not use symlinks',
    'Expected installed Governance package', 'Installed host/v1 export is unavailable', 'Host export escapes selected package', 'Unsupported host API']) {
    assert.equal(workflowBindingRefusal(new Error(message)).error, message);
  }
  const parse = workflowBindingRefusal(new SyntaxError('project profile: SYNTHETIC_PRIVATE_MARKER'));
  assert.match(parse.error, /Invalid JSON/); assert.doesNotMatch(parse.error, /SYNTHETIC_PRIVATE_MARKER/);
  assert.match(workflowBindingRefusal(Object.assign(new Error('private flag'), {code:'ERR_PARSE_ARGS_UNKNOWN_OPTION'})).error, /no extra flags/);
});

test('pending policy binding after opt-out needs fresh operator consent and keeps its original action', async () => {
  const f=fixture(); let prompts=0;
  try {
    taskPolicy(f);
    class BeforeBinding extends host.api.WorkflowStore {
      authorizeWorkflow() {throw new Error('synthetic interruption before binding');}
    }
    await assert.rejects(bindConfiguredWorkflow({...host,api:{...host.api,WorkflowStore:BeforeBinding}},f.request,f.receipt,noPrompt), /before binding/);
    const pending=JSON.parse(readFileSync(f.receipt,'utf8'));
    setPolicy(f,{mode:'operator'});
    await assert.rejects(bindConfiguredWorkflow(host,f.request,f.receipt,()=>false),/did not approve/);
    const recovered=await bindConfiguredWorkflow(host,f.request,f.receipt,()=>{prompts++;return true;});
    assert.equal(prompts,1);assert.equal(recovered.approvalRoute,'operator-dialog');assert.ok(recovered.approvedAt);
    assert.equal(recovered.policyDigest,undefined);assert.equal(recovered.binding.authorityRef,f.task.taskId);
    assert.equal(recovered.binding.actionId,pending.binding.actionId);assert.equal(f.actions().length,1);
  } finally {f.clean();}
});
