import { mkdtempSync,realpathSync,writeFileSync,chmodSync,rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { api,ownerReleaseFixture } from "./workflow-owner-release.ts";
export const serial="emulator-5556",resources=[`android:${serial}`,"app:example.fixture","fixture-producer","fixture-storage"];
export const closedProbes={devices:async()=>"List of devices attached\n",portClosed:async()=>true,lockAbsent:async()=>true};

/** Only benign Node descendants and injected transport/port facts; no emulator or device execution. */
export async function ownedSessionFixture(exitCode=0,normal=false,registryPath?:string){
 const root=realpathSync(mkdtempSync(join(tmpdir(),"owned-android-fixture-"))),adb=join(root,"adb"),preload=join(root,"ports.mjs");
 writeFileSync(adb,`#!${process.execPath}\nprocess.stdout.write(${JSON.stringify(normal?"List of devices attached\n":"unavailable")});\n`);chmodSync(adb,0o700);
 writeFileSync(preload,`import net from'node:net';import{EventEmitter}from'node:events';import{syncBuiltinESMExports}from'node:module';net.connect=options=>{if(options.host!=='127.0.0.1'||![5556,5557].includes(options.port))throw Error('Unexpected probe');const socket=new EventEmitter;socket.setTimeout=()=>socket;socket.destroy=()=>{};queueMicrotask(()=>socket.emit('error',{code:'ECONNREFUSED'}));return socket;};syncBuiltinESMExports();`);
 try{const f=await ownerReleaseFixture(resources,false,exitCode,{...(registryPath?{registryPath}:{}),expectedState:normal?exitCode===0?"succeeded":"failed":"unknown",...(normal?{workerPreload:preload}:{}),
  recipe:dir=>({androidAppSession:{ownership:"owned-emulator",serial,adb,userId:0,emulator:{bootStage:"native",lockPath:join(dir,"emulator.lock")},localLocks:resources.slice(2).map((resource,i)=>({resource,path:join(dir,`local-${i}.lock`)}))}}),
  producer:dir=>`import{spawn,execFileSync}from'node:child_process';import{mkdirSync,writeFileSync,readFileSync,existsSync,rmSync}from'node:fs';import{join}from'node:path';import{once}from'node:events';
await new Promise(r=>setTimeout(r,400));const initial={targetAbsent:true,portsClosed:[5556,5557],lockAcquired:true,observedAt:new Date().toISOString()};
const lock=${JSON.stringify(join(dir,"emulator.lock"))};mkdirSync(lock);const child=spawn(process.execPath,['-e','setInterval(()=>{},100)'],{stdio:'ignore'});
const fingerprint=execFileSync('/bin/ps',['-p',String(child.pid),'-o','lstart='],{encoding:'utf8'}).trim();const bootedAt=new Date().toISOString();
const membership=process.env.PROJECT_GOVERNANCE_WORKFLOW_ARTIFACT_DIR.replace(/-artifacts$/,'')+'/group-members.json';let retained=false;const until=Date.now()+2500;
while(Date.now()<until){if(existsSync(membership)){const saved=JSON.parse(readFileSync(membership,'utf8'));if(saved.members.some(x=>x.pid===child.pid&&x.fingerprint===fingerprint)){retained=true;break;}}await new Promise(r=>setTimeout(r,50));}
const stopped=once(child,'exit');child.kill('SIGTERM');await stopped;rmSync(lock,{recursive:true});if(!retained)throw Error('Synthetic VM descendant was not sampled by the native guardian');
const artifacts=process.env.PROJECT_GOVERNANCE_WORKFLOW_ARTIFACT_DIR;mkdirSync(artifacts,{recursive:true});writeFileSync(join(artifacts,'android-emulator-owner.json'),JSON.stringify({version:1,runId:process.env.PROJECT_GOVERNANCE_WORKFLOW_RUN_ID,stageId:process.env.PROJECT_GOVERNANCE_WORKFLOW_STAGE_ID,ownership:'owned-emulator',serial:${JSON.stringify(serial)},userId:0,lockPath:lock,initial,emulator:{pid:child.pid,fingerprint},bootedAt,observedAt:new Date().toISOString()}),{flag:'wx'});writeFileSync(process.argv[2],'{}');process.exit(${exitCode});\n`});
 f.args[f.args.indexOf("--kind")+1]="android-app-session";f.args[f.args.indexOf("--evidence")+1]=join(f.command,"result.json");f.args[f.args.indexOf("--evidence-digest")+1]=api.fileDigest(join(f.command,"result.json"));
 return{...f,preload,bootReport:join(f.worker,"commands",`${f.run.id}-0-artifacts`,"android-emulator-owner.json"),close(){f.close();rmSync(root,{recursive:true,force:true});}};
 }catch(error){rmSync(root,{recursive:true,force:true});throw error;}
}

/** CLI fixture uses the original fake ADB path plus injected closed-port observations. */
export function publicOwnedPreload(f:Awaited<ReturnType<typeof ownedSessionFixture>>){
 writeFileSync(f.run.binding.recipe.androidAppSession.adb,`#!${process.execPath}\nprocess.stdout.write('List of devices attached\\n');\n`);
 return f.preload;
}
