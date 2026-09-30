import { checkObservationContext } from "./check-observation-context.ts";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, lstatSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { canonical, digest } from "./core.ts";
import type { RunMetric } from "./check-telemetry.ts";
import { RELEASE_VERSION } from "./release-version.ts";
const MAX_RECORDS = 1000, MAX_BYTES = 1024 * 1024;
const fields = ["version", "run_id", "workspace", "stage", "runtime_version", "status", "termination_reason", "duration_ms", "started_at", "ended_at", "pack_count", "command_count", "blocked_pack_count", "result_digest"];

/** Accept only compact measured values. Source text, prompts and native logs have no field here. */
function metricValue(value: RunMetric): string {
  if (Object.keys(value).length !== fields.length + (Object.hasOwn(value, "trigger") ? 1 : 0) + (Object.hasOwn(value, "expected_status") ? 1 : 0) || fields.some(key => !Object.hasOwn(value, key)) || value.version !== 1 ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(value.run_id) ||
      typeof value.workspace !== "string" || value.workspace.length > 4096 ||
      (value.stage !== null && (typeof value.stage !== "string" || !/^[a-z][a-z0-9-]{0,63}$/u.test(value.stage))) ||
      !["passed", "warning", "failed"].includes(value.status) ||
      typeof value.runtime_version !== "string" || value.runtime_version.length > 64 ||
      !/^[a-z][a-z0-9-]{0,63}$/u.test(value.termination_reason) ||
      !/^sha256:[a-f0-9]{64}$/u.test(value.result_digest)) throw new Error("Invalid telemetry projection");
  for (const count of [value.duration_ms, value.pack_count, value.command_count, value.blocked_pack_count]) {
    if (!Number.isSafeInteger(count) || count < 0) throw new Error("Invalid telemetry count");
  }
  if (!Number.isFinite(Date.parse(value.started_at)) || !Number.isFinite(Date.parse(value.ended_at)) || Date.parse(value.ended_at) < Date.parse(value.started_at)) throw new Error("Invalid telemetry interval");
  checkObservationContext(value.trigger, value.expected_status);
  const encoded = canonical(value);
  if (Buffer.byteLength(encoded) > 16384) throw new Error("Telemetry record exceeds budget");
  return encoded;
}
function location(root: string, workspace: string, create: boolean): string {
  if (create) mkdirSync(root, { recursive: true, mode: 0o700 });
  root = realpathSync(root); workspace = realpathSync(workspace);
  const directory = join(root, "telemetry");
  if (create) mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(directory) !== directory) throw new Error("Invalid telemetry directory");
  const path = join(directory, `${digest(workspace).slice(7)}.sqlite`);
  try { const file = lstatSync(path); if (!file.isFile() || file.isSymbolicLink() || file.size > 8 * 1024 * 1024) throw new Error("Invalid telemetry database"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  return path;
}

export interface ContextMetric {
  version: 1; id: string; workspace: string; runtimeVersion: string; capturedAt: string;
  kind: "entry" | "route" | "decision" | "usage" | "outcome" | "expansion" | "failure" | "observation";
  entryId: string | null; routeId: string | null; familyId: string | null; taskId: string | null; taskRevision: string | null;
  status: string; reason: string | null; counts: Record<string, number | null>;
}
const contextFields = ["version", "id", "workspace", "runtimeVersion", "capturedAt", "kind", "entryId", "routeId", "familyId", "taskId", "taskRevision", "status", "reason", "counts"];
function contextValue(value: ContextMetric) {
  if (Object.keys(value).length !== contextFields.length || contextFields.some(key => !Object.hasOwn(value, key)) || value.version !== 1 ||
      !["entry", "route", "decision", "usage", "outcome", "expansion", "failure", "observation"].includes(value.kind) ||
      !/^[a-z0-9-]{1,128}$/u.test(value.id) || typeof value.workspace !== "string" || value.workspace.length > 4096 ||
      typeof value.runtimeVersion !== "string" || value.runtimeVersion.length > 64 || !Number.isFinite(Date.parse(value.capturedAt)) ||
      !/^[a-z][a-z0-9-]{0,127}$/u.test(value.status) || value.reason !== null && !/^[a-z][a-z0-9-]{0,127}$/u.test(value.reason)) throw new Error("Invalid context metric");
  for (const field of [value.entryId, value.routeId, value.familyId, value.taskId, value.taskRevision])
    if (field !== null && (typeof field !== "string" || field.length > 256 || /[\x00-\x1f]/u.test(field))) throw new Error("Invalid metric reference");
  if (!value.counts || typeof value.counts !== "object" || Array.isArray(value.counts) || Object.keys(value.counts).length > 64 ||
      Object.entries(value.counts).some(([key, count]) => !/^[a-zA-Z][a-zA-Z0-9]{0,63}$/u.test(key) || count !== null &&
        (typeof count !== "number" || !Number.isFinite(count) || count < 0))) throw new Error("Invalid context counts");
  const encoded = canonical(value);
  if (Buffer.byteLength(encoded) > 16384) throw new Error("Context metric exceeds budget");
  return encoded;
}

/** Extend the same bounded SQLite projection; receipts, never this cache, own operational proof. */
export function projectContextMetric(root: string, value: Omit<ContextMetric, "version" | "runtimeVersion">): boolean {
  let database: DatabaseSync | undefined;
  try {
    const metric: ContextMetric = { ...value, version: 1, runtimeVersion: RELEASE_VERSION }, encoded = contextValue(metric);
    if (realpathSync(metric.workspace) !== metric.workspace) throw new Error("Noncanonical metric workspace");
    database = new DatabaseSync(location(root, metric.workspace, true));
    database.exec("PRAGMA busy_timeout=0; PRAGMA max_page_count=1024; BEGIN IMMEDIATE;");
    const version = Number(database.prepare("PRAGMA user_version").get()!.user_version);
    if (version !== 0 && version !== 1) throw new Error("Unsupported telemetry schema");
    if (version === 0) {
      if (database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().length) throw new Error("Unknown telemetry database");
      database.exec(`CREATE TABLE metrics(id TEXT PRIMARY KEY, ended INTEGER NOT NULL, bytes INTEGER NOT NULL, payload TEXT NOT NULL);
        CREATE TABLE retention(id INTEGER PRIMARY KEY CHECK(id=1), evicted_records INTEGER NOT NULL, evicted_bytes INTEGER NOT NULL);
        INSERT INTO retention VALUES(1,0,0); PRAGMA user_version=1;`);
    }
    database.exec(`CREATE TABLE IF NOT EXISTS context_metrics(id TEXT NOT NULL, kind TEXT NOT NULL, captured INTEGER NOT NULL,
      runtime TEXT NOT NULL, bytes INTEGER NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(kind,id));
      CREATE INDEX IF NOT EXISTS context_recent ON context_metrics(captured DESC);
      CREATE TABLE IF NOT EXISTS context_retention(id INTEGER PRIMARY KEY CHECK(id=1), evicted_records INTEGER NOT NULL, evicted_bytes INTEGER NOT NULL);
      INSERT OR IGNORE INTO context_retention VALUES(1,0,0);`);
    const previous = database.prepare("SELECT payload FROM context_metrics WHERE kind=? AND id=?").get(metric.kind, metric.id);
    if (previous && previous.payload !== encoded) throw new Error("Context metric identity conflict");
    if (!previous) database.prepare("INSERT INTO context_metrics VALUES(?,?,?,?,?,?)").run(metric.id, metric.kind, Date.parse(metric.capturedAt), metric.runtimeVersion, Buffer.byteLength(encoded), encoded);
    let bytes = 0, count = 0, lostBytes = 0, lostCount = 0;
    for (const row of database.prepare("SELECT id,kind,bytes FROM context_metrics ORDER BY captured DESC,kind,id DESC").all()) {
      if (count < MAX_RECORDS && bytes + Number(row.bytes) <= MAX_BYTES) { count++; bytes += Number(row.bytes); }
      else { database.prepare("DELETE FROM context_metrics WHERE kind=? AND id=?").run(String(row.kind), String(row.id)); lostCount++; lostBytes += Number(row.bytes); }
    }
    database.prepare("UPDATE context_retention SET evicted_records=evicted_records+?,evicted_bytes=evicted_bytes+? WHERE id=1").run(lostCount, lostBytes);
    database.exec("COMMIT"); return true;
  } catch { return false; }
  finally { try { database?.close(); } catch { /* Projection failure never replaces its receipt owner. */ } }
}

/** Filter before limiting; reads never create or repair a projection. */
export function readContextProjection(root: string, workspace: string, options: { since?: number; runtimeVersion?: string; kinds?: ContextMetric["kind"][]; limit?: number } = {}) {
  let database: DatabaseSync | undefined;
  const limit = options.limit ?? MAX_RECORDS;
  try {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_RECORDS) throw new Error("Invalid context metric limit");
    database = new DatabaseSync(location(root, workspace, false), { readOnly: true }); database.exec("BEGIN");
    if (database.prepare("PRAGMA user_version").get()?.user_version !== 1) throw new Error("Unsupported telemetry schema");
    const retention = database.prepare("SELECT * FROM context_retention WHERE id=1").get();
    if (!retention || [retention.evicted_records, retention.evicted_bytes].some(value => !Number.isSafeInteger(value) || Number(value) < 0)) throw new Error("Invalid context retention");
    const where = ["captured>=?"], parameters: (string | number)[] = [Number.isFinite(options.since) ? options.since! : 0];
    if (options.runtimeVersion) { where.push("runtime=?"); parameters.push(options.runtimeVersion); }
    if (options.kinds?.length) { where.push(`kind IN (${options.kinds.map(() => "?").join(",")})`); parameters.push(...options.kinds); }
    const rows = database.prepare(`SELECT * FROM context_metrics WHERE ${where.join(" AND ")} ORDER BY captured DESC,kind,id DESC LIMIT ?`).all(...parameters, limit + 1);
    let bytes = 0;
    const records = rows.slice(0, limit).map(row => {
      const value = JSON.parse(String(row.payload)) as ContextMetric, size = Buffer.byteLength(contextValue(value));
      bytes += size;
      if (row.id !== value.id || row.kind !== value.kind || row.runtime !== value.runtimeVersion || row.captured !== Date.parse(value.capturedAt) || row.bytes !== size ||
          bytes > MAX_BYTES || value.workspace !== realpathSync(workspace)) throw new Error("Context projection identity mismatch");
      return value;
    });
    database.exec("COMMIT");
    return { state: "available" as const, records, truncated: rows.length > limit, evictedRecords: Number(retention.evicted_records),
      evictedBytes: Number(retention.evicted_bytes), writeCoverage: "not-verified", selection: "newest-matching-cache-records; receipt-inventory-not-verified", limits: { records: MAX_RECORDS, bytes: MAX_BYTES } };
  } catch { return { state: "unavailable" as const, records: [] as ContextMetric[], truncated: false, evictedRecords: null,
    evictedBytes: null, writeCoverage: "unknown", selection: "projection-unavailable", limits: { records: MAX_RECORDS, bytes: MAX_BYTES } }; }
  finally { try { database?.close(); } catch { /* Keep the read-only diagnostic. */ } }
}

/** Advisory, bounded projection only. Operational results and private frozen evaluations are never pruned. */
export function projectRunMetric(root: string, value: RunMetric): boolean {
  let database: DatabaseSync | undefined;
  try {
    const encoded = metricValue(value);
    if (realpathSync(value.workspace) !== value.workspace) throw new Error("Telemetry workspace must be canonical");
    const path = location(root, value.workspace, true);
    database = new DatabaseSync(path);
    database.exec("PRAGMA busy_timeout=0; PRAGMA max_page_count=1024;");
    database.exec("BEGIN IMMEDIATE");
    const version = Number(database.prepare("PRAGMA user_version").get()!.user_version);
    if (version !== 0 && version !== 1) throw new Error("Unsupported telemetry schema");
    if (version === 0) {
      if (database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().length) throw new Error("Unknown telemetry database");
      database.exec(`CREATE TABLE metrics(id TEXT PRIMARY KEY, ended INTEGER NOT NULL, bytes INTEGER NOT NULL, payload TEXT NOT NULL);
        CREATE TABLE retention(id INTEGER PRIMARY KEY CHECK(id=1), evicted_records INTEGER NOT NULL, evicted_bytes INTEGER NOT NULL);
        INSERT INTO retention VALUES(1,0,0); PRAGMA user_version=1;`);
    }
    const previous = database.prepare("SELECT payload FROM metrics WHERE id=?").get(value.run_id);
    if (previous && previous.payload !== encoded) throw new Error("Telemetry identity conflict");
    if (!previous) database.prepare("INSERT INTO metrics VALUES(?,?,?,?)").run(value.run_id, Date.parse(value.ended_at), Buffer.byteLength(encoded), encoded);
    const entries = database.prepare("SELECT id, bytes FROM metrics ORDER BY ended DESC,id DESC").all();
    let retainedBytes = 0, retainedCount = 0, evictedBytes = 0, evictedCount = 0;
    for (const entry of entries) {
      const size = Number(entry.bytes);
      if (retainedCount < MAX_RECORDS && retainedBytes + size <= MAX_BYTES) { retainedBytes += size; retainedCount++; }
      else { database.prepare("DELETE FROM metrics WHERE id=?").run(String(entry.id)); evictedBytes += size; evictedCount++; }
    }
    database.prepare("UPDATE retention SET evicted_records=evicted_records+?,evicted_bytes=evicted_bytes+? WHERE id=1").run(evictedCount, evictedBytes);
    database.exec("COMMIT");
    return true;
  } catch { return false; }
  finally { try { database?.close(); } catch { /* Analytics errors never replace execution outcomes. */ } }
}

/** Read bounded retained metrics and explicit loss counts without creating a store. */
export function readRunProjection(root: string, workspace: string) {
  let database: DatabaseSync | undefined;
  try {
    database = new DatabaseSync(location(root, workspace, false), { readOnly: true });
    database.exec("BEGIN");
    if (database.prepare("PRAGMA user_version").get()?.user_version !== 1) throw new Error("Unsupported telemetry schema");
    const retention = database.prepare("SELECT evicted_records,evicted_bytes FROM retention WHERE id=1").get();
    if (!retention || [retention.evicted_records, retention.evicted_bytes].some(value => !Number.isSafeInteger(value) || Number(value) < 0)) throw new Error("Invalid retention counters");
    const rows = database.prepare("SELECT id,ended,bytes,payload FROM metrics ORDER BY ended DESC,id DESC LIMIT ?").all(MAX_RECORDS + 1);
    if (rows.length > MAX_RECORDS) throw new Error("Telemetry count exceeds budget");
    let bytes = 0;
    const metrics = rows.map(row => {
      const metric = JSON.parse(String(row.payload)) as RunMetric;
      const size = Buffer.byteLength(metricValue(metric));
      if (row.id !== metric.run_id || row.ended !== Date.parse(metric.ended_at) || row.bytes !== size) throw new Error("Telemetry row identity mismatch");
      bytes += size;
      if (bytes > MAX_BYTES || metric.workspace !== realpathSync(workspace)) throw new Error("Telemetry scope or budget mismatch");
      return metric;
    });
    database.exec("COMMIT");
    return { state: "available", metrics, retained_bytes: bytes, evicted_records: Number(retention.evicted_records), evicted_bytes: Number(retention.evicted_bytes), limits: { records: MAX_RECORDS, bytes: MAX_BYTES } };
  } catch { return { state: "unavailable", metrics: [], retained_bytes: null, evicted_records: null, evicted_bytes: null, limits: { records: MAX_RECORDS, bytes: MAX_BYTES } }; }
  finally { try { database?.close(); } catch { /* Preserve the diagnostic result. */ } }
}
