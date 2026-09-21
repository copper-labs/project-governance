import {join} from "node:path";
import {parse} from "yaml";
import {digest,fileDigest} from "./core.ts";
import {narrativeFile} from "./narrative-inputs.ts";
import {startupEvent} from "./startup-event.ts";
import {startupStatus} from "./startup-status.ts";
import {startupWorkAssessment} from "./startup-policy.ts";
import {startupGitSnapshot} from "./startup-git.ts";
import {captureStartupHostOwner,requireCurrentStartupHost} from "./startup-host-owner.ts";

/** Bind a parent's scope assessment to its native receipt before expensive preparation. */
export function assessStartup(input:{workspace:string;registry:string;receipts:string;task:string;workState:string;reason:string},
 environment:NodeJS.ProcessEnv=process.env,capture=captureStartupHostOwner) {
 const native=startupEvent("codex",{session_id:environment.CODEX_THREAD_ID,hook_event_name:"UserPromptSubmit"},input.workspace,true,environment);
 if(native.action!=="reserve" || native.taskId!==input.task)throw new Error("Startup assessment requires the owning native parent task");
 const status=startupStatus(input.receipts,input.task,input);
 if(status.state!=="open")throw new Error("Startup assessment requires an open task");
 const lockPath=join(native.root,"config/governance/runtime.lock.yaml");
 if(fileDigest(lockPath)!==status.lockDigest)throw new Error("Runtime changed; refresh task context before assessment");
 const profileText=narrativeFile(native.root,"config/governance/profile.yaml");
 const assessment=startupWorkAssessment(parse(profileText),input.workState,input.reason);
 const identity={task:input.task,lockDigest:status.lockDigest,workState:input.workState,reason:input.reason,
  profileDigest:digest(profileText),bindingDigest:status.bindingDigest};
 if(!assessment.eligible)return {...identity,status:"deferred" as const,reason:assessment.reason};
 if(!status.owner)return {...identity,status:"deferred" as const,reason:"native-owner-unrecorded"};
 const host=requireCurrentStartupHost(status.owner.host,capture);
 const snapshot=startupGitSnapshot(native.root,environment);
 requireCurrentStartupHost(host,capture);
 return {...identity,status:"preparation-required" as const,snapshot,settings:assessment.settings,
  authority:"assessment-only" as const};
}
