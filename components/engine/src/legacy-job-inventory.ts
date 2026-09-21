import { lstatSync, opendirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { object, text } from "./core.ts";
import { narrativeFile } from "./narrative-inputs.ts";

function legacyResult(directory: string, id: string, state: string, protocol: number) {
  let raw: string;
  try { raw = narrativeFile(directory,"result.json"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  const value = object(JSON.parse(raw));
  if (value.job_id !== id || value.protocol_version !== protocol || value.state !== state)
    throw new Error("Legacy result identity differs from status");
  return {digest:`sha256:${createHash("sha256").update(raw).digest("hex")}`,
    cleanupReported:value.cleanup_confirmed === true ? "confirmed" : value.cleanup_confirmed === false ? "unconfirmed" : "unknown"};
}

/** Observe legacy ownership without invoking its mutating status/recovery API or claiming drain. */
export function legacyJobInventory(workspace: string, store: string, limit = 10000) {
  workspace = realpathSync(workspace);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10000) throw new Error("Legacy inventory limit must be 1..10000");
  store = realpathSync(store);
  const root = join(store,"jobs"), stat = lstatSync(root);
  if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(root) !== root) throw new Error("Invalid legacy job directory");
  const jobs: Array<{id:string; directory:string; state:string; protocolVersion:number; statusDigest:string; result:ReturnType<typeof legacyResult>}> = [];
  const issues: Array<{entry:string; reason:string}> = [];
  let inspected = 0, bytes = 0, truncated = false;
  const directory = opendirSync(root);
  try {
    for (let entry = directory.readSync(); entry; entry = directory.readSync()) {
      if (inspected >= limit) { truncated = true; break; }
      inspected++;
      try {
        if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(entry.name) || !entry.isDirectory() || entry.isSymbolicLink()) throw new Error("Invalid entry");
        const path = join(root,entry.name);
        if (realpathSync(path) !== path) throw new Error("Aliased entry");
        const raw = narrativeFile(path,"status.json"); bytes += Buffer.byteLength(raw);
        if (bytes > 32 * 1024 * 1024) { truncated = true; break; }
        const value = object(JSON.parse(raw));
        if (!(value.protocol_version === 1 || (value.protocol_version === 2 && value.kind === "test-batch")) || value.job_id !== entry.name)
          throw new Error("Unsupported identity");
        const recordedWorkspace = text(value.workspace,"legacy workspace");
        // Do not resolve historical paths: deleted/recreated worktrees cannot inherit their jobs.
        if (recordedWorkspace !== workspace) continue;
        const state = text(value.state,"legacy state",64);
        const result = legacyResult(path,entry.name,state,value.protocol_version);
        if (narrativeFile(path,"status.json") !== raw) throw new Error("Legacy status changed during observation");
        jobs.push({id:entry.name,directory:path,state,protocolVersion:value.protocol_version,result,
          statusDigest:`sha256:${createHash("sha256").update(raw).digest("hex")}`});
      } catch { issues.push({entry:entry.name,reason:"unreadable-or-unsupported-record"}); }
    }
  } finally { directory.closeSync(); }
  jobs.sort((a,b)=>a.id.localeCompare(b.id)); issues.sort((a,b)=>a.entry.localeCompare(b.entry));
  return {version:1,kind:"legacy-job-inventory",workspace,store,jobs,issues,inspected,truncated,
    scope:"exact-recorded-workspace",ownership:"legacy-owner-retained",drain:"unverified"};
}
