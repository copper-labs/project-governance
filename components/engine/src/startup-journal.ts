import {mkdirSync,realpathSync} from "node:fs";
import {dirname,isAbsolute,join,relative,resolve} from "node:path";
import {randomUUID} from "node:crypto";
import {canonical,digest,durableJson} from "./core.ts";
import {narrativeFile} from "./narrative-inputs.ts";
import {compiledRuntimeLock} from "./runtime-lock.ts";
import {inspectRuntimeGeneration} from "./runtime-inspection.ts";
import type {startupGitSnapshot} from "./startup-git.ts";
import type {RuntimeReader} from "./runtime-reader.ts";

export interface StartupJournalRequest {
 workspace:string;registry:string;receipts:string;task:string;bindingDigest:string;reader:RuntimeReader;
 before:ReturnType<typeof startupGitSnapshot>;original:string;candidate:string;candidateDirectory:string;
}

/** Persist an exact prepared operation before handoff. This journal alone grants no update authority. */
export function reserveStartupJournal(directory:string,request:StartupJournalRequest) {
 directory=resolve(directory);
 const workspace=realpathSync(request.workspace),registry=realpathSync(request.registry);
 const location=relative(workspace,directory);
 if((location!==".." && !location.startsWith("../") && !isAbsolute(location)) || realpathSync(dirname(directory))!==dirname(directory))
  throw new Error("Startup journal requires a canonical external operation directory");
 if(workspace!==request.workspace || registry!==request.registry || realpathSync(request.receipts)!==request.receipts ||
   request.before.workspace!==workspace || request.before.lockDigest!==digest(request.original) ||
   !/^sha256:[a-f0-9]{64}$/u.test(request.task) || !/^sha256:[a-f0-9]{64}$/u.test(request.bindingDigest) ||
   request.reader.registry!==registry || request.reader.owner!==`startup-task:${request.task}` ||
   !request.reader.token || !Number.isSafeInteger(request.reader.revision) || request.reader.revision<1)
  throw new Error("Startup journal request identity differs");
 const candidate=compiledRuntimeLock(JSON.parse(request.candidate));
 const installed=inspectRuntimeGeneration(request.candidateDirectory);
 if(installed.directory!==request.candidateDirectory || installed.lockDigest!==digest(candidate))throw new Error("Startup journal candidate differs");
 if(Buffer.byteLength(canonical(request))>900*1024)throw new Error("Startup journal request exceeds bounded readback size");
 const requestDigest=digest(request),path=join(directory,"startup.json");
 let created=false;
 try{mkdirSync(directory,{mode:0o700});created=true;}catch(error){if((error as NodeJS.ErrnoException).code!=="EEXIST")throw error;}
 if(realpathSync(directory)!==directory)throw new Error("Startup operation directory uses aliases");
 if(created)durableJson(path,{version:1,kind:"startup-update",request,requestDigest,token:randomUUID()});
 const saved=JSON.parse(narrativeFile(directory,path));
 if(saved.version!==1 || saved.kind!=="startup-update" || saved.requestDigest!==requestDigest || digest(saved.request)!==requestDigest ||
  typeof saved.token!=="string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(saved.token))
  throw new Error("Startup journal differs; retain the original operation");
 return {directory,path,requestDigest,token:saved.token as string,reused:!created};
}
