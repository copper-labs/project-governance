import {join} from "node:path";
import {durableJson} from "./core.ts";
import {narrativeFile} from "./narrative-inputs.ts";
import {OperationDeadline} from "./operation-deadline.ts";
import {lstatSync} from "node:fs";

/** Reopening a prepared operation consumes its original budget, never a new installation allowance. */
export function startupDeadline(directory:string,requestDigest:string,seconds:number,create=false) {
 if(!/^sha256:[a-f0-9]{64}$/u.test(requestDigest) || !Number.isFinite(seconds) || seconds<=0 || seconds>3600)
  throw new Error("Invalid startup installation budget");
 const path=join(directory,"deadline.json"),durationMs=Math.ceil(seconds*1000);
 if(create){
  if(lstatSync(path,{throwIfNoEntry:false}))throw new Error("Startup installation deadline already reserved");
  const startedAt=Date.now();
  durableJson(path,{version:1,requestDigest,startedAt,durationMs,expiresAt:startedAt+durationMs});
 }
 const saved=JSON.parse(narrativeFile(directory,path));
 if(saved.version!==1 || saved.requestDigest!==requestDigest || saved.durationMs!==durationMs ||
   !Number.isSafeInteger(saved.startedAt) || saved.startedAt<1 || saved.startedAt>Date.now() || saved.expiresAt!==saved.startedAt+durationMs)
  throw new Error("Startup installation deadline identity differs");
 const deadline=new OperationDeadline(saved.expiresAt);deadline.remaining();return deadline;
}
