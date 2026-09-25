import { DatabaseSync } from "node:sqlite";
import { existsSync, lstatSync, mkdirSync, realpathSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { digest } from "./core.ts";
import type { DecisionBudgetLimits } from "./decision-settings.ts";

export const DECISION_BUDGET_FILE = "decision-budgets.sqlite";
const MAX_SCOPES = 512, MAX_DATABASE_BYTES = 8 * 1024 * 1024;
const FAMILY_LIFETIME = 15 * 60_000;

export interface BudgetScope { workspace: string; taskId: string; taskRevision: string }
/** One retrieval invocation has its own bounded allowance; real task identity stays in receipts. */
export function contextBudgetScope(scope: BudgetScope, invocationId: string): BudgetScope {
  if (!/^[a-f0-9]{64}$/u.test(invocationId)) throw new Error("Invalid context invocation identity");
  return { ...scope, taskRevision: `${digest({ revision: scope.taskRevision, invocationId }).slice(7)}#context-selection` };
}
/** Stable accounting survives the first provisional-task association and clarified purposes. */
export function contextFamilyScope(workspace: string, id: string): BudgetScope {
  if (!/^[a-f0-9]{64}$/u.test(id)) throw new Error("Invalid context family");
  return { workspace, taskId: `context-family-${id}`, taskRevision: "family#context-selection" };
}
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
  if (version === 2) return;
  if (version === 1) { migrateFamilies(database); return; }
  if (version !== 0) throw new Error("Unsupported decision budget schema");
  if (database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().length) throw new Error("Unknown decision budget database");
  database.exec(`
    CREATE TABLE scope(id TEXT PRIMARY KEY, workspace TEXT NOT NULL, task TEXT NOT NULL, revision TEXT NOT NULL,
      calls INTEGER NOT NULL, bytes INTEGER NOT NULL, closed INTEGER NOT NULL, updated INTEGER NOT NULL) STRICT;
    CREATE TABLE reservation(id TEXT PRIMARY KEY, scope TEXT NOT NULL REFERENCES scope(id) ON DELETE CASCADE,
      event TEXT NOT NULL, bytes INTEGER NOT NULL, created INTEGER NOT NULL, UNIQUE(scope,event)) STRICT;
    PRAGMA user_version=1;`);
  migrateFamilies(database);
}
function migrateFamilies(database: DatabaseSync) {
  database.exec(`CREATE TABLE context_family(id TEXT PRIMARY KEY, workspace TEXT NOT NULL, locator TEXT NOT NULL, session TEXT NOT NULL,
    turn TEXT NOT NULL, started INTEGER NOT NULL, expires INTEGER NOT NULL, closed INTEGER NOT NULL, budget_scope TEXT NOT NULL) STRICT;
    CREATE INDEX context_family_session ON context_family(workspace,locator,session);
    CREATE TABLE context_request(family TEXT NOT NULL REFERENCES context_family(id), step INTEGER NOT NULL,
      identity TEXT NOT NULL, cursor_digest TEXT, PRIMARY KEY(family,step)) STRICT;
    PRAGMA user_version=2;`);
}
function expireFamilies(database: DatabaseSync, now: number) {
  database.prepare("UPDATE scope SET closed=1 WHERE id IN (SELECT budget_scope FROM context_family WHERE closed=1 OR expires<=?)").run(now);
  database.prepare("UPDATE context_family SET closed=1 WHERE expires<=?").run(now);
}
/** Expired entry IDs can never reopen: admission also checks their original timestamp. */
function retireFamilies(database: DatabaseSync, now: number): string[] {
  const rows = database.prepare("SELECT id,budget_scope FROM context_family WHERE closed=1 AND expires<=? ORDER BY expires LIMIT 128").all(now);
  for (const row of rows) {
    database.prepare("DELETE FROM context_request WHERE family=?").run(String(row["id"]));
    database.prepare("DELETE FROM context_family WHERE id=?").run(String(row["id"]));
    // Only this owner's expired contextual scope is disposable. Ordinary scopes are never evicted.
    database.prepare("DELETE FROM scope WHERE id=? AND closed=1 AND revision='family#context-selection'").run(String(row["budget_scope"]));
  }
  return rows.map(row => String(row["id"]));
}
export interface ContextFamilyIdentity { id: string; workspace: string; locator: string; session: string; turn: string; started: number }
function familyTransaction<T>(stateRoot: string, work: (database: DatabaseSync) => T, now = Date.now()): T | null {
  let database: DatabaseSync | undefined;
  try {
    database = open(budgetPath(stateRoot, true), 250); database.exec("BEGIN IMMEDIATE"); migrate(database);
    expireFamilies(database, now);
    const retired = retireFamilies(database, now), result = work(database); database.exec("COMMIT");
    for (const id of retired) if (/^[a-f0-9]{64}$/u.test(id)) for (let step = 0; step <= 2; step++) {
      try { unlinkSync(join(stateRoot, "context-cursors", `${id}-${step}.json`)); } catch { /* Missing/denied optional cache cannot affect accounting. */ }
    }
    return result;
  } catch { try { database?.exec("ROLLBACK"); } catch {} return null; }
  finally { database?.close(); }
}
/** A newer observed root turn closes older families. It never touches workflow resource ownership. */
export function openContextFamily(stateRoot: string, identity: ContextFamilyIdentity, now = Date.now(), admit = true) {
  if (identity.started + FAMILY_LIFETIME <= now) return "expired";
  if (!admit && !existsSync(join(stateRoot, DECISION_BUDGET_FILE))) return "local-only";
  return familyTransaction(stateRoot, db => {
    const { id, locator, session, turn, started } = identity, workspace = realpathSync(identity.workspace);
    const scope = budgetScopeId(contextFamilyScope(workspace, id));
    if (!locator || !session || !turn || !Number.isSafeInteger(started) || started > now + 1000) return "invalid";
    expireFamilies(db, now);
    const existing = db.prepare("SELECT * FROM context_family WHERE id=?").get(id);
    if (existing) return existing["workspace"] === workspace && existing["locator"] === locator && existing["session"] === session && existing["turn"] === turn
      ? existing["closed"] === 1 ? "closed" : "existing" : "identity-mismatch";
    const latest = db.prepare("SELECT MAX(started) AS latest FROM context_family WHERE workspace=? AND locator=? AND session=?").get(workspace, locator, session);
    if (Number(latest?.["latest"] ?? 0) >= started) return "superseded";
    db.prepare("UPDATE context_family SET closed=1 WHERE workspace=? AND locator=? AND session=?").run(workspace, locator, session);
    expireFamilies(db, now);
    if (!admit) return "local-only";
    if (db.prepare("SELECT closed FROM scope WHERE id=?").get(scope)?.["closed"] === 1) return "closed";
    if (Number(db.prepare("SELECT COUNT(*) AS n FROM context_family WHERE closed=0").get()!["n"]) >= MAX_SCOPES) return "capacity";
    db.prepare("INSERT INTO context_family VALUES(?,?,?,?,?,?,?,0,?)").run(id, workspace, locator, session, turn, started, started + FAMILY_LIFETIME, scope);
    return "opened";
  }, now) ?? "unavailable";
}
export function beginContextRequest(stateRoot: string, family: string, step: number, identity: string, now = Date.now()) {
  return familyTransaction(stateRoot, db => {
    if (!Number.isInteger(step) || step < 0 || step > 2 || !/^[a-f0-9]{64}$/u.test(family)) return { status: "invalid" };
    expireFamilies(db, now);
    const row = db.prepare("SELECT closed,expires FROM context_family WHERE id=?").get(family);
    if (!row || Number(row["expires"]) <= now) return { status: "closed-or-unavailable" };
    const prior = db.prepare("SELECT identity,cursor_digest FROM context_request WHERE family=? AND step=?").get(family, step);
    if (prior) return { status: prior["identity"] !== identity ? "request-conflict" : prior["cursor_digest"] ? "duplicate" : "in-progress", cursorDigest: prior["cursor_digest"] as string | null };
    if (row["closed"] === 1) return { status: "closed-or-unavailable" };
    const previous = step > 0 ? db.prepare("SELECT cursor_digest FROM context_request WHERE family=? AND step=?").get(family, step - 1) : null;
    if (step > 0 && !previous?.["cursor_digest"]) return { status: "previous-request-incomplete" };
    db.prepare("INSERT INTO context_request VALUES(?,?,?,NULL)").run(family, step, identity);
    return { status: "reserved", previousDigest: previous?.["cursor_digest"] as string | undefined };
  }, now) ?? { status: "budget-store-unavailable" };
}
/** Release only an undispatched claim whose prerequisite cursor could not be read. */
export function abandonContextRequest(stateRoot: string, family: string, step: number, identity: string) {
  return familyTransaction(stateRoot, db => db.prepare("DELETE FROM context_request WHERE family=? AND step=? AND identity=? AND cursor_digest IS NULL").run(family, step, identity).changes === 1) ?? false;
}
export function finishContextRequest(stateRoot: string, family: string, step: number, identity: string, cursorDigest: string, now = Date.now()) {
  return familyTransaction(stateRoot, db => {
    const result = db.prepare("UPDATE context_request SET cursor_digest=? WHERE family=? AND step=? AND identity=? AND cursor_digest IS NULL").run(cursorDigest, family, step, identity);
    if (step === 2) { db.prepare("UPDATE context_family SET closed=1 WHERE id=?").run(family); expireFamilies(db, now); }
    return result.changes === 1;
  }, now) ?? false;
}

/**
 * One short atomic check-and-reserve. The transaction commits before transport and is never held
 * across provider I/O; a crash before commit spends nothing and dispatches nothing, while a
 * committed reservation stays spent even when delivery is uncertain.
 */
export function reserveDecisionCall(stateRoot: string, scope: BudgetScope, eventId: string, requestBytes: number,
  limits: DecisionBudgetLimits, options: { busyTimeoutMs?: number; now?: () => number; familyId?: string } = {}): BudgetReservation {
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
      expireFamilies(database, now());
      const existing = database.prepare("SELECT id FROM reservation WHERE scope=? AND event=?").get(id, eventId);
      const counters = database.prepare("SELECT calls,bytes,closed FROM scope WHERE id=?").get(id);
      if (existing) {
        database.exec("COMMIT");
        // A repeated observation of the same decision event reuses its retained reservation.
        return { ...base, state: "duplicate", reservationId: String(existing["id"]), calls: Number(counters?.["calls"] ?? 0), bytes: Number(counters?.["bytes"] ?? 0) };
      }
      if (options.familyId) {
        const family = database.prepare("SELECT budget_scope,closed FROM context_family WHERE id=?").get(options.familyId);
        if (!family || family["budget_scope"] !== id || family["closed"] === 1) { database.exec("COMMIT"); return base; }
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
        const promptPool = Number(scope.taskRevision.endsWith("#context-selection"));
        if (Number(database.prepare("SELECT COUNT(*) AS total FROM scope WHERE closed=0 AND (substr(revision,-18)='#context-selection')=?").get(promptPool)!["total"]) >= MAX_SCOPES) {
          // Prompt observations cannot consume the scope capacity reserved for deliberate decisions.
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
    if (![1, 2].includes(Number(database.prepare("PRAGMA user_version").get()!["user_version"]))) return null;
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
    let activeScopes: { contextSelection: number; ordinary: number } | null = null;
    if (status === "present") {
      let database: DatabaseSync | undefined;
      try {
        database = open(budgetPath(stateRoot, false), 50, true);
        const rows = database.prepare("SELECT (substr(revision,-18)='#context-selection') AS contextual, COUNT(*) AS total FROM scope WHERE closed=0 GROUP BY contextual").all();
        activeScopes = { contextSelection: 0, ordinary: 0 };
        for (const row of rows) activeScopes[Number(row["contextual"]) ? "contextSelection" : "ordinary"] = Number(row["total"]);
      } catch { /* Unknown capacity remains explicit. */ } finally { database?.close(); }
    }
    return { status, bytes: stat.size, maxBytes: MAX_DATABASE_BYTES, activeScopeLimit: MAX_SCOPES, activeScopes, scopeCapacity: "per context-selection and ordinary pool; shared database byte limit",
      retention: "ordinary identities retained; context family accounting and cursors expire after 15 minutes; audit receipts retained" };
  } catch (error) {
    return { status: (error as NodeJS.ErrnoException).code === "ENOENT" ? "absent" : "unavailable",
      bytes: null, maxBytes: MAX_DATABASE_BYTES, activeScopeLimit: MAX_SCOPES, activeScopes: null, scopeCapacity: "per context-selection and ordinary pool; shared database byte limit",
      retention: "ordinary identities retained; context family accounting and cursors expire after 15 minutes; audit receipts retained" };
  }
}
