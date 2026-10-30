import { createHash } from "node:crypto";
import { realpathSync, statSync } from "node:fs";
import { digest, object } from "./core.ts";
import { narrativeFile } from "./narrative-inputs.ts";
import { commandProcesses } from "./command-owner-recovery.ts";
import { workflowNativeResourceEvidence } from "./workflow-resource-evidence.ts";
import { absentLock } from "./ios-observation-cleanup.ts";
import { observeSimulatorCleanup } from "./simulator-cleanup.ts";
import type { Recipe } from "./workflow-types.ts";
import type { WorkflowRun, WorkflowStage } from "./workflow-store.ts";
export type SimulatorBuildProbes=Parameters<typeof observeSimulatorCleanup>[1];

/** Explicit compiler-only owner selection composes simulator custody with one original producer claim. */
export function simulatorBuildClaims(recipe:Recipe,local:string) {
  const simulator=recipe.resources.find(value=>/^ios-simulator:[0-9A-Fa-f-]{36}$/u.test(value));
  if(recipe.androidEmulator || recipe.resources.length!==2 || !simulator || !local?.trim() || !recipe.resources.includes(local) ||
      /^(?:ios-|android-|workspace-v1:|simulator:|emulator:|device:|tcp:|port:|metro:|service:|remote:)/u.test(local) ||
      Object.values(recipe.operations).some(operation=>operation.effect!=="local"))throw new Error("Exact compiler-only simulator and local producer claims required");
  return {simulator,local};
}

/** The original failed compiler closeout is retained; fresh simulator shutdown is observed, never performed. */
export async function simulatorBuildEvidence(context:{values:Record<string,string|undefined>;directory:string;run:WorkflowRun;stages:WorkflowStage[]},probes?:SimulatorBuildProbes) {
  const {values,run,stages,directory}=context,claims=simulatorBuildClaims(run.binding.recipe,values["local-resource"]!);
  const native=workflowNativeResourceEvidence(directory,run,stages),evidence=realpathSync(values.evidence!);
  const raw=narrativeFile(directory,evidence),report=object(JSON.parse(raw)),closure=object(report.processClosure);
  const hash="sha256:"+createHash("sha256").update(raw).digest("hex"),modified=statSync(evidence).mtimeMs;
  if(hash!==values["evidence-digest"] || report.nativeSdkRebuilt!==false || report.status!=="failed" ||
      !Number.isInteger(report.exitCode) || report.exitCode===0 || report.legacyLocksReleased!==true ||
      !Array.isArray(report.appClosure) || report.appClosure.length || closure.closed!==true ||
      !Array.isArray(closure.conflicts) || closure.conflicts.length || !Array.isArray(closure.observedIdentities) || !closure.observedIdentities.length)
    throw new Error("Original failed compiler-only closeout with released locks and no app closure required");
  const finished=typeof report.finished==="number"?report.finished*1000:NaN;
  if(!Number.isFinite(finished) || !native.windows.some(window=>finished>=window.start && finished<=window.end && modified>=window.start && modified<=window.end))
    throw new Error("Compiler closeout is stale or belongs to another original command");
  const identities=closure.observedIdentities.map(value=>object(value));
  if(identities.length>4096 || identities.some(value=>!Number.isSafeInteger(value.pid)||Number(value.pid)<2||!Number.isFinite(Number(value.started))||Number(value.started)<=0) ||
      !native.windows.some(window=>finished>=window.start && finished<=window.end && modified>=window.start && modified<=window.end &&
        identities.some(value=>window.ids.has(Number(value.pid)))))throw new Error("Original compiler process identities differ");
  native.files.set(evidence,hash);
  const lock=values["lock-directory"]!,simulatorLock=values["simulator-lock-directory"]!;
  if(lock===simulatorLock)throw new Error("Separate original producer and simulator lock mappings required");
  const check=()=>{
    native.assertCurrent();if(statSync(evidence).mtimeMs!==modified)throw new Error("Original compiler closeout metadata changed");
    absentLock(lock);absentLock(simulatorLock);
    if(commandProcesses().some(process=>identities.some(value=>value.pid===process.pid)))throw new Error("Original compiler process still present or PID reused");
  };
  check();const simulator=await observeSimulatorCleanup([claims.simulator],probes);
  if(!simulator)throw new Error("Fresh qualified simulator shutdown unavailable; original claims retained");
  const completed=performance.now();check();const {observedAt,...device}=simulator;
  const original={commands:native.commands,evidence:{path:evidence,digest:hash,modifiedAt:modified},stagesDigest:digest(stages),
    identitiesDigest:digest(identities),localResource:claims.local,lockDirectory:lock,simulatorLockDirectory:simulatorLock};
  const assertions={simulator:device,localLocksAbsent:true,lockDirectory:lock,simulatorLockDirectory:simulatorLock,compilerOnly:"original-owner-declaration",sdkLifecycle:"unclaimed",physicalDevice:"unclaimed"};
  return {proof:{original,fresh:{observedAt,assertions}},assertCurrent:()=>{check();if(performance.now()-completed>5000)throw new Error("Fresh owner closure expired before release");},
    compatible:(previous:unknown,current:unknown)=>{const prior=object(previous),next=object(current),fresh=object(prior.fresh);return digest(prior.original)===digest(next.original)&&digest(fresh.assertions)===digest(object(next.fresh).assertions)&&typeof fresh.observedAt==="string"&&Number.isFinite(Date.parse(fresh.observedAt))&&Date.parse(fresh.observedAt)<=Date.now();}};
}
