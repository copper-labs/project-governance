import {execFileSync} from "node:child_process";
import {lstatSync,realpathSync} from "node:fs";
import {join} from "node:path";
import {digest,durableJson} from "./core.ts";
import {narrativeFile} from "./narrative-inputs.ts";
import {reserveStartupJournal,type StartupJournalRequest} from "./startup-journal.ts";
import {RuntimeGenerations} from "./runtime-generations.ts";
import {observeCommand} from "./process-owner.ts";
import {assertStartupGitSnapshot,assertStartupGitTransition} from "./startup-git.ts";
import {completeStartupUpdate} from "./startup-finalization.ts";
import {requireStoppedStartupUpdater} from "./startup-update-owner.ts";

/** Inspect evidence without restoring files, releasing ownership, or repeating a command. */
export function inspectStartupRecovery(directory:string,command:{directory:string;requestDigest:string}) {
 directory=realpathSync(directory);
 const saved=JSON.parse(narrativeFile(directory,"startup.json")),request=saved.request as StartupJournalRequest;
 const journal=reserveStartupJournal(directory,request);
 const commandDirectory=realpathSync(command.directory),retryDirectory=join(directory,"retry");
 if(commandDirectory!==join(directory,"commit") && commandDirectory!==join(retryDirectory,"commit"))throw new Error("Startup recovery command scope differs");
 const boundCommand=(path:string,expected:string)=>{
  const recorded=JSON.parse(narrativeFile(path,"request.json"));
  if(recorded.version!==1 || digest(recorded)!==expected || recorded.operation?.cwd!==request.workspace ||
   !Array.isArray(recorded.operation?.argv) || !recorded.operation.argv[0]?.startsWith("/") ||
   digest(recorded.operation.argv.slice(1))!==digest(["commit","--only","--file","-","--",":(literal)config/governance/runtime.lock.yaml"]))
   throw new Error("Startup recovery command identity differs");
  return observeCommand(path,expected);
 };
 if(lstatSync(retryDirectory,{throwIfNoEntry:false})){
  const retry=JSON.parse(narrativeFile(retryDirectory,"request.json"));
  if(retry.version!==1 || retry.kind!=="startup-forward-retry" || retry.requestDigest!==journal.requestDigest || retry.token!==journal.token)
   throw new Error("Startup retry identity differs");
  requireStoppedStartupUpdater({...journal,directory:retryDirectory});
  const previous=boundCommand(join(directory,"commit"),retry.originalCommandDigest);
  if(previous.receipt?.cleanup!=="confirmed")return {action:"retain-maintenance" as const,reason:"original-command-cleanup-unconfirmed",observation:previous};
  const retryCommand=join(retryDirectory,"commit");
  if(lstatSync(retryCommand,{throwIfNoEntry:false})){
   const retryRequest=JSON.parse(narrativeFile(retryCommand,"request.json")),observed=boundCommand(retryCommand,digest(retryRequest));
   if(observed.receipt?.cleanup!=="confirmed")return {action:"retain-maintenance" as const,reason:"retry-command-cleanup-unconfirmed",observation:observed};
  }
 }
 const observation=boundCommand(commandDirectory,command.requestDigest);
 if(!observation.receipt || observation.receipt.cleanup!=="confirmed")return {action:"retain-maintenance" as const,reason:"commit-process-cleanup-unconfirmed",observation};
 const registry=new RuntimeGenerations(request.registry);
 try {
  const state=registry.state(),{registry:unused,...reader}=request.reader,owner=`startup-update:${digest(reader)}`;
  const head=execFileSync("git",["rev-parse","HEAD"],{cwd:request.workspace,encoding:"utf8",timeout:5000,maxBuffer:1024,stdio:["ignore","pipe","pipe"]}).trim();
  if(head!==request.before.head){
   const completed=registry.finalization(journal.token,owner);
   if(state.revision!==reader.revision+1 || state.directory!==request.candidateDirectory || state.previous!==reader.directory ||
     (completed?Boolean(state.maintenance):state.maintenance?.token!==journal.token || state.maintenance.owner!==owner || Boolean(state.readers.length)))
    throw new Error("Committed startup recovery generation or ownership differs");
   const commit=assertStartupGitTransition(request.before,request.original,request.candidate,true);
   return {action:"complete-committed" as const,commit,token:journal.token,commandReceipt:observation.receipt};
  }
  if(state.maintenance?.token!==journal.token || state.maintenance.owner!==owner || state.readers.length)
   throw new Error("Startup recovery requires exact drained maintenance");
  const lock=narrativeFile(request.workspace,"config/governance/runtime.lock.yaml");
  if(lock===request.original)assertStartupGitSnapshot(request.before);
  else if(lock===request.candidate)assertStartupGitTransition(request.before,request.original,request.candidate);
  else throw new Error("Startup recovery lock changed independently");
  if(state.revision===reader.revision && state.directory===reader.directory)
   return {action:"cancel-before-activation" as const,token:journal.token,commandReceipt:observation.receipt};
  if(state.revision!==reader.revision+1 || state.directory!==request.candidateDirectory || state.previous!==reader.directory)
   throw new Error("Startup recovery generation differs");
  return {action:state.written?"forward-repair" as const:"restore-before-write" as const,token:journal.token,commandReceipt:observation.receipt};
 }finally{registry.close();}
}

/** Follow an already committed lock; this path never creates, amends or resets a commit. */
export function recoverCommittedStartupUpdate(directory:string,command:{directory:string;requestDigest:string},
 scope:{workspace:string;registry:string;receipts:string}) {
 directory=realpathSync(directory);
 const saved=JSON.parse(narrativeFile(directory,"startup.json")),request=saved.request as StartupJournalRequest;
 if(request.workspace!==realpathSync(scope.workspace) || request.registry!==realpathSync(scope.registry) || request.receipts!==realpathSync(scope.receipts))
  throw new Error("Startup recovery differs from requested scope");
 if(lstatSync(join(directory,"updater"),{throwIfNoEntry:false}))
  requireStoppedStartupUpdater({directory,requestDigest:saved.requestDigest,token:saved.token});
 const assessed=inspectStartupRecovery(directory,command);
 if(assessed.action!=="complete-committed")return {status:"recovery-required" as const,assessment:assessed};
 const {registry:unused,...reader}=request.reader;
 const result=completeStartupUpdate({registry:request.registry,token:assessed.token,reader,before:request.before,
  original:request.original,candidate:request.candidate},request.receipts,request.task,request.bindingDigest);
 const receipt={version:1,kind:"startup-committed-recovery",requestDigest:saved.requestDigest,
  commandDigest:command.requestDigest,commit:assessed.commit,result};
 const path=join(directory,"recovered.json");
 if(lstatSync(path,{throwIfNoEntry:false})){
  if(digest(JSON.parse(narrativeFile(directory,path)))!==digest(receipt))throw new Error("Existing startup recovery receipt differs");
 }else durableJson(path,receipt);
 return {status:"recovered" as const,...receipt};
}
