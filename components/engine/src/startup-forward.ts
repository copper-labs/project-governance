import {lstatSync,mkdirSync,realpathSync} from "node:fs";
import {join} from "node:path";
import {digest,durableJson} from "./core.ts";
import {narrativeFile} from "./narrative-inputs.ts";
import {reserveStartupJournal,type StartupJournalRequest} from "./startup-journal.ts";
import {requireStoppedStartupUpdater,withStartupUpdateOwner} from "./startup-update-owner.ts";
import {inspectStartupRecovery,recoverCommittedStartupUpdate} from "./startup-recovery.ts";
import {inspectRuntimeGeneration} from "./runtime-inspection.ts";
import {runtimeLauncher} from "./runtime-launcher.ts";
import {commitStartupLock} from "./startup-commit.ts";
import {completeStartupUpdate} from "./startup-finalization.ts";
import {RuntimeGenerations} from "./runtime-generations.ts";
import {startupPolicy} from "./startup-policy.ts";
import {parse} from "yaml";

/** Explicit forward retry preserves post-write evidence and never reinstalls or resets HEAD. */
export async function retryStartupCommit(directory:string,originalCommandDigest:string,
 scope:{workspace:string;registry:string;receipts:string}) {
 directory=realpathSync(directory);
 const saved=JSON.parse(narrativeFile(directory,"startup.json")),request=saved.request as StartupJournalRequest;
 if(request.workspace!==realpathSync(scope.workspace) || request.registry!==realpathSync(scope.registry) || request.receipts!==realpathSync(scope.receipts))
  throw new Error("Startup retry differs from requested scope");
 const journal=reserveStartupJournal(directory,request);
 requireStoppedStartupUpdater(journal);
 const retryDirectory=join(directory,"retry"),retry={version:1,kind:"startup-forward-retry",requestDigest:journal.requestDigest,token:journal.token,originalCommandDigest};
 if(lstatSync(retryDirectory,{throwIfNoEntry:false})){
  if(realpathSync(retryDirectory)!==retryDirectory || digest(JSON.parse(narrativeFile(retryDirectory,"request.json")))!==digest(retry))
   throw new Error("Startup retry request differs");
  requireStoppedStartupUpdater({...journal,directory:retryDirectory});
  const commandDirectory=join(retryDirectory,"commit");
  if(!lstatSync(commandDirectory,{throwIfNoEntry:false}))return {status:"recovery-required" as const,reason:"retry-stopped-before-command",directory:retryDirectory};
  const command=JSON.parse(narrativeFile(commandDirectory,"request.json"));
  return recoverCommittedStartupUpdate(directory,{directory:commandDirectory,requestDigest:digest(command)},scope);
 }
 const assess=()=>inspectStartupRecovery(directory,{directory:join(directory,"commit"),requestDigest:originalCommandDigest});
 const assessed=assess();
 if(assessed.action==="complete-committed")return recoverCommittedStartupUpdate(directory,{directory:join(directory,"commit"),requestDigest:originalCommandDigest},scope);
 if(assessed.action!=="forward-repair")return {status:"recovery-required" as const,assessment:assessed};
 mkdirSync(retryDirectory,{mode:0o700});durableJson(join(retryDirectory,"request.json"),retry);
 return withStartupUpdateOwner({...journal,directory:retryDirectory},async()=>{
  const {registry:unused,...reader}=request.reader,owner=`startup-update:${digest(reader)}`,generations=new RuntimeGenerations(request.registry);
  try {
   const state=generations.state();
   if(state.maintenance?.token!==journal.token || state.maintenance.owner!==owner || state.readers.length || !state.written ||
    state.revision!==reader.revision+1 || state.directory!==request.candidateDirectory || state.previous!==reader.directory)
    throw new Error("Startup retry state changed before dispatch");
  }finally{generations.close();}
  const installed=inspectRuntimeGeneration(request.candidateDirectory),launcher=join(request.workspace,".governance/runtime/bin/project-governance");
  if(realpathSync(launcher)!==launcher || narrativeFile(request.workspace,launcher)!==runtimeLauncher(realpathSync(process.execPath),String(installed.executable),request.registry,request.workspace))
   throw new Error("Startup retry launcher differs from candidate");
  const settings=startupPolicy(parse(narrativeFile(request.workspace,"config/governance/profile.yaml")));
  const committed=await commitStartupLock({before:request.before,original:request.original,candidate:request.candidate,
   version:JSON.parse(request.candidate).version,directory:join(retryDirectory,"commit"),deadlineMs:Math.ceil(settings.install_seconds*1000),
   maintenance:{token:journal.token,owner,registry:request.registry,workspace:request.workspace}});
  if(committed.status!=="committed")return {status:"recovery-required" as const,directory:retryDirectory,command:committed.command};
  const result=completeStartupUpdate({registry:request.registry,token:journal.token,reader,before:request.before,
   original:request.original,candidate:request.candidate},request.receipts,request.task,request.bindingDigest);
  return {status:"updated" as const,commit:committed.commit,result,command:committed.command};
 });
}
