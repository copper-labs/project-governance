import { lstatSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { parseArgs } from "node:util";
import { createHash } from "node:crypto";
import { digest, object } from "./core.ts";
import { narrativeFile } from "./narrative-inputs.ts";
import type { Lease } from "./resources.ts";
import { absentLock } from "./ios-observation-cleanup.ts";
import type { WorkflowRun } from "./workflow-store.ts";

interface FileReference { path: string; digest: string }
interface LocalGuard { directory: string; resources: string[] }
interface ObservedLocalRequest {
  version: 1; runId: string; revision: number; owner: string; authority: string;
  workspace: string; database: string; workerDirectory: string; registry: string;
  bindingDigest: string; leases: Lease[]; generation: unknown;
  report: FileReference; approval: FileReference; mappingEvidence: FileReference;
  localOnly: true; historicalMutexMappingConfirmed: true; guards: LocalGuard[];
}

/** Trusted local authority supplies scope and mapping; the runtime observes absence itself. */
export function observedLocalRequest(args: string[],workspace: string) {
  const {values}=parseArgs({args,strict:true,allowPositionals:false,options:{kind:{type:"string"},"request-file":{type:"string"},receipt:{type:"string"}}});
  if(values.kind!=="local-host-observed"||!values["request-file"]||!values.receipt)throw Error("Exact observed local-host request and new receipt required");
  const snapshots=new Map<string,string>();
  const exactKeys=(value:Record<string,unknown>,keys:string[])=>{
    if(digest(Object.keys(value).sort())!==digest(keys.sort()))throw Error("Unexpected or missing recovery request fields");
  };
  // Hash the bounded ordinary-file reader's bytes so a pipe or oversized replacement cannot block recovery.
  const boundedDigest=(path:string)=>"sha256:"+createHash("sha256").update(narrativeFile(dirname(path),path)).digest("hex");
  const reference=(value: unknown) => {
    const ref=object(value) as unknown as FileReference;
    exactKeys(object(value),["path","digest"]);
    if(typeof ref.path!=="string"||!isAbsolute(ref.path)||realpathSync(ref.path)!==ref.path||
       !/^sha256:[a-f0-9]{64}$/u.test(ref.digest)||boundedDigest(ref.path)!==ref.digest)throw Error("Approved recovery reference differs");
    snapshots.set(ref.path,ref.digest);return ref;
  };
  const path=resolve(values["request-file"]),raw=narrativeFile(dirname(path),path);
  if(realpathSync(path)!==path)throw Error("Recovery request uses an alias");
  const request=object(JSON.parse(raw)) as unknown as ObservedLocalRequest,requestDigest="sha256:"+createHash("sha256").update(raw).digest("hex");
  exactKeys(object(request),["version","runId","revision","owner","authority","workspace","database","workerDirectory","registry","bindingDigest","leases","generation","report","approval","mappingEvidence","localOnly","historicalMutexMappingConfirmed","guards"]);
  snapshots.set(path,requestDigest);
  if(request.version!==1||!Number.isSafeInteger(request.revision)||request.revision<1||
      typeof request.runId!=="string"||typeof request.owner!=="string"||typeof request.authority!=="string"||
      !/^sha256:[a-f0-9]{64}$/u.test(request.bindingDigest)||request.localOnly!==true||request.historicalMutexMappingConfirmed!==true||
      !Array.isArray(request.leases)||!request.leases.length||!Array.isArray(request.guards)||!request.guards.length||request.guards.length>4096)
    throw Error("Complete approved local-only recovery scope and historical mutex mapping required");
  for(const key of ["workspace","database","workerDirectory","registry"] as const)
    if(typeof request[key]!=="string"||!isAbsolute(request[key])||realpathSync(request[key])!==request[key])throw Error("Original recovery paths must be canonical");
  if(realpathSync(workspace)!==request.workspace)throw Error("Approved recovery workspace differs");
  reference(request.report);reference(request.approval);reference(request.mappingEvidence);
  const mapped:string[]=[],parents=new Map<string,{dev:number;ino:number}>();
  for(const value of request.guards){
    const guard=object(value) as unknown as LocalGuard;
    exactKeys(object(value),["directory","resources"]);
    if(typeof guard.directory!=="string"||!isAbsolute(guard.directory)||resolve(guard.directory)!==guard.directory||
       !Array.isArray(guard.resources)||!guard.resources.length||guard.resources.some(resource=>typeof resource!=="string"))
      throw Error("Actual canonical local guard mapping required");
    const parent=dirname(guard.directory);
    if(realpathSync(parent)!==parent)throw Error("Local guard parent uses an alias");
    const state=lstatSync(parent);if(!state.isDirectory()||state.isSymbolicLink())throw Error("Local guard parent unavailable");
    parents.set(parent,{dev:state.dev,ino:state.ino});mapped.push(...guard.resources);
  }
  const resources=request.leases.map(lease=>lease.resource).sort();
  if(new Set(mapped).size!==mapped.length||digest(mapped.sort())!==digest(resources))throw Error("Every original claim needs exactly one actual local guard mapping");
  const assertUnchanged=()=>{
    for(const [file,expected]of snapshots)if(realpathSync(file)!==file||boundedDigest(file)!==expected)throw Error("Approved recovery evidence changed");
  };
  const observeGuards=()=>{
    for(const [parent,identity]of parents){
      const current=lstatSync(parent);
      if(realpathSync(parent)!==parent||!current.isDirectory()||current.dev!==identity.dev||current.ino!==identity.ino)throw Error("Local guard parent changed");
    }
    for(const guard of request.guards)absentLock(guard.directory);
  };
  return {request,requestDigest,path,receipt:values.receipt,
    args:["--database",request.database,"--run",request.runId,"--revision",String(request.revision),"--worker-directory",request.workerDirectory,
      "--registry",request.registry,"--authority",request.authority,"--kind","local-host-observed","--evidence",request.report.path,
      "--evidence-digest",request.report.digest,"--receipt",values.receipt],
    assertOriginal(run: WorkflowRun,leases:Lease[],reader:unknown){
      if(run.id!==request.runId||run.owner!==request.owner||run.revision!==request.revision||digest(run.binding)!==request.bindingDigest||
         digest(leases)!==digest(request.leases)||digest(reader??null)!==digest(request.generation??null)||run.state!=="unknown"||
         Object.values(run.binding.recipe.operations).some(operation=>operation.effect!=="local"))
        throw Error("Approved original recovery binding, leases or reader differ");
    },
    observe(){assertUnchanged();observeGuards();return {request:{path,digest:requestDigest},approval:request.approval,mappingEvidence:request.mappingEvidence,
      guards:request.guards.map(guard=>({directory:guard.directory,resources:guard.resources,present:false})),guardParents:[...parents].map(([path,identity])=>({path,...identity}))};},
    assertCurrent(){assertUnchanged();observeGuards();}
  };
}
