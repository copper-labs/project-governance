import { spawn, spawnSync } from "node:child_process";
import { lstatSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, resolve, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { digest, object } from "./core.ts";
import { preserveWorkflowReleaseReceipt } from "./workflow-release-receipt.ts";
import type { Recipe } from "./workflow-types.ts";
import type { WorkflowRun, WorkflowStage } from "./workflow-store.ts";
import { workflowNativeResourceEvidence } from "./workflow-resource-evidence.ts";

/** Explicit local build scope. Paths name POSIX record locks, not lock-directory conventions. */
export interface LocalBuild { posixLockFiles: string[] }

export function localBuild(value: unknown): LocalBuild {
  const raw=object(value);
  if(Object.keys(raw).join(",")!=="posixLockFiles" || !Array.isArray(raw.posixLockFiles) || raw.posixLockFiles.length>64 ||
     raw.posixLockFiles.some(path=>typeof path!=="string" || !isAbsolute(path) || resolve(path)!==path) ||
     new Set(raw.posixLockFiles).size!==raw.posixLockFiles.length)throw Error("Local build requires unique absolute POSIX lock file paths");
  return {posixLockFiles:[...raw.posixLockFiles] as string[]};
}

export function assertLocalBuildScope(recipe: Recipe, descriptor: LocalBuild, checkCapability=true, historicalRecovery=false) {
  localBuild(descriptor);
  if(recipe.androidEmulator || recipe.androidAppSession || recipe.resources.some(resource=>/^(?:ios-|android[:-]|device:)/u.test(resource) ||
      (historicalRecovery && /^(?:android|ios|simulator|emulator|device|app)/iu.test(resource))))
    throw Error("Mixed build/device cleanup is unsupported; keep their reservations in separately owned workflows");
  if(!recipe.resources.length || recipe.resources.some(resource=>! /^(?:local|build|gradle):.+/u.test(resource) && !(historicalRecovery && /^[A-Za-z0-9][A-Za-z0-9_.-]*$/u.test(resource))) ||
     recipe.androidEmulator || recipe.androidAppSession || Object.values(recipe.operations).some(operation=>!["local","read"].includes(operation.effect)))
    throw Error("Local build cleanup requires exclusively declared local build reservations");
  if(descriptor.posixLockFiles.length) {
    if(process.platform!=="darwin" && process.platform!=="linux")throw Error("POSIX build locks require a supported host");
    for(const path of descriptor.posixLockFiles) {
      let parent=dirname(path),stat;
      for(;;) {
        try{stat=lstatSync(parent);break;}
        catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;parent=dirname(parent);}
      }
      if(!stat.isDirectory() || realpathSync(parent)!==parent)throw Error("Build lock nearest existing ancestor must be a canonical directory");
      let file;try{file=lstatSync(path);}catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;}
      if(file && (!file.isFile() || file.isSymbolicLink() || file.nlink!==1))throw Error("Build lock must be a regular file with one link");
    }
    if(!checkCapability)return;
    const capability=spawnSync("/usr/bin/python3",["-I","-S","-c","import fcntl,os,stat"],
      {timeout:5000,stdio:"ignore",env:{PATH:"/usr/bin:/bin"}});
    if(capability.error || capability.status!==0)throw Error("POSIX build lock observer unavailable on this host");
  }
}

// Keep real record locks held until the registry transaction finishes. Never create, unlink or
// rewrite a build lock, and never stop a daemon belonging to a different build.
const HOLD_LOCKS=String.raw`import os,sys,json,fcntl,stat
files=[]; rows=[]
for path in json.loads(sys.argv[1]):
 parent=os.path.dirname(path); ancestor=parent; absentPath=path
 while not os.path.lexists(ancestor):
  absentPath=ancestor; ancestor=os.path.dirname(ancestor)
 p=os.lstat(ancestor)
 if os.path.realpath(ancestor)!=ancestor or not stat.S_ISDIR(p.st_mode): raise RuntimeError('lock parent changed')
 try:
  before=os.lstat(path)
  if not stat.S_ISREG(before.st_mode) or before.st_nlink!=1: raise RuntimeError('not a regular lock file')
  fd=os.open(path,os.O_RDWR|os.O_NOFOLLOW|os.O_NONBLOCK); s=os.fstat(fd)
  if (s.st_dev,s.st_ino)!=(before.st_dev,before.st_ino): raise RuntimeError('lock file changed')
 except FileNotFoundError:
  rows.append(dict(path=path,absent=True,absentPath=absentPath,ancestor=ancestor,parentDev=p.st_dev,parentIno=p.st_ino)); continue
 if not stat.S_ISREG(s.st_mode) or s.st_nlink!=1: raise RuntimeError('not an owned regular lock file')
 fcntl.lockf(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
 files.append(fd); rows.append(dict(path=path,absent=False,ancestor=ancestor,dev=s.st_dev,ino=s.st_ino,parentDev=p.st_dev,parentIno=p.st_ino))
print(json.dumps(rows),flush=True)
sys.stdin.buffer.read(1)
`;

export async function holdBuildLocks(paths: string[]) {
  if(!paths.length)return {proof:[] as unknown[],assertCurrent(){},async close(){}};
  const child=spawn("/usr/bin/python3",["-I","-S","-c",HOLD_LOCKS,JSON.stringify(paths)],{stdio:["pipe","pipe","pipe"],env:{PATH:"/usr/bin:/bin"}});
  child.stdin.on("error",()=>{});
  let ended=false,output="",failure="";
  const closed=new Promise<void>(resolve=>child.once("close",()=>{ended=true;resolve();}));
  child.stderr.on("data",chunk=>{failure=(failure+String(chunk)).slice(-2048);});
  let timer:NodeJS.Timeout|undefined;
  try {
    const rows=await new Promise<Array<Record<string,unknown>>>((resolve,reject)=>{
      timer=setTimeout(()=>reject(Error("Build lock observation timed out")),5000);
      child.once("error",reject);child.once("close",()=>reject(Error("Build lock is busy or unavailable: "+failure)));
      child.stdout.on("data",chunk=>{
        output+=String(chunk);
        if(output.length>65536){reject(Error("Build lock observation exceeds bound"));return;}
        if(output.includes("\n")){try{resolve(JSON.parse(output.trim()));}catch{reject(Error("Invalid build lock observation"));}}
      });
    });
    clearTimeout(timer);
    if(!Array.isArray(rows)||rows.length!==paths.length||rows.some((row,index)=>row.path!==paths[index]))throw Error("Build lock observation scope differs");
    const assertCurrent=()=>{
      if(ended || child.exitCode!==null || child.signalCode!==null)throw Error("Build lock observer ended before release");
      for(const row of rows) {
        const path=String(row.path),parent=String(row.ancestor),p=lstatSync(parent);
        if(realpathSync(parent)!==parent || p.dev!==row.parentDev || p.ino!==row.parentIno)throw Error("Build lock parent changed");
        let s;try{s=lstatSync(row.absent?String(row.absentPath):path);}catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;}
        if(row.absent ? !!s : !s || !s.isFile() || s.isSymbolicLink() || s.nlink!==1 || s.dev!==row.dev || s.ino!==row.ino)
          throw Error("Build lock identity changed");
      }
    };
    assertCurrent();
    return {proof:rows,assertCurrent,async close(){child.stdin.end();await closed;}};
  }catch(error){clearTimeout(timer);child.kill("SIGKILL");await closed;throw error;}
}

/** The same evidence and lock checks serve normal completion and explicit old-run recovery. */
export async function observeLocalBuild(directory: string, run: WorkflowRun, stages: WorkflowStage[], descriptor=run.binding.recipe.localBuild, historicalRecovery=false) {
  if(!descriptor)throw Error("Local build cleanup declaration required before dispatch");
  assertLocalBuildScope(run.binding.recipe,descriptor,false,historicalRecovery);
  const native=workflowNativeResourceEvidence(directory,run,stages,true,true);
  for(const path of native.files.keys())if(realpathSync(path)!==path)throw Error("Original build cleanup evidence uses an alias");
  // The supervisor can persist its receipt just before its own process exits.
  const grace=Math.max(0,...Object.values(run.binding.recipe.operations).map(op=>op.terminationGraceMs??30000));
  const deadline=Date.now()+Math.min(30000,grace+1000);
  for(;;){
    try{native.assertCurrent();break;}
    catch(error){
      if(!(error instanceof Error) || error.message!=="Original command owner or process group still present or PID reused" || Date.now()>=deadline)throw error;
      await delay(25);
    }
  }
  const locks=await holdBuildLocks(descriptor.posixLockFiles);
  try {
    native.assertCurrent();locks.assertCurrent();
    // A release intent is immutable. Fresh lock identities belong to separate immutable attempts,
    // so an interrupted release can retry after an unlocked file was legitimately replaced.
    const observation={runId:run.id,bindingDigest:digest(run.binding),leases:[],observation:{
      kind:"local-build-observation",version:1,descriptor,commands:native.commands,stagesDigest:digest(stages),locks:locks.proof}};
    const observations=join(directory,"local-build-observations");
    const saved=preserveWorkflowReleaseReceipt(join(observations,digest(observation).slice(7)+".json"),observation);
    if(digest(saved)!==digest(observation))throw Error("Build observation evidence differs");
    return {proof:{kind:"local-build-cleanup",version:1,descriptor,commands:native.commands,
      stagesDigest:digest(stages),observations:{directory:observations,contract:"fresh-lock-observation-before-release"}},assertCurrent(){
        for(const path of native.files.keys())if(realpathSync(path)!==path)throw Error("Original build cleanup evidence uses an alias");
        native.assertCurrent();locks.assertCurrent();},close:locks.close};
  }catch(error){await locks.close();throw error;}
}
