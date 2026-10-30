import { ownedAndroidAppSessionCleanup,type AndroidOwnedSessionProbes } from "./android-owned-app-session.ts";
import { realpathSync } from "node:fs";
import { join } from "node:path";
import { digest, fileDigest, object } from "./core.ts";
import { observeAndroidAppSession, assertAndroidAppSession, type AndroidAppProbe } from "./android-app-session.ts";
import { absentLock } from "./ios-observation-cleanup.ts";
import { workflowNativeResourceEvidence } from "./workflow-resource-evidence.ts";
import type { WorkflowRun, WorkflowStage } from "./workflow-store.ts";

/** Reuse original native outcomes and the existing owner-release transaction; no SDK acknowledgement is invented. */
export async function androidAppSessionEvidence(context:{values:Record<string,string|undefined>;directory:string;run:WorkflowRun;stages:WorkflowStage[]},probe?:AndroidAppProbe|AndroidOwnedSessionProbes) {
  const {run,stages,directory,values}=context,recipe=run.binding.recipe;
  assertAndroidAppSession(recipe);
  if(!recipe.androidAppSession)throw Error("Original Android app-session descriptor required");
  const config=recipe.androidAppSession,native=workflowNativeResourceEvidence(directory,run,stages,true),evidence=realpathSync(values.evidence!);
  const receipts=recipe.stages.map((_,index)=>join(directory,"commands",`${run.id}-${index}`,"result.json"));
  if(!receipts.includes(evidence)||native.files.get(evidence)!==values["evidence-digest"]||fileDigest(evidence)!==values["evidence-digest"])
    throw Error("Evidence must be an original confirmed native command receipt");
  if(probe!==undefined&&(config.ownership==="owned-emulator"?typeof probe==="function":typeof probe!=="function"))throw Error("Cleanup probe shape differs from original Android lifetime");
  const owned=config.ownership==="owned-emulator"?await ownedAndroidAppSessionCleanup(directory,run,stages,probe as AndroidOwnedSessionProbes|undefined,native):null;
  const checkHost=()=>{owned?.assertCurrent();native.assertCurrent();for(const lock of config.localLocks)absentLock(lock.path);};
  checkHost();
  const observation=owned?.observation??await observeAndroidAppSession(recipe.resources,config,recipe.workspace,probe as AndroidAppProbe|undefined),completed=performance.now();
  if(!observation)throw Error("Exact Android app-session closure unavailable; original claims retained");
  checkHost();
  const original={commands:native.commands,evidence:{path:evidence,digest:values["evidence-digest"]},descriptorDigest:digest(config),...(owned?{ownership:owned.original}:{})};
  const {observedAt,inventoryDigest:_inventory,processInventoryDigest:_process,...base}=observation as Record<string,unknown>;
  const assertions={...base};
  if(owned){const {observedAt:_time,inventoryDigest:_digest,...target}=owned.observation.target;assertions.target=target;}
  const proof={original,fresh:{observedAt,assertions}};
  return{proof,assertCurrent:()=>{checkHost();if(performance.now()-completed>5000)throw Error("Fresh Android closure expired before release");},
    compatible:(previous:unknown,current:unknown)=>{const prior=object(previous),next=object(current),fresh=object(prior.fresh);return digest(prior.original)===digest(next.original)&&digest(fresh.assertions)===digest(object(next.fresh).assertions)&&typeof fresh.observedAt==="string"&&Number.isFinite(Date.parse(fresh.observedAt))&&Date.parse(fresh.observedAt)<=Date.now();}};
}
