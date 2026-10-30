import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { realpathSync,statSync } from "node:fs";
import { join } from "node:path";
import { digest,fileDigest,object } from "./core.ts";
import { narrativeFile } from "./narrative-inputs.ts";
import { commandEnvironment,processLiveFingerprint } from "./process-owner.ts";
import { observeClosedPort } from "./simulator-cleanup.ts";
import { assertAndroidAppSession } from "./android-app-session.ts";
import { observeAndroidEmulatorTargetCleanup,type AndroidEmulatorCleanupProbes } from "./android-emulator.ts";
import { absentLock } from "./ios-observation-cleanup.ts";
import { workflowNativeResourceEvidence } from "./workflow-resource-evidence.ts";
import type { WorkflowRun,WorkflowStage } from "./workflow-store.ts";
const exec=promisify(execFile);
export type AndroidOwnedSessionProbes=AndroidEmulatorCleanupProbes;

/** Original native boot ownership plus unchanged owned-target shutdown; never dispatches device control. */
export async function ownedAndroidAppSessionCleanup(directory:string,run:WorkflowRun,stages:WorkflowStage[],probes?:AndroidOwnedSessionProbes,originalNative?:ReturnType<typeof workflowNativeResourceEvidence>,settleNative=false) {
  let native=originalNative??workflowNativeResourceEvidence(directory,run,stages,true);
  if(settleNative){
    // A normal worker can read the receipt just before its native supervisor exits. Wait only
    // for those exact original identities; a reused PID or unavailable proof still refuses.
    const deadline=performance.now()+5000;
    for(;;){
      native=workflowNativeResourceEvidence(directory,run,stages,true);let live=false;
      for(const [pid,fingerprint]of native.identities){const current=processLiveFingerprint(pid);if(current!==null){if(current!==fingerprint)throw Error("Original native PID was reused");live=true;}}
      if(!live){native.assertCurrent();break;}
      if(performance.now()>=deadline)throw Error("Original native supervisor has not finished");
      await new Promise(resolve=>setTimeout(resolve,50));
    }
  }
  const recipe=run.binding.recipe;assertAndroidAppSession(recipe);
  const config=recipe.androidAppSession;
  if(config?.ownership!=="owned-emulator"||!config.emulator)throw Error("Explicit original owned-emulator app session required");
  const owned=config.emulator,index=recipe.stages.findIndex(x=>x.id===owned.bootStage),stage=recipe.stages[index]!;
  const reportPath=join(directory,"commands",`${run.id}-${index}-artifacts`,"android-emulator-owner.json");
  if(realpathSync(reportPath)!==reportPath)throw Error("Original boot evidence uses an alias");
  const report=object(JSON.parse(narrativeFile(directory,reportPath))),initial=object(report.initial),emulator=object(report.emulator);
  const commandIndex=native.commands.findIndex(x=>x.stage===stage.id),window=native.windows[commandIndex];
  if(!window||Object.keys(report).some(x=>!["version","runId","stageId","ownership","serial","userId","lockPath","initial","emulator","bootedAt","observedAt"].includes(x))||
     report.version!==1||report.runId!==run.id||report.stageId!==stage.id||report.ownership!=="owned-emulator"||report.serial!==config.serial||report.userId!==config.userId||report.lockPath!==owned.lockPath)
    throw Error("Original native boot ownership binding differs");
  const port=Number(config.serial.slice("emulator-".length));
  if(initial.targetAbsent!==true||initial.lockAcquired!==true||digest(initial.portsClosed)!==digest([port,port+1]))throw Error("Pre-boot target absence, ports and owned lock must be confirmed");
  const before=Date.parse(String(initial.observedAt)),booted=Date.parse(String(report.bootedAt)),observed=Date.parse(String(report.observedAt)),modified=statSync(reportPath).mtimeMs;
  if(![before,booted,observed].every(Number.isFinite)||before<window.start||booted<before||observed<booted||observed>window.end||modified<window.start||modified>window.end)
    throw Error("Boot ownership evidence is stale or outside its original native command");
  const command=join(directory,"commands",`${run.id}-${index}`),membersPath=join(command,"group-members.json"),members=object(JSON.parse(narrativeFile(directory,membersPath))),launch=object(JSON.parse(narrativeFile(directory,join(command,"launch.json"))));
  if(!Number.isSafeInteger(emulator.pid)||Number(emulator.pid)<2||typeof emulator.fingerprint!=="string"||window.ids.get(Number(emulator.pid))!==emulator.fingerprint||
     emulator.pid===object(launch.child).pid||!Array.isArray(members.members)||!members.members.some(value=>{const member=object(value);return member.pid===emulator.pid&&member.fingerprint===emulator.fingerprint;}))
    throw Error("Owned emulator must be an original retained native descendant");
  const reportDigest=fileDigest(reportPath);native.files.set(reportPath,reportDigest);
  const checkHost=()=>{native.assertCurrent();absentLock(owned.lockPath);for(const lock of config.localLocks)absentLock(lock.path);};
  checkHost();
  const observedTarget=await observeAndroidEmulatorTargetCleanup({serial:config.serial,adb:config.adb,lockPath:owned.lockPath},recipe.workspace,[],probes??{
    devices:async()=>{const result=await exec(config.adb,["devices"],{timeout:5000,maxBuffer:65536,env:commandEnvironment({})});if(result.stderr)throw Error("ADB inventory reported an error");return result.stdout;},
    portClosed:observeClosedPort,lockAbsent:async path=>{absentLock(path);return true;}});
  if(!observedTarget)throw Error("Owned emulator, ports or ownership lock remain unresolved");
  checkHost();const completed=performance.now();
  const original={bootStage:stage.id,bootReport:{path:reportPath,digest:reportDigest},emulator:{pid:emulator.pid,fingerprint:emulator.fingerprint}};
  const observation={kind:"android-owned-app-session-cleanup",version:1,serial:config.serial,userId:config.userId,
    packages:recipe.resources.filter(x=>x.startsWith("app:")).map(x=>({name:x.slice(4),ownedTargetAbsent:true})),
    localLocks:config.localLocks,localLocksAbsent:true,ownedLifecycle:"closed",sdkLifecycle:"unclaimed",target:observedTarget,originalOwnership:original,observedAt:observedTarget.observedAt};
  return{observation,original,assertCurrent:()=>{checkHost();if(performance.now()-completed>5000)throw Error("Fresh owned emulator closure expired before release");}};
}
