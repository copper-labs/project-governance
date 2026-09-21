import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { homedir } from "node:os";
import { canonical, text } from "./core.ts";
import { workspaceClaimsConflict } from "./workspace-claims.ts";

export interface Lease { resource: string; owner: string; operation: string; generation: number }
interface HeldRow extends Lease { state: "held" | "released"; observation: string | null }

/** The host registry has one location across repository and package versions. */
export function resourceRegistryPath(): string {
  const state = process.env["XDG_STATE_HOME"] ?? join(homedir(), ".local", "state");
  if (!isAbsolute(state)) throw new Error("XDG_STATE_HOME must be absolute");
  return join(state, "project-governance", "resources", "registry.sqlite");
}

/** Admission records never infer cleanup from a timeout, dead PID, or vanished observer. */
export class ResourceRegistry {
  readonly path: string;
  readonly hostId: string;
  readonly #db: DatabaseSync;

  constructor(path = resourceRegistryPath(), options: { migrateFromProtocol1?: boolean; authority?: string } = {}) {
    path = resolve(path);
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    if (existsSync(path) && lstatSync(path).isSymbolicLink()) throw new Error("resource registry cannot be a symlink");
    this.path = join(realpathSync(dirname(path)), basename(path));
    this.#db = new DatabaseSync(this.path);
    try {
      this.#db.exec("PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL; BEGIN IMMEDIATE");
      const version = Number(this.#db.prepare("PRAGMA user_version").get()!["user_version"]);
      if (options.migrateFromProtocol1 && version === 0) throw new Error("Resource migration requires an existing versioned registry");
      if (version !== 0 && version !== 1 && version !== 2) {
        throw new Error(`RESOURCE_PROTOCOL_INCOMPATIBLE: ${this.path}; observed ${version}, supported 2. Inspect holders with a compatible pinned engine; use explicit resource maintenance, never delete the registry.`);
      }
      if (version === 0) {
        const tables = this.#db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
        if (tables.length) throw new Error("unrecognized resource registry; explicit maintenance required");
        this.#db.exec(`
          CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
          CREATE TABLE resources (
            resource TEXT PRIMARY KEY, owner TEXT NOT NULL, operation TEXT NOT NULL,
            generation INTEGER NOT NULL, state TEXT NOT NULL CHECK(state IN ('held','released')),
            observation TEXT
          );
          CREATE TABLE requests (operation TEXT PRIMARY KEY, owner TEXT NOT NULL, resources TEXT NOT NULL, leases TEXT NOT NULL);
          CREATE TABLE events (seq INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, kind TEXT NOT NULL, data TEXT NOT NULL);
          PRAGMA user_version=2;
        `);
        this.#db.prepare("INSERT INTO metadata VALUES('host_id',?)").run(randomUUID());
      }
      if (version === 1) {
        if (!options.migrateFromProtocol1) throw new Error("RESOURCE_PROTOCOL_MIGRATION_REQUIRED: explicit drained migration to protocol 2 required");
        if (this.#db.prepare("SELECT 1 FROM resources WHERE state='held' LIMIT 1").get()) throw new Error("RESOURCE_PROTOCOL_DRAIN_REQUIRED: finish existing holders before workspace-claim upgrade");
        text(options.authority, "resource migration authority");
        this.#db.exec("PRAGMA user_version=2");
        this.#event("protocol-migrated", { from: 1, to: 2, authority: options.authority });
      }
      const identity = this.#db.prepare("SELECT value FROM metadata WHERE key='host_id'").get();
      if (!identity) throw new Error("resource registry identity missing");
      this.hostId = String(identity["value"]);
      this.#db.exec("COMMIT; PRAGMA journal_mode=WAL");
      chmodSync(this.path, 0o600);
    } catch (error) {
      try { this.#db.exec("ROLLBACK"); } catch { /* Opening may fail before a transaction exists. */ }
      this.#db.close();
      throw error;
    }
  }

  #atomic<T>(fn: () => T): T {
    this.#db.exec("BEGIN IMMEDIATE");
    try { const result = fn(); this.#db.exec("COMMIT"); return result; }
    catch (error) { try { this.#db.exec("ROLLBACK"); } catch { /* Preserve the original transaction failure. */ } throw error; }
  }

  #event(kind: string, data: unknown): void {
    this.#db.prepare("INSERT INTO events(at,kind,data) VALUES(?,?,?)").run(new Date().toISOString(), kind, canonical(data));
  }

  /** All claims are acquired together; a partial grant cannot deadlock another recipe. */
  acquire(resources: readonly string[], owner: string, operation: string): Lease[] {
    text(owner, "owner"); text(operation, "operation");
    if (!resources.length || resources.length > 64) throw new Error("claim requires 1..64 resources");
    const names = [...new Set(resources.map(r => text(r, "resource", 65536)))].sort();
    return this.#atomic(() => {
      const prior = this.#db.prepare("SELECT * FROM requests WHERE operation=?").get(operation);
      if (prior) {
        if (prior["owner"] !== owner || prior["resources"] !== canonical(names)) throw new Error("resource operation identity conflict");
        const leases = JSON.parse(String(prior["leases"])) as Lease[];
        for (const lease of leases) this.assertHeld(lease);
        return leases;
      }
      const leases: Lease[] = [];
      const held = this.#db.prepare("SELECT resource,owner FROM resources WHERE state='held'").all();
      for (const resource of names) {
        // Parsing even an otherwise empty registry prevents malformed reserved claims from entering it.
        workspaceClaimsConflict(resource, resource);
        for (const row of held) {
          if (workspaceClaimsConflict(resource, String(row.resource))) throw new Error(`WORKSPACE_BUSY: held by ${row.owner}; observe original owner before retry`);
        }
      }
      for (const resource of names) {
        const row = this.#db.prepare("SELECT * FROM resources WHERE resource=?").get(resource) as unknown as HeldRow | undefined;
        if (row?.state === "held") throw new Error(`RESOURCE_BUSY: ${resource}; held by ${row.owner}; observe original owner before retry`);
        const lease = { resource, owner, operation, generation: (row?.generation ?? 0) + 1 };
        this.#db.prepare("INSERT INTO resources VALUES(?,?,?,?, 'held',NULL) ON CONFLICT(resource) DO UPDATE SET owner=excluded.owner,operation=excluded.operation,generation=excluded.generation,state='held',observation=NULL")
          .run(resource, owner, operation, lease.generation);
        leases.push(lease);
      }
      this.#db.prepare("INSERT INTO requests VALUES(?,?,?,?)").run(operation, owner, canonical(names), canonical(leases));
      this.#event("acquired", leases);
      return leases;
    });
  }

  assertHeld(lease: Lease): void {
    const row = this.#db.prepare("SELECT * FROM resources WHERE resource=?").get(lease.resource) as unknown as HeldRow | undefined;
    if (!row || row.state !== "held" || row.owner !== lease.owner || row.operation !== lease.operation || row.generation !== lease.generation) {
      throw new Error(`RESOURCE_STALE_OWNER: ${lease.resource}`);
    }
  }

  /** Only the actual resource adapter can supply a cleanup observation; this is not a permission grant. */
  release(leases: readonly Lease[], observation: string): void {
    text(observation, "cleanup observation");
    this.#atomic(() => {
      const data = canonical({ leases, observation });
      if (this.#db.prepare("SELECT 1 FROM events WHERE kind='released' AND data=? LIMIT 1").get(data)) return;
      for (const lease of leases) this.assertHeld(lease);
      for (const lease of leases) this.#db.prepare("UPDATE resources SET state='released',observation=? WHERE resource=?").run(observation, lease.resource);
      this.#event("released", { leases, observation });
    });
  }

  /** Historical release survives later acquisitions of the same physical resource. */
  hasRelease(leases: readonly Lease[], observation: string): boolean {
    return Boolean(this.#db.prepare("SELECT 1 FROM events WHERE kind='released' AND data=? LIMIT 1")
      .get(canonical({ leases, observation })));
  }

  /** Durable transfer fences the run before a retained session takes responsibility. */
  transfer(lease: Lease, nextOwner: string, observation: string): Lease {
    text(nextOwner, "continuing owner"); text(observation, "handoff acknowledgment");
    return this.#atomic(() => {
      this.assertHeld(lease);
      const next = { ...lease, owner: nextOwner, generation: lease.generation + 1 };
      this.#db.prepare("UPDATE resources SET owner=?,generation=?,observation=? WHERE resource=?").run(nextOwner, next.generation, observation, lease.resource);
      this.#event("transferred", { before: lease, after: next, observation });
      return next;
    });
  }

  inspect(): HeldRow[] { return this.#db.prepare("SELECT * FROM resources ORDER BY resource").all() as unknown as HeldRow[]; }
  close(): void { this.#db.close(); }
}
