/** One machine/user provider pool; only short SQLite transactions own admission and health. */
import { DatabaseSync } from "node:sqlite";
import { closeSync, lstatSync, mkdirSync, openSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

export const PROVIDER_CONCURRENCY = 4;
export const PROVIDER_TOKENS_PER_SECOND = 200_000;
export const PROVIDER_REQUESTS_PER_MINUTE = 960;
export const PROVIDER_LEASE_CLEANUP_MS = 1000;
export const PROVIDER_AUTH_COOLDOWN_MS = 300000;
export const providerCoordinationRoot = () => join(process.env.XDG_STATE_HOME ?? join(homedir(), ".local", "state"), "project-governance", "provider-admission");
export const providerDatabasePath = (root: string) => join(root, "jev-admission.sqlite");

export type ProviderAdmission =
  | { state: "admitted"; id: string; active: number }
  | { state: "wait"; reason: "concurrency" | "rate"; waitMs: number }
  | { state: "suppressed"; reason: "authentication-disabled" | "cooldown" };

/** Paid task accounting stays with decision-budget; this store cannot mint a task allowance. */
export class ProviderPool {
  readonly #db: DatabaseSync;
  constructor(root = providerCoordinationRoot()) {
    mkdirSync(root, { recursive: true, mode: 0o700 });
    const path = providerDatabasePath(root);
    try { closeSync(openSync(path, "wx", 0o600)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8 * 1024 * 1024) throw new Error("provider-coordination-unavailable");
    this.#db = new DatabaseSync(path);
    try {
      this.#db.exec("PRAGMA busy_timeout=0; PRAGMA max_page_count=2048; BEGIN IMMEDIATE");
      const version = Number(this.#db.prepare("PRAGMA user_version").get()!.user_version);
      if (version !== 0 && version !== 1) throw new Error("provider-coordination-schema");
      if (!version) {
        if (this.#db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().length) throw new Error("provider-coordination-schema");
        this.#db.exec(`
          CREATE TABLE leases (id TEXT PRIMARY KEY, expires INTEGER NOT NULL);
          CREATE TABLE calls (id TEXT PRIMARY KEY, at INTEGER NOT NULL, tokens INTEGER NOT NULL, reported INTEGER);
          CREATE INDEX calls_at ON calls(at);
          CREATE TABLE health (identity TEXT PRIMARY KEY, auth INTEGER NOT NULL, until INTEGER NOT NULL);
          PRAGMA user_version=1;
        `);
      }
      this.#db.exec("COMMIT");
    } catch (error) { try { this.#db.exec("ROLLBACK"); } catch { /* The transaction may not have opened. */ } this.#db.close(); throw error; }
  }

  #transaction<T>(run: () => T): T {
    this.#db.exec("BEGIN IMMEDIATE");
    try { const result = run(); this.#db.exec("COMMIT"); return result; }
    catch (error) { this.#db.exec("ROLLBACK"); throw error; }
  }
  #suppression(credential: string, now: number, failureScope: string): "authentication-disabled" | "cooldown" | null {
    const auth = this.#db.prepare("SELECT auth,until FROM health WHERE identity=?").get(credential);
    if (auth?.auth === 1 && Number(auth.until) > now) return "authentication-disabled";
    const pool = this.#db.prepare("SELECT until FROM health WHERE identity='pool'").get();
    const local = this.#db.prepare("SELECT until FROM health WHERE identity=?").get(failureScope);
    return Number(pool?.until ?? 0) > now || Number(local?.until ?? 0) > now ? "cooldown" : null;
  }

  acquire(credential: string, tokens: number, now: number, leaseMs: number, failureScope = credential): ProviderAdmission {
    if (!Number.isSafeInteger(tokens) || tokens < 0 || tokens > PROVIDER_TOKENS_PER_SECOND || !Number.isFinite(now) || leaseMs < 1 || leaseMs > 31000)
      throw new Error("provider-admission-invalid");
    return this.#transaction(() => {
      this.#db.prepare("DELETE FROM leases WHERE expires<=?").run(now);
      this.#db.prepare("DELETE FROM calls WHERE at<=?").run(now - 60000);
      this.#db.prepare("DELETE FROM health WHERE until<=?").run(now);
      const reason = this.#suppression(credential, now, failureScope);
      if (reason) return { state: "suppressed", reason };
      const active = Number(this.#db.prepare("SELECT count(*) AS n FROM leases").get()!.n);
      if (active >= PROVIDER_CONCURRENCY) return { state: "wait", reason: "concurrency", waitMs: 10 };
      const rate = this.#db.prepare("SELECT count(*) AS requests,coalesce(sum(CASE WHEN at>? THEN tokens ELSE 0 END),0) AS tokens,min(at) AS oldest FROM calls").get(now - 1000)!;
      if (Number(rate.requests) >= PROVIDER_REQUESTS_PER_MINUTE) return { state: "wait", reason: "rate", waitMs: Math.max(1, Math.min(100, Number(rate.oldest) + 60000 - now)) };
      if (Number(rate.tokens) + tokens > PROVIDER_TOKENS_PER_SECOND) return { state: "wait", reason: "rate", waitMs: 25 };
      const id = randomUUID();
      this.#db.prepare("INSERT INTO leases VALUES (?,?)").run(id, now + leaseMs);
      this.#db.prepare("INSERT INTO calls VALUES (?,?,?,NULL)").run(id, now, tokens);
      return { state: "admitted", id, active: active + 1 };
    });
  }

  /** Revalidate and renew admission before paid reservation and the actual network clock. */
  dispatch(id: string, credential: string, now: number, leaseMs: number, failureScope = credential): boolean {
    return this.#transaction(() => {
      if (this.#suppression(credential, now, failureScope)) return false;
      const own = this.#db.prepare("SELECT tokens FROM calls WHERE id=?").get(id);
      const rate = this.#db.prepare("SELECT count(*) AS requests,coalesce(sum(CASE WHEN at>? THEN tokens ELSE 0 END),0) AS tokens FROM calls WHERE id<>? AND at>?").get(now - 1000, id, now - 60000)!;
      if (!own || Number(rate.requests) >= PROVIDER_REQUESTS_PER_MINUTE || Number(rate.tokens) + Number(own.tokens) > PROVIDER_TOKENS_PER_SECOND) return false;
      if (this.#db.prepare("UPDATE leases SET expires=? WHERE id=? AND expires>?").run(now + leaseMs, id, now).changes !== 1) return false;
      this.#db.prepare("UPDATE calls SET at=? WHERE id=?").run(now, id);
      return true;
    });
  }

  release(id: string, dispatched: boolean) {
    this.#transaction(() => {
      this.#db.prepare("DELETE FROM leases WHERE id=?").run(id);
      if (!dispatched) this.#db.prepare("DELETE FROM calls WHERE id=?").run(id);
    });
  }

  /** Older success never clears newer failure. Expiry clears transient suppression naturally. */
  fail(credential: string, now: number, auth: boolean, cooldownMs: number, failureScope = credential) {
    this.#transaction(() => {
      this.#db.prepare(`INSERT INTO health VALUES (?,?,?) ON CONFLICT(identity) DO UPDATE SET
        auth=max(auth,excluded.auth),until=max(until,excluded.until)`).run(auth ? credential : failureScope, auth ? 1 : 0,
          now + (auth ? PROVIDER_AUTH_COOLDOWN_MS : cooldownMs));
    });
  }

  reportUsage(id: string, inputTokens: number | null) {
    if (inputTokens !== null && Number.isSafeInteger(inputTokens) && inputTokens >= 0)
      this.#db.prepare("UPDATE calls SET reported=?,tokens=max(tokens,?) WHERE id=?").run(inputTokens, inputTokens, id);
  }
  close() { this.#db.close(); }
}
