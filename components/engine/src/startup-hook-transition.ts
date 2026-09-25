import {closeSync,fchmodSync,fsyncSync,lstatSync,openSync,readFileSync,realpathSync,renameSync,unlinkSync,writeFileSync,mkdirSync,linkSync} from "node:fs";
import {join,dirname} from "node:path";
import {randomUUID} from "node:crypto";
import {digest} from "./core.ts";
import {inspectRuntimeBackup} from "./runtime-backup-inspection.ts";
import {narrativeFile} from "./narrative-inputs.ts";
import {planStartupHookMigration} from "./startup-hook-migration.ts";
import {RuntimeGenerations} from "./runtime-generations.ts";
import {startupHooks} from "./startup-hooks.ts";

/** Bind old and intended bytes to the same backup used by runtime activation. */
export function backedStartupHookTransition(workspace:string,backupDirectory:string,receipts?:string) {
 const root=realpathSync(workspace),path=join(root,".codex/hooks.json"),backup=inspectRuntimeBackup(backupDirectory);
 const record=backup.records.find(value=>value.source===path);
 if(!record) {
  if(lstatSync(path,{throwIfNoEntry:false}))throw new Error("Native hooks missing from migration backup");
  return null;
 }
 if(record.kind==="absent") {
  const entry=lstatSync(path,{throwIfNoEntry:false});
  if(!receipts) { if(entry)throw new Error("Native hooks appeared after backup"); return null; }
  const proposal=startupHooks({},root,receipts),parent=dirname(path),parentEntry=lstatSync(parent,{throwIfNoEntry:false});
  if(parentEntry && (!parentEntry.isDirectory() || realpathSync(parent)!==parent))throw new Error("Native hook directory changed");
  if(entry && (!entry.isFile() || entry.nlink!==1 || realpathSync(path)!==path || (entry.mode&0o777)!==0o600 || narrativeFile(root,path)!==proposal.content))
   throw new Error("Native hooks appeared outside backed transition");
  const identity={path,original:null,content:proposal.content,mode:0o600,backupDigest:backup.receiptDigest,receipts};
  return {...identity,planDigest:digest(identity),complete:Boolean(entry)};
 }
 if(record.kind!=="file" || typeof record.file!=="string")throw new Error("Invalid native hook backup");
 const original=readFileSync(join(backup.directory,record.file),"utf8");
 if(!receipts) {
  if(original.includes("governance-startup.py"))throw new Error("Legacy startup hook migration requires an explicit startup receipt store");
  return null;
 }
 const proposal=original.includes("governance-startup.py") ? planStartupHookMigration(JSON.parse(original),root,receipts)
  : startupHooks(JSON.parse(original),root,receipts);
 const entry=lstatSync(path),parent=dirname(path);
 if(!entry.isFile() || entry.nlink!==1 || realpathSync(path)!==path || realpathSync(parent)!==parent || (entry.mode&0o777)!==record.mode)
  throw new Error("Native hook path or mode changed since backup");
 const actual=narrativeFile(root,path);
 if(actual!==original && actual!==proposal.content)throw new Error("Native hooks changed outside backed transition");
 const identity={path,original,content:proposal.content,mode:record.mode,backupDigest:backup.receiptDigest,receipts};
 return {...identity,planDigest:digest(identity),complete:actual===proposal.content};
}

/** Hook writes share the enclosing host completion requirement; no independent admission or trust. */
export function applyBackedStartupHooks(registry:string,workspace:string,backupDirectory:string,receipts:string,token:string,owner:string) {
 const plan=backedStartupHookTransition(workspace,backupDirectory,receipts);if(!plan || plan.complete)return plan;
 const backup=inspectRuntimeBackup(backupDirectory),generations=new RuntimeGenerations(registry);
 try {
  const state=generations.state();
  if(state.maintenance?.token!==token || state.maintenance.owner!==owner || backup.maintenance.token!==token ||
    backup.maintenance.owner!==owner || state.revision!==backup.revision+1 || !state.directory || state.written || state.readers.length)
   throw new Error("Native hook migration requires owned drained pre-write activation");
  const parentDirectory=dirname(plan.path);
  if(!lstatSync(parentDirectory,{throwIfNoEntry:false}))mkdirSync(parentDirectory,{mode:0o700});
  if(realpathSync(parentDirectory)!==parentDirectory)throw new Error("Native hook directory changed");
  const temporary=`${plan.path}.${randomUUID()}.tmp`,fd=openSync(temporary,"wx",plan.mode as number);
  try {
   try{writeFileSync(fd,plan.content);fchmodSync(fd,plan.mode as number);fsyncSync(fd);}finally{closeSync(fd);}
   const current=backedStartupHookTransition(workspace,backupDirectory,receipts);
   if(!current || current.planDigest!==plan.planDigest || current.complete)throw new Error("Native hook migration changed before replacement");
   if(plan.original===null)linkSync(temporary,plan.path);else renameSync(temporary,plan.path);
   const parent=openSync(dirname(plan.path),"r");try{fsyncSync(parent);}finally{closeSync(parent);}
  }finally{try{unlinkSync(temporary);}catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;}}
  const result=backedStartupHookTransition(workspace,backupDirectory,receipts);
  if(!result?.complete)throw new Error("Native hook migration readback failed");
  return result;
 }finally{generations.close();}
}

/** A lock-only completion cannot leave an executable legacy observer in any backed provider settings. */
export function assertNoLegacyStartupHooks(workspace:string) {
 const root=realpathSync(workspace);
 const legacyCommand=(value:unknown,depth=0):boolean=>{
  if(depth>32)throw new Error("Native hook configuration nesting exceeds limit");
  if(Array.isArray(value))return value.some(entry=>legacyCommand(entry,depth+1));
  if(!value || typeof value!=="object")return false;
  const record=value as Record<string,unknown>;
  if(typeof record.command==="string" && record.command.includes("governance-startup.py"))return true;
  return Object.values(record).some(entry=>legacyCommand(entry,depth+1));
 };
 for(const relative of [".codex/hooks.json",".claude/settings.json",".claude/settings.local.json",".gemini/settings.json"]) {
  const path=join(root,relative);
  if(!lstatSync(path,{throwIfNoEntry:false}))continue;
  if(realpathSync(path)!==path)throw new Error("Native hook configuration uses aliases");
  const value=JSON.parse(narrativeFile(root,path));
  if(legacyCommand(value.hooks??{}))
   throw new Error(`Legacy native startup hooks remain active in ${relative}; complete their backed host transition`);
 }
}
