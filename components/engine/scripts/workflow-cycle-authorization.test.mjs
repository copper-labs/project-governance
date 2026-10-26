/** Synthetic host confirmations exercise bounded reuse; no adopter task receives fixture authority. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { loadHost } from './workflow-host-binding.mjs';
import { enrollCycle, bindCycle, revokeCycle } from './workflow-cycle-authorization.mjs';
const host = await loadHost(process.env.GOVERNANCE_HOST_TEST_PACKAGE ?? fileURLToPath(new URL('../../../', import.meta.url)));
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


function cycle(f) {
  const guard = join(f.workspace, 'guard.txt'); writeFileSync(guard, 'fixed device and resource guard');
  f.recipe.inputs.push({path: 'guard.txt', digest: host.api.fileDigest(guard)});
  writeFileSync(f.recipeFile, JSON.stringify(f.recipe));
  return { enrollmentId: 'fixture-cycle', request: f.request, bounds: {expiresAt: new Date(Date.now()+3600000).toISOString(),
    inputRoots: ['.'], immutableInputs: ['guard.txt'], maxRunMs: 5000, maxStageMs: 3000, requiredResources: {probe: []}} };
}
function changed(f) {
  writeFileSync(f.input, 'changed implementation');
  f.recipe.inputs[0].digest=host.api.fileDigest(f.input); writeFileSync(f.recipeFile, JSON.stringify(f.recipe));
  f.request={...f.request,operationId:f.request.operationId+'-next'};
}

test('one enrollment covers changed-input iterations with zero further prompts and exact replay', async () => {
 const f=fixture();let prompts=0;
 try {
  const input=cycle(f);await enrollCycle(host,input,f.receipt,async()=>{prompts++;return true;});
  const a=await bindCycle(host,f.request,f.receipt);changed(f);
  const b=await bindCycle(host,f.request,f.receipt);const replay=await bindCycle(host,f.request,f.receipt);
  assert.equal(prompts,1);assert.notEqual(a.binding.actionId,b.binding.actionId);
  assert.notEqual(a.binding.recipeDigest,b.binding.recipeDigest);assert.equal(b.binding.actionId,replay.binding.actionId);
  assert.equal(b.approvalRoute,'operator-cycle');assert.equal(f.actions().length,2);
  const workflows=new host.api.WorkflowStore(f.database);
  try {workflows.validateWorkflowBinding(b.binding);assert.equal(workflows.submit(b.binding).id,workflows.submit(replay.binding).id);} finally {workflows.close();}
 } finally {f.clean();}
});

test('changed commands, device, guard, scope, clock and runtime refuse before a successor action', async () => {
 for(const change of ['command','device','guard','missing-guard','scope','clock','runtime','session']) {
  const f=fixture();try {
   const input=cycle(f);await enrollCycle(host,input,f.receipt,async()=>true);
   if(change==='command')writeFileSync(f.catalog,readFileSync(f.catalog,'utf8').replace('--version','--help'));
   if(change==='device')f.recipe.resources=['ios-device:unapproved'];
   if(change==='guard') {writeFileSync(join(f.workspace,'guard.txt'),'larger limit');f.recipe.inputs[1].digest=host.api.fileDigest(join(f.workspace,'guard.txt'));}
   if(change==='missing-guard')f.recipe.inputs.pop();
   if(change==='scope')f.recipe.inputs.push({path:'../foreign',digest:'sha256:bad'});
   if(change==='clock')f.recipe.deadlineMs=6000;
   if(change==='runtime')writeFileSync(join(f.workspace,'config/governance/runtime.lock.yaml'),JSON.stringify({package:'@organta/project-governance',version:'0.0.0'}));
   if(change==='session')f.request.sessionId='other';
   writeFileSync(f.recipeFile,JSON.stringify(f.recipe));
   await assert.rejects(bindCycle(host,f.request,f.receipt));assert.equal(f.actions().length,0);
  } finally {f.clean();}
 }
});

test('cycle locator cannot manufacture or widen a recorded grant', async()=>{
 const f=fixture();try {
  await enrollCycle(host,cycle(f),f.receipt,async()=>true);
  const receipt=JSON.parse(readFileSync(f.receipt));receipt.bounds.maxRunMs=999999;writeFileSync(f.receipt,JSON.stringify(receipt));
  f.recipe.deadlineMs=6000;writeFileSync(f.recipeFile,JSON.stringify(f.recipe));
  await assert.rejects(bindCycle(host,f.request,f.receipt),/time limit/);
  receipt.eventId='invented';writeFileSync(f.receipt,JSON.stringify(receipt));await assert.rejects(bindCycle(host,f.request,f.receipt),/No recorded/);
  assert.equal(f.actions().length,0);
 }finally{f.clean();}
});

test('lost enrollment acknowledgement recovers its original grant without another prompt',async()=>{
 const f=fixture();try{
  const input=cycle(f);const first=await enrollCycle(host,input,f.receipt,async()=>true);unlinkSync(f.receipt);
  const replay=await enrollCycle(host,input,f.receipt,async()=>{throw new Error('duplicate prompt');});assert.equal(first.eventId,replay.eventId);
 }finally{f.clean();}
});

test('revocation invalidates future admission and an already-bound unsubmitted workflow',async()=>{
 const f=fixture();try{
  await enrollCycle(host,cycle(f),f.receipt,async()=>true);const bound=await bindCycle(host,f.request,f.receipt);
  await revokeCycle(host,f.request,f.receipt);
  await assert.rejects(bindCycle(host,f.request,f.receipt),/stale|closed/);
  const w=new host.api.WorkflowStore(f.database);try{assert.throws(()=>w.submit(bound.binding),/stale|open/);}finally{w.close();}
 }finally{f.clean();}
});

test('completed tasks and expired cycles cannot authorize further work',async()=>{
 for(const mode of ['completed','expired']){
  const f=fixture();try{
   const input=cycle(f);await enrollCycle(host,input,f.receipt,async()=>true);
   if(mode==='completed') {const s=new host.api.Store(f.database);try{s.reviseTask(f.task.taskId,[],{expectedVersion:f.task.version,status:'accepted',authorityRef:'synthetic-operator'});}finally{s.close();}}
   const now=Date.now;try{if(mode==='expired')Date.now=()=>Date.parse(input.bounds.expiresAt)+1;await assert.rejects(bindCycle(host,f.request,f.receipt),/stale|closed|expired/);}finally{Date.now=now;}
   assert.equal(f.actions().length,0);
  }finally{f.clean();}
 }
});

test('operator cancellation and changes during enrollment create no grant',async()=>{
 const f=fixture();try{
  const input=cycle(f);await assert.rejects(enrollCycle(host,input,f.receipt,async()=>false),/did not approve/);
  await assert.rejects(enrollCycle(host,input,f.receipt,async()=>{writeFileSync(join(f.workspace,'guard.txt'),'changed');return true;}),/Stale|changed/);
  assert.equal(f.actions().length,0);
 }finally{f.clean();}
});
