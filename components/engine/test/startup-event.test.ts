import {test} from "node:test";
import assert from "node:assert/strict";
import {startupEvent} from "../src/startup-event.ts";
const event={session_id:"session-one",hook_event_name:"SessionStart",source:"startup"};
test("startup event discovers only for unseen top-level Codex startup",()=>{
 const initial=startupEvent("codex",event,process.cwd(),false,{});
 assert.equal(initial.discover,true);assert.equal(initial.action,"reserve");
 const repeat=startupEvent("codex",event,process.cwd(),true,{});
 assert.equal(repeat.discover,false);assert.equal(repeat.action,"reserve");
 for(const source of ["resume","fork","clear","compact",undefined])assert.equal(startupEvent("codex",{...event,source},process.cwd(),false,{}).discover,false);
 assert.equal(startupEvent("codex",{...event,hook_event_name:"UserPromptSubmit"},process.cwd(),false,{}).discover,false);
 const ended=startupEvent("codex",{...event,hook_event_name:"SessionEnd"},process.cwd(),true,{});
 assert.equal(ended.action,"close");assert.equal(ended.discover,false);
 if("taskId" in initial && "taskId" in ended)assert.equal(initial.taskId,ended.taskId);
});
test("startup rejects workers, unsupported hosts and malformed identities before filesystem access",()=>{
 for(const env of [{HARNESS_AGENT_ANCESTRY:"malformed"},{GOVERNANCE_PARENT_TASK:"parent"},{GOVERNANCE_PARENT_LOCK_DIGEST:"digest"}])
  assert.equal(startupEvent("codex",event,"/does-not-exist",false,env).action,"defer");
 for(const value of [null,[],{...event,agent_id:"child"},{...event,hook_event_name:"SubagentStart"},{...event,session_id:""},{...event,session_id:"a\u0000b"}])
  assert.equal(startupEvent("codex",value,"/does-not-exist",false,{}).action,"defer");
 for(const provider of ["claude","gemini","unknown"])assert.equal(startupEvent(provider,event,"/does-not-exist",false,{}).discover,false);
});
