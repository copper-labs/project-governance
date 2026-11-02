import { createHash } from "node:crypto";
import { lstatSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { digest, object } from "./core.ts";
import { narrativeFile } from "./narrative-inputs.ts";
import { observePhysicalCleanup } from "./physical-cleanup.ts";
import { workflowNativeResourceEvidence } from "./workflow-resource-evidence.ts";
import type { Recipe } from "./workflow-types.ts";
import type { WorkflowRun, WorkflowStage } from "./workflow-store.ts";

export type IosObservationProbes = Parameters<typeof observePhysicalCleanup>[1];
const reserved = /^(?:ios-|android-|workspace-v1:|simulator:|emulator:|device:|tcp:|port:|metro:|service:|remote:)/u;

/** The owner declares the opaque local claim; device and app identity remain reserved and exact. */
export function iosObservationClaims(recipe: Recipe, local: string | undefined) {
  const resources=recipe.resources;
  const beforeActor=resources.length===2 && local===undefined;
  const device=resources.find(value=>/^ios-device:(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{8}-[0-9a-fA-F]{16})$/u.test(value));
  if(recipe.androidEmulator || recipe.androidAppSession || !device || (!beforeActor &&
      (resources.length!==3 || !local?.trim() || reserved.test(local) || !resources.includes(local))))
    throw new Error("Exact iOS observation device/app/local-storage claims required");
  const udid=device.slice("ios-device:".length),app=resources.find(value=>value.startsWith(`ios-app:${udid}:`));
  if(!app || !/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/u.test(app.slice(`ios-app:${udid}:`.length)) ||
      new Set(resources).size!==resources.length || Object.values(recipe.operations).some(operation=>operation.effect!=="local"))
    throw new Error("Exact local observation and matching iOS app required");
  return {device,app,udid,local:local??null,beforeActor};
}

/** Read actual absence only. The adapter never creates, steals, deletes or stale-prunes a project lock. */
export function absentLock(path:string) {
  if(!isAbsolute(path) || resolve(path)!==path || realpathSync(dirname(path))!==dirname(path) || !statSync(dirname(path)).isDirectory())
    throw new Error("Canonical original owner lock directory required");
  try { lstatSync(path); } catch(error) {
    if((error as NodeJS.ErrnoException).code==="ENOENT")return;
    throw error;
  }
  throw new Error("Original local custody lock remains present; no release performed");
}

/** Combine original observation evidence with fresh qualified device/app and host closure, without SDK assertions. */
export async function iosObservationEvidence(context:{values:Record<string,string|undefined>;directory:string;run:WorkflowRun;stages:WorkflowStage[]},probes?:IosObservationProbes) {
  const {values,run,stages,directory}=context,claims=iosObservationClaims(run.binding.recipe,values["local-resource"]!);
  const native=workflowNativeResourceEvidence(directory,run,stages,true),evidence=realpathSync(values.evidence!);
  const raw=narrativeFile(directory,evidence),report=object(JSON.parse(raw)),modified=statSync(evidence).mtimeMs;
  const evidenceDigest="sha256:"+createHash("sha256").update(raw).digest("hex");
  if(evidenceDigest!==values["evidence-digest"])throw new Error("Selected owner evidence digest differs");
  if(claims.beforeActor){
    const closure=object(report.processClosure),recorded=object(report.observedProcessIdentities);
    if(run.binding.recipe.stages.length!==1 || !native.originalFailedLaunchesConfirmed || report.status!=="failed" || report.childStarted!==false ||
       closure.closed!==true || closure.notStarted!==true || report.legacyLockHeld!==false || report.legacyLockReleased!==false ||
       report.appOrSDKLaunch!==undefined && report.appOrSDKLaunch!==false || report.ownedFileLockHeld!==undefined && report.ownedFileLockHeld!==false ||
       report.deviceUdid!==undefined && report.deviceUdid!==claims.udid || report.deviceClosure!==undefined || Object.keys(recorded).length>4096)
      throw new Error("Original failed before-first-device-actor and never-held lock evidence required");
    if(closure.after!==undefined){const after=object(closure.after);if(!Array.isArray(after.group)||after.group.length||!Array.isArray(after.observedTree)||after.observedTree.length)throw Error("Original actor closure is contradictory");}
    for(const [pid,fingerprint]of Object.entries(recorded)){if(!/^[1-9]\d*$/u.test(pid))throw Error("Invalid owner process identity");native.identify({pid:Number(pid),fingerprint});}
    const worker=join(directory,"owner.json"),bytes=narrativeFile(directory,worker);
    native.identify(JSON.parse(bytes));native.files.set(worker,"sha256:"+createHash("sha256").update(bytes).digest("hex"));
  }else if(report.deviceUdid!==claims.udid || report.appOrSDKLaunch!==false || report.ownedFileLockHeld!==false)
    throw new Error("Original observation-only device and file-lock closure evidence required");
  const observed=claims.beforeActor?(typeof report.ended==="number"?report.ended*1000:NaN):typeof report.observedAt==="string"?Date.parse(report.observedAt):NaN;
  if(!Number.isFinite(observed) || !native.windows.some(window=>observed>=window.start && observed<=window.end && modified>=window.start && modified<=window.end))
    throw new Error("Observation report is stale or belongs to another original command");
  native.files.set(evidence,evidenceDigest);
  const lock=values["lock-directory"]!;
  const checkHost=()=>{
    native.assertCurrent();
    if(statSync(evidence).mtimeMs!==modified)throw new Error("Original observation report metadata changed");
    absentLock(lock);
  };
  checkHost();
  const physical=await observePhysicalCleanup([claims.device,claims.app],probes);
  if(!physical)throw new Error("Fresh qualified iOS device/app closure unavailable; original claims retained");
  const completed=performance.now();
  checkHost();
  const {observedAt,...device}=physical;
  const original={commands:native.commands,evidence:{path:evidence,digest:values["evidence-digest"],modifiedAt:modified},
    stagesDigest:digest(stages),identitiesDigest:digest([...native.identities]),localResource:claims.local,lockDirectory:lock,
    ...(claims.beforeActor?{executionBoundary:"before-first-device-actor",originalChildStarted:false,originalLegacyLockHeld:false,originalLegacyLockReleased:false}:{})};
  const assertions={device,localResource:claims.local,lockDirectory:lock,localLockAbsent:true,sdkLifecycle:"unclaimed"};
  const proof={original,fresh:{observedAt,assertions}};
  return {proof,
    assertCurrent:()=>{
      checkHost();
      // Original claims remain held throughout readback. Do not commit a delayed observation.
      if(performance.now()-completed>5000)throw new Error("Fresh owner closure expired before release");
    },
    compatible:(previous:unknown,current:unknown)=>{
      const prior=object(previous),next=object(current),fresh=object(prior.fresh);
      return digest(prior.original)===digest(next.original) && digest(fresh.assertions)===digest(object(next.fresh).assertions) &&
        typeof fresh.observedAt==="string" && Number.isFinite(Date.parse(fresh.observedAt)) && Date.parse(fresh.observedAt)<=Date.now();
    }};
}
