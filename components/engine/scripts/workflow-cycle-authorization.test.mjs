/** Synthetic host confirmations exercise bounded reuse; no adopter task receives fixture authority. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { loadHost, bindReviewedWorkflow, takeReceiptLock } from './workflow-host-binding.mjs';
import { enrollCycle, bindCycle, revokeCycle, enrollWorkspace, bindWorkspace, revokeWorkspace } from './workflow-cycle-authorization.mjs';
const host = await loadHost(process.env.GOVERNANCE_HOST_TEST_PACKAGE ?? fileURLToPath(new URL('../../../', import.meta.url)));
const legacyHost = process.env.GOVERNANCE_LEGACY_HOST_TEST_PACKAGE ? await loadHost(process.env.GOVERNANCE_LEGACY_HOST_TEST_PACKAGE) : null;
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

test('mixed runtime ledger keeps legacy work usable but refuses grant actions in the old engine', {skip: !legacyHost}, async()=>{
 const f=fixture(); let old, current;
 try {
  const input=cycle(f);
  const legacy=await bindReviewedWorkflow(host,{...f.request,operationId:'legacy'},join(f.workspace,'legacy.json'),async()=>true);
  old=new legacyHost.api.WorkflowStore(f.database);
  const existing=old.submit(legacy.binding);old.claim(existing.id,existing.revision,'old-worker');
  await enrollWorkspace(host,input,f.receipt,async()=>true);
  old.close();old=null;old=new legacyHost.api.WorkflowStore(f.database);
  old.stage(existing.id,'old-worker','probe','running');
  const bound=await bindWorkspace(host,f.request,f.receipt);
  assert.throws(()=>old.validateWorkflowBinding(bound.binding),/binding/);
  assert.throws(()=>old.authorizeWorkflow(bound.binding),/different workflow/);
  assert.throws(()=>old.submit(bound.binding),/binding/);
  current=new host.api.WorkflowStore(f.database);const queued=current.submit(bound.binding);
  assert.throws(()=>old.claim(queued.id,queued.revision,'wrong-worker'),/binding/);
  current.claim(queued.id,queued.revision,'new-worker');
  assert.throws(()=>old.stage(queued.id,'new-worker','probe','running'),/binding/);
  current.stage(queued.id,'new-worker','probe','running');
 }finally{old?.close();current?.close();f.clean();}
});

test('workspace binding never replays a task-cycle binding at the same receipt and operation',async()=>{
 const f=fixture();try{
  const input=cycle(f);await enrollCycle(host,input,f.receipt,async()=>true);
  const old=await bindCycle(host,f.request,f.receipt);
  const grant=await enrollWorkspace(host,input,f.receipt,async()=>true);
  const next=await bindWorkspace(host,f.request,f.receipt);
  assert.notEqual(next.binding.actionId,old.binding.actionId);
  assert.equal(next.binding.authorityRef,'workspace-workflow:'+grant.grantId);
  await revokeWorkspace(host,f.request,f.receipt);
  const w=new host.api.WorkflowStore(f.database);
  try{assert.throws(()=>w.submit(next.binding),/revoked/);}finally{w.close();}
 }finally{f.clean();}
});

test('workspace revocation survives stale inputs, closed tasks and a lost locked receipt directory',async()=>{
 const f=fixture();try{
  const dir=join(f.workspace,'approval');mkdirSync(dir);f.receipt=join(dir,'grant.json');
  const grant=await enrollWorkspace(host,cycle(f),f.receipt,async()=>true);
  const locator=join(f.workspace,'locator.json');writeFileSync(locator,JSON.stringify({grantId:grant.grantId}));
  writeFileSync(f.receipt+'.lock','dead-owner');writeFileSync(f.input,'normal edit');
  const s=new host.api.Store(f.database);
  try{s.reviseTask(f.task.taskId,[],{expectedVersion:f.task.version,status:'accepted',authorityRef:'synthetic-operator'});}finally{s.close();}
  rmSync(dir,{recursive:true});unlinkSync(f.recipeFile);
  assert.equal((await revokeWorkspace(host,{workspace:f.workspace,sessionId:'fixture-session'},locator)).status,'revoked');
  const w=new host.api.WorkflowStore(f.database);try{assert.ok(w.readWorkflowGrant(grant.grantId).revokedAt);}finally{w.close();}
 }finally{f.clean();}
});

test('a copied completed or pending receipt cannot cross approval routes',async()=>{
 const f=fixture();try{
  const input=cycle(f);await enrollCycle(host,input,f.receipt,async()=>true);
  const old=await bindCycle(host,f.request,f.receipt);
  const grant=await enrollWorkspace(host,input,f.receipt,async()=>true);
  for(const status of ['bound','binding-pending']) {
   const target=join(f.workspace,status+'.json');writeFileSync(target,JSON.stringify({...old,status}));
   const authorityRef='workspace-workflow:'+grant.grantId;
   await assert.rejects(bindReviewedWorkflow(host,f.request,target,async()=>({route:'workspace-workflow',authorityRef}),authorityRef),/authority differs/);
  }
  assert.equal(f.actions().length,1);
 }finally{f.clean();}
});

test('workspace revocation refuses foreign session and never needs current runtime pin or recipe',async()=>{
 const f=fixture();try{
  const grant=await enrollWorkspace(host,cycle(f),f.receipt,async()=>true);
  await assert.rejects(revokeWorkspace(host,{workspace:f.workspace,sessionId:'foreign'},f.receipt),/matching workspace/);
  writeFileSync(join(f.workspace,'config/governance/runtime.lock.yaml'),'changed');unlinkSync(f.recipeFile);
  assert.equal((await revokeWorkspace(host,{workspace:f.workspace,sessionId:'fixture-session'},f.receipt)).grantId,grant.grantId);
 }finally{f.clean();}
});

test('revocation during slow preflight wins before dispatch takes the write lock',async()=>{
 const f=fixture();let w,other;const now=Date.now;
 try{
  const grant=await enrollWorkspace(host,cycle(f),f.receipt,async()=>true);
  const bound=await bindWorkspace(host,f.request,f.receipt);
  w=new host.api.WorkflowStore(f.database);other=new host.api.WorkflowStore(f.database);
  const queued=w.submit(bound.binding);let revoked=false;
  Date.now=()=>{if(!revoked){revoked=true;other.revokeWorkflowGrant(grant.grantId,'synthetic-race');}return now();};
  assert.throws(()=>w.claim(queued.id,queued.revision,'worker'),/revoked or expired/);
  assert.equal(w.read(queued.id).state,'queued');
 }finally{Date.now=now;w?.close();other?.close();f.clean();}
});

test('workspace enrollment rejects known shell and attached interpreter eval forms before prompting',async()=>{
 for(const argv of [['/bin/ksh'],['/bin/csh'],['/bin/tcsh'],['/usr/local/bin/pwsh'],
  [process.execPath,'-p','1'],[process.execPath,'--print=1'],[process.execPath,'--eval=1'],['/usr/bin/python3','-cprint(1)'],
  ['/usr/bin/python3','-Ic','print(1)'],['/usr/bin/perl','-lne','print'],['/usr/bin/ruby','-ne','print'],
  [process.execPath,'--import=data:text/javascript,1'],['/usr/local/bin/deno','eval','1']]) {
  const f=fixture();try{
   const input=cycle(f);writeFileSync(f.catalog,JSON.stringify({version:1,operations:{probe:{argv,cwd:f.workspace,effect:'read'}}}));
   let prompted=false;
   await assert.rejects(enrollWorkspace(host,input,f.receipt,async()=>{prompted=true;return true;}),/shell\/eval/);
   assert.equal(prompted,false);assert.equal(f.actions().length,0);
  }finally{f.clean();}
 }
});

test('workspace command checks preserve compiler and pattern-tool options',async()=>{
 for(const argv of [['/usr/bin/clang','-c','source.c'],['/usr/bin/grep','-e','pattern','input.txt']]) {
  const f=fixture();try {
   const input=cycle(f);writeFileSync(f.catalog,JSON.stringify({version:1,operations:{probe:{argv,cwd:f.workspace,effect:'local'}}}));
   const grant=await enrollWorkspace(host,input,f.receipt,async()=>true);
   assert.equal(grant.status,'enrolled');assert.equal((await bindWorkspace(host,f.request,f.receipt)).approvalRoute,'workspace-workflow');
  }finally{f.clean();}
 }
});

test('retained approval locks explain ownership without reclaiming live, dead or unknown owners',()=>{
 const f=fixture();try {
  for(const [content,expected] of [[String(process.pid),/exists \(identity unverified\)/],['9999999',/is absent/],['incomplete',/owner unknown/]]) {
   writeFileSync(f.receipt+'.lock',content);
   assert.throws(()=>takeReceiptLock(f.receipt),expected);
   assert.equal(readFileSync(f.receipt+'.lock','utf8'),content);
  }
 }finally{f.clean();}
});

test('old runtime refuses workspace enrollment before an operator dialog', {skip:!legacyHost},async()=>{
 const f=fixture();try{
  await assert.rejects(enrollWorkspace(legacyHost,cycle(f),f.receipt,async()=>{throw new Error('must not prompt');}),/does not support/);
 }finally{f.clean();}
});

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

// Workspace grants are explicitly enrolled. These synthetic approvals never
// upgrade a real installation or grant an adopter permission to run anything.
test('workspace review survives task revision and successor task with fresh actions and exact replay', async () => {
 const f=fixture(); let prompts=0;
 try {
  const input=cycle(f), first=await enrollWorkspace(host,input,f.receipt,async()=>{prompts++;return true;});
  const a=await bindWorkspace(host,f.request,f.receipt);
  const s=new host.api.Store(f.database);
  try {
   const revised=s.reviseTask(f.task.taskId,[{kind:'handoff',provenance:'hypothesis',body:'Continue the same workflow'}], {session:'fixture-session'});
   f.request={...f.request,taskVersion:revised.version,operationId:'revised'};
   const b=await bindWorkspace(host,f.request,f.receipt);
   assert.notEqual(a.binding.actionId,b.binding.actionId);
   const next=s.createTask('Successor task',[{kind:'scope',provenance:'operator',body:f.workspace}],
     {worktree:f.workspace,branch:'main',session:'fixture-session'});
   f.request={...f.request,taskId:next.taskId,taskVersion:next.version,operationId:'successor'};
   const c=await bindWorkspace(host,f.request,f.receipt), replay=await bindWorkspace(host,f.request,f.receipt);
   assert.notEqual(b.binding.actionId,c.binding.actionId);assert.equal(c.binding.actionId,replay.binding.actionId);
   assert.equal(c.binding.authorityRef,'workspace-workflow:'+first.grantId);assert.equal(prompts,1);
   const w=new host.api.WorkflowStore(f.database);
   try {
    assert.throws(()=>w.validateWorkflowBinding(a.binding),/stale/);
    assert.equal(w.submit(c.binding).id,w.submit(replay.binding).id);
   }finally{w.close();}
  }finally{s.close();}
 }finally{f.clean();}
});

test('workspace grant refuses widened operations, guards, resources, runtime, limits and current task scope',async()=>{
 for(const change of ['command','device','guard','missing-guard','clock','runtime','scope']) {
  const f=fixture();try {
   await enrollWorkspace(host,cycle(f),f.receipt,async()=>true);
   if(change==='command')writeFileSync(f.catalog,readFileSync(f.catalog,'utf8').replace('--version','--help'));
   if(change==='device')f.recipe.resources=['ios-device:unapproved'];
   if(change==='guard'){writeFileSync(join(f.workspace,'guard.txt'),'changed');f.recipe.inputs[1].digest=host.api.fileDigest(join(f.workspace,'guard.txt'));}
   if(change==='missing-guard')f.recipe.inputs.pop();
   if(change==='clock')f.recipe.deadlineMs=6000;
   if(change==='runtime')writeFileSync(join(f.workspace,'config/governance/runtime.lock.yaml'),'{}');
   if(change==='scope'){
    const s=new host.api.Store(f.database);try{
     const next=s.createTask('Narrow task',[{kind:'scope',provenance:'operator',body:f.input}],{worktree:f.workspace,branch:'main',session:'fixture-session'});
     f.request={...f.request,taskId:next.taskId,taskVersion:next.version};
    }finally{s.close();}
   }
   writeFileSync(f.recipeFile,JSON.stringify(f.recipe));
   await assert.rejects(bindWorkspace(host,f.request,f.receipt));assert.equal(f.actions().length,0);
  }finally{f.clean();}
 }
});

test('workspace expiry and revocation block queued dispatch and later ordinary stages but preserve cleanup',async()=>{
 for(const reason of ['expiry','revocation']) {
  const f=fixture();let w;const now=Date.now;
  try {
   f.recipe.stages=[{id:'first',operation:'probe',deadlineMs:1000},{id:'later',operation:'probe',dependsOn:['first'],deadlineMs:1000},
     {id:'cleanup',operation:'probe',cleanup:true,deadlineMs:1000}];
   const input=cycle(f);await enrollWorkspace(host,input,f.receipt,async()=>true);
   const a=await bindWorkspace(host,f.request,f.receipt);w=new host.api.WorkflowStore(f.database);
   const active=w.submit(a.binding);w.claim(active.id,active.revision,'worker');w.stage(active.id,'worker','first','running');
   f.request={...f.request,operationId:'queued'};const b=await bindWorkspace(host,f.request,f.receipt);const queued=w.submit(b.binding);
   if(reason==='revocation')await revokeWorkspace(host,f.request,f.receipt);
   else Date.now=()=>Date.parse(input.bounds.expiresAt)+1;
   assert.throws(()=>w.claim(queued.id,queued.revision,'other'),/revoked or expired/);
   assert.throws(()=>w.validateWorkflowBinding(b.binding),/revoked or expired/);
   const passed={state:'succeeded',exitCode:0,cleanup:'confirmed',startedAt:'start',endedAt:'end',log:'synthetic.log',inputValidity:'valid',detail:'synthetic outcome'};
   w.stage(active.id,'worker','first','succeeded',passed);
   assert.throws(()=>w.stage(active.id,'worker','later','running'),/revoked or expired/);
   w.stage(active.id,'worker','cleanup','running');w.stage(active.id,'worker','cleanup','succeeded',passed);
   assert.equal(w.submit(b.binding).id,queued.id,'replay observes the existing run without dispatching it');
  }finally{Date.now=now;w?.close();f.clean();}
 }
});

test('workspace receipt tampering and interrupted enrollment cannot fabricate or promote authority',async()=>{
 const f=fixture();try{
  const input=cycle(f);await enrollCycle(host,input,f.receipt,async()=>true);
  await assert.rejects(bindWorkspace(host,f.request,f.receipt),/matching workspace/);
  await assert.rejects(enrollWorkspace(host,input,f.receipt,async()=>false),/did not approve/);
  const first=await enrollWorkspace(host,input,f.receipt,async()=>true);unlinkSync(f.receipt);
  const recovered=await enrollWorkspace(host,input,f.receipt,async()=>{throw new Error('duplicate prompt');});
  assert.equal(first.grantId,recovered.grantId);
  const locator=JSON.parse(readFileSync(f.receipt));locator.bounds.maxRunMs=999999;writeFileSync(f.receipt,JSON.stringify(locator));
  f.recipe.deadlineMs=6000;writeFileSync(f.recipeFile,JSON.stringify(f.recipe));await assert.rejects(bindWorkspace(host,f.request,f.receipt),/time limit/);
  locator.grantId='invented';writeFileSync(f.receipt,JSON.stringify(locator));await assert.rejects(bindWorkspace(host,f.request,f.receipt),/matching workspace/);
 }finally{f.clean();}
});
