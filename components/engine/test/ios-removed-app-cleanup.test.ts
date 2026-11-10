import assert from "node:assert/strict";
import {test,mock} from "node:test";
import {readFileSync,writeFileSync,mkdirSync,utimesSync,statSync} from "node:fs";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {api,moduleUrl,ownerReleaseFixture} from "./fixtures/workflow-owner-release.ts";
const {workflowResourceReleaseCommand:release}=await import(moduleUrl("workflow-resource-release"));
const udid="00000000-0000000000000001",bundle="example.private.app",identifier="fixture-device",url="file:///private/apps/old/Fixture.app/";
const resources=[`ios-device:${udid}`,`ios-app:${udid}:${bundle}`];
const data={details:{identifier,hardwareProperties:{udid},deviceProperties:{bootState:"booted"}},apps:{deviceIdentifier:identifier,apps:[]},processes:{deviceIdentifier:identifier,runningProcesses:[]}};
function probes(overrides:Record<string,unknown>={}){return{device:async(_id:string,kind:string)=>({...data,...overrides})[kind as keyof typeof data],portClosed:async()=>false};}
async function fixture(){
 const f=await ownerReleaseFixture(resources,false,1,{cancelWhenReport:true,recipe:dir=>{const path=join(dir,'outputs.json');writeFileSync(path,JSON.stringify({output:dir}));return{inputs:[{path:'producer.mjs',digest:api.fileDigest(join(dir,'producer.mjs'))},{path:'outputs.json',digest:api.fileDigest(path)}]};},producer:dir=>`
 import {writeFileSync} from 'node:fs';
 const dir=${JSON.stringify(dir)},bundle=${JSON.stringify(bundle)},identifier=${JSON.stringify(identifier)},url=${JSON.stringify(url)};
 const put=(name,value)=>writeFileSync(dir+'/'+name+'.json',JSON.stringify(value));
 const envelope=(command,result,last=[])=>({info:{outcome:'success',commandType:'devicectl.device.'+command.join('.'),arguments:['devicectl','device',...command,'--device',identifier,...last]},result:{deviceIdentifier:identifier,...result}});
 await new Promise(r=>setTimeout(r,400));
 put('guard',{ok:true,command:'acquire',lock:'ios-${udid}.lock',lockDir:dir+'/ios-${udid}.lock',pid:process.pid,holder:'fixture',stolen:false});
 put('installation',envelope(['info','apps'],{apps:[{bundleIdentifier:bundle,url}]}));
 put('launch',envelope(['process','launch'],{process:{executable:url+'Fixture',processIdentifier:123}},[bundle]));
 put('uninstall',envelope(['uninstall','app'],{uninstalledApplications:[{bundleID:bundle}]},[bundle]));
 put('absence',envelope(['info','apps'],{apps:[]}));

 put('closure',{deviceCleanupConfirmed:false});setInterval(()=>{},1000);
 `});
 const manifest=join(f.dir,'manifest.json'),lock=join(f.dir,`ios-${udid}.lock`);
 const save=()=>{writeFileSync(manifest,JSON.stringify({version:1,runId:f.run.id,outputInput:'outputs.json',outputKey:'output',bindingDigest:api.digest(f.run.binding),files:Object.fromEntries(['installation','launch','uninstall','absence','guard'].map(role=>[role,{path:join(f.dir,role+'.json'),digest:api.fileDigest(join(f.dir,role+'.json'))}]))}));f.args[f.args.indexOf('--evidence-digest')+1]=api.fileDigest(manifest);};
 f.args[f.args.indexOf('--kind')+1]='ios-removed-app';f.args[f.args.indexOf('--evidence')+1]=manifest;f.args.push('--lock-directory',lock);save();
 const change=(role:string,edit:(x:any)=>void)=>{const path=join(f.dir,role+'.json'),times=statSync(path),x=JSON.parse(readFileSync(path,'utf8'));edit(x);writeFileSync(path,JSON.stringify(x));utimesSync(path,times.atimeMs/1000,times.mtimeMs/1000);save();};
 return{...f,lock,manifest,save,change};
}
test('cancelled removed-app release preserves originals and reconciles cancellation',async()=>{
 const f=await fixture();try{
  const before=readFileSync(join(f.command,'result.json')),closeout=readFileSync(f.report);
  assert.equal(f.store.stages(f.run.id)[0].state,'cancelled');
  const cli=process.env.GOVERNANCE_HOST_TEST_PACKAGE?join(process.env.GOVERNANCE_HOST_TEST_PACKAGE,'dist/engine/src/cli.js'):fileURLToPath(new URL('../src/cli.ts',import.meta.url));
  const preload=join(f.dir,'probe.mjs');writeFileSync(preload,`import cp from 'node:child_process';import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';
  const replies=${JSON.stringify(data)};cp.execFile=(file,args,options,callback)=>{if(file!=='/usr/bin/xcrun'||args.slice(0,3).join(' ')!=='devicectl device info'||!replies[args[3]]||args[5]!==${JSON.stringify(udid)})throw Error('Unexpected device command');fs.writeFileSync(args[args.indexOf('--json-output')+1],JSON.stringify({info:{outcome:'success'},result:replies[args[3]]}));queueMicrotask(()=>callback(null,''));};syncBuiltinESMExports();`);
  const released=process.platform!=='darwin'?{status:(await release(f.args,f.dir,probes())).state==='released'?0:1,stdout:'',stderr:''}:spawnSync(process.execPath,['--import',preload,cli,'workflow-release-resources',...f.args],{cwd:f.dir,encoding:'utf8',timeout:20000});
  assert.equal(released.status,0,released.stdout+released.stderr);assert.equal(f.held().length,0);
  const result=spawnSync(process.execPath,[cli,'workflow-reconcile-cleanup','--database',f.database,'--run',f.run.id,'--revision',String(f.run.revision),'--registry',f.registry.path,'--receipt',f.receipt,'--worker-directory',f.worker],{cwd:f.dir,encoding:'utf8'});
  assert.equal(result.status,1,result.stderr);assert.equal(JSON.parse(result.stdout).run.state,'cancelled');assert.deepEqual(readFileSync(join(f.command,'result.json')),before);assert.deepEqual(readFileSync(f.report),closeout);
  const receipt=JSON.parse(readFileSync(f.receipt,'utf8'));assert.equal(receipt.observation.proof.fresh.assertions.applicationCleanup,'unclaimed');
 }finally{f.close();}
});
for(const mode of ['wrong-device','wrong-identifier','outside-output','reinstalled','live-process','ambiguous-process','wrong-owner','wrong-revision','lock','duplicate-installation','wrong-filter','unacknowledged','wrong-container','wrong-guard','outside-window','wrong-order','wrong-output','wrong-lock-path','changed-digest','conflicting-owner'])test('removed-app rejects '+mode,async()=>{
 const f=await fixture();try{
  let p=probes();
  if(mode==='wrong-device')p=probes({details:{...data.details,hardwareProperties:{udid:'wrong'}}});
  if(mode==='wrong-identifier')p=probes({details:{...data.details,identifier:'other'},apps:{deviceIdentifier:'other',apps:[]},processes:{deviceIdentifier:'other',runningProcesses:[]}});
  if(mode==='outside-output'){const dir=join(f.dir,'other');mkdirSync(dir);const path=join(dir,'absence.json');writeFileSync(path,readFileSync(join(f.dir,'absence.json')));const m=JSON.parse(readFileSync(f.manifest,'utf8'));m.files.absence={path,digest:api.fileDigest(path)};writeFileSync(f.manifest,JSON.stringify(m));f.args[f.args.indexOf('--evidence-digest')+1]=api.fileDigest(f.manifest);}
  if(mode==='reinstalled')p=probes({apps:{deviceIdentifier:identifier,apps:[{bundleIdentifier:bundle,url}]}});
  if(mode==='live-process')p=probes({processes:{deviceIdentifier:identifier,runningProcesses:[{executable:url+'Fixture',processIdentifier:123}]}});
  if(mode==='ambiguous-process')p=probes({processes:{deviceIdentifier:identifier,runningProcesses:[{processIdentifier:123}]}});
  if(mode==='wrong-owner')f.args[f.args.indexOf('--authority')+1]='other';
  if(mode==='wrong-revision')f.args[f.args.indexOf('--revision')+1]='999';
  if(mode==='lock')mkdirSync(f.lock);
  if(mode==='duplicate-installation')f.change('installation',x=>x.result.apps.push(x.result.apps[0]));
  if(mode==='wrong-filter')f.change('absence',x=>x.result.matchingBundleIdentifier='other.app');
  if(mode==='unacknowledged')f.change('uninstall',x=>x.info.outcome='failure');
  if(mode==='wrong-container')f.change('launch',x=>x.result.process.executable='file:///private/other/Other.app/Main');
  if(mode==='wrong-guard')f.change('guard',x=>x.pid=process.pid);
  if(mode==='outside-window')utimesSync(join(f.dir,'installation.json'),new Date(0),new Date(0));
  if(mode==='wrong-order'){const t=new Date(f.store.stages(f.run.id)[0].result.endedAt);utimesSync(join(f.dir,'installation.json'),t,t);}
  if(mode==='wrong-output')writeFileSync(join(f.dir,'outputs.json'),JSON.stringify({output:'/tmp'}));
  if(mode==='wrong-lock-path'){f.change('guard',x=>x.lockDir=join(f.dir,'other.lock'));f.args[f.args.indexOf('--lock-directory')+1]=join(f.dir,'other.lock');}
  if(mode==='changed-digest')writeFileSync(f.manifest,readFileSync(f.manifest,'utf8')+' ');
  if(mode==='conflicting-owner'){const stub=mock.method(f.registry.constructor.prototype,'inspect',()=>[{resource:`ios:${udid}`,state:'held',operation:'other'}]);try{await assert.rejects(()=>release(f.args,f.dir,p),/Another device owner/);}finally{stub.mock.restore();}return;}
  const expected:Record<string,RegExp>={'wrong-device':/Fresh removed-app closure/,'wrong-identifier':/Fresh removed-app closure/,'outside-output':/Canonical original device record/,'reinstalled':/Fresh removed-app closure/,'live-process':/Fresh removed-app closure/,'ambiguous-process':/Fresh removed-app closure/,'wrong-owner':/owner, workflow revision/,'wrong-revision':/owner, workflow revision/,'lock':/lock remains present/,'duplicate-installation':/identity is ambiguous/,'wrong-filter':/bundle filter differs/,'unacknowledged':/acknowledged device command/,'wrong-container':/launch container differs/,'wrong-guard':/lock owner differs/,'outside-window':/window or identity/,'wrong-order':/record order differs/,'wrong-output':/output input changed/,'wrong-lock-path':/lock owner differs/,'changed-digest':/manifest digest differs/};
  await assert.rejects(()=>release(f.args,f.dir,p),expected[mode]);assert.equal(f.held().length,2);
 }finally{f.close();}
});
for(const race of ['record','manifest','lock','conflict','revision'])test('removed-app refuses probe race: '+race,async()=>{
 const f=await fixture();try{let changed=false;const p={...probes(),device:async(id:string,kind:string)=>{
  if(!changed){changed=true;
   if(race==='record')writeFileSync(join(f.dir,'absence.json'),'{}');
   if(race==='manifest')writeFileSync(f.manifest,readFileSync(f.manifest,'utf8')+' ');
   if(race==='lock')mkdirSync(f.lock);
   if(race==='conflict')f.registry.acquire([`ios:${udid}`],'other','other-operation');
   if(race==='revision')f.store.transition(f.run.id,f.run.owner,f.run.revision,'reconciling');
  }return probes().device(id,kind);}};
  await assert.rejects(()=>release(f.args,f.dir,p));assert.equal(f.held().length,2);
 }finally{f.close();}
});
test('removed-app refuses expired observation',async()=>{
 const f=await fixture();try{let calls=0;const stub=mock.method(performance,'now',()=>calls++===0?0:6000);
  try{await assert.rejects(()=>release(f.args,f.dir,probes()),/expired/);}finally{stub.mock.restore();}assert.equal(f.held().length,2);
 }finally{f.close();}
});
test('removed-app refuses lost generation reader',{skip:!process.env.GOVERNANCE_HOST_TEST_GENERATION},async()=>{
 const f=await fixture();try{const request=JSON.parse(readFileSync(join(f.worker,'request.json'),'utf8'));let once=false;
  const p={...probes(),device:async(id:string,kind:string)=>{if(!once){once=true;f.generations.release(request.generation.token,request.generation.owner);}return probes().device(id,kind);}};
  await assert.rejects(()=>release(f.args,f.dir,p),/generation reader differs/);assert.equal(f.held().length,2);
 }finally{f.close();}
});
