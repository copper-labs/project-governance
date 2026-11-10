import {createHash} from "node:crypto";
import {statSync,realpathSync} from "node:fs";
import {isAbsolute,resolve,basename,dirname} from "node:path";
import {digest,fileDigest,object} from "./core.ts";
import {narrativeFile} from "./narrative-inputs.ts";
import {absentLock,iosObservationClaims,type IosObservationProbes} from "./ios-observation-cleanup.ts";
import {observeRemovedPhysicalApp} from "./physical-cleanup.ts";
import {workflowNativeResourceEvidence} from "./workflow-resource-evidence.ts";
import type {WorkflowRun,WorkflowStage} from "./workflow-store.ts";

/** Explicit historical recovery joins original device records; it never declares application cleanup. */
export async function iosRemovedAppEvidence(context:{values:Record<string,string|undefined>;directory:string;run:WorkflowRun;stages:WorkflowStage[];assertDeviceExclusive:()=>void},probes?:IosObservationProbes) {
 const {values,directory,run,stages}=context,recipe=run.binding.recipe;
 const claims=iosObservationClaims(recipe,undefined),bundleId=claims.app.slice(`ios-app:${claims.udid}:`.length);
 if(recipe.stages.length!==1 || stages.length!==1 || stages[0]!.state!=="cancelled" || stages[0]!.result?.state!=="cancelled" ||
    stages[0]!.result?.inputValidity!=="valid" || stages[0]!.result?.cleanup!=="confirmed")throw Error("Original cancelled single-command app workflow required");
 const native=workflowNativeResourceEvidence(directory,run,stages);
 if(native.commands.length!==1 || native.commands.some(command=>command.cleanupRecovery))throw Error("Original supervisor cleanup required");
 const hash=(raw:string)=>"sha256:"+createHash("sha256").update(raw).digest("hex");
 const manifestPath=realpathSync(values.evidence!),manifestRaw=narrativeFile(directory,manifestPath),manifestTime=statSync(manifestPath).mtimeMs;
 if(hash(manifestRaw)!==values["evidence-digest"])throw Error("Removed-app evidence manifest digest differs");
 const manifest=object(JSON.parse(manifestRaw)),roles=["installation","launch","uninstall","absence","guard"];
 if(manifest.version!==1 || manifest.runId!==run.id || manifest.bindingDigest!==digest(run.binding) ||
    Object.keys(manifest).some(key=>!["version","runId","bindingDigest","files","outputInput","outputKey"].includes(key)))throw Error("Removed-app original binding differs");
 const outputInput=recipe.inputs.find(input=>input.path===manifest.outputInput);
 if(!outputInput || typeof manifest.outputKey!=="string" || !manifest.outputKey || manifest.outputKey.length>128)throw Error("Original output input binding required");
 const inputPath=resolve(recipe.workspace,outputInput.path),inputRaw=narrativeFile(recipe.workspace,inputPath);
 if(hash(inputRaw)!==outputInput.digest)throw Error("Original output input changed");
 const output=object(JSON.parse(inputRaw))[manifest.outputKey];
 if(typeof output!=="string" || !isAbsolute(output) || resolve(output)!==output || realpathSync(output)!==output)throw Error("Original canonical output directory required");
 const refs=object(manifest.files),records=new Map<string,{hash:string;modified:number}>();
 if(Object.keys(refs).length!==roles.length || roles.some(role=>!refs[role]))throw Error("Complete original removed-app records required");
 const read=(role:string)=>{
  const ref=object(refs[role]);
  if(Object.keys(ref).some(key=>!["path","digest"].includes(key)) || typeof ref.path!=="string" || !isAbsolute(ref.path) || resolve(ref.path)!==ref.path || realpathSync(ref.path)!==ref.path || typeof ref.digest!=="string" || dirname(ref.path)!==output)throw Error("Canonical original device record required");
  const raw=narrativeFile(directory,ref.path),modified=statSync(ref.path).mtimeMs;
  if(hash(raw)!==ref.digest || !native.windows.some(window=>modified>=window.start&&modified<=window.end) || records.has(ref.path))throw Error("Original device record digest, window or identity differs");
  records.set(ref.path,{hash:ref.digest,modified});return object(JSON.parse(raw));
 };
 const installation=read("installation"),launch=read("launch"),uninstall=read("uninstall"),absence=read("absence"),guard=read("guard");
 const times=["guard","installation","launch","uninstall","absence"].map(role=>records.get(String(object(refs[role]).path))!.modified);
 if(times.some((time,index)=>index>0&&time<times[index-1]!))throw Error("Original device record order differs");
 const installed=object(installation.result),launched=object(launch.result),removed=object(uninstall.result),absent=object(absence.result);
 const identifier=installed.deviceIdentifier;
 if(typeof identifier!=="string" || !identifier || [launched,removed,absent].some(result=>result.deviceIdentifier!==identifier))throw Error("Original device identities differ");
 const acknowledged=(envelope:Record<string,unknown>,command:string,bundleArg=false)=>{
  const info=object(envelope.info),args=info.arguments;
  if(info.outcome!=="success" || info.commandType!==`devicectl.device.${command.replaceAll(" ",".")}` || !Array.isArray(args) || args.some(arg=>typeof arg!=="string") ||
     args.slice(0,2).join(" ")!=="devicectl device" || args.slice(2,2+command.split(" ").length).join(" ")!==command ||
     args.filter(arg=>arg==="--device").length!==1 || ![identifier,claims.udid].includes(String(args[args.indexOf("--device")+1])) ||
     bundleArg && args.at(-1)!==bundleId)throw Error("Original acknowledged device command differs");
 };
 for(const envelope of [installation,absence]){
  const args=object(envelope.info).arguments,result=object(envelope.result);
  if(!Array.isArray(args) || args.includes("--bundle-id") && (args.filter(arg=>arg==="--bundle-id").length!==1 || args[args.indexOf("--bundle-id")+1]!==bundleId) ||
     result.matchingBundleIdentifier!==undefined && result.matchingBundleIdentifier!==bundleId)throw Error("Original inventory bundle filter differs");
 }
 acknowledged(installation,"info apps");acknowledged(launch,"process launch",true);acknowledged(uninstall,"uninstall app",true);acknowledged(absence,"info apps");
 if(!Array.isArray(installed.apps) || !Array.isArray(absent.apps) || !Array.isArray(removed.uninstalledApplications))throw Error("Original app inventories unavailable");
 const matches=installed.apps.map(value=>object(value)).filter(app=>app.bundleIdentifier===bundleId);
 if(matches.length!==1 || typeof matches[0]!.url!=="string" || absent.apps.some(value=>object(value).bundleIdentifier===bundleId) ||
    !removed.uninstalledApplications.some(value=>object(value).bundleID===bundleId))throw Error("Original removed-app identity is ambiguous");
 const appUrl=new URL(matches[0]!.url),process=object(launched.process),executable=new URL(String(process.executable));
 if(appUrl.protocol!=="file:" || appUrl.host || appUrl.search || appUrl.hash || !appUrl.pathname.endsWith(".app/") ||
    executable.protocol!=="file:" || executable.host || executable.search || executable.hash || !executable.pathname.startsWith(appUrl.pathname) ||
    !Number.isSafeInteger(process.processIdentifier) || Number(process.processIdentifier)<1)throw Error("Original launch container differs");
 const lock=values["lock-directory"]!;
 const guardPath=typeof guard.lockDir==="string"&&isAbsolute(guard.lockDir)?resolve(realpathSync(dirname(guard.lockDir)),basename(guard.lockDir)):null;
 if(guard.ok!==true || guard.command!=="acquire" || guard.lock!==`ios-${claims.udid}.lock` || typeof guard.lockDir!=="string" ||
    guardPath!==lock || basename(lock)!==guard.lock ||
    !native.identities.has(Number(guard.pid)) || typeof guard.holder!=="string" || !guard.holder || guard.stolen!==false)throw Error("Original device lock owner differs");
 const assertCurrent=()=>{
  native.assertCurrent();context.assertDeviceExclusive();absentLock(lock);
  if(fileDigest(manifestPath)!==values["evidence-digest"] || statSync(manifestPath).mtimeMs!==manifestTime || fileDigest(inputPath)!==outputInput.digest)throw Error("Removed-app evidence manifest changed");
  for(const [path,record]of records)if(fileDigest(path)!==record.hash || statSync(path).mtimeMs!==record.modified)throw Error("Original device record changed");
 };
 assertCurrent();
 const physical=await observeRemovedPhysicalApp({udid:claims.udid,bundleId,appUrl:appUrl.href},probes);
 if(!physical || physical.deviceIdentifier!==identifier)throw Error("Fresh removed-app closure unavailable");
 const completed=performance.now();assertCurrent();
 const {observedAt,...device}=physical;
 const original={bindingDigest:digest(run.binding),commands:native.commands,evidence:{path:manifestPath,digest:values["evidence-digest"]},files:Object.fromEntries(records),outputInput:{path:inputPath,digest:outputInput.digest,key:manifest.outputKey},lockDirectory:lock};
 const assertions={device,sdkLifecycle:"unclaimed",applicationCleanup:"unclaimed"};
 return {proof:{original,fresh:{observedAt,assertions}},assertCurrent:()=>{assertCurrent();if(performance.now()-completed>5000)throw Error("Fresh removed-app closure expired");},
 compatible:(previous:unknown,current:unknown)=>{const a=object(previous),b=object(current);return digest(a.original)===digest(b.original)&&digest(object(a.fresh).assertions)===digest(object(b.fresh).assertions);}};
}
