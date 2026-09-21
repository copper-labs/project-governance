import { backup, DatabaseSync } from "node:sqlite";
import { mkdirSync, realpathSync, lstatSync, writeFileSync, chmodSync, openSync, fsyncSync, closeSync } from "node:fs";
import { dirname, basename, join, resolve } from "node:path";
import { RuntimeGenerations } from "./runtime-generations.ts";
import { digest, durableJson, fileDigest } from "./core.ts";
import { worktreeBytes } from "./change-subject.ts";

export const MAX_BACKUP_INPUTS = 256;
export interface BackupInput { path: string; kind: "sqlite" | "file" | "absent" }
/** Snapshot an explicitly declared, drained scope. Legacy writers must be drained before this boundary. */
export async function backupRuntimeState(registry: string, token: string, owner: string, inputs: BackupInput[], destination: string, validateScope?: () => void) {
  if (!inputs.length || inputs.length > MAX_BACKUP_INPUTS) throw new Error("Backup needs a bounded declared input set");
  const paths = inputs.map(input => resolve(input.path));
  if (new Set(paths).size !== paths.length || inputs.some(input => !["sqlite", "file", "absent"].includes(input.kind))) throw new Error("Invalid backup inputs");
  const receiptVersion = inputs.some(input => input.kind === "absent") ? 3 : 2;
  const generations = new RuntimeGenerations(registry);
  const assertDrained = () => {
    const state = generations.state();
    if (state.maintenance?.token !== token || state.maintenance.owner !== owner || state.readers.length) throw new Error("Backup requires owned maintenance and drained readers");
    return state;
  };
  let created = false;
  const databases: DatabaseSync[] = [];
  const rechecks: Array<() => void> = [];
  try {
    const state = assertDrained();
    validateScope?.();
    destination = resolve(destination);
    mkdirSync(destination, { mode: 0o700 }); created = true;
    const records: Array<{ source: string; kind: string; file: string | null; digest: string | null; mode: number | null }> = [];
    for (const [index, input] of inputs.entries()) {
      const source = paths[index]!;
      if (input.kind === "absent") {
        // Fresh projects may lack the product directories as well as the file. Bind
        // absence to the nearest existing ancestor without creating project state.
        let parent = dirname(source);
        while (!lstatSync(parent,{throwIfNoEntry:false})) {
          const next=dirname(parent);
          if(next===parent)throw new Error("Absent backup source has no existing ancestor");
          parent=next;
        }
        const identity = lstatSync(parent);
        const assertAbsent = () => {
          const current = lstatSync(parent);
          if (!current.isDirectory() || realpathSync(parent) !== parent || current.dev !== identity.dev || current.ino !== identity.ino) throw new Error("Absent backup parent changed");
          for(let ancestor=dirname(source);ancestor!==parent;ancestor=dirname(ancestor)) {
            const entry=lstatSync(ancestor,{throwIfNoEntry:false});
            if(entry && (!entry.isDirectory() || realpathSync(ancestor)!==ancestor))throw new Error("Absent backup parent changed");
          }
          try { lstatSync(source); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
          throw new Error("Declared absent backup source exists");
        };
        assertAbsent(); rechecks.push(assertAbsent);
        records.push({ source, kind: "absent", file: null, digest: null, mode: null });
        continue;
      }
      if (realpathSync(source) !== source || !lstatSync(source).isFile()) throw new Error("Backup source must be an ordinary canonical file");
      const file = `${index}.${input.kind === "sqlite" ? "sqlite" : "data"}`, output = join(destination, file);
      const identity = lstatSync(source);
      if (identity.mode & 0o7000) throw new Error("Backup source has unsupported special permissions");
      rechecks.push(() => {
        const current = lstatSync(source);
        if (!current.isFile() || current.dev !== identity.dev || current.ino !== identity.ino || current.mode !== identity.mode || realpathSync(source) !== source) throw new Error("Backup source identity changed");
      });
      if (input.kind === "sqlite") {
        const database = new DatabaseSync(source, { readOnly: true });
        databases.push(database);
        {
          const before = database.prepare("PRAGMA data_version").get()!;
          rechecks.push(() => { if (digest(before) !== digest(database.prepare("PRAGMA data_version").get()!)) throw new Error("Database changed during backup"); });
          await backup(database, output);
          if (digest(before) !== digest(database.prepare("PRAGMA data_version").get()!)) throw new Error("Database changed during backup");
          const copied = new DatabaseSync(output, { readOnly: true });
          try { if (copied.prepare("PRAGMA integrity_check").get()?.integrity_check !== "ok") throw new Error("Backup integrity failure"); }
          finally { copied.close(); }
        }
      } else {
        const captured = worktreeBytes(dirname(source), basename(source), 16 * 1024 * 1024);
        if (captured.type !== "regular") throw new Error("Backup source changed type");
        writeFileSync(output, captured.bytes, { flag: "wx", mode: 0o600 });
        const expected = digest(captured.bytes.toString("base64"));
        rechecks.push(() => {
          const current = worktreeBytes(dirname(source), basename(source), 16 * 1024 * 1024);
          if (current.type !== "regular" || digest(current.bytes.toString("base64")) !== expected) throw new Error("File changed during backup");
        });
      }
      chmodSync(output, 0o600);
      const fd = openSync(output, "r");
      try { fsyncSync(fd); } finally { closeSync(fd); }
      records.push({ source, kind: input.kind, file, digest: fileDigest(output), mode: identity.mode & 0o777 });
    }
    for (const recheck of rechecks) recheck();
    validateScope?.();
    if (assertDrained().revision !== state.revision) throw new Error("Generation changed during backup");
    const receipt = { version: receiptVersion, state: "verified", revision: state.revision, directory: state.directory,
      scope: "declared-inputs", written: state.written, maintenance: { token, owner }, records, createdAt: new Date().toISOString() };
    durableJson(join(destination, "backup.json"), receipt);
    return receipt;
  } catch (error) {
    if (created) durableJson(join(destination, "backup.json"), { version: receiptVersion, state: "failed", reason: "Backup incomplete; maintenance retained" });
    throw error;
  } finally { for (const database of databases) database.close(); generations.close(); }
}
