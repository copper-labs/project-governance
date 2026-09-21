import {lstatSync,mkdirSync,realpathSync} from "node:fs";
import {dirname,isAbsolute,join,relative,resolve} from "node:path";
import {parse} from "yaml";
import {canonical,digest,durableJson} from "./core.ts";
import {narrativeFile} from "./narrative-inputs.ts";
import {assessStartup} from "./startup-assessment.ts";
import {startupStatus} from "./startup-status.ts";
import {captureStartupHostOwner} from "./startup-host-owner.ts";
import {compiledRuntimeLock} from "./runtime-lock.ts";
import {compatibleStartupCandidate} from "./startup-compatibility.ts";
import {StartupHttp} from "./startup-http.ts";
import {stageStartupArchive} from "./startup-archive.ts";
import {stageRuntimeOperation} from "./runtime-stage-operation.ts";
import {reserveStartupJournal} from "./startup-journal.ts";
import {RuntimeGenerations} from "./runtime-generations.ts";
import {inspectRuntimeGeneration} from "./runtime-inspection.ts";
import {startupDeadline} from "./startup-deadline.ts";

/** Prepare the saved discovery candidate; no generation activation or reader release occurs here. */
export async function prepareStartupCandidate(input:Parameters<typeof assessStartup>[0]&{directory:string},
 options:{token?:string;fetch?:typeof fetch;environment?:NodeJS.ProcessEnv;capture?:typeof captureStartupHostOwner}={}) {
 const assess=()=>assessStartup(input,options.environment??process.env,options.capture??captureStartupHostOwner);
 const assessment=assess();if(assessment.status!=="preparation-required")return assessment;
 const status=startupStatus(input.receipts,input.task,input);
 if(status.discovery!=="complete" || status.result?.status!=="available")throw new Error("Completed startup release discovery required");
 const workspace=realpathSync(input.workspace),registry=realpathSync(input.registry),receipts=realpathSync(input.receipts);
 const original=narrativeFile(workspace,"config/governance/runtime.lock.yaml"),current=compiledRuntimeLock(parse(original));
 const validateRuntime=()=>{
  const generations=new RuntimeGenerations(registry);
  try {
   const state=generations.state(),reader=status.owner?.reader;
   if(!reader || state.maintenance || state.directory!==reader.directory || state.revision!==reader.revision ||
     !state.readers.some(value=>value.token===reader.token && value.owner===reader.owner && value.revision===reader.revision) ||
     digest(current)!==inspectRuntimeGeneration(state.directory!).lockDigest)throw new Error("Startup parent runtime reservation changed");
  }finally{generations.close();}
 };
 validateRuntime();
 const selected=status.result.candidate;
 const lock=compatibleStartupCandidate(current,Buffer.from(selected.lockText),selected.metadata);
 if(digest(lock)!==digest(selected.lock))throw new Error("Saved startup candidate identity differs");
 const directory=resolve(input.directory),location=relative(workspace,directory);
 if((location!==".."&&!location.startsWith("../")&&!isAbsolute(location)) || realpathSync(dirname(directory))!==dirname(directory))
  throw new Error("Startup preparation requires a canonical external directory");
 const request={workspace,registry,receipts,task:input.task,assessment,candidate:selected,original};
 if(Buffer.byteLength(canonical(request))>900*1024)throw new Error("Startup preparation request exceeds limit");
 let created=false;try{mkdirSync(directory,{mode:0o700});created=true;}catch(error){if((error as NodeJS.ErrnoException).code!=="EEXIST")throw error;}
 if(realpathSync(directory)!==directory)throw new Error("Startup preparation directory uses aliases");
 const requestPath=join(directory,"request.json");
 if(created)durableJson(requestPath,request);
 else if(digest(JSON.parse(narrativeFile(directory,requestPath)))!==digest(request))throw new Error("Startup preparation request changed");
 const deadline=startupDeadline(directory,digest(request),assessment.settings.install_seconds,created);
 const preparedPath=join(directory,"prepared.json");
 let archive:string;
 if(lstatSync(preparedPath,{throwIfNoEntry:false}))archive=JSON.parse(narrativeFile(directory,preparedPath)).archive;
 else {
  const owner=/^https:\/\/github\.com\/([^/]+\/[^/]+)\/releases\/download\//u.exec(current.artifact.url)?.[1];
  if(!owner)throw new Error("Startup release owner missing");
  const client=new StartupHttp(owner,deadline.remaining(60000)/1000,options);
  const release=await client.json(`${client.api}/releases/tags/${encodeURIComponent(lock.version)}`);
  const downloaded=await stageStartupArchive(directory,current,release,client);
  if(downloaded.lockText!==selected.lockText)throw new Error("Downloaded startup candidate changed since discovery");
  archive=downloaded.path;
 }
 if(typeof archive!=="string" || dirname(archive)!==directory)throw new Error("Prepared archive scope differs");
 const staged=stageRuntimeOperation(archive,lock,join(directory,"staging"),deadline);
 if(digest(assess())!==digest(assessment))throw new Error("Startup assessment changed during preparation");
 validateRuntime();
 deadline.remaining();
 const journal=reserveStartupJournal(join(directory,"operation"),{workspace,registry,receipts,task:input.task,
  bindingDigest:status.bindingDigest!,reader:status.owner.reader,before:assessment.snapshot,original,candidate:selected.lockText,candidateDirectory:staged.directory});
 const prepared={status:"prepared" as const,directory,requestDigest:digest(request),archive,candidate:staged.directory,journal:journal.path,token:journal.token,activation:"not-performed"};
 if(lstatSync(preparedPath,{throwIfNoEntry:false})){
  if(digest(JSON.parse(narrativeFile(directory,preparedPath)))!==digest(prepared))throw new Error("Startup preparation receipt differs");
 }else durableJson(preparedPath,prepared);
 return prepared;
}
