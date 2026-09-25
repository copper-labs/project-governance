import { object } from "./core.ts";

/** Preserve repository opt-in and bounded budgets; this grants no host or release authority. */
export function startupPolicy(profile: unknown) {
  const document=object(profile,"governance profile"),raw=document.runtime_updates;
  const value=raw===undefined?{}:object(raw,"runtime_updates");
  const fields=["policy","cache_seconds","discovery_seconds","install_seconds"];
  if(Object.keys(value).some(key=>!fields.includes(key)))throw new Error("Unsupported startup policy field");
  const policy=value.policy===undefined?"manual":value.policy;
  if(policy!=="manual" && policy!=="compatible")throw new Error("Unsupported startup policy");
  const budget=(key:string,fallback:number,maximum:number)=>{
    const selected=value[key]===undefined?fallback:value[key];
    if(typeof selected!=="number" || !Number.isFinite(selected) || selected<=0 || selected>maximum)
      throw new Error(`Invalid startup ${key}`);
    return selected;
  };
  return {policy,cache_seconds:budget("cache_seconds",86400,604800),
    discovery_seconds:budget("discovery_seconds",5,60),install_seconds:budget("install_seconds",180,3600)};
}

/** Parent assessment cannot override repository policy, host identity or release validation. */
export function startupWorkAssessment(profile:unknown,workState:string,reason:string) {
  if(typeof reason!=="string" || !reason.trim() || reason.length>1000)throw new Error("A bounded work assessment reason is required");
  if(!["not-started","minor","substantial-plan","review","read-only"].includes(workState))throw new Error("Unknown startup work state");
  const settings=startupPolicy(profile);
  if(workState!=="not-started" && workState!=="minor")return {eligible:false,reason:"task-retains-runtime",settings};
  if(settings.policy!=="compatible")return {eligible:false,reason:"manual-policy",settings};
  return {eligible:true,reason:"requires-host-release-and-worktree-validation",settings};
}
