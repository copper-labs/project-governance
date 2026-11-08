/** A distinct signoff ledger in the existing repository store; receipts are locators only. */
import { realpathSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { Store } from "../../harness/src/store/store.ts";
import { canonical, digest } from "./core.ts";
import { apiSignoffSubject, apiSignoffObservation, apiSignoffPredecessor, apiSignoffEnvelopeDigest,
  signoffFields, signoffId, type ApiSignoffReceipt, type ApiSignoffLocator,
  type ApiSignoffSubject, type ApiSignoffHostObservation, type ApiSignoffPredecessor } from "./api-signoff.ts";

export class ApiSignoffStore {
  readonly #db: DatabaseSync;
  readonly repositoryId: string;
  readonly #readOnly: boolean;
  constructor(path: string, options: { readOnly?: boolean } = {}) {
    this.#readOnly = options.readOnly !== false;
    // Readback never initializes a database, table or alternate authority.
    const continuity = new Store(path, { readOnly: this.#readOnly });
    try { this.repositoryId = continuity.repositoryId(); } finally { continuity.close(); }
    this.#db = new DatabaseSync(realpathSync(path), { readOnly: this.#readOnly });
    try {
      this.#db.exec("PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON");
      if (!this.#readOnly) {
      this.#db.exec("PRAGMA synchronous=FULL");
      this.#atomic(() => this.#db.exec(`
        CREATE TABLE IF NOT EXISTS engine_api_signoff_v1 (
          id TEXT PRIMARY KEY, request_id TEXT UNIQUE NOT NULL, record TEXT NOT NULL
        ) STRICT;
        CREATE TABLE IF NOT EXISTS engine_api_signoff_head_v1 (
          contract_id TEXT PRIMARY KEY, receipt_id TEXT NOT NULL REFERENCES engine_api_signoff_v1(id)
        ) STRICT;
      `));
      }
    } catch (error) { this.#db.close(); throw error; }
  }
  close(): void { this.#db.close(); }
  #atomic<T>(body: () => T, write = true): T {
    if (write && this.#readOnly) throw new Error("API signoff store is read-only");
    this.#db.exec(write ? "BEGIN IMMEDIATE" : "BEGIN");
    try { const result = body(); this.#db.exec("COMMIT"); return result; }
    catch (error) { this.#db.exec("ROLLBACK"); throw error; }
  }
  #read(id: string): ApiSignoffReceipt | null {
    const row = this.#db.prepare("SELECT record FROM engine_api_signoff_v1 WHERE id=?").get(id);
    if (!row) return null;
    const record = JSON.parse(String(row.record)) as ApiSignoffReceipt;
    signoffFields(record, ["kind", "id", "repositoryId", "requestId", "subject", "subjectDigest", "host", "predecessor",
      "createdAt", "envelopeDigest", "revision", "revokedAt", "revocation", "supersededBy"], "API signoff record");
    if (record.kind !== "api-signoff-v1" || record.id !== id || record.repositoryId !== this.repositoryId ||
        !Number.isSafeInteger(record.revision) || record.revision < 1 ||
        (record.revokedAt !== null && (typeof record.revokedAt !== "string" || !Number.isFinite(Date.parse(record.revokedAt)))) ||
        ((record.revokedAt === null) !== (record.revocation === null)) ||
        (record.supersededBy !== null && typeof record.supersededBy !== "string") ||
        record.subjectDigest !== digest(apiSignoffSubject(record.subject)) ||
        record.envelopeDigest !== apiSignoffEnvelopeDigest(record)) throw new Error("Corrupt API signoff record");
    apiSignoffObservation(record.host);
    if (record.revocation) apiSignoffObservation(record.revocation);
    return record;
  }
  #head(contractId: string): string | null {
    const row = this.#db.prepare("SELECT receipt_id FROM engine_api_signoff_head_v1 WHERE contract_id=?").get(contractId);
    return row ? String(row.receipt_id) : null;
  }
  #active(record: ApiSignoffReceipt): void {
    if (record.revokedAt || record.supersededBy || this.#head(record.subject.contractId) !== record.id)
      throw new Error("API signoff revoked or superseded");
  }
  #save(record: ApiSignoffReceipt): void {
    this.#db.prepare("UPDATE engine_api_signoff_v1 SET record=? WHERE id=?").run(canonical(record), record.id);
  }
  #replay(requestId: string, subject: ApiSignoffSubject, predecessor: ApiSignoffPredecessor | null): ApiSignoffReceipt | null {
    const row = this.#db.prepare("SELECT id FROM engine_api_signoff_v1 WHERE request_id=?").get(requestId);
    if (!row) return null;
    const record = this.#read(String(row.id))!;
    if (record.subjectDigest !== digest(subject) || canonical(record.predecessor) !== canonical(predecessor))
      throw new Error("API signoff request already has different inputs");
    this.#active(record);
    return record;
  }
  /** Recover only an already committed exact request, never infer approval from a receipt file. */
  replay(requestId: string, subject: unknown, predecessor: unknown): ApiSignoffReceipt | null {
    return this.#atomic(() => this.#replay(signoffId(requestId), apiSignoffSubject(subject), apiSignoffPredecessor(predecessor)), false);
  }
  /** Trusted-host entry after native confirmation. Caller-supplied observations are not authenticated here. */
  recordConfirmation(requestId: string, subject: unknown, host: ApiSignoffHostObservation, predecessor: unknown): ApiSignoffReceipt {
    requestId = signoffId(requestId);
    const bound = apiSignoffSubject(subject), observed = apiSignoffObservation(host), prior = apiSignoffPredecessor(predecessor);
    return this.#atomic(() => {
      const replay = this.#replay(requestId, bound, prior);
      if (replay) return replay;
      const current = this.#head(bound.contractId);
      if (current !== (prior?.id ?? null)) throw new Error("API signoff predecessor changed");
      const previous = current ? this.#read(current) : null;
      if (prior && (!previous || previous.revision !== prior.revision)) throw new Error("API signoff predecessor revision changed");
      if (previous) this.#active(previous);
      const record: ApiSignoffReceipt = { kind: "api-signoff-v1", id: randomUUID(), repositoryId: this.repositoryId,
        requestId, subject: bound, subjectDigest: digest(bound), host: observed, predecessor: prior,
        createdAt: new Date().toISOString(), envelopeDigest: "", revision: 1, revokedAt: null, revocation: null, supersededBy: null };
      record.envelopeDigest = apiSignoffEnvelopeDigest(record);
      this.#db.prepare("INSERT INTO engine_api_signoff_v1 VALUES(?,?,?)").run(record.id, requestId, canonical(record));
      if (previous) { previous.supersededBy = record.id; previous.revision++; this.#save(previous); }
      this.#db.prepare("INSERT INTO engine_api_signoff_head_v1 VALUES(?,?) ON CONFLICT(contract_id) DO UPDATE SET receipt_id=excluded.receipt_id")
        .run(bound.contractId, record.id);
      return record;
    });
  }
  #locate(value: unknown): ApiSignoffReceipt {
    const locator = signoffFields(value, ["kind", "id", "repositoryId"], "API signoff locator");
    if (locator.kind !== "api-signoff-v1" || locator.repositoryId !== this.repositoryId) throw new Error("API signoff repository mismatch");
    const record = this.#read(signoffId(locator.id));
    if (!record) throw new Error("API signoff not found");
    return record;
  }
  /** A point-in-time read, never a cached authorization for a later publication. */
  verify(locator: ApiSignoffLocator, expected: unknown): ApiSignoffReceipt {
    const subject = apiSignoffSubject(expected);
    return this.#atomic(() => {
      const record = this.#locate(locator); this.#active(record);
      if (record.subjectDigest !== digest(subject)) throw new Error("API signoff subject mismatch");
      return record;
    }, false);
  }
  /** Revocation remains possible after the reviewed artifact changes or disappears. */
  revoke(locator: ApiSignoffLocator, expectedRevision: number, host: ApiSignoffHostObservation): ApiSignoffReceipt {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) throw new Error("Invalid signoff revision");
    const observed = apiSignoffObservation(host);
    return this.#atomic(() => {
      const record = this.#locate(locator);
      if (record.revokedAt) return record;
      if (record.revision !== expectedRevision) throw new Error("API signoff revision changed");
      record.revokedAt = new Date().toISOString(); record.revocation = observed; record.revision++; this.#save(record);
      this.#db.prepare("DELETE FROM engine_api_signoff_head_v1 WHERE receipt_id=?").run(record.id);
      return record;
    });
  }
}
