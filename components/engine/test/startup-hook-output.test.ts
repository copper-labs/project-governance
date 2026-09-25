import {test} from "node:test";
import assert from "node:assert/strict";
import {startupHookOutput} from "../src/startup-hook-output.ts";
import {startupHooks} from "../src/startup-hooks.ts";

test("native hook output emits bounded actionable context only on initial discovery",()=>{
 const taskId=`sha256:${"a".repeat(64)}`,receipt={taskId,discovery:"complete",result:{status:"available",candidate:{untrusted:"DO NOT ECHO"}}};
 const result=startupHookOutput({hook_event_name:"SessionStart"},receipt);
 assert.equal(result.hookSpecificOutput?.hookEventName,"SessionStart");
 assert.match(result.hookSpecificOutput!.additionalContext,/startup assess/);
 assert.doesNotMatch(JSON.stringify(result),/DO NOT ECHO/);
 for(const name of ["SessionEnd","SubagentStart","UserPromptSubmit"])
  assert.deepEqual(startupHookOutput({hook_event_name:name},receipt),{});
 for(const status of ["manual","current","discovery-failed"])
  assert.deepEqual(startupHookOutput({hook_event_name:"SessionStart"},{...receipt,result:{status}}),{});
 assert.deepEqual(startupHookOutput({hook_event_name:"SessionStart"},{...receipt,discovery:undefined}),{});
 assert.deepEqual(startupHookOutput({hook_event_name:"SessionStart"},{...receipt,result:{status:"available",discoveryFresh:false}}),{});
 assert.match(startupHookOutput({hook_event_name:"SessionStart"},{...receipt,result:{status:"approval-required"}}).hookSpecificOutput!.additionalContext,/do not apply it automatically/);
});
test("generated SessionEnd hook respects native three-second limit",()=>{
 const hooks=startupHooks({},"/project","/receipts.sqlite").configuration.hooks as Record<string,{hooks:{timeout:number}[]}[]>;
 assert.equal(hooks.SessionEnd![0]!.hooks[0]!.timeout,3);
});
