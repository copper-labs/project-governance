import {execFileSync} from "node:child_process";
import {lstatSync,realpathSync} from "node:fs";
import {join} from "node:path";
import {digest} from "./core.ts";
import {narrativeFile} from "./narrative-inputs.ts";
import {reserveStartupJournal,type StartupJournalRequest} from "./startup-journal.ts";
import {requireStoppedStartupUpdater} from "./startup-update-owner.ts";
import {assertStartupGitSnapshot,assertStartupGitTransition} from "./startup-git.ts";
import {RuntimeGenerations} from "./runtime-generations.ts";
import {StartupTasks} from "./startup-tasks.ts";
import {inspectRuntimeGeneration} from "./runtime-inspection.ts";
import {inspectRuntimeBackup} from "./runtime-backup-inspection.ts";
import {runtimeLauncher} from "./runtime-launcher.ts";
import {recoverPrewriteActivation} from "./runtime-recovery.ts";
import {inspectStartupRecovery} from "./startup-recovery.ts";
import {commandEnvironment} from "./process-owner.ts";
import {parse} from "yaml";
import {compiledRuntimeLock} from "./runtime-lock.ts";

/** Restore the prior installation only before writes; serialize recovery through the task ledger. */
export function restorePrewriteStartup(directory:string,scope:{workspace:string;registry:string;receipts:string}) {
 directory=realpathSync(directory);
 const saved=JSON.parse(narrativeFile(directory,"startup.json")),request=saved.request as StartupJournalRequest;
 if(request.workspace!==realpathSync(scope.workspace) || request.registry!==realpathSync(scope.registry) || request.receipts!==realpathSync(scope.receipts))
  throw new Error("Startup restoration differs from requested scope");
 const journal=reserveStartupJournal(directory,request),ownerProof=requireStoppedStartupUpdater(journal);
 const backup=inspectRuntimeBackup(join(directory,"backup")),{registry:unused,...reader}=request.reader;
 const owner=`startup-update:${digest(reader)}`;
 if(backup.maintenance.token!==journal.token || backup.maintenance.owner!==owner || backup.revision!==reader.revision || backup.generation!==reader.directory)
  throw new Error("Startup restoration backup identity differs");
 const restoration=digest({kind:"pre-write-recovery",workspace:request.workspace,backup:backup.receiptDigest,token:journal.token,owner});
 const original=inspectRuntimeGeneration(reader.directory),launcher=join(request.workspace,".governance/runtime/bin/project-governance");
 const originalLock=compiledRuntimeLock(parse(request.original));
 if(digest(originalLock)!==original.lockDigest)throw new Error("Original startup installation differs from lock");
 const verifyRestored=()=>{
  assertStartupGitSnapshot(request.before);
  if(narrativeFile(request.workspace,"config/governance/runtime.lock.yaml")!==request.original || realpathSync(launcher)!==launcher ||
   narrativeFile(request.workspace,launcher)!==runtimeLauncher(realpathSync(process.execPath),String(original.executable),request.registry,request.workspace))
   throw new Error("Restored startup files differ from original installation");
 };
 const generations=new RuntimeGenerations(request.registry),tasks=new StartupTasks(request.receipts);
 try {
  if(tasks.workspace(request.task)!==request.workspace)throw new Error("Startup restoration task scope differs");
  const result=tasks.cancelUpdate(request.task,request.bindingDigest,journal.token,(binding,closed)=>{
   if(digest(binding.reader)!==digest(request.reader))throw new Error("Startup restoration reservation differs");
   requireStoppedStartupUpdater(journal);
   const state=generations.state(),prior=generations.finalization(journal.token,owner);
   if(!prior){
    const lock=narrativeFile(request.workspace,"config/governance/runtime.lock.yaml");
    if(lock===request.original)assertStartupGitSnapshot(request.before);
    else if(lock===request.candidate)assertStartupGitTransition(request.before,request.original,request.candidate);
    else throw new Error("Startup lock changed independently");
    if(state.revision===reader.revision+1 && state.directory!==request.candidateDirectory)throw new Error("Startup candidate generation differs");
    const commandDirectory=join(directory,"commit");
    if(state.revision===reader.revision+1 && lstatSync(commandDirectory,{throwIfNoEntry:false})){
     const command=JSON.parse(narrativeFile(commandDirectory,"request.json"));
     if(inspectStartupRecovery(directory,{directory:commandDirectory,requestDigest:digest(command)}).action!=="restore-before-write")
      throw new Error("Startup commit outcome does not permit pre-write restoration");
    }
    recoverPrewriteActivation(request.registry,request.workspace,backup.directory,journal.token,owner,request.candidate);
    verifyRestored();
    const readback=execFileSync(launcher,["--version"],{cwd:request.workspace,encoding:"utf8",timeout:15000,maxBuffer:16384,
     env:{...commandEnvironment({}),GOVERNANCE_MAINTENANCE_PROBE:journal.token}}).trim();
    if(readback!==`project-governance ${originalLock.version}`)throw new Error("Restored startup version readback differs");
    verifyRestored();
   }else verifyRestored();
   const restored=generations.cancelStartupMaintenance(reader,journal.token,restoration);
   if(closed && !generations.retireStartupReader(restored))throw new Error("Startup restoration still owns maintenance");
   return {registry:request.registry,...restored};
  });
  verifyRestored();
  const finalization=generations.finalization(journal.token,owner),restored={...reader,revision:reader.revision+2};
  if(!finalization || finalization.revision!==restored.revision || digest(finalization.receipt)!==digest({kind:"startup-restored",reader:restored,previousReader:reader,restoration}))
   throw new Error("Startup restoration differs from generation finalization");
  return {status:"restored" as const,result,ownerProof};
 }finally{tasks.close();generations.close();}
}
