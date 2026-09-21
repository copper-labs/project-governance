import {lstatSync,realpathSync} from "node:fs";
import {join} from "node:path";
import {digest,durableJson} from "./core.ts";
import {narrativeFile} from "./narrative-inputs.ts";
import {prepareStartupCandidate} from "./startup-preparation.ts";
import {assessStartup} from "./startup-assessment.ts";
import {RuntimeGenerations} from "./runtime-generations.ts";
import {backupRuntimeOperation} from "./runtime-backup-operation.ts";
import {prepareRuntimeTransition} from "./runtime-transition.ts";
import {commitStartupLock} from "./startup-commit.ts";
import {completeStartupUpdate} from "./startup-finalization.ts";
import {reserveStartupJournal,type StartupJournalRequest} from "./startup-journal.ts";
import {recoverCommittedStartupUpdate} from "./startup-recovery.ts";
import {withStartupUpdateOwner} from "./startup-update-owner.ts";
import {startupDeadline} from "./startup-deadline.ts";

/** Apply a revalidated prepared candidate. Failures retain the exact journal and maintenance owner. */
export async function applyPreparedStartup(input:Parameters<typeof prepareStartupCandidate>[0],
 options:Parameters<typeof prepareStartupCandidate>[1]={}) {
 const completedPath=join(input.directory,"completed.json");
 if(lstatSync(completedPath,{throwIfNoEntry:false})){
  const directory=realpathSync(input.directory),saved=JSON.parse(narrativeFile(directory,"request.json"));
  if(saved.workspace!==realpathSync(input.workspace) || saved.registry!==realpathSync(input.registry) || saved.receipts!==realpathSync(input.receipts) ||
    saved.task!==input.task || saved.assessment?.workState!==input.workState || saved.assessment?.reason!==input.reason)
   throw new Error("Completed startup request differs");
  const assessment=assessStartup(input,options?.environment,options?.capture);
  if(assessment.status!=="preparation-required")return assessment;
  const journalDirectory=join(directory,"operation"),commandDirectory=join(journalDirectory,"commit");
  const commandDigest=digest(JSON.parse(narrativeFile(commandDirectory,"request.json")));
  const recovered=recoverCommittedStartupUpdate(journalDirectory,{directory:commandDirectory,requestDigest:commandDigest},input);
  if(recovered.status!=="recovered")return recovered;
  const completed={status:"updated" as const,directory:journalDirectory,commit:recovered.commit,result:recovered.result};
  if(digest(JSON.parse(narrativeFile(directory,"completed.json")))!==digest(completed))throw new Error("Completed startup receipt differs");
  return completed;
 }
 const prepared=await prepareStartupCandidate(input,options);
 if(prepared.status!=="prepared")return prepared;
 const saved=JSON.parse(narrativeFile(prepared.directory,"request.json"));
 const deadline=startupDeadline(prepared.directory,prepared.requestDigest,saved.assessment.settings.install_seconds);
 const journalValue=JSON.parse(narrativeFile(prepared.directory,prepared.journal)),request=journalValue.request as StartupJournalRequest;
 const journal=reserveStartupJournal(realpathSync(join(prepared.directory,"operation")),request);
 const validate=()=>{
  deadline.remaining();
  const current=assessStartup(input,options?.environment,options?.capture);
  if(digest(current)!==digest(saved.assessment))throw new Error("Startup scope changed before activation");
  deadline.remaining();
 };
 return withStartupUpdateOwner(journal,async()=>{
 validate();
 const {registry:unused,...reader}=request.reader,generations=new RuntimeGenerations(request.registry);
 let maintenance;
 try{maintenance=generations.beginStartupMaintenance(reader,journal.token);}finally{generations.close();}
 const inputs=[{path:join(request.workspace,"config/governance/runtime.lock.yaml"),kind:"file" as const},
  {path:join(request.workspace,".governance/runtime/bin/project-governance"),kind:"file" as const}];
 const backup=await backupRuntimeOperation(request.registry,maintenance.token,maintenance.owner,inputs,join(journal.directory,"backup"),validate);
 validate();
 prepareRuntimeTransition(request.registry,request.workspace,request.candidateDirectory,backup.directory,inputs,
  maintenance.token,maintenance.owner,request.candidate);
 const committed=await commitStartupLock({before:request.before,original:request.original,candidate:request.candidate,
  version:JSON.parse(request.candidate).version,directory:join(journal.directory,"commit"),deadlineMs:deadline.remaining(),
  maintenance:{token:maintenance.token,owner:maintenance.owner,workspace:request.workspace,registry:request.registry}});
 if(committed.status!=="committed")return {status:"recovery-required" as const,directory:journal.directory,command:committed.command};
 const result=completeStartupUpdate({registry:request.registry,token:maintenance.token,reader,before:request.before,
  original:request.original,candidate:request.candidate,deadline},request.receipts,request.task,request.bindingDigest);
 const completed={status:"updated" as const,directory:journal.directory,commit:committed.commit,result};
 durableJson(join(prepared.directory,"completed.json"),completed);
 return completed;
 });
}
