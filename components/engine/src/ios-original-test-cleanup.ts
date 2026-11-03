import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {lstatSync,readFileSync,readdirSync,readlinkSync,realpathSync,statSync} from "node:fs";
import {basename,dirname,isAbsolute,join,relative,resolve} from "node:path";
import {digest,fileDigest,object} from "./core.ts";
import {narrativeFile} from "./narrative-inputs.ts";
import {workflowRecoveryIdentity,releaseRecoveredWorkflowReader} from "./workflow-reader-recovery.ts";
import {RuntimeGenerations} from "./runtime-generations.ts";
import {commandProcesses} from "./command-owner-recovery.ts";
import {preserveWorkflowReleaseReceipt} from "./workflow-release-receipt.ts";
import {reconcileReleasedWorkflow,type WorkflowCleanupReceipt} from "./workflow-resource-recovery.ts";
import {absentLock} from "./ios-observation-cleanup.ts";
import {observeRemovedPhysicalApp} from "./physical-cleanup.ts";
import {workflowNativeResourceEvidence} from "./workflow-resource-evidence.ts";
import type {WorkflowRun,WorkflowStage,WorkflowStore} from "./workflow-store.ts";
import type {ResourceRegistry,Lease} from "./resources.ts";

/** Missing shape is a normal fall-through; positively identified tests retain strict evidence checks. */
export function hasOriginalIosTestShape(run:WorkflowRun,stages:WorkflowStage[]) {
 const recipe=run.binding.recipe;
 if(recipe.resources.length!==1 || !/^ios:(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{8}-[0-9a-fA-F]{16})$/u.test(recipe.resources[0]!) ||
    recipe.androidEmulator || recipe.androidAppSession || recipe.stages.length!==1 || recipe.stages[0]!.cleanup || stages.length!==1 ||
    !["unknown","reconciling","failed","succeeded","cancelled"].includes(run.state) || !["failed","succeeded"].includes(stages[0]!.state) || stages[0]!.result?.cleanup!=="confirmed")return false;
 const operation=recipe.operations[recipe.stages[0]!.operation];
 if(!operation || operation.effect!=="local" || !operation.argv[1])return false;
 const script=relative(recipe.workspace,resolve(recipe.workspace,operation.cwd,operation.argv[1]));
 return !script.startsWith("../")&&!isAbsolute(script)&&recipe.inputs.some(input=>input.path===script)&&
  ["--app","--sha256","--xctestrun","--xctestrun-sha256","--udid","--output"].every(name=>{
   const index=operation.argv.indexOf(name);return index>=2&&operation.argv.lastIndexOf(name)===index&&!!operation.argv[index+1]&&!operation.argv[index+1]!.startsWith("--");
  });
}

/** Retained native app pins bind path names, file bytes and link targets without following links. */
export function originalAppDigest(root:string) {
 const paths:string[]=[];
 const walk=(directory:string)=>{for(const name of readdirSync(directory)){const path=join(directory,name),entry=lstatSync(path);if(entry.isSymbolicLink()||entry.isFile())paths.push(path);else if(entry.isDirectory())walk(path);else throw Error("Original app has an unsupported entry");}};
 walk(root);const hash=createHash("sha256");
 // The original native pin sorts path components (Path ordering), not flattened slash strings.
 paths.sort((left,right)=>{
  const a=relative(root,left).split("/"),b=relative(root,right).split("/");
  for(let i=0;i<Math.min(a.length,b.length);i++){if(a[i]!==b[i])return a[i]!<b[i]!?-1:1;}
  return a.length-b.length;
 });
 for(const path of paths)hash.update(relative(root,path)).update("\0").update(lstatSync(path).isSymbolicLink()?Buffer.from("link:"+readlinkSync(path)):createHash("sha256").update(readFileSync(path)).digest()).update("\0");
 return hash.digest("hex");
}

/** Qualify an original completed physical test; never translate or acquire its legacy claim. */
export function originalIosTestCleanup(directory:string,run:WorkflowRun,stages:WorkflowStage[],registry:ResourceRegistry,
 options:{bundleId?:(app:string)=>string;physical?:Parameters<typeof observeRemovedPhysicalApp>[1]}={}) {
 const recipe=run.binding.recipe;
 if(!hasOriginalIosTestShape(run,stages))return null;
 if(recipe.androidEmulator || recipe.androidAppSession || recipe.stages.length!==1 || stages.length!==1 ||
   !["failed","succeeded"].includes(stages[0]!.state) || stages[0]!.result?.cleanup!=="confirmed")throw Error("Original physical test commands remain unresolved");
 const operation=recipe.operations[recipe.stages[0]!.operation]!;
 if(operation.effect!=="local")throw Error("Original physical test must retain its local operation boundary");
 const args=operation.argv;
 const flag=(name:string)=>{const index=args.indexOf(name);if(index<2 || args.lastIndexOf(name)!==index || !args[index+1] || args[index+1]!.startsWith("--"))throw Error("Original physical test argument unavailable");return args[index+1]!;};
 const app=flag("--app"),appHash=flag("--sha256"),test=flag("--xctestrun"),testHash=flag("--xctestrun-sha256"),udid=flag("--udid"),output=flag("--output");
 if(udid!==recipe.resources[0]!.slice(4) || !/^[a-f0-9]{64}$/u.test(appHash) || !/^[a-f0-9]{64}$/u.test(testHash) ||
    [app,test,output].some(path=>!isAbsolute(path)||resolve(path)!==path||realpathSync(path)!==path) || !app.endsWith(".app") || !test.endsWith(".xctestrun"))throw Error("Original physical test identity differs");
 const script=relative(recipe.workspace,resolve(recipe.workspace,operation.cwd,args[1]!));
 if(script.startsWith("../") || isAbsolute(script) || !recipe.inputs.some(input=>input.path===script))throw Error("Original native driver is not an approved input");
 const native=workflowNativeResourceEvidence(directory,run,stages),metadata=new Map<string,{hash:string;modified:number}>();
 const read=(name:string)=>{
  const path=join(output,name),raw=narrativeFile(output,path),modified=statSync(path).mtimeMs;
  if(!native.windows.some(window=>modified>=window.start&&modified<=window.end))throw Error("Original physical evidence is outside the native command window");
  metadata.set(path,{hash:fileDigest(path),modified});return object(JSON.parse(raw));
 };
 const receipt=read("receipt.json"),inventory=read("installed-apps.json"),uninstall=read("uninstall.json"),removed=read("uninstalled-apps.json"),guard=read("lock.log");
 if(receipt.device!==udid || receipt.appSha256!==appHash || receipt.xctestrunSha256!==testHash ||
   !["failed","passed"].includes(String(receipt.status)) || !Array.isArray(receipt.commands))throw Error("Original test receipt differs from bound app or XCTest inputs");
 if(originalAppDigest(app)!==appHash || fileDigest(test)!=="sha256:"+testHash)throw Error("Original app or XCTest bytes changed");
 const bundleId=options.bundleId?.(app)??execFileSync("/usr/bin/plutil",["-extract","CFBundleIdentifier","raw","-o","-",join(app,"Info.plist")],{encoding:"utf8",timeout:5000,maxBuffer:16384}).trim();
 if(receipt.bundle!==bundleId || !/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/u.test(bundleId))throw Error("Original app bundle identity differs");
 for(const envelope of [inventory,uninstall,removed])if(object(envelope.info).outcome!=="success")throw Error("Original device operation was not acknowledged");
 const installed=object(inventory.result),uninstalled=object(uninstall.result),absent=object(removed.result);
 if(typeof installed.deviceIdentifier!=="string" || uninstalled.deviceIdentifier!==installed.deviceIdentifier || absent.deviceIdentifier!==installed.deviceIdentifier ||
   !Array.isArray(installed.apps) || !Array.isArray(absent.apps) || !Array.isArray(uninstalled.uninstalledApplications))throw Error("Original device inventories differ");
 const matches=installed.apps.map(value=>object(value)).filter(value=>value.bundleIdentifier===bundleId);
 if(matches.length!==1 || typeof matches[0]!.url!=="string" || absent.apps.some(value=>object(value).bundleIdentifier===bundleId) ||
   !uninstalled.uninstalledApplications.some(value=>object(value).bundleID===bundleId))throw Error("Original removed-app identity is ambiguous");
 const appUrl=new URL(matches[0]!.url);
 if(appUrl.protocol!=="file:" || appUrl.host || appUrl.search || appUrl.hash || !appUrl.pathname.endsWith("/"+basename(app)+"/"))throw Error("Original installed container differs");
 const commands=(receipt.commands as unknown[]).map(value=>object(value));
 const command=(required:string[])=>commands.some(value=>{const argv=value.argv;return value.exit===0 && Array.isArray(argv) && required.every(part=>argv.includes(part)) &&
  (argv.includes(udid)||argv.includes(`platform=iOS,id=${udid}`));});
 if(!command(["devicectl","install","app",app]) || !command(["devicectl","uninstall","app",bundleId]) || !command(["xcodebuild","-xctestrun",test]))throw Error("Original device commands do not bind this test");
 const acquired=commands.find(value=>value.exit===0&&Array.isArray(value.argv)&&value.argv.includes("acquire"));
 if(!acquired || !Array.isArray(acquired.argv))throw Error("Original device file guard unavailable");
 const holderAt=acquired.argv.indexOf("--holder"),holder=acquired.argv[holderAt+1];
 if(guard.ok!==true || guard.command!=="acquire" || guard.lock!==`ios-${udid}.lock` || guard.holder!==holder || holderAt<0 ||
    typeof guard.lockDir!=="string" || !isAbsolute(guard.lockDir) || !native.identities.has(Number(guard.pid)))throw Error("Original file guard identity differs");
 const lockDirectory=join(realpathSync(dirname(guard.lockDir)),basename(guard.lockDir));
 if(basename(lockDirectory)!==guard.lock)throw Error("Original device file guard path differs");
 const assertCurrent=()=>{
  native.assertCurrent();absentLock(lockDirectory);
  if(originalAppDigest(app)!==appHash || fileDigest(test)!=="sha256:"+testHash)throw Error("Original app or XCTest bytes changed");
  for(const [path,value] of metadata)if(fileDigest(path)!==value.hash||statSync(path).mtimeMs!==value.modified)throw Error("Original physical evidence changed");
 const conflicts=registry.inspect().filter(lease=>{const resource=lease.resource.toLowerCase(),device=udid.toLowerCase();return lease.state==="held" && lease.operation!==run.id &&
   (resource===`ios:${device}`||resource===`ios-device:${device}`||resource.startsWith(`ios-app:${device}:`));});
  if(conflicts.length)throw Error("Another device owner remains active");
 };
 assertCurrent();
 return {assertCurrent,
  observe:async(leases:readonly Lease[])=>{
   assertCurrent();
   const physical=await observeRemovedPhysicalApp({udid,bundleId,appUrl:appUrl.href},options.physical);
   if(!physical)return null;
   if(physical.deviceIdentifier!==installed.deviceIdentifier)throw Error("Fresh device identity differs from original test");
   const completed=performance.now();assertCurrent();
   if(performance.now()-completed>5000)throw Error("Fresh original physical closure expired");
   const observation={...physical,original:{bindingDigest:digest(run.binding),commands:native.commands,
    files:Object.fromEntries([...native.files,...[...metadata].map(([path,value])=>[path,value.hash] as const)]),appHash,testHash,
    originalDeviceIdentifier:installed.deviceIdentifier,lockDirectory,originalResource:recipe.resources[0]},sdkLifecycle:"unclaimed"};
   return {observation,assertCurrent:()=>{assertCurrent();if(performance.now()-completed>5000)throw Error("Fresh original physical closure expired");for(const lease of leases)registry.assertHeld(lease);}};
  }};
}

/** Existing continuation owns selection, exact original lease retirement and normal reconciliation. */
export async function recoverOriginalIosTestCleanup(directory:string,database:string,store:WorkflowStore,registry:ResourceRegistry,
 run:WorkflowRun,options:Parameters<typeof originalIosTestCleanup>[4]={}) {
 if(!hasOriginalIosTestShape(run,store.stages(run.id)))return null;
 if(!run.owner || !["unknown","reconciling","failed","succeeded","cancelled"].includes(run.state))throw Error("Original test recovery requires its current settled command state");
 const identity=workflowRecoveryIdentity(directory,database,run),bindingDigest=digest(run.binding),stages=store.stages(run.id);
 const leases=registry.originalLeases(run.id,run.owner),path=join(directory,"resource-cleanup.json");
 if(digest(leases.map(lease=>lease.resource).sort())!==digest([...run.binding.recipe.resources].sort()))throw Error("Original physical lease scope differs");
 const snapshot=digest({run,stages,cleanupWorker:store.cleanupWorker(run.id)});
 const assertAbsent=()=>{
  identity.assertAbsent();identity.assertUnchanged();
  const worker=store.cleanupWorker(run.id);
  if(worker && commandProcesses().some(row=>row.pid===worker.pid))throw Error("Original cleanup worker still present or PID reused");
 };
 assertAbsent();
 const saved=lstatSync(path,{throwIfNoEntry:false})?JSON.parse(narrativeFile(directory,path)) as WorkflowCleanupReceipt:null;
 if(saved) {
  const observation=object(saved.observation),original=object(observation.original);
  if(saved.runId!==run.id || saved.bindingDigest!==bindingDigest || digest(saved.leases)!==digest(leases) ||
     observation.kind!=="physical-cleanup-observation" || original.bindingDigest!==bindingDigest || original.originalResource!==run.binding.recipe.resources[0])throw Error("Retained original physical cleanup receipt differs");
  if(registry.hasRelease(leases,digest(saved))) {
   reconcileReleasedWorkflow(store,registry,run.id,run.revision,saved);
   releaseRecoveredWorkflowReader(directory,database,store.read(run.id));
   return {run:store.read(run.id),stages:store.stages(run.id)};
  }
 }
 const assertGeneration=()=>{
  if(identity.reader) {
   const generations=new RuntimeGenerations(identity.reader.registry);
   try {
    const state=generations.state(),held=state.readers.find(row=>row.token===identity.reader!.token);
    if(state.maintenance || state.revision!==identity.reader.revision || state.directory!==identity.reader.directory ||
       !held || held.owner!==identity.reader.owner || held.revision!==identity.reader.revision)throw Error("Original physical runtime reader differs");
   }finally{generations.close();}
  }
 };
 for(const lease of leases)registry.assertHeld(lease);
 assertGeneration();
 const qualified=originalIosTestCleanup(directory,run,stages,registry,options);
 if(!qualified)throw Error("Original physical test does not match recovery selection");
 const proof=await qualified.observe(leases);
 if(!proof)return {run,stages};
 assertAbsent();assertGeneration();proof.assertCurrent();
 const receipt=preserveWorkflowReleaseReceipt(path,{runId:run.id,bindingDigest,leases,observation:proof.observation});
 const {observedAt:oldTime,...oldProof}=object(receipt.observation),{observedAt:newTime,...newProof}=proof.observation;
 if(receipt.runId!==run.id || receipt.bindingDigest!==bindingDigest || digest(receipt.leases)!==digest(leases) || digest(oldProof)!==digest(newProof))throw Error("Original physical cleanup proof changed");
 assertAbsent();assertGeneration();proof.assertCurrent();
 store.withResourceReleaseSnapshot(run.id,snapshot,()=>registry.release(leases,digest(receipt)));
 reconcileReleasedWorkflow(store,registry,run.id,run.revision,receipt);
 releaseRecoveredWorkflowReader(directory,database,store.read(run.id));
 return {run:store.read(run.id),stages:store.stages(run.id)};
}
