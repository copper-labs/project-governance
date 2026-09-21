import {mkdirSync,realpathSync,lstatSync} from "node:fs";
import {join} from "node:path";
import {hostname} from "node:os";
import {digest,durableJson} from "./core.ts";
import {narrativeFile} from "./narrative-inputs.ts";
import {processFingerprint} from "./process-owner.ts";
import {commandProcesses} from "./command-owner-recovery.ts";

type JournalIdentity={directory:string;requestDigest:string;token:string};
const identity=(journal:JournalIdentity)=>({requestDigest:journal.requestDigest,token:journal.token});

/** One mutating coordinator per journal. A stopped attempt is recovered, never silently repeated. */
export async function withStartupUpdateOwner<T>(journal:JournalIdentity,run:()=>Promise<T>):Promise<T> {
 const directory=realpathSync(journal.directory),fingerprint=processFingerprint(process.pid);
 if(!fingerprint)throw new Error("Startup updater process identity unavailable");
 const claim=join(directory,"updater");
 mkdirSync(claim,{mode:0o700});
 const owner={version:1,...identity(journal),host:hostname(),pid:process.pid,fingerprint};
 durableJson(join(claim,"owner.json"),owner);
 try{return await run();}
 finally {
  // This records coordinator quiescence only; child cleanup and mutation outcomes remain separate.
  durableJson(join(claim,"stopped.json"),{version:1,ownerDigest:digest(owner),stoppedAt:new Date().toISOString()});
 }
}

/** Missing, foreign-host or live ownership never grants recovery authority. No signals or age limits. */
export function requireStoppedStartupUpdater(journal:JournalIdentity) {
 const directory=realpathSync(journal.directory),claim=join(directory,"updater");
 if(realpathSync(claim)!==claim)throw new Error("Startup updater claim uses an alias");
 const owner=JSON.parse(narrativeFile(claim,"owner.json"));
 if(owner.version!==1 || owner.requestDigest!==journal.requestDigest || owner.token!==journal.token ||
   owner.host!==hostname() || !Number.isSafeInteger(owner.pid) || owner.pid<2 ||
   typeof owner.fingerprint!=="string" || !owner.fingerprint.trim())throw new Error("Startup updater ownership differs or is incomplete");
 const stopped=join(claim,"stopped.json");
 if(lstatSync(stopped,{throwIfNoEntry:false})) {
  const receipt=JSON.parse(narrativeFile(claim,stopped));
  if(receipt.version!==1 || receipt.ownerDigest!==digest(owner) || typeof receipt.stoppedAt!=="string" ||
    !Number.isFinite(Date.parse(receipt.stoppedAt)))throw new Error("Startup updater stop receipt differs");
  return {ownerDigest:digest(owner),proof:"coordinator-returned" as const};
 }
 if(commandProcesses().some(row=>row.pid===owner.pid))throw new Error("Startup updater PID remains present");
 return {ownerDigest:digest(owner),proof:"local-process-absent" as const};
}
