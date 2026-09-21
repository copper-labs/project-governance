import {hostname} from "node:os";
import {randomUUID} from "node:crypto";
import {realpathSync} from "node:fs";
import {processFingerprint} from "./process-owner.ts";
import {commandProcesses} from "./command-owner-recovery.ts";
import {RuntimeGenerations} from "./runtime-generations.ts";
import {text} from "./core.ts";
const prefix="startup-observation:v1:";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

/** Keep the hook process identity in the reader row itself, before any separate task-store write. */
export function startupObservationOwner(workspace:string) {
 const fingerprint=processFingerprint(process.pid);
 if(!fingerprint)throw new Error("Startup observer process identity unavailable");
 return prefix+Buffer.from(JSON.stringify({host:hostname(),pid:process.pid,fingerprint,workspace:realpathSync(workspace),nonce:randomUUID()})).toString("base64url");
}

/** Explicit absence proof only: never signal a process or retire a parent task reservation. */
export function recoverStartupObservation(workspace:string,registry:string,token:string,authority:string) {
 workspace=realpathSync(workspace);registry=realpathSync(registry);text(authority,"observation recovery authority");
 if(!uuid.test(token))throw new Error("Observation reader token must be a UUID");
 const generations=new RuntimeGenerations(registry);
 try {
  const row=generations.state().readers.find(value=>value.token===token);
  if(!row)return {status:"not-held",token,registry,workspace,observationOutcome:"not-inferred",authority};
  if(typeof row.owner!=="string" || !row.owner.startsWith(prefix))throw new Error("Reader lacks a recoverable observation identity");
  const owner=JSON.parse(Buffer.from(row.owner.slice(prefix.length),"base64url").toString("utf8"));
  if(!owner || typeof owner!=="object" || owner.host!==hostname() || owner.workspace!==workspace || !Number.isSafeInteger(owner.pid) || owner.pid<2 ||
    typeof owner.fingerprint!=="string" || !owner.fingerprint.trim() || typeof owner.nonce!=="string" ||
    !uuid.test(owner.nonce) || Object.keys(owner).sort().join()!=="fingerprint,host,nonce,pid,workspace")
   throw new Error("Recorded local observation identity differs");
  if(commandProcesses().some(process=>process.pid===owner.pid))throw new Error("Startup observer PID remains present");
  const released=generations.releaseConfirmed(token,row.owner,Number(row.revision));
  return {status:released?"released":"not-held",token,registry,workspace,authority,owner,
    observationOutcome:"unknown",taskReservation:"unchanged",replayed:false};
 }finally{generations.close();}
}
