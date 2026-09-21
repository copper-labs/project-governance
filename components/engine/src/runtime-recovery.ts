import { legacyRuntimeEntrypoints } from "./runtime-legacy-retirement.ts";
import { realpathSync, readFileSync, openSync, writeFileSync, fsyncSync, closeSync, renameSync, chmodSync, lstatSync } from "node:fs";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { RuntimeGenerations } from "./runtime-generations.ts";
import { inspectRuntimeBackup } from "./runtime-backup-inspection.ts";
import { inspectRuntimeGeneration } from "./runtime-inspection.ts";
import { runtimeLauncher } from "./runtime-launcher.ts";
import { narrativeFile } from "./narrative-inputs.ts";
import { canonical, object, digest, fileDigest } from "./core.ts";
import { parse } from "yaml";
import { execFileSync } from "node:child_process";
import { legacyRuntimeLock } from "./legacy-runtime-lock.ts";
import { commandEnvironment } from "./process-owner.ts";
import { compiledRuntimeLock } from "./runtime-lock.ts";

/** Restore installation-owned files only before runtime writes. New task evidence is never restored away. */
export function recoverPrewriteActivation(registry: string, workspace: string, backupDirectory: string, token: string, owner: string, candidateLockText?: string) {
  registry = realpathSync(registry); workspace = realpathSync(workspace);
  const backup = inspectRuntimeBackup(backupDirectory), generations = new RuntimeGenerations(registry);
  try {
    generations.assertNoRepair(token);
    const legacy = backup.generation === null;
    const retired = legacy ? legacyRuntimeEntrypoints(workspace).filter(({path, expectedDigest}) => backup.records.some(raw => { const record=object(raw); return record.source===path && record.kind==="file" && (!expectedDigest || record.digest===expectedDigest); })).map(entry => entry.path) : [];
    const verifyLegacy = () => {
      const lock = legacyRuntimeLock(parse(narrativeFile(workspace, "config/governance/runtime.lock.yaml")));
      const readback = execFileSync(join(workspace, ".governance/runtime/bin/project-governance"), ["--version"],
        { cwd: workspace, encoding: "utf8", timeout: 15000, maxBuffer: 16384, env: commandEnvironment({}) }).trim();
      if (readback !== `project-governance ${lock.version}`) throw new Error("Restored wheel version readback failed");
    };
    const state = generations.state();
    const operation = digest({ kind: "pre-write-recovery", workspace, backup: backup.receiptDigest, token, owner });
    const completed = generations.activation(operation);
    if (completed) {
      if (completed.revision !== state.revision || completed.directory !== state.directory || state.maintenance?.token !== token || state.maintenance.owner !== owner || state.written || state.readers.length) throw new Error("Recovered generation no longer matches maintenance");
      const restored = [join(workspace, "config/governance/runtime.lock.yaml"), join(workspace, ".governance/runtime/bin/project-governance")];
      restored.push(...retired);
      for (const path of restored) {
        const record = backup.records.map(raw => object(raw)).find(record => record.source === path && record.kind === "file");
        if (!record || realpathSync(path) !== path || fileDigest(path) !== record.digest || (lstatSync(path).mode & 0o777) !== record.mode) throw new Error("Recovered files changed after restoration");
      }
      if (legacy) verifyLegacy(); else inspectRuntimeGeneration(String(state.directory));
      return { state, restored, admission: "maintenance-retained-for-recovery-readback" };
    }
    if (!state.directory || state.written || state.readers.length || state.maintenance?.token !== token || state.maintenance.owner !== owner ||
        backup.maintenance.token !== token || backup.maintenance.owner !== owner || state.revision !== backup.revision + 1 ||
        state.previous !== backup.generation || (!legacy && typeof backup.generation !== "string")) throw new Error("Pre-write recovery unavailable; preserve evidence and forward-repair");
    const candidate = inspectRuntimeGeneration(state.directory);
    if (!legacy) inspectRuntimeGeneration(String(backup.generation));
    const installation = object(JSON.parse(narrativeFile(state.directory, "installation.json")));
    if (candidateLockText !== undefined && digest(compiledRuntimeLock(parse(candidateLockText))) !== candidate.lockDigest)
      throw new Error("Recovery candidate lock differs from installed identity");
    const expected: Array<{path:string;content:string|null;mode:number}> = [
      { path: join(workspace, "config/governance/runtime.lock.yaml"), content: candidateLockText ?? canonical(installation.lock) + "\n", mode: 0o600 },
      { path: join(workspace, ".governance/runtime/bin/project-governance"), content: runtimeLauncher(realpathSync(process.execPath), String(candidate.executable), registry, workspace), mode: 0o700 },
    ];
    for (const path of retired) expected.push({path,content:null,mode:0o700});
    // Validate every destination before changing either; unexpected edits remain untouched.
    const restores = expected.map(item => {
      let absent=false;
      try { lstatSync(item.path); } catch(error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; absent=true; }
      if (absent ? item.content !== null || realpathSync(dirname(item.path)) !== dirname(item.path) : realpathSync(item.path) !== item.path) throw new Error("Recovery destination uses a symlink or is unexpectedly absent");
      const record = backup.records.map(raw => object(raw)).find(record => record.source === item.path && record.kind === "file");
      if (!record) throw new Error("Recovery file missing from backup");
      const bytes = readFileSync(join(backup.directory, String(record.file))), current = absent ? null : readFileSync(item.path);
      if (current !== null && !current.equals(bytes) && (item.content === null || !current.equals(Buffer.from(item.content)))) throw new Error("Recovery would overwrite unrelated edits");
      return { ...item, bytes, mode: Number(record.mode) };
    });
    if (legacy) legacyRuntimeLock(parse(restores[0]!.bytes.toString("utf8")));
    for (const item of restores) {
      const temporary = `${item.path}.${randomUUID()}.tmp`, fd = openSync(temporary, "wx", item.mode);
      try { writeFileSync(fd, item.bytes); chmodSync(temporary, item.mode); fsyncSync(fd); } finally { closeSync(fd); }
      renameSync(temporary, item.path);
      const directory = openSync(dirname(item.path), "r");
      try { fsyncSync(directory); } finally { closeSync(directory); }
    }
    if (legacy) verifyLegacy();
    return { state: generations.rollback(state.revision, token, operation, legacy), restored: restores.map(item => item.path),
      admission: "maintenance-retained-for-recovery-readback" };
  } finally { generations.close(); }
}
