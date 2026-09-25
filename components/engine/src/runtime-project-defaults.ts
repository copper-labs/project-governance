import { closeSync, fchmodSync, fsyncSync, linkSync, lstatSync, openSync, realpathSync, unlinkSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { object } from "./core.ts";
import { narrativeFile } from "./narrative-inputs.ts";
import { inspectRuntimeBackup } from "./runtime-backup-inspection.ts";
import { RuntimeGenerations } from "./runtime-generations.ts";
import { GIT_HOOKS, gitHookLauncher } from "./git-hooks.ts";

export const PROJECT_DEFAULTS: Record<string,string> = {
  "config/governance/profile.yaml":"schema_version: 1\nproject_extensions: []\ncontext_router:\n  default_route: project\n  routes:\n    - id: project\n      token_budget:\n        primary_context_tokens: 1500\n        active_plan_context_tokens: 500\n        expansion_context_tokens: 1500\n        total_context_tokens: 3500\n",
  "config/governance/facts.lock.yaml":"schema_version: 1\nfacts: {}\n",
  ".governance/.gitignore":"*\n!.gitignore\n",
  ...Object.fromEntries(GIT_HOOKS.map(hook=>[`.githooks/${hook}`,gitHookLauncher(hook)])),
};

/** Create only backed absent defaults; authored project configuration remains project-owned. */
export function installProjectDefaults(workspace:string,registry:string,backupDirectory:string,token:string,owner:string) {
  const backup=inspectRuntimeBackup(backupDirectory),generations=new RuntimeGenerations(registry);
  try {
    if(backup.maintenance.token!==token || backup.maintenance.owner!==owner || backup.generation!==null)
      throw new Error("Project defaults require the initial installation backup");
    const state=generations.state();
    const owned=state.maintenance?.token===token && state.maintenance.owner===owner && !state.readers.length;
    if(!owned && !generations.finalization(token,owner))throw new Error("Project defaults require owned installation maintenance");
    for(const [relative,content] of Object.entries(PROJECT_DEFAULTS)) {
      const path=join(workspace,relative),record=backup.records.map(value=>object(value)).find(value=>value.source===path);
      if(!record)throw new Error("Project default missing from backup scope");
      if(record.kind==="file")continue;
      if(record.kind!=="absent" || realpathSync(dirname(path))!==dirname(path))throw new Error("Invalid project default target");
      const entry=lstatSync(path,{throwIfNoEntry:false});
      if(entry) {
        if(!entry.isFile() || narrativeFile(workspace,path)!==content ||
          (relative.startsWith(".githooks/") && (entry.mode & 0o777)!==0o755))throw new Error("Project default changed since backup");
        continue;
      }
      if(!owned)throw new Error("Completed project default is missing");
      const temporary=`${path}.${randomUUID()}.tmp`;
      const mode=relative.startsWith(".githooks/")?0o755:0o644;
      const fd=openSync(temporary,"wx",mode);
      try {
        try{writeFileSync(fd,content);fchmodSync(fd,mode);fsyncSync(fd);}finally{closeSync(fd);}
        // A hard-link publish is atomic and fails if another writer created the target.
        linkSync(temporary,path);
      } finally {unlinkSync(temporary);}
      const parent=openSync(dirname(path),"r");try{fsyncSync(parent);}finally{closeSync(parent);}
    }
  }finally{generations.close();}
}
