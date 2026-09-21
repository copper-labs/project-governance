import { MAX_BACKUP_INPUTS } from "./runtime-backup.ts";
import { DatabaseSync } from "node:sqlite";
import { realpathSync, lstatSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { narrativeFile } from "./narrative-inputs.ts";
import { digest, fileDigest, object, text } from "./core.ts";

/** Readback checks backup bytes, never restores files or treats the backup as post-write rollback authority. */
export function inspectRuntimeBackup(directory: string) {
  directory = realpathSync(directory);
  const receipt = object(JSON.parse(narrativeFile(directory, "backup.json")));
  if ((receipt.version !== 2 && receipt.version !== 3) || receipt.state !== "verified" || receipt.scope !== "declared-inputs" ||
      !Number.isSafeInteger(receipt.revision) || Number(receipt.revision) < 0 ||
      (receipt.directory !== null && (typeof receipt.directory !== "string" || !isAbsolute(receipt.directory))) ||
      !Array.isArray(receipt.records) || !receipt.records.length || receipt.records.length > MAX_BACKUP_INPUTS) throw new Error("Invalid backup receipt");
  const sources = new Set<string>();
  const maintenance = object(receipt.maintenance);
  text(maintenance.token, "backup maintenance token"); text(maintenance.owner, "backup maintenance owner");
  for (const [index, raw] of receipt.records.entries()) {
    const record = object(raw), source = text(record.source, "backup source");
    if (!isAbsolute(source) || sources.has(source) || !["sqlite", "file", "absent"].includes(String(record.kind))) throw new Error("Invalid backup record");
    sources.add(source);
    if (record.kind === "absent") {
      if (receipt.version !== 3 || record.file !== null || record.digest !== null || record.mode !== null) throw new Error("Invalid absent backup identity");
      continue;
    }
    if (!Number.isInteger(record.mode) || Number(record.mode) < 0 || Number(record.mode) > 0o777) throw new Error("Invalid backup permissions");
    const expected = `${index}.${record.kind === "sqlite" ? "sqlite" : "data"}`;
    if (record.file !== expected || typeof record.digest !== "string" || !/^sha256:[a-f0-9]{64}$/u.test(record.digest)) throw new Error("Invalid backup identity");
    const path = join(directory, expected), stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(path) !== path || fileDigest(path) !== record.digest) throw new Error("Backup payload changed");
    if (record.kind === "sqlite") {
      const database = new DatabaseSync(path, { readOnly: true });
      try { if (database.prepare("PRAGMA integrity_check").get()?.integrity_check !== "ok") throw new Error("Backup database invalid"); }
      finally { database.close(); }
    }
  }
  return { state: "verified", directory, receiptDigest: digest(receipt), revision: Number(receipt.revision),
    generation: receipt.directory, written: typeof receipt.written === "boolean" ? receipt.written : null, maintenance, records: receipt.records, scope: "declared-inputs", restoration: "not-performed" };
}
