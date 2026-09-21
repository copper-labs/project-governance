import {realpathSync} from "node:fs";

/** Permit only the commit's native validation hooks under its exact maintenance identity. */
export function startupHookAdmission(args:string[],workspace:string,registry:string,
 maintenance:Record<string,unknown>|null,environment:NodeJS.ProcessEnv=process.env):string|undefined {
 const names=["GOVERNANCE_STARTUP_TOKEN","GOVERNANCE_STARTUP_OWNER","GOVERNANCE_STARTUP_WORKSPACE","GOVERNANCE_STARTUP_REGISTRY"] as const;
 if(!names.some(name=>environment[name]!==undefined))return undefined;
 if(names.some(name=>!environment[name]))throw new Error("Incomplete startup hook maintenance identity");
 if(environment.GOVERNANCE_MAINTENANCE_PROBE)throw new Error("Startup hooks cannot use version-probe authority");
 const token=environment.GOVERNANCE_STARTUP_TOKEN!,owner=environment.GOVERNANCE_STARTUP_OWNER!;
 if(!/^startup-update:sha256:[a-f0-9]{64}$/u.test(owner) || maintenance?.token!==token || maintenance.owner!==owner)
  throw new Error("Startup hook maintenance ownership differs");
 if(realpathSync(workspace)!==realpathSync(environment.GOVERNANCE_STARTUP_WORKSPACE!) ||
  realpathSync(registry)!==realpathSync(environment.GOVERNANCE_STARTUP_REGISTRY!))throw new Error("Startup hook scope differs");
 if(args[0]!=="hook" || !((args[1]==="pre-commit" && args.length===2) ||
  (args[1]==="commit-msg" && args.length===3 && Boolean(args[2]))))throw new Error("Startup maintenance permits commit validation hooks only");
 return token;
}
