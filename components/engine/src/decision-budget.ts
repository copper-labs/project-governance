import { DatabaseSync } from "node:sqlite";
import { lstatSync, mkdirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { digest } from "./core.ts";
import type { DecisionBudgetLimits } from "./decision-settings.ts";

export const DECISION_BUDGET_FILE = "decision-budgets.sqlite";
const MAX_SCOPES = 512, MAX_DATABASE_BYTES = 8 * 1024 * 1024;

export interface BudgetScope { workspace: string; taskId: string; taskRevision: string }
export type ReservationState = "reserved" | "duplicate" | "exhausted" | "unavailable";
export interface BudgetReservation {
  state: ReservationState; reservationId: string | null; eventId: string;
  calls: number | null; bytes: number | null; limits: DecisionBudgetLimits;
}

export function budgetScopeId(scope: BudgetScope): string {
  if (![scope.taskId, scope.taskRevision].every(value => typeof value === "string" && value.trim().length > 0 && value.length <= 512 && !value.includes("\0"))) throw new Error("Invalid decision scope");
  return digest({ workspace: realpathSync(scope.workspace), taskId: scope.taskId, taskRevision: scope.taskRevision }).slice(7);
}
function budgetPath(stateRoot: string, create: boolean): string {
  if (create) mkdirSync(stateRoot, { recursive: true, mode: 0o700 });
  const canonical = realpathSync(stateRoot);
  const path = join(canonical, DECISION_BUDGET_FILE);
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_DATABASE_BYTES) throw new Error("Invalid decision budget store");
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  return path;
}
function open(path: string, busyTimeoutMs: number, readOnly = false): DatabaseSync {
  const database = new DatabaseSync(path, readOnly ? { readOnly: true } : {});
  database.exec(`PRAGMA busy_timeout=${busyTimeoutMs}; PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL;`);
  return database;
}
function migrate(database: DatabaseSync): void {
  const version = Number(database.prepare("PRAGMA user_version").get()!["user_version"]);
  if (version === 1) return;
  if (version !== 0) throw new Error("Unsupported decision budget schema");
  if (database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().length) throw new Error("Unknown decision budget database");
  database.exec(`
    CREATE TABLE scope(id TEXT PRIMARY KEY, workspace TEXT NOT NULL, task TEXT NOT NULL, revision TEXT NOT NULL,
      calls INTEGER NOT NULL, bytes INTEGER NOT NULL, closed INTEGER NOT NULL, updated INTEGER NOT NULL) STRICT;
    CREATE TABLE reservation(id TEXT PRIMARY KEY, scope TEXT NOT NULL REFERENCES scope(id) ON DELETE CASCADE,
      event TEXT NOT NULL, bytes INTEGER NOT NULL, created INTEGER NOT NULL, UNIQUE(scope,event)) STRICT;
    PRAGMA user_version=1;`);
}

/**
 * One short atomic check-and-reserve. The transaction commits before transport and is never held
 * across provider I/O; a crash before commit spends nothing and dispatches nothing, while a
 * committed reservation stays spent even when delivery is uncertain.
 */
export function reserveDecisionCall(stateRoot: string, scope: BudgetScope, eventId: string, requestBytes: number,
  limits: DecisionBudgetLimits, options: { busyTimeoutMs?: number; now?: () => number } = {}): BudgetReservation {
  const busyTimeoutMs = options.busyTimeoutMs ?? 250, now = options.now ?? Date.now;
  const base: BudgetReservation = { state: "unavailable", reservationId: null, eventId, calls: null, bytes: null, limits };
  if (!Number.isSafeInteger(requestBytes) || requestBytes < 0 ||
      !Number.isSafeInteger(limits.maxCalls) || limits.maxCalls < 1 ||
      !Number.isSafeInteger(limits.maxRequestBytes) || limits.maxRequestBytes < 1 ||
      !Number.isSafeInteger(busyTimeoutMs) || busyTimeoutMs < 0 || busyTimeoutMs > 1000 ||
      !eventId || eventId.length > 512) return base;
  if (requestBytes > limits.maxRequestBytes) return { ...base, state: "exhausted" };
  let database: DatabaseSync | undefined;
  try {
    const id = budgetScopeId(scope);
    database = open(budgetPath(stateRoot, true), busyTimeoutMs);
    database.exec("BEGIN IMMEDIATE");
    try {
      migrate(database);
      const existing = database.prepare("SELECT id FROM reservation WHERE scope=? AND event=?").get(id, eventId);
      const counters = database.prepare("SELECT calls,bytes,closed FROM scope WHERE id=?").get(id);
      if (existing) {
        database.exec("COMMIT");
        // A repeated observation of the same decision event reuses its retained reservation.
        return { ...base, state: "duplicate", reservationId: String(existing["id"]), calls: Number(counters?.["calls"] ?? 0), bytes: Number(counters?.["bytes"] ?? 0) };
      }
      const calls = Number(counters?.["calls"] ?? 0), bytes = Number(counters?.["bytes"] ?? 0);
      if (counters?.["closed"] === 1) {
        database.exec("COMMIT");
        return { ...base, calls, bytes };
      }
      if (calls + 1 > limits.maxCalls || bytes + requestBytes > limits.maxRequestBytes) {
        database.exec("COMMIT");
        return { ...base, state: "exhausted", calls, bytes };
      }
      if (!counters) {
        if (database.prepare("SELECT COUNT(*) AS total FROM scope WHERE closed=0").get()!["total"] as number >= MAX_SCOPES) {
          // Refuse new scopes at capacity rather than forgetting a spent reservation.
          database.exec("COMMIT");
          return { ...base, state: "unavailable" };
        }
        database.prepare("INSERT INTO scope VALUES(?,?,?,?,0,0,0,?)").run(id, scope.workspace, scope.taskId, scope.taskRevision, now());
      }
      const reservationId = digest({ scope: id, eventId }).slice(7, 39);
      database.prepare("INSERT INTO reservation VALUES(?,?,?,?,?)").run(reservationId, id, eventId, requestBytes, now());
      database.prepare("UPDATE scope SET calls=calls+1,bytes=bytes+?,updated=? WHERE id=?").run(requestBytes, now(), id);
      database.exec("COMMIT");
      return { ...base, state: "reserved", reservationId, calls: calls + 1, bytes: bytes + requestBytes };
    } catch (error) {
      try { database.exec("ROLLBACK"); } catch { /* An aborted transaction reserves nothing and dispatches nothing. */ }
      throw error;
    }
  } catch { return base; }
  finally { try { database?.close(); } catch { /* Accounting cannot interrupt native work. */ } }
}

/** Read-only inspection for doctor and receipts; it never creates the store or admits a call. */
export function readDecisionBudget(stateRoot: string, scope: BudgetScope): { calls: number; bytes: number; reservations: number } | null {
  let database: DatabaseSync | undefined;
  try {
    database = open(budgetPath(stateRoot, false), 50, true);
    if (Number(database.prepare("PRAGMA user_version").get()!["user_version"]) !== 1) return null;
    const id = budgetScopeId(scope);
    const counters = database.prepare("SELECT calls,bytes FROM scope WHERE id=?").get(id);
    if (!counters) return null;
    const reservations = database.prepare("SELECT COUNT(*) AS total FROM reservation WHERE scope=?").get(id);
    return { calls: Number(counters["calls"]), bytes: Number(counters["bytes"]), reservations: Number(reservations!["total"]) };
  } catch { return null; }
  finally { try { database?.close(); } catch { /* Preserve the diagnostic result. */ } }
}

/** Closing prohibits new events. Retain identities so delayed observations cannot reset spending. */
export function closeDecisionScope(stateRoot: string, scope: BudgetScope): boolean {
  let database: DatabaseSync | undefined;
  try {
    database = open(budgetPath(stateRoot, true), 250);
    database.exec("BEGIN IMMEDIATE");
    try {
      migrate(database);
      const id = budgetScopeId(scope);
      if (!database.prepare("SELECT id FROM scope WHERE id=?").get(id)) {
        database.prepare("INSERT INTO scope VALUES(?,?,?,?,0,0,1,?)").run(id, realpathSync(scope.workspace), scope.taskId, scope.taskRevision, Date.now());
      } else database.prepare("UPDATE scope SET closed=1,updated=? WHERE id=?").run(Date.now(), id);
      database.exec("COMMIT");
      return true;
    } catch (error) { try { database.exec("ROLLBACK"); } catch { /* Preserve the original failure. */ } throw error; }
  } catch { return false; }
  finally { try { database?.close(); } catch { /* Preserve the diagnostic result. */ } }
}

/** Report capacity without opening SQLite or changing reservation ownership. */
export function decisionBudgetStoreStatus(stateRoot: string) {
  try {
    const stat = lstatSync(join(stateRoot, DECISION_BUDGET_FILE));
    const status = !stat.isFile() || stat.isSymbolicLink() ? "invalid" : stat.size > MAX_DATABASE_BYTES ? "capacity-exceeded" : "present";
    return { status, bytes: stat.size, maxBytes: MAX_DATABASE_BYTES, activeScopeLimit: MAX_SCOPES,
      retention: "closed identities retained; no automatic eviction or spending reset" };
  } catch (error) {
    return { status: (error as NodeJS.ErrnoException).code === "ENOENT" ? "absent" : "unavailable",
      bytes: null, maxBytes: MAX_DATABASE_BYTES, activeScopeLimit: MAX_SCOPES,
      retention: "closed identities retained; no automatic eviction or spending reset" };
  }
}
