import { existsSync, lstatSync, mkdirSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import { parse } from "yaml";
import { digest, object } from "./core.ts";
import { narrativeFile } from "./narrative-inputs.ts";
import { compiledRuntimeLock } from "./runtime-lock.ts";
import { assertPortableStartupCutover } from "./startup-hook-cutover.ts";
import { prepareRuntimeOperation, type RuntimePreparation } from "./runtime-operation-preparation.ts";
import { completePreparedRuntimeOperation } from "./runtime-operation-completion.ts";
import { legacyMigrationInvocation } from "./legacy-migration-launch.ts";
import { readCurrentMigrationPlan } from "./runtime-migration-plan.ts";
import { MAX_BACKUP_INPUTS } from "./runtime-backup.ts";

/** Explicit local transition command; no package publication or implicit remote artifact selection. */
export async function runtimeOperationCommand(command: "init" | "update" | "repair", args: string[],
  installedScope?: {workspace:string;registry:string}) {
  const {values}=parseArgs({args,strict:true,allowPositionals:false,options:{
    "request-file":{type:"string"},"operation-directory":{type:"string"},"project-plan":{type:"string"},
    "request-digest":{type:"string"},
  }});
  if(!values["request-file"]||!values["operation-directory"]||!values["project-plan"])
    throw new Error("Installation request, operation directory and project plan required");
  const raw=object(JSON.parse(narrativeFile(process.cwd(),values["request-file"])));
  if(values["request-digest"] !== undefined && values["request-digest"] !== digest(raw))
    throw new Error("Installation request changed during handoff");
  const allowed=["mode","workspace","registry","archive","lock","expectedRevision","inputs","hostPlan","history","startupReceipts","lockedCheckout"];
  if(Object.keys(raw).some(key=>!allowed.includes(key))||typeof raw.workspace!=="string"||typeof raw.registry!=="string"||
    typeof raw.archive!=="string"||!Array.isArray(raw.inputs)||raw.mode!==command||!Number.isSafeInteger(raw.expectedRevision))
    throw new Error("Invalid installation request");
  if((raw.expectedRevision as number)<0 || !raw.inputs.length || raw.inputs.length>MAX_BACKUP_INPUTS)
    throw new Error("Invalid installation revision or backup scope");
  const paths=raw.inputs.map(value=>{
    const input=object(value);
    if(Object.keys(input).some(key=>!["path","kind"].includes(key)) || typeof input.path!=="string" ||
      resolve(input.path)!==input.path || !["file","sqlite","absent"].includes(input.kind as string))
      throw new Error("Invalid installation backup input");
    return input.path;
  });
  if(new Set(paths).size!==paths.length)throw new Error("Duplicate installation backup input");
  if(raw.startupReceipts!==undefined && (typeof raw.startupReceipts!=="string" || resolve(raw.startupReceipts)!==raw.startupReceipts || command==="repair"))throw new Error("Startup receipt store requires an absolute path and a host migration");
  if(raw.startupReceipts!==undefined && raw.startupReceipts!==join(dirname(raw.registry),"startup.sqlite"))
    throw new Error("Managed Codex hooks require the receipt store next to this worktree's installation registry");
  compiledRuntimeLock(raw.lock);
  if(raw.lockedCheckout!==undefined && (raw.lockedCheckout!==true || command!=="init"))throw new Error("Locked checkout requires explicit initial installation");
  const request={ ...raw, ...(command === "init" && raw.startupReceipts === undefined
    ? { startupReceipts: join(dirname(String(raw.registry)), "startup.sqlite") } : {}) } as unknown as RuntimePreparation;
  const workspace=realpathSync(request.workspace),directory=resolve(values["operation-directory"]);
  if(installedScope) {
    if(process.env.GOVERNANCE_MAINTENANCE_PROBE)throw new Error("Maintenance probe permits version readback only");
    if(command==="init" || workspace!==realpathSync(installedScope.workspace) ||
      request.registry!==realpathSync(installedScope.registry))throw new Error("Installation request differs from launcher scope");
  }
  if(workspace!==request.workspace||resolve(request.registry)!==request.registry||realpathSync(request.archive)!==request.archive)
    throw new Error("Installation request paths must be canonical");
  if(command==="update" && !request.startupReceipts)assertPortableStartupCutover(workspace,request.registry);
  const savedPath=join(directory,"operation.json");
  const saved=existsSync(savedPath)?JSON.parse(narrativeFile(directory,savedPath)):null;
  if(command === "init") {
    if(request.expectedRevision!==0 || request.history)throw new Error("Init requires a fresh installation");
    for(const name of ["config/governance/runtime.lock.yaml",".governance/runtime/bin/project-governance"]) {
      const path=join(workspace,name);
      const locked=request.lockedCheckout && name==="config/governance/runtime.lock.yaml";
      if(!request.inputs.some(input=>input.path===path && input.kind===(locked?"file":"absent")))
        throw new Error("Init requires absent installation targets in backup scope");
      if(locked && digest(compiledRuntimeLock(parse(narrativeFile(workspace,path))))!==digest(request.lock))
        throw new Error("Locked checkout differs from requested artifact");
      if(!saved && !locked && lstatSync(path,{throwIfNoEntry:false}))throw new Error("Init cannot replace an existing installation");
    }
    if(!saved && lstatSync(request.registry,{throwIfNoEntry:false}))throw new Error("Init requires a new registry");
  }
  const legacy=existsSync(join(workspace,"config/governance/runtime.lock.yaml")) &&
    parse(narrativeFile(workspace,"config/governance/runtime.lock.yaml"))?.schema_version===1;
  if((legacy||saved?.legacyLockRequired) && !process.env.GOVERNANCE_LEGACY_LOCK_FD) {
    const cli=fileURLToPath(new URL(import.meta.url.endsWith(".ts")?"./cli.ts":"./cli.js",import.meta.url));
    const invocation=legacyMigrationInvocation(workspace,cli,[command,"--request-file",resolve(values["request-file"]),
      "--operation-directory",directory,"--project-plan",resolve(values["project-plan"]),
      "--request-digest",digest(raw)],saved?directory:undefined);
    return JSON.parse(execFileSync(invocation.argv[0]!,invocation.argv.slice(1),{cwd:workspace,encoding:"utf8",maxBuffer:1024*1024}));
  }
  if(existsSync(join(directory,"prepared.json"))) {
    const expected={version:1,kind:"runtime-preparation",...request};
    if(saved?.requestDigest!==digest(expected))throw new Error("Installation resume request differs");
  } else {
    const plan=readCurrentMigrationPlan(values["project-plan"]);
    if(plan.workspace!==workspace || plan.inputs.some(input=>!request.inputs.some(value=>value.path===input.path&&value.kind===input.kind)))
      throw new Error("Installation request omits discovered project scope");
    if(command !== "repair" && digest(request.hostPlan ?? null)!==digest(plan.hostPlan))
      throw new Error("Installation request must bind the discovered host instruction plan");
    if(command === "init") {
      // Create only the product-owned layout, refusing aliases at each existing ancestor.
      for(const name of ["config","config/governance",".governance",".governance/runtime",".governance/runtime/bin",".githooks"]) {
        const path=join(workspace,name),entry=lstatSync(path,{throwIfNoEntry:false});
        if(entry && (!entry.isDirectory() || realpathSync(path)!==path))throw new Error("Init directory uses an alias or non-directory");
        if(!entry)mkdirSync(path,{mode:0o700});
      }
    }
    await prepareRuntimeOperation(request,directory,()=>{readCurrentMigrationPlan(values["project-plan"]!,plan.planDigest);});
  }
  return completePreparedRuntimeOperation(directory);
}
