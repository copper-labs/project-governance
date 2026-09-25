import {recoverStartupObservation} from "./startup-observation-owner.ts";
import {parseArgs} from "node:util";
import {lstatSync,realpathSync} from "node:fs";
import {dirname,join} from "node:path";
import {narrativeFile} from "./narrative-inputs.ts";
import {recoverStartupOwner} from "./startup-owner-recovery.ts";
import {installStartupHooks} from "./startup-hook-installation.ts";
import {startupHooks} from "./startup-hooks.ts";
import {startupStatus} from "./startup-status.ts";
import {assessStartup} from "./startup-assessment.ts";
import {recoverCommittedStartupUpdate} from "./startup-recovery.ts";
import {prepareStartupCandidate} from "./startup-preparation.ts";
import {cancelUnactivatedStartup} from "./startup-cancellation.ts";
import {restorePrewriteStartup} from "./startup-restoration.ts";
import {retryStartupCommit} from "./startup-forward.ts";
import {applyPreparedStartup} from "./startup-application.ts";
import {startupObserveCommand} from "./startup-observe-command.ts";

/** Unresolved update recovery is actionable, not a successful CLI completion. */
export function startupExitCode(result: unknown): number {
 return result && typeof result === "object" && "status" in result && result.status === "recovery-required" ? 2 : 0;
}

function delegatedWorker(): boolean {
 return Boolean(process.env.HARNESS_AGENT_ANCESTRY || process.env.GOVERNANCE_PARENT_TASK || process.env.GOVERNANCE_PARENT_LOCK_DIGEST);
}

function startupHookConfiguration(workspace: string, receipts: string, install: boolean) {
 if(install)return installStartupHooks(workspace,receipts);
 const root=realpathSync(workspace),directory=join(root,".codex"),path=join(directory,"hooks.json");
 const parent=lstatSync(directory,{throwIfNoEntry:false});
 if(parent && (!parent.isDirectory() || realpathSync(directory)!==directory))throw new Error("Startup hook directory must be canonical");
 const entry=lstatSync(path,{throwIfNoEntry:false});
 if(entry && !entry.isFile())throw new Error("Startup hook configuration must be an ordinary file");
 return startupHooks(entry?JSON.parse(narrativeFile(root,path)):{},root,receipts);
}

/** Observation stays passive; application requires the native parent's explicit work assessment. */
export async function startupCommand(args:string[],scope?:{workspace:string;registry:string}) {
 if(!["observe","recover-observation","recover","recover-update","cancel-update","restore-update","retry-update","hooks","install-hooks","status","assess","prepare","apply"].includes(args[0]??""))throw new Error("Unsupported startup operation");
 const {values}=parseArgs({args:args.slice(1),strict:true,allowPositionals:false,options:{
  provider:{type:"string"},"event-file":{type:"string"},"event-stdin":{type:"boolean"},workspace:{type:"string"},registry:{type:"string"},receipts:{type:"string"},
  task:{type:"string"},"binding-digest":{type:"string"},authority:{type:"string"},"work-state":{type:"string"},reason:{type:"string"},
  "operation-directory":{type:"string"},"command-digest":{type:"string"},"observation-token":{type:"string"}
 }});
 // A tracked hook has no checkout-specific path. Its ignored launcher fixes the registry,
 // and a native Codex observation uses that registry's private receipt store.
 if(scope && args[0]==="observe" && values.provider==="codex" && values["event-stdin"] && !values.receipts)
  values.receipts=join(dirname(scope.registry),"startup.sqlite");
 if(!values.receipts || (!scope && (!values.workspace || !values.registry)) ||
   (args[0]==="observe" && (!values.provider || Boolean(values["event-file"])===Boolean(values["event-stdin"]))))
  throw new Error("Startup provider, event, workspace, registry and receipts required");
 if(process.env.GOVERNANCE_MAINTENANCE_PROBE)throw new Error("Maintenance probe permits version readback only");
 const workspace=scope?.workspace??values.workspace!,registry=scope?.registry??values.registry!;
 if(scope && args[0]==="observe" && values.provider==="codex" && values["event-stdin"] &&
   values.receipts!==join(dirname(registry),"startup.sqlite"))
  throw new Error("Native Codex observations require this worktree's default startup receipt store");
 if(scope && ((values.workspace && realpathSync(values.workspace)!==realpathSync(scope.workspace)) ||
   (values.registry && realpathSync(values.registry)!==realpathSync(scope.registry))))throw new Error("Startup invocation differs from launcher scope");
 if(args[0]==="recover-observation") {
  if(!values["observation-token"] || !values.authority || values.task || values.provider || values["event-file"] || values["event-stdin"] ||
    values["binding-digest"] || values["work-state"] || values.reason || values["operation-directory"] || values["command-digest"])
   throw new Error("Observation recovery requires only token, authority and receipt scope");
  if(delegatedWorker())
   throw new Error("Delegated workers cannot recover startup observations");
  return recoverStartupObservation(workspace,registry,values["observation-token"],values.authority);
 }
 if(values["observation-token"])throw new Error("Observation token requires recover-observation");
 if(args[0]==="prepare" || args[0]==="apply") {
  if(!values.task || !values["work-state"] || !values.reason || !values["operation-directory"] || values.provider || values["event-file"] ||
   values["event-stdin"] || values["binding-digest"] || values.authority || values["command-digest"])throw new Error("Startup preparation requires task, work assessment and operation directory");
  const token=process.env.GH_TOKEN||process.env.GITHUB_TOKEN;
  const operation=args[0]==="apply"?applyPreparedStartup:prepareStartupCandidate;
  return operation({workspace,registry,receipts:values.receipts,task:values.task,workState:values["work-state"],reason:values.reason,
   directory:values["operation-directory"]},token?{token}:{});
 }
 if(args[0]==="recover-update" || args[0]==="cancel-update" || args[0]==="restore-update" || args[0]==="retry-update") {
  const cancel=args[0]==="cancel-update" || args[0]==="restore-update";
  if(!values["operation-directory"] || (cancel?Boolean(values["command-digest"]):!values["command-digest"]) || values.task || values.provider || values["event-file"] || values["event-stdin"] ||
   values["binding-digest"] || values.authority || values["work-state"] || values.reason)throw new Error(cancel?
    "Startup cancellation requires only operation directory and receipt scope":"Startup update recovery requires operation directory and command digest");
  if(delegatedWorker())
   throw new Error("Delegated workers cannot recover startup updates");
  const directory=realpathSync(values["operation-directory"]);
  if(args[0]==="retry-update")return retryStartupCommit(directory,values["command-digest"]!,{workspace,registry,receipts:values.receipts});
  if(args[0]==="restore-update")return restorePrewriteStartup(directory,{workspace,registry,receipts:values.receipts});
  if(cancel)return cancelUnactivatedStartup(directory,{workspace,registry,receipts:values.receipts});
  return recoverCommittedStartupUpdate(directory,{directory:join(directory,"commit"),requestDigest:values["command-digest"]!},{workspace,registry,receipts:values.receipts});
 }
 if(values["operation-directory"] || values["command-digest"])throw new Error("Update recovery arguments require startup recover-update");
 if(args[0]==="assess") {
  if(!values.task || !values["work-state"] || !values.reason || values.provider || values["event-file"] || values["event-stdin"] || values["binding-digest"] || values.authority)
   throw new Error("Startup assessment requires task, work state and reason");
  return assessStartup({workspace,registry,receipts:values.receipts,task:values.task,workState:values["work-state"],reason:values.reason});
 }
 if(values["work-state"] || values.reason)throw new Error("Assessment arguments require startup assess");
 if(args[0]==="status") {
  if(!values.task || values.provider || values["event-file"] || values["event-stdin"] || values["binding-digest"] || values.authority)
   throw new Error("Startup status requires only a task and receipt scope");
  return startupStatus(values.receipts,values.task,{workspace,registry});
 }
 if(args[0]==="hooks" || args[0]==="install-hooks") {
  if(values.provider || values["event-file"] || values["event-stdin"] || values.task || values["binding-digest"] || values.authority)
   throw new Error("Startup hook proposal accepts only workspace, registry and receipts");
  if(values.receipts!==join(dirname(registry),"startup.sqlite"))
   throw new Error("Managed Codex hooks require the receipt store next to this worktree's installation registry");
  return startupHookConfiguration(workspace,values.receipts,args[0]==="install-hooks");
 }
 if(args[0]==="recover") {
  if(values.provider || values["event-file"] || values["event-stdin"] || !values.task || !values["binding-digest"] || !values.authority)
   throw new Error("Startup recovery task, binding digest and authority required");
  if(delegatedWorker())
   throw new Error("Delegated workers cannot recover parent startup reservations");
  return recoverStartupOwner(values.receipts,values.task,values["binding-digest"],values.authority,{workspace,registry});
 }
 if(values.task || values["binding-digest"] || values.authority)throw new Error("Recovery arguments cannot be used for observation");
 return startupObserveCommand({provider:values.provider!,eventFile:values["event-file"],eventStdin:Boolean(values["event-stdin"]),
  workspace,registry,receipts:values.receipts,installedScope:Boolean(scope)});
}
