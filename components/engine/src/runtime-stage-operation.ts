import { existsSync, mkdirSync, readdirSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { compiledRuntimeLock, type CompiledRuntimeLock } from "./runtime-lock.ts";
import { stageRuntimeArchive } from "./runtime-staging.ts";
import { inspectRuntimeGeneration } from "./runtime-inspection.ts";
import { digest, durableJson, fileDigest } from "./core.ts";
import { narrativeFile } from "./narrative-inputs.ts";
import type { OperationDeadline } from "./operation-deadline.ts";

/** A durable staging reservation prevents restart from silently installing another candidate. */
export function stageRuntimeOperation(archive: string, input: CompiledRuntimeLock, operationDirectory: string, deadline?: OperationDeadline) {
  deadline?.remaining();
  archive=realpathSync(archive);
  const lock=compiledRuntimeLock(input),directory=resolve(operationDirectory);
  const request={version:1,kind:"runtime-stage-operation",archive,archiveDigest:fileDigest(archive),lock};
  let created=false;
  try {mkdirSync(directory,{mode:0o700});created=true;}
  catch(error){if((error as NodeJS.ErrnoException).code!=="EEXIST")throw error;}
  if(realpathSync(directory)!==directory)throw new Error("Staging operation directory uses aliases");
  const requestPath=join(directory,"request.json"),stages=join(directory,"candidates");
  if(created)durableJson(requestPath,request);
  else {
    if(!existsSync(requestPath))throw new Error("Staging reservation is incomplete; inspect original operation");
    if(digest(JSON.parse(narrativeFile(directory,requestPath)))!==digest(request))throw new Error("Staging operation identity differs");
    // The first caller may still be running. Never repeat a missing or unfinished installation.
    if(!existsSync(stages))throw new Error("Staging outcome unresolved; inspect original operation");
    const names=readdirSync(stages);
    if(names.length!==1)throw new Error("Staging candidate identity unresolved");
    const candidate=inspectRuntimeGeneration(join(stages,names[0]!));
    if(candidate.lockDigest!==digest(lock))throw new Error("Staging candidate lock differs");
    deadline?.remaining();
    return {state:"staged",directory:candidate.directory,operationDirectory:directory,reused:true};
  }
  const staged=stageRuntimeArchive(archive,lock,stages,deadline);
  return {state:"staged",directory:staged.directory,operationDirectory:directory,reused:false};
}
