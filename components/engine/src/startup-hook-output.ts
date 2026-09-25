/** Native stdout is a host protocol, not the internal evidence record. */
export function startupHookOutput(event:unknown,receipt:unknown) {
 if(!event || typeof event!=="object" || !receipt || typeof receipt!=="object")return {};
 const name=(event as Record<string,unknown>).hook_event_name,r=receipt as Record<string,unknown>;
 if(name!=="SessionStart" || r.discovery!=="complete" || typeof r.taskId!=="string" || !/^sha256:[a-f0-9]{64}$/u.test(r.taskId))return {};
 const result=r.result as Record<string,unknown>|undefined;
 if(!result || result.discoveryFresh===false || !["available","approval-required"].includes(String(result.status)))return {};
 const message=result.status==="available"
  ? "A compatible governance runtime candidate is available. Before editing, assess whether this top-level task is clean/new or continuing existing work. Use startup assess for this task and the configured receipt store; apply only through startup apply if assessment permits. Discovery alone does not authorize activation."
  : "A governance runtime candidate requires explicit approval. Continue using the pinned runtime; do not apply it automatically.";
 return {hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:`${message} Task: ${r.taskId}.`}};
}
