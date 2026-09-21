import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {realpathSync} from "node:fs";
import {join} from "node:path";
import {parse} from "yaml";
import {digest} from "./core.ts";
import {narrativeFile} from "./narrative-inputs.ts";
import {RuntimeGenerations} from "./runtime-generations.ts";
import {inspectRuntimeGeneration} from "./runtime-inspection.ts";
import {runtimeLauncher} from "./runtime-launcher.ts";
import {compiledRuntimeLock} from "./runtime-lock.ts";
import {commandEnvironment} from "./process-owner.ts";
import {assertStartupGitTransition,type startupGitSnapshot} from "./startup-git.ts";
import {StartupTasks} from "./startup-tasks.ts";
import type {OperationDeadline} from "./operation-deadline.ts";

/** Commit authority, installed identity and native readback precede reopening parent admission. */
export function finalizeStartupUpdate(input:{registry:string;token:string;
 reader:{token:string;owner:string;revision:number;directory:string};
 before:ReturnType<typeof startupGitSnapshot>;original:string;candidate:string;deadline?:OperationDeadline}) {
 input.deadline?.remaining();
 const registry=realpathSync(input.registry),workspace=realpathSync(input.before.workspace),generations=new RuntimeGenerations(registry);
 try {
  const owner=`startup-update:${digest(input.reader)}`,state=generations.state();
  const completed=generations.finalization(input.token,owner);
  if(!state.directory || (!completed && (state.maintenance?.token!==input.token || state.maintenance.owner!==owner || state.readers.length)))
   throw new Error("Startup readback requires owned drained maintenance");
  const installed=inspectRuntimeGeneration(state.directory),lock=compiledRuntimeLock(parse(input.candidate));
  const launcher=join(workspace,".governance/runtime/bin/project-governance");
  if(realpathSync(launcher)!==launcher || digest(lock)!==installed.lockDigest ||
    narrativeFile(workspace,launcher)!==runtimeLauncher(realpathSync(process.execPath),String(installed.executable),registry,workspace))
   throw new Error("Startup installed entrypoint differs from committed runtime");
  const commit=assertStartupGitTransition(input.before,input.original,input.candidate,true);
  const expected=`project-governance ${lock.version}`;
  const readback=completed?completed.receipt.readback:execFileSync(launcher,["--version"],{cwd:workspace,encoding:"utf8",timeout:input.deadline?.remaining(15000)??15000,maxBuffer:16384,
   env:{...commandEnvironment({}),GOVERNANCE_MAINTENANCE_PROBE:input.token}}).trim();
  if(readback!==expected)throw new Error("Startup installed version readback failed");
  if(assertStartupGitTransition(input.before,input.original,input.candidate,true)!==commit)throw new Error("Startup commit changed during readback");
  input.deadline?.remaining();
  return {...generations.finishStartupMaintenance(input.reader,input.token,{lockDigest:installed.lockDigest,readback,workspace,commit}),commit};
 }finally{generations.close();}
}

/** Complete both ledgers with replayable generation finalization inside the task transaction. */
export function completeStartupUpdate(input:Parameters<typeof finalizeStartupUpdate>[0],receipts:string,task:string,bindingDigest:string) {
 const tasks=new StartupTasks(realpathSync(receipts));
 try {
  if(tasks.workspace(task)!==realpathSync(input.before.workspace))throw new Error("Startup completion workspace differs");
  const registry=realpathSync(input.registry),commit=assertStartupGitTransition(input.before,input.original,input.candidate,true);
  const lockDigest=`sha256:${createHash("sha256").update(input.candidate).digest("hex")}`;
  const completed=tasks.completeUpdate(task,bindingDigest,lockDigest,commit,binding=>{
   if(digest(binding.reader)!==digest({...input.reader,registry}))throw new Error("Startup completion reservation differs");
   const result=finalizeStartupUpdate(input);
   if(result.commit!==commit)throw new Error("Startup completion commit changed");
   return {...result.reader,registry};
  },reader=>{
   const generations=new RuntimeGenerations(reader.registry);
   try {
    const {registry:unused,...recorded}=reader;
    if(!generations.retireStartupReader(recorded))throw new Error("Closed startup task still owns an update");
   }finally{generations.close();}
  });
  const generations=new RuntimeGenerations(registry);
  try {
   const receipt=generations.finalization(input.token,`startup-update:${digest(input.reader)}`);
   if(completed.reader.registry!==registry || !receipt || receipt.revision!==completed.reader.revision ||
     receipt.receipt.workspace!==realpathSync(input.before.workspace) || receipt.receipt.lockDigest!==digest(compiledRuntimeLock(parse(input.candidate))))
    throw new Error("Startup task completion differs from generation finalization");
  }finally{generations.close();}
  return completed;
 }finally{tasks.close();}
}
