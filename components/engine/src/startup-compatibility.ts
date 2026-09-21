import {createHash} from "node:crypto";
import {object} from "./core.ts";
import {compiledRuntimeLock, type CompiledRuntimeLock} from "./runtime-lock.ts";

export class StartupApprovalRequired extends Error {}
export const COMPILED_STARTUP_CONTRACT = 2;
export function stableStartupVersion(value:unknown): number[] {
  if(typeof value!=="string" || !/^(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})$/u.test(value))
    throw new Error("Startup requires a canonical stable version");
  return value.split(".").map(Number);
}
const compare=(a:number[],b:number[])=>a[0]!-b[0]! || a[1]!-b[1]! || a[2]!-b[2]!;
function distribution(lock:CompiledRuntimeLock) {
  const match=/^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/releases\/download\/([^/]+)\/([A-Za-z0-9_.-]+\.tgz)$/u.exec(lock.artifact.url);
  if(!match || match[3]!==lock.version)throw new Error("Startup requires a version-bound GitHub release artifact");
  return `${match[1]}/${match[2]}`;
}

/** Compatibility is necessary, not sufficient: publication immutability and host authority are separate checks. */
export function compatibleStartupCandidate(currentValue:unknown,lockBytes:Uint8Array,metadataValue:unknown) {
  if(lockBytes.byteLength>1024*1024)throw new Error("Startup lock exceeds size limit");
  const current=compiledRuntimeLock(currentValue);
  const candidate=compiledRuntimeLock(JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(lockBytes)));
  const metadata=object(metadataValue,"startup compatibility");
  const fields=["schema_version","version","lock_sha256","startup_contract","automatic","from_version","before_version","configuration_schema","integration_change"];
  if(Object.keys(metadata).length!==fields.length || fields.some(key=>!Object.hasOwn(metadata,key)))throw new StartupApprovalRequired("Unsupported startup compatibility fields");
  if(metadata.schema_version!==1 || metadata.startup_contract!==COMPILED_STARTUP_CONTRACT || metadata.automatic!==true || metadata.integration_change!==false)
    throw new StartupApprovalRequired("Startup candidate requires deliberate adoption");
  const old=stableStartupVersion(current.version),next=stableStartupVersion(candidate.version);
  if(old[0]!==next[0] || compare(old,next)>=0 || compare(stableStartupVersion(metadata.from_version),old)>0 || compare(old,stableStartupVersion(metadata.before_version))>=0)
    throw new StartupApprovalRequired("Startup candidate does not cover the current version");
  if(metadata.lock_sha256!==createHash("sha256").update(lockBytes).digest("hex") || metadata.version!==candidate.version ||
    metadata.configuration_schema!==candidate.configuration_schema || current.configuration_schema!==candidate.configuration_schema ||
    current.node!==candidate.node || distribution(current)!==distribution(candidate))throw new Error("Startup candidate identity or compatibility differs");
  return candidate;
}
