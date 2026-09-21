import {lstatSync,realpathSync} from "node:fs";
import {dirname,isAbsolute} from "node:path";
import {digest,durableJson} from "./core.ts";
import {narrativeFile} from "./narrative-inputs.ts";

export interface StartupMetadata {replay?:Record<string,string>;record:Record<string,string>}
/** Disposable metadata only. Never persist credentials, safety assessments or activation authority. */
export function startupMetadataCache(path:string,scope:unknown,seconds:number) {
 if(!isAbsolute(path) || realpathSync(dirname(path))!==dirname(path))throw new Error("Startup cache requires a canonical external directory");
 const key=digest(scope),now=Date.now();
 const ordinary=()=>{
  const stat=lstatSync(path,{throwIfNoEntry:false});
  if(stat && (!stat.isFile() || stat.nlink!==1))throw new Error("Startup cache must be an ordinary unshared file");
 };
 ordinary();
 let replay:Record<string,string>|undefined;
 try {
  const value=JSON.parse(narrativeFile(dirname(path),path));
  if(value.version===1 && value.key===key && Number.isSafeInteger(value.createdAt) && value.createdAt<=now &&
    now-value.createdAt<seconds*1000 && value.responses && typeof value.responses==="object" && !Array.isArray(value.responses) &&
    Object.entries(value.responses).length<=16 && Object.values(value.responses).every(x=>typeof x==="string"))replay=value.responses;
 }catch(error) {
  // Missing, malformed or oversized cache is a miss; path redirection is never followed.
  ordinary();
  if((error as NodeJS.ErrnoException).code && (error as NodeJS.ErrnoException).code!=="ENOENT")throw error;
 }
 const metadata:StartupMetadata={...(replay?{replay}:{}),record:{}};
 return {metadata,commit:()=>{
  if(replay)return;
  const value={version:1,key,createdAt:now,responses:metadata.record};
  if(Buffer.byteLength(JSON.stringify(value))>900*1024)return;
  ordinary();durableJson(path,value);
 }};
}
