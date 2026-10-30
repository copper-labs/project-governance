import { existsSync, realpathSync, statSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { digest, fileDigest, object } from "./core.ts";
import { narrativeFile } from "./narrative-inputs.ts";
import { commandProcesses, recordedCommandMembers, hasConfirmedCommandCleanup } from "./command-owner-recovery.ts";
import { observeCommand, type CommandRequest } from "./process-owner.ts";
import { isLocalMachine } from "./machine-identity.ts";
import { validateOriginalWorkflowCommand } from "./workflow-operation.ts";
import { qualifiedWorkflowCommandCleanup } from "./workflow-command-cleanup.ts";
import { startTime } from "./workflow-reader-recovery.ts";
import type { WorkflowRun, WorkflowStage } from "./workflow-store.ts";

/** Host-owned reports supplement original native evidence; they never supply executable instructions. */
export function workflowNativeResourceEvidence(directory: string, run: WorkflowRun, stages: WorkflowStage[], originalNativeClosure=false) {
  const files = new Map<string,string>(), identities = new Map<number,string>(), groups: number[] = [];
  const absentMemberships:string[]=[];
  const read = (path: string) => { const text = narrativeFile(directory,path); files.set(path,"sha256:"+createHash("sha256").update(text).digest("hex")); return object(JSON.parse(text)); };
  const identify = (value: unknown) => {
    const id = object(value,"original process identity");
    if (!Number.isSafeInteger(id.pid) || Number(id.pid) < 2 || startTime(typeof id.fingerprint === "string" ? id.fingerprint.trim() : null) === null)
      throw new Error("Original process identity unavailable");
    const pid = Number(id.pid), fingerprint = String(id.fingerprint).trim();
    if (identities.has(pid) && identities.get(pid) !== fingerprint) throw new Error("Original process identities conflict");
    identities.set(pid,fingerprint);
  };
  const commands: Array<Record<string,unknown>> = [], windows: Array<{start:number;end:number;ids:Map<number,string>}> = [];
  for (let index=0;index<run.binding.recipe.stages.length;index++) {
    const spec=run.binding.recipe.stages[index]!, stage=stages.find(value=>value.id===spec.id)!;
    if (!stage || ["pending","running","unknown"].includes(stage.state)) throw new Error("Command effects remain unresolved");
    const command=join(directory,"commands",`${run.id}-${index}`);
    if (!stage.result) {
      if (stage.state !== "blocked" && stage.state !== "cancelled") throw new Error("Original command result missing");
      try { statSync(join(command,"request.json")); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") continue; throw error; }
      throw new Error("Unstarted stage has a retained command");
    }
    const request=read(join(command,"request.json")) as unknown as CommandRequest;
    if(realpathSync(command)!==command)throw new Error("Original command directory uses an alias");
    validateOriginalWorkflowCommand(request,run.binding.recipe,run.id,spec,join(directory,"commands"));
    const requestDigest=digest(request), rawReceipt=observeCommand(command,requestDigest).receipt;
    const originalReceipt=read(join(command,"result.json"));
    const qualified=rawReceipt?qualifiedWorkflowCommandCleanup(command,rawReceipt,run.binding.recipe.operations[spec.operation]!.expectedExitCodes):null;
    const receipt=qualified?.receipt;
    if (!receipt || !rawReceipt || digest(originalReceipt)!==digest(rawReceipt) || receipt.state === "unknown" || !hasConfirmedCommandCleanup(command,rawReceipt) ||
        receipt.runtimeVersion!==request.executionIdentity?.runtimeVersion || receipt.archiveDigest!==request.executionIdentity?.archiveDigest ||
        stage.result.cleanup!=="confirmed" || stage.result.exitCode!==receipt.exitCode || stage.result.startedAt!==receipt.startedAt ||
        stage.result.endedAt!==receipt.endedAt || stage.result.log!==receipt.log) throw new Error("Original confirmed native cleanup differs");
    if(qualified?.recovery){
      if(digest(stage.result.cleanupRecovery??null)!==digest(qualified.recovery)||
         stage.result.state!==receipt.state&&!(receipt.state==="succeeded"&&stage.result.state==="failed"&&stage.result.inputValidity==="stale"))
        throw new Error("Original workflow recovered cleanup binding differs");
      const recoveryPath=join(command,"owner-recovery.json");read(recoveryPath);
      if(files.get(recoveryPath)!==qualified.recovery.recoveryDigest)throw Error("Original recovered cleanup evidence changed");
    }
    const owner=read(join(command,"owner.json")), guardian=read(join(command,"guardian.json")), launch=read(join(command,"launch.json"));
    if (owner.requestDigest!==requestDigest || guardian.version!==1 || guardian.requestDigest!==requestDigest ||
        launch.version!==1 || launch.requestDigest!==requestDigest || launch.state!=="spawned" || !isLocalMachine(launch) ||
        digest(launch.owner)!==digest({pid:owner.pid,fingerprint:owner.fingerprint})) throw new Error("Original command ownership differs");
    const child=object(launch.child);
    if (child.processGroup!==child.pid) throw new Error("Original command process group differs");
    const previousIds=new Set(identities.keys());
    identify(owner); identify(guardian); identify(child); groups.push(Number(child.processGroup));
    const members=recordedCommandMembers(command,requestDigest,child.processGroup);
    if (!members.digest) {
      // Fast commands can finish before the first telemetry sample. Only this explicit observation
      // adapter may rely on the original native supervisor's confirmed cleanup, never owner-loss inference.
      if(!originalNativeClosure || rawReceipt.cleanup!=="confirmed" || rawReceipt.state==="unknown" || qualified?.recovery)throw new Error("Original process membership missing");
      absentMemberships.push(join(command,"group-members.json"));
    } else {
      const membership=read(join(command,"group-members.json"));
      for (const member of membership.members as unknown[]) identify(member);
    }
    const start=Date.parse(receipt.startedAt),end=Date.parse(receipt.endedAt);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start>end) throw new Error("Original native execution window unavailable");
    windows.push({start,end,ids:new Map([...identities].filter(([pid])=>!previousIds.has(pid)))});
    commands.push({stage:stage.id,requestDigest,receiptDigest:digest(originalReceipt),launchDigest:digest(launch),membersDigest:members.digest,
      ...(qualified?.recovery?{cleanupRecovery:qualified.recovery}:{}),
      ...(!members.digest?{closureAuthority:"original-confirmed-native-receipt",membershipHistory:"not-recorded"}:{})});
  }
  const assertCurrent=()=>{
    for (const [path,expectedDigest] of files) if (fileDigest(path)!==expectedDigest) throw new Error("Original cleanup evidence changed");
    if(absentMemberships.some(path=>existsSync(path)))throw new Error("Original process membership evidence changed");
    const processes=commandProcesses();
    if (processes.some(process=>identities.has(process.pid) || groups.includes(process.group))) throw new Error("Original command owner or process group still present or PID reused");
  };
  return {commands,windows,identities,files,identify,assertCurrent};
}

/** Local producer reports remain bound to their original execution window and process membership. */
export function workflowResourceEvidence(directory: string, run: WorkflowRun, stages: WorkflowStage[], evidence: string, expected: string) {
  return localReportEvidence(directory,run,stages,evidence,expected,true);
}

/** Explicit approved recovery records a missing historical join; ordinary reports still require it. */
export function workflowObservedResourceEvidence(directory: string, run: WorkflowRun, stages: WorkflowStage[], evidence: string, expected: string) {
  return localReportEvidence(directory,run,stages,evidence,expected,false);
}

function localReportEvidence(directory: string, run: WorkflowRun, stages: WorkflowStage[], evidence: string, expected: string, requireJoin: boolean) {
  const {commands,windows,identities,files,identify,assertCurrent:nativeCurrent}=workflowNativeResourceEvidence(directory,run,stages);
  if(!requireJoin){
    const worker=join(directory,"owner.json"),raw=narrativeFile(directory,worker);
    identify(JSON.parse(raw));files.set(worker,"sha256:"+createHash("sha256").update(raw).digest("hex"));
  }
  evidence=realpathSync(evidence);
  const raw=narrativeFile(directory,evidence), evidenceDigest="sha256:"+createHash("sha256").update(raw).digest("hex");
  if (!/^sha256:[a-f0-9]{64}$/u.test(expected) || evidenceDigest!==expected) throw new Error("Selected owner evidence digest differs");
  const report=object(JSON.parse(raw)), closure=object(report.processClosure), after=object(closure.after);
  if(!requireJoin&&report.status!=="failed")throw Error("Observed local recovery requires an original failed report");
  if (report.childStarted!==true || !["passed","failed","cancelled"].includes(String(report.status)) || closure.closed!==true ||
      !Array.isArray(after.group) || after.group.length || !Array.isArray(after.observedTree) || after.observedTree.length ||
      report.legacyLockReleased!==undefined && report.legacyLockReleased!==true) throw new Error("Owner cleanup remains unresolved");
  const ended=Number(report.ended)*1000, modified=statSync(evidence).mtimeMs, recorded=object(report.observedProcessIdentities);
  const entries=Object.entries(recorded);
  if (!entries.length || entries.length>4096 || typeof report.ended!=="number" || !Number.isFinite(ended) || !windows.some(window =>
      ended>=window.start && ended<=window.end && modified>=window.start && modified<=window.end)) throw new Error("Owner evidence is stale or belongs to another command");
  const joined=windows.some(window=>ended>=window.start && ended<=window.end && modified>=window.start && modified<=window.end &&
    entries.some(([pid,fp])=>window.ids.get(Number(pid))===String(fp).trim()));
  if(requireJoin&&!joined)throw new Error("Owner evidence is stale or belongs to another command");
  if(!requireJoin&&joined)throw new Error("Original identity join exists; use ordinary local-host cleanup");
  for (const [pid,fingerprint] of entries) { if (!/^[1-9]\d*$/u.test(pid)) throw new Error("Invalid owner process identity"); identify({pid:Number(pid),fingerprint}); }
  files.set(evidence,evidenceDigest);
  const assertCurrent=()=>{
    nativeCurrent();
    if(statSync(evidence).mtimeMs!==modified)throw new Error("Owner cleanup evidence metadata changed");
  };
  assertCurrent();
  return { proof:{commands,evidence:{path:evidence,digest:evidenceDigest,modifiedAt:modified},identitiesDigest:digest([...identities]),stagesDigest:digest(stages),
    ...(!requireJoin?{historicalProcessJoin:"missing"}:{} )},assertCurrent };
}
