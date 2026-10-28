import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';

async function unpackOriginal(root,oldArchive) {
 const oldRoot=join(root,'old-package');mkdirSync(oldRoot);
 execFileSync('tar',['-xzf',oldArchive,'-C',oldRoot]);
 const oldPackage=join(oldRoot,'package'),oldCli=join(oldPackage,'dist/engine/src/cli.js');
 const {runtimeMigrationPlan:oldMigrationPlan}=await import(pathToFileURL(join(oldPackage,'dist/engine/src/runtime-migration-plan.js')));
 const oldManifest=JSON.parse(readFileSync(join(oldPackage,'package.json'),'utf8'));
 return {oldCli,oldManifest,oldMigrationPlan};
}

/** Exact packaged CLI proof. Native events and project contents are synthetic; no adopter is touched. */
export async function verifyInstallationHandoff(packageRoot,archive,oldArchive=archive,retainedArchive=oldArchive) {
 const root=realpathSync(mkdtempSync(join(tmpdir(),'governance-handoff-proof-')));
 console.error(`Handoff proof evidence: ${root}`);
 const cli=join(packageRoot,'dist/engine/src/cli.js');
 const module=async name=>import(pathToFileURL(join(packageRoot,`dist/engine/src/${name}.js`)));
 const {RuntimeGenerations}=await module('runtime-generations');
 const {StartupTasks}=await module('startup-tasks');
 const {captureStartupHostOwner}=await module('startup-host-owner');
 const {runtimeMigrationPlan}=await module('runtime-migration-plan');
 const {fileDigest,digest}=await module('core');
 const host=captureStartupHostOwner('codex');assert.ok(host,'Installed handoff qualification requires a real native Codex ancestor');
 const {oldCli,oldManifest,oldMigrationPlan}=await unpackOriginal(root,oldArchive);
 const manifest=JSON.parse(readFileSync(join(packageRoot,'package.json'),'utf8'));
 const retainedManifest=JSON.parse(execFileSync('tar',['-xOf',retainedArchive,'package/package.json'],{encoding:'utf8'}));
 const lock=(path,meta)=>({schema_version:2,package:meta.name,version:meta.version,
  artifact:{url:pathToFileURL(path).href,integrity:'sha512-'+createHash('sha512').update(readFileSync(path)).digest('base64')},
  source_commit:'a'.repeat(40),node:meta.engines.node,configuration_schema:1});
 const results=[];
 for(const scenario of ['successor','retained-candidate','absent-cancel','absent-complete','absent-retired-cancel','historical-lock','historical-lock-cancel']) {
  const retainedOldCandidate=scenario==='retained-candidate',absent=scenario.startsWith('absent-'),retired=scenario==='absent-retired-cancel',cancel=scenario==='absent-cancel'||retired||scenario==='historical-lock-cancel';
  const area=join(root,scenario),workspace=join(area,'repo');mkdirSync(workspace,{recursive:true});
  execFileSync('git',['init','-q'],{cwd:workspace});
  const registry=join(area,'registry.sqlite'),receipts=join(area,'startup.sqlite');
  const env={...process.env,CODEX_THREAD_ID:`handoff-fixture-${scenario}`,XDG_STATE_HOME:join(area,'state')};
  for(const key of Object.keys(env))if(/^(GOVERNANCE_|HARNESS_)/u.test(key))delete env[key];
  const run=(executable,args,expected=0)=>{
   const result=spawnSync(executable,args,{cwd:workspace,env,encoding:'utf8',timeout:120000,maxBuffer:4*1024*1024});
   assert.equal(result.status,expected,result.stderr||result.error?.message||result.stdout);return result.stdout?JSON.parse(result.stdout):null;
  };
  const plan=oldMigrationPlan(workspace),planPath=join(area,'init-plan.json'),requestPath=join(area,'init-request.json');
  writeFileSync(planPath,JSON.stringify(plan));
  writeFileSync(requestPath,JSON.stringify({mode:'init',workspace,registry,archive:oldArchive,lock:lock(oldArchive,oldManifest),expectedRevision:0,inputs:plan.inputs,hostPlan:plan.hostPlan}));
  run(process.execPath,[oldCli,'init','--request-file',requestPath,'--project-plan',planPath,'--operation-directory',join(area,'init')]);
  const generations=new RuntimeGenerations(registry),tasks=new StartupTasks(receipts);
  const lockPath=join(workspace,'config/governance/runtime.lock.yaml');
  const event={session_id:env.CODEX_THREAD_ID,hook_event_name:'SessionStart',source:'startup'};
  const native=tasks.event('codex',event,workspace,scenario.startsWith('historical-lock')?'sha256:'+'b'.repeat(64):fileDigest(lockPath),env);assert.ok(native.taskId);
  let boundHost=host;
  if(absent) {
   // Seed a synthetic parent with a real exited local PID; recovery still uses the real process inventory.
   const fingerprintModule=pathToFileURL(join(packageRoot,'dist/engine/src/process-owner.js')).href;
   const exited=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',`import {processFingerprint} from ${JSON.stringify(fingerprintModule)};console.log(JSON.stringify({pid:process.pid,fingerprint:processFingerprint(process.pid)}));`],{encoding:'utf8'}));
   boundHost={...host,...exited};
  }
  const reader=generations.reserveStartupTask(native.taskId);tasks.bindOwner(native.taskId,boundHost,{...reader,registry});
  const nextPlan=runtimeMigrationPlan(workspace),nextPlanPath=join(area,'update-plan.json'),nextRequestPath=join(area,'update-request.json'),operation=join(area,'update');
  const targetArchive=retainedOldCandidate?retainedArchive:archive,targetManifest=retainedOldCandidate?retainedManifest:manifest;
  writeFileSync(nextPlanPath,JSON.stringify(nextPlan));
  writeFileSync(nextRequestPath,JSON.stringify({mode:'update',workspace,registry,startupReceipts:receipts,archive:targetArchive,lock:lock(targetArchive,targetManifest),expectedRevision:reader.revision,inputs:nextPlan.inputs,hostPlan:nextPlan.hostPlan}));
  const args=['update','--request-file',nextRequestPath,'--project-plan',nextPlanPath,'--operation-directory',operation];
  const launcher=join(workspace,'.governance/runtime/bin/project-governance');
  run(process.execPath,[cli,...args],2); // The actual packaged explicit update refuses its live parent without handoff.
  const originalOperation=readFileSync(join(operation,'operation.json'));
  const stagedReceipt=readFileSync(join(operation,'staging/request.json'));
  if(absent || scenario==='historical-lock-cancel') {
   const {prepareRuntimeOperation}=await module('runtime-operation-preparation');
   const {prepareInstallationHandoff}=await module('runtime-installation-handoff');
   const request=JSON.parse(readFileSync(nextRequestPath,'utf8'));
   let prepared;
   if(retired) {
    const saved=JSON.parse(originalOperation),other=generations.acquire('fixture-other',saved.token);
    assert.throws(()=>prepareInstallationHandoff(operation,request,env,()=>boundHost),/sole recorded parent/);
    generations.release(other.token,other.owner);
    const {recoverStartupOwner}=await module('startup-owner-recovery');
    recoverStartupOwner(receipts,native.taskId,digest(tasks.owner(native.taskId)),'fixture explicit recovery');
   }else prepared=await prepareRuntimeOperation(request,operation,()=>{},()=>prepareInstallationHandoff(operation,request,env,()=>boundHost));
   if(!cancel) {
    const {completeHostInstructionTransition}=await module('host-instruction-transition');
    const {COMPILED_HOST_BLOCK}=await module('provider-guidance');
    assert.throws(()=>completeHostInstructionTransition(registry,workspace,prepared.candidate,prepared.backup,request.inputs,
     prepared.maintenance.token,prepared.maintenance.owner,request.hostPlan,COMPILED_HOST_BLOCK,undefined,receipts,
     ()=>{throw new Error('fixture interruption after activation');}),/fixture interruption/);
   }
   if(absent)env.CODEX_THREAD_ID='new-recovery-parent';
  }
  const completed=run(process.execPath,[cli,...args,cancel?'--cancel-handoff':'--handoff-startup']);
  assert.equal(generations.state().maintenance,null);
  if(!cancel)assert.equal(completed.state.maintenance,null);
  const expectedRevision=reader.revision+(cancel?0:1);
  assert.equal(generations.state().readers.length,retired?0:1);assert.equal(generations.state().revision,expectedRevision);
  if(retired)assert.equal(tasks.owner(native.taskId),null);
  else assert.equal(tasks.owner(native.taskId).reader.revision,expectedRevision);
  assert.deepEqual(readFileSync(join(operation,'operation.json')),originalOperation);
  assert.deepEqual(readFileSync(join(operation,'staging/request.json')),stagedReceipt);
  assert.equal(execFileSync(launcher,['--version'],{cwd:workspace,env,encoding:'utf8'}).trim(),`project-governance ${cancel?oldManifest.version:targetManifest.version}`);
  const replay=run(process.execPath,[cli,...args,cancel?'--cancel-handoff':'--handoff-startup']);assert.equal(cancel?replay.revision:replay.state.revision,expectedRevision);
  assert.equal(generations.state().readers.length,retired?0:1);
  // Test the selected runtime's real close path, including a retained older candidate.
  const eventFile=join(area,'end.json');writeFileSync(eventFile,JSON.stringify({...event,hook_event_name:'SessionEnd'}));
  run(process.execPath,[generations.state().directory+'/node_modules/@organta/project-governance/dist/engine/src/cli.js','startup','observe','--provider','codex','--workspace',workspace,'--registry',registry,'--receipts',receipts,'--event-file',eventFile]);
  assert.equal(generations.state().readers.length,0);assert.equal(tasks.owner(native.taskId),null);
  results.push({scenario,retainedOldCandidate,from:oldManifest.version,target:targetManifest.version,installed:cancel?oldManifest.version:targetManifest.version,revision:generations.state().revision});
  generations.close();tasks.close();
 }
 const result={status:'passed',evidenceDirectory:root,cases:results,scope:'packaged explicit update and synthetic native lifecycle; not ordinary accepted development'};
 writeFileSync(join(root,'handoff-proof.json'),JSON.stringify(result,null,2));return result;
}
if(process.argv[1]===new URL(import.meta.url).pathname)console.log(JSON.stringify(await verifyInstallationHandoff(resolve(process.argv[2]),resolve(process.argv[3]),resolve(process.argv[4]??process.argv[3]),resolve(process.argv[5]??process.argv[4]??process.argv[3]))));
