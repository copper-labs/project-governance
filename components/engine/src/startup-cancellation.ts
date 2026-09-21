import {lstatSync,realpathSync} from "node:fs";
import {join} from "node:path";
import {digest} from "./core.ts";
import {narrativeFile} from "./narrative-inputs.ts";
import {reserveStartupJournal,type StartupJournalRequest} from "./startup-journal.ts";
import {requireStoppedStartupUpdater} from "./startup-update-owner.ts";
import {assertStartupGitSnapshot} from "./startup-git.ts";
import {RuntimeGenerations} from "./runtime-generations.ts";
import {StartupTasks} from "./startup-tasks.ts";
import {inspectRuntimeGeneration} from "./runtime-inspection.ts";
import {runtimeLauncher} from "./runtime-launcher.ts";

/** No file restoration: cancel only a stopped updater that has not activated or submitted a commit. */
export function cancelUnactivatedStartup(directory:string,scope:{workspace:string;registry:string;receipts:string}) {
 directory=realpathSync(directory);
 const saved=JSON.parse(narrativeFile(directory,"startup.json")),request=saved.request as StartupJournalRequest;
 if(request.workspace!==realpathSync(scope.workspace) || request.registry!==realpathSync(scope.registry) || request.receipts!==realpathSync(scope.receipts))
  throw new Error("Startup cancellation differs from requested scope");
 const journal=reserveStartupJournal(directory,request),ownerProof=requireStoppedStartupUpdater(journal);
 if(lstatSync(join(directory,"commit"),{throwIfNoEntry:false}))throw new Error("Submitted startup commit requires command recovery");
 assertStartupGitSnapshot(request.before);
 if(narrativeFile(request.workspace,"config/governance/runtime.lock.yaml")!==request.original)throw new Error("Startup original lock changed");
 const original=inspectRuntimeGeneration(request.reader.directory);
 const launcher=join(request.workspace,".governance/runtime/bin/project-governance");
 if(realpathSync(launcher)!==launcher || narrativeFile(request.workspace,launcher)!==runtimeLauncher(realpathSync(process.execPath),String(original.executable),request.registry,request.workspace))
  throw new Error("Startup original launcher changed");
 const {registry:unused,...reader}=request.reader,generations=new RuntimeGenerations(request.registry),tasks=new StartupTasks(request.receipts);
 try {
  const state=generations.state();
  if(state.revision!==reader.revision || state.directory!==reader.directory)throw new Error("Startup cancellation requires the original generation");
  if(tasks.workspace(request.task)!==request.workspace)throw new Error("Startup cancellation task scope differs");
  const result=tasks.cancelUpdate(request.task,request.bindingDigest,journal.token,(binding,closed)=>{
   if(digest(binding.reader)!==digest(request.reader))throw new Error("Startup cancellation reservation differs");
   generations.cancelStartupMaintenance(reader,journal.token);
   if(closed && !generations.retireStartupReader(reader))throw new Error("Startup cancellation still owns maintenance");
  });
  const finalization=generations.finalization(journal.token,`startup-update:${digest(reader)}`);
  if(!finalization || finalization.revision!==reader.revision || digest(finalization.receipt)!==digest({kind:"startup-cancelled",reader}))
   throw new Error("Startup cancellation differs from generation finalization");
  return {status:"cancelled" as const,result,ownerProof};
 }finally{tasks.close();generations.close();}
}
