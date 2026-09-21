import {execFileSync} from "node:child_process";
import {basename} from "node:path";
import {hostname} from "node:os";
import {commandProcesses} from "./command-owner-recovery.ts";
import {processFingerprint} from "./process-owner.ts";

export interface StartupHostOwner {host:string;pid:number;fingerprint:string;provider:"codex"}
/** Session strings are not enough: preparation must still descend from the recorded native process. */
export function requireCurrentStartupHost(owner:StartupHostOwner|null,capture=captureStartupHostOwner) {
 if(!owner || owner.provider!=="codex" || !Number.isSafeInteger(owner.pid) || owner.pid<2 ||
   !owner.host || typeof owner.fingerprint!=="string" || !owner.fingerprint.trim())throw new Error("Recorded startup host identity required");
 const current=capture("codex");
 if(!current || current.provider!==owner.provider || current.host!==owner.host || current.pid!==owner.pid || current.fingerprint!==owner.fingerprint)
  throw new Error("Current native host differs from the recorded startup parent");
 return current;
}
/** Inspect only native ancestors; an absent or ambiguous owner is not recoverable by time alone. */
export function captureStartupHostOwner(provider:string):StartupHostOwner|null {
 if(provider!=="codex")return null;
 const rows=commandProcesses();let pid=process.ppid;
 for(let depth=0;depth<8 && pid>1;depth++) {
  const row=rows.find(value=>value.pid===pid);if(!row)return null;
  const before=processFingerprint(pid);if(!before)return null;
  let executable:string;
  try{executable=execFileSync("/bin/ps",["-p",String(pid),"-o","comm="],{encoding:"utf8",timeout:2000,maxBuffer:16384}).trim();}
  catch{return null;}
  if(processFingerprint(pid)!==before)return null;
  if(/^codex(?:[-.]|$)/iu.test(basename(executable)))return {provider:"codex",host:hostname(),pid,fingerprint:before};
  pid=row.parent;
 }
 return null;
}

/** PID reuse also refuses release; this proof path never signals processes. */
export function requireAbsentStartupHost(owner:StartupHostOwner|null,
 enumerate=commandProcesses,localHost=hostname()) {
 if(!owner || owner.provider!=="codex" || owner.host!==localHost || !Number.isSafeInteger(owner.pid) || owner.pid<2 ||
   typeof owner.fingerprint!=="string" || !owner.fingerprint.trim())throw new Error("Recorded local startup host identity required");
 if(enumerate().some(row=>row.pid===owner.pid))throw new Error("Startup host PID remains present");
 return {host:owner.host,pid:owner.pid,fingerprint:owner.fingerprint,absent:true as const};
}
