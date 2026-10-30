import type { AndroidOwnedSessionProbes } from "./android-owned-app-session.ts";
import { androidAppSessionEvidence } from "./android-app-session-cleanup.ts";
import { assertAndroidAppSession, type AndroidAppProbe } from "./android-app-session.ts";
import { parseArgs } from "node:util";
import { existsSync, realpathSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { digest, object } from "./core.ts";
import { narrativeFile } from "./narrative-inputs.ts";
import { ResourceRegistry } from "./resources.ts";
import { RuntimeGenerations } from "./runtime-generations.ts";
import { WorkflowStore } from "./workflow-store.ts";
import { workflowRecoveryIdentity } from "./workflow-reader-recovery.ts";
import { commandProcesses } from "./command-owner-recovery.ts";
import { workflowResourceEvidence, workflowObservedResourceEvidence } from "./workflow-resource-evidence.ts";
import { observedLocalRequest } from "./workflow-local-host-observation.ts";
import { preserveWorkflowReleaseReceipt } from "./workflow-release-receipt.ts";
import { iosObservationClaims, iosObservationEvidence, type IosObservationProbes } from "./ios-observation-cleanup.ts";
import { simulatorBuildClaims, simulatorBuildEvidence, type SimulatorBuildProbes } from "./simulator-build-cleanup.ts";
import type { WorkflowCleanupReceipt } from "./workflow-resource-recovery.ts";

/** Public trusted-local-owner surface; evidence can retire old claims, never authorize new work. */
function prepareResourceRelease(args: string[], workspace: string, kind: "local-host"|"local-host-observed"|"ios-observation"|"ios-simulator-build"|"android-app-session", approvedScopeDigest?:string) {
  const local=kind==="local-host"||kind==="local-host-observed";
  const names=["database","run","revision","worker-directory","registry","authority","kind","evidence","evidence-digest","receipt",...(!local&&kind!=="android-app-session"?["local-resource","lock-directory"]:[]),...(kind==="ios-simulator-build"?["simulator-lock-directory"]:[])];
  const {values}=parseArgs({args,strict:true,allowPositionals:false,options:Object.fromEntries(names.map(key=>[key,{type:"string" as const}]))});
  if (names.some(key=>!values[key]) || values.kind!==kind || !/^\d+$/u.test(values.revision!) ||
      !Number.isSafeInteger(Number(values.revision))) throw new Error("Complete original workflow, revision, owner adapter and evidence binding required");
  const database=realpathSync(values.database!), directory=realpathSync(values["worker-directory"]!), registryPath=realpathSync(values.registry!);
  if (!statSync(database).isFile() || !statSync(registryPath).isFile()) throw new Error("Existing original stores required");
  const request=object(JSON.parse(narrativeFile(directory,"request.json")));
  if (realpathSync(String(request.database))!==database || realpathSync(String(request.registry))!==registryPath ||
      request.commandsDirectory!==join(directory,"commands") || !/^sha256:[a-f0-9]{64}$/u.test(String(request.workerDigest)))
    throw new Error("Original workflow request scope differs");
  const store=new WorkflowStore(database), registry=new ResourceRegistry(registryPath);
  try {
    const run=store.read(values.run!), stages=store.stages(run.id), expectedRevision=Number(values.revision);
    if (!run.owner || !["unknown","reconciling","succeeded","failed","cancelled"].includes(run.state) || run.revision!==expectedRevision ||
        realpathSync(run.binding.recipe.workspace)!==realpathSync(workspace) || values.authority!==run.binding.authorityRef)
      throw new Error("Original resource owner, workflow revision or workspace differs");
    if (kind==="android-app-session") {assertAndroidAppSession(run.binding.recipe);if(!run.binding.recipe.androidAppSession)throw Error("Original Android app-session descriptor required");}
    if (kind==="ios-simulator-build") simulatorBuildClaims(run.binding.recipe,values["local-resource"]!);
    if (kind==="ios-observation") iosObservationClaims(run.binding.recipe,values["local-resource"]!);
    if (local && (run.binding.recipe.androidEmulator || run.binding.recipe.androidAppSession || run.binding.recipe.resources.some(resource=>
        resource.startsWith("workspace-v1:") && JSON.parse(resource.slice("workspace-v1:".length)).session!==null ||
        /^(?:ios-|android[:-]|app:|simulator:|emulator:|device:|tcp:|port:|metro:|service:|remote:)/u.test(resource))))
      throw new Error("Device, network or remote custody requires its qualified resource adapter");
    if (stages.some(stage=>["pending","running","unknown"].includes(stage.state) || stage.result?.cleanup==="unknown"))
      throw new Error("Command effects remain unresolved");
    const identity=workflowRecoveryIdentity(directory,database,run), leases=registry.originalLeases(run.id,run.owner);
    if (digest(leases.map(lease=>lease.resource).sort())!==digest([...run.binding.recipe.resources].sort())) throw new Error("Original lease scope differs");
    const receiptPath=resolve(values.receipt!), bindingDigest=digest(run.binding), workerRequestDigest=digest(identity.request);
    const observationKind=kind==="local-host-observed"?"workflow-local-host-observed-cleanup":kind==="android-app-session"?"workflow-android-app-session-cleanup":kind==="local-host"?"workflow-local-host-cleanup":kind==="ios-observation"?"workflow-ios-observation-cleanup":"workflow-ios-simulator-build-cleanup";
    const scopeDigest=approvedScopeDigest??(kind==="android-app-session"?digest(run.binding.recipe.androidAppSession):kind==="local-host"?null:digest({localResource:values["local-resource"],lockDirectory:values["lock-directory"],...(kind==="ios-simulator-build"?{simulatorLockDirectory:values["simulator-lock-directory"]}:{})}));
    const validate=(receipt: WorkflowCleanupReceipt) => {
      const observation=object(receipt.observation,"resource owner observation");
      if (receipt.runId!==run.id || receipt.bindingDigest!==bindingDigest || digest(receipt.leases)!==digest(leases) ||
          observation.kind!==observationKind || observation.version!==1 || observation.authority!==values.authority ||
          observation.workerRequestDigest!==workerRequestDigest || (kind==="local-host"?object(object(observation.proof).evidence):object(object(object(observation.proof).original).evidence)).digest!==values["evidence-digest"] ||
          kind!=="local-host" && observation.scopeDigest!==scopeDigest)
        throw new Error("Original release receipt binding differs");
      return observation;
    };
    const response=(receipt: WorkflowCleanupReceipt,replayed: boolean)=>({state:"released",runId:run.id,revision:run.revision,
      workflowState:run.state,receipt:receiptPath,receiptDigest:digest(receipt),replayed});
    let replay: ReturnType<typeof response> | null=null;
    if (existsSync(receiptPath)) {
      const prior=JSON.parse(narrativeFile(dirname(receiptPath),receiptPath)) as WorkflowCleanupReceipt; validate(prior);
      if (registry.hasRelease(prior.leases,digest(prior))) replay=response(prior,true);
    }
    const snapshot=digest({run,stages,cleanupWorker:store.cleanupWorker(run.id)});
    const assertOwnerAbsent=()=>{
      identity.assertAbsent();
      const cleanupWorker=store.cleanupWorker(run.id);
      if(cleanupWorker && commandProcesses().some(process=>process.pid===cleanupWorker.pid)) throw new Error("Cleanup worker still present or PID reused");
    };
    const assertGeneration=()=>{
    if(identity.reader) {
      if (!statSync(identity.reader.registry).isFile() || realpathSync(identity.reader.registry)!==identity.reader.registry ||
          realpathSync(identity.reader.directory)!==identity.reader.directory) throw new Error("Original generation identity unavailable");
      const generations=new RuntimeGenerations(identity.reader.registry);
      try {
        const state=generations.state(), reader=state.readers.find(value=>value.token===identity.reader!.token);
        if (!reader || reader.owner!==identity.reader.owner || reader.revision!==identity.reader.revision ||
            state.revision!==identity.reader.revision || state.directory!==identity.reader.directory)
          throw new Error("Original workflow generation reader differs");
      } finally {generations.close();}
    }};
    if (!replay) {
    assertOwnerAbsent();
    for(const lease of leases)registry.assertHeld(lease);
    assertGeneration();
    }
    return {values,run,stages,directory,replay,leases,reader:identity.reader,
      close:()=>{registry.close();store.close();},
      finish:(proof:unknown,assertCurrent:()=>void,compatible=(previous:unknown,current:unknown)=>digest(previous)===digest(current))=>{
        const receipt: WorkflowCleanupReceipt={runId:run.id,bindingDigest,leases,
          observation:{kind:observationKind,version:1,authority:values.authority,originalRevision:run.revision,
            ...(scopeDigest?{scopeDigest}:{}),workerRequestDigest,proof,observedAt:new Date().toISOString()}};
        const preserved=preserveWorkflowReleaseReceipt(receiptPath,receipt),observation=validate(preserved);
        if (!Number.isSafeInteger(observation.originalRevision) || Number(observation.originalRevision)<1 || Number(observation.originalRevision)>run.revision || !compatible(observation.proof,proof)) throw new Error("Retained release proof differs");
        assertOwnerAbsent(); identity.assertUnchanged(); assertGeneration(); assertCurrent();
        store.withResourceReleaseSnapshot(run.id,snapshot,()=>registry.release(leases,digest(preserved)));
        return response(preserved,false);
      }};
  } catch(error) {registry.close();store.close();throw error;}
}

/** Existing synchronous local producer route retains its original evidence contract. */
export function workflowResourceRelease(args: string[],workspace=process.cwd()) {
  const context=prepareResourceRelease(args,workspace,"local-host");
  try {
    if(context.replay)return context.replay;
    const observed=workflowResourceEvidence(context.directory,context.run,context.stages,resolve(context.values.evidence!),context.values["evidence-digest"]!);
    return context.finish(observed.proof,observed.assertCurrent);
  } finally {context.close();}
}

/** Explicit platform adapters observe cleanup only; it never dispatches a workflow or app action. */
export async function workflowResourceReleaseCommand(args:string[],workspace=process.cwd(),probes?:IosObservationProbes|SimulatorBuildProbes|AndroidAppProbe|AndroidOwnedSessionProbes) {
  const {values}=parseArgs({args,strict:false,allowPositionals:true,options:{kind:{type:"string"}}});
  if(values.kind==="local-host-observed"){
    const selected=observedLocalRequest(args,workspace),context=prepareResourceRelease(selected.args,workspace,"local-host-observed",selected.requestDigest);
    try{
      selected.assertOriginal(context.run,context.leases,context.reader);
      if(context.replay)return context.replay;
      if(!context.stages.some(stage=>stage.state==="failed")||context.stages.some(stage=>stage.result&&stage.result.state!=="failed"))throw Error("Observed recovery requires original failed local execution");
      const original=workflowObservedResourceEvidence(context.directory,context.run,context.stages,selected.request.report.path,selected.request.report.digest);
      const proof={original:original.proof,...selected.observe()};
      return context.finish(proof,()=>{original.assertCurrent();selected.assertCurrent();});
    }finally{context.close();}
  }
  if(values.kind!=="ios-observation"&&values.kind!=="ios-simulator-build"&&values.kind!=="android-app-session")return workflowResourceRelease(args,workspace);
  const context=prepareResourceRelease(args,workspace,values.kind);
  try {
    if(context.replay)return context.replay;
    const observed=values.kind==="android-app-session"?await androidAppSessionEvidence(context,probes as AndroidAppProbe|AndroidOwnedSessionProbes):values.kind==="ios-observation"?await iosObservationEvidence(context,probes as IosObservationProbes):await simulatorBuildEvidence(context,probes as SimulatorBuildProbes);
    return context.finish(observed.proof,observed.assertCurrent,observed.compatible);
  } finally {context.close();}
}
