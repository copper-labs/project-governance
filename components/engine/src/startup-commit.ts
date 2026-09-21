import {existsSync} from "node:fs";
import {digest} from "./core.ts";
import {stableStartupVersion} from "./startup-compatibility.ts";
import {assertStartupGitTransition,type startupGitSnapshot} from "./startup-git.ts";
import {commandExecutable} from "./native-check-command.ts";
import {commandEnvironment,submitCommand,waitCommand} from "./process-owner.ts";

/** The caller must hold update maintenance and journal this command before committing. */
export async function commitStartupLock(input:{before:ReturnType<typeof startupGitSnapshot>;original:string;candidate:string;
 version:string;directory:string;deadlineMs:number;maintenance?:{token:string;owner:string;registry:string;workspace:string}}) {
 stableStartupVersion(input.version);
 if(!Number.isSafeInteger(input.deadlineMs) || input.deadlineMs<1 || input.deadlineMs>3600000)
  throw new Error("Invalid startup commit deadline");
 if(Object.keys(process.env).some(key=>key.startsWith("GIT_CONFIG") && process.env[key]))
  throw new Error("Startup commit requires stable file-based Git configuration");
 const env=commandEnvironment({});
 if(input.maintenance){
  env.GOVERNANCE_STARTUP_TOKEN=input.maintenance.token;env.GOVERNANCE_STARTUP_OWNER=input.maintenance.owner;
  env.GOVERNANCE_STARTUP_REGISTRY=input.maintenance.registry;env.GOVERNANCE_STARTUP_WORKSPACE=input.maintenance.workspace;
 }
 for(const name of ["SSH_AUTH_SOCK","GPG_TTY","GIT_AUTHOR_NAME","GIT_AUTHOR_EMAIL","GIT_COMMITTER_NAME","GIT_COMMITTER_EMAIL"])
  if(process.env[name]!==undefined)env[name]=process.env[name]!;
 if(!existsSync(input.directory))assertStartupGitTransition(input.before,input.original,input.candidate);
 const submitted=submitCommand(input.directory,{id:`startup-commit:${digest(input)}`,
  operation:{argv:[commandExecutable("git",input.before.workspace),"commit","--only","--file","-","--",":(literal)config/governance/runtime.lock.yaml"],
   cwd:input.before.workspace,env,expectedExitCodes:[0],effect:"local"},
  stdin:`Adopt governance ${input.version} for new work\n\nUse the compatible verified runtime before substantial implementation begins. The isolated lock update preserves existing project work and policy.\n`,
  deadlineMs:input.deadlineMs,outputLimit:1024*1024});
 const deadline=Date.now()+input.deadlineMs+5000;
 while(Date.now()<deadline){
  const observed=await waitCommand(submitted.directory,submitted.requestDigest,Math.min(1000,deadline-Date.now()));
  if(!observed.receipt)continue;
  const receipt=observed.receipt;
  if(receipt.state!=="succeeded" || receipt.exitCode!==0 || receipt.cleanup!=="confirmed")
   return {status:"recovery-required" as const,command:submitted,receipt};
  const commit=assertStartupGitTransition(input.before,input.original,input.candidate,true);
  return {status:"committed" as const,commit,command:submitted,receipt};
 }
 return {status:"recovery-required" as const,command:submitted,reason:"command-outcome-unresolved"};
}
