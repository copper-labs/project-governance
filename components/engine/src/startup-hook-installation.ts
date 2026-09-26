import {closeSync,fchmodSync,fsyncSync,lstatSync,mkdirSync,openSync,realpathSync,renameSync,unlinkSync,writeFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {join} from "node:path";
import {narrativeFile} from "./narrative-inputs.ts";
import {startupHooks} from "./startup-hooks.ts";
import {assertSharedStartupHookSource} from "./startup-hook-source.ts";

/** Installs project observers only; host trust and update policy retain their own authority. */
export function installStartupHooks(workspace:string,receipts:string) {
 assertSharedStartupHookSource(workspace);
 const root=realpathSync(workspace),directory=join(root,".codex"),path=join(directory,"hooks.json");
 const inspect=()=>{
  const parent=lstatSync(directory,{throwIfNoEntry:false});
  if(parent && (!parent.isDirectory() || realpathSync(directory)!==directory))throw new Error("Startup hook directory must be canonical");
  const entry=lstatSync(path,{throwIfNoEntry:false});
  if(entry && (!entry.isFile() || entry.nlink!==1 || (entry.mode&0o7000)))throw new Error("Startup hook configuration must be an ordinary unshared file");
  return {text:entry?narrativeFile(root,path):null,mode:entry?entry.mode&0o777:0o600};
 };
 const before=inspect(),plan=startupHooks(before.text===null?{}:JSON.parse(before.text),root,receipts);
 // A semantically current file keeps its authored formatting and permissions.
 const current=before.text!==null && JSON.stringify(JSON.parse(before.text))===JSON.stringify(plan.configuration);
 if(!current) {
  if(!lstatSync(directory,{throwIfNoEntry:false}))mkdirSync(directory,{mode:0o700});
  const temporary=join(directory,`.hooks-${randomUUID()}.tmp`);
  const fd=openSync(temporary,"wx",before.mode);
  try {
   try{writeFileSync(fd,plan.content);fchmodSync(fd,before.mode);fsyncSync(fd);}finally{closeSync(fd);}
   if(JSON.stringify(inspect())!==JSON.stringify(before))throw new Error("Startup hook configuration changed before replacement");
   renameSync(temporary,path);
   const parent=openSync(directory,"r");try{fsyncSync(parent);}finally{closeSync(parent);}
  } finally {
   try{unlinkSync(temporary);}catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;}
  }
 }
 const after=inspect();
 if(after.text===null || JSON.stringify(JSON.parse(after.text))!==JSON.stringify(plan.configuration))throw new Error("Startup hook installation readback failed");
 return {provider:plan.provider,path,changed:!current,source:assertSharedStartupHookSource(workspace),authority:"project-observers-installed" as const,
  hostRequirements:["Ensure features.hooks is not disabled in Codex","Trust the project in Codex; managed policy may prohibit project hooks","Review and trust the exact hook definitions using /hooks in Codex"],
  updatePolicyChanged:false};
}
