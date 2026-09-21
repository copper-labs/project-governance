import {createHash,randomUUID} from "node:crypto";
import {closeSync,constants,fstatSync,fsyncSync,linkSync,lstatSync,openSync,readSync,realpathSync,unlinkSync,writeFileSync} from "node:fs";
import {join} from "node:path";
import {downloadStartupArchive} from "./startup-release-assets.ts";
import type {StartupHttp} from "./startup-http.ts";

/** Publish verified bytes atomically; this stages an input and does not activate a runtime. */
export async function stageStartupArchive(directory:string,current:unknown,release:unknown,client:Pick<StartupHttp,"api"|"read">) {
 if(realpathSync(directory)!==directory || !lstatSync(directory).isDirectory())throw new Error("Startup archive directory must be canonical");
 const downloaded=await downloadStartupArchive(current,release,client);
 const path=join(directory,`${downloaded.verification.sha256.slice(7)}.tgz`);
 const verify=()=>{
  const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try {
   const entry=fstatSync(fd);
   if(!entry.isFile() || entry.size!==downloaded.verification.size)throw new Error("Existing startup archive differs");
   const bytes=Buffer.alloc(entry.size+1);let length=0;
   while(length<bytes.length){const count=readSync(fd,bytes,length,bytes.length-length,null);if(!count)break;length+=count;}
   if(length!==entry.size || `sha512-${createHash("sha512").update(bytes.subarray(0,length)).digest("base64")}`!==downloaded.verification.integrity)
    throw new Error("Existing startup archive differs");
  }finally{closeSync(fd);}
 };
 if(lstatSync(path,{throwIfNoEntry:false}))verify();
 else {
  const temporary=join(directory,`.startup-${randomUUID()}.tmp`),fd=openSync(temporary,"wx",0o600);
  try {
   try{writeFileSync(fd,downloaded.bytes);fsyncSync(fd);}finally{closeSync(fd);}
   try{linkSync(temporary,path);}catch(error){if((error as NodeJS.ErrnoException).code!=="EEXIST")throw error;}
   verify();
  }finally{unlinkSync(temporary);}
 }
 const parent=openSync(directory,"r");try{fsyncSync(parent);}finally{closeSync(parent);}
 return {path,lock:downloaded.candidate.lock,lockText:downloaded.candidate.lockText,
  verification:downloaded.verification,authority:"staged-archive-only" as const};
}
