/** Disposable per-worktree projection. SQLite owns snapshots and writer exclusion; tasks never enter here. */
import { DatabaseSync } from "node:sqlite";
import { lstatSync, mkdirSync, realpathSync, statSync, readdirSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { workContext } from "../../harness/src/store/location.ts";
import { digest, durableJson } from "./core.ts";
import type { SourceFacts } from "./context-source-facts.ts";
import { narrativeFile } from "./narrative-inputs.ts";

export const PROJECTION_FILE = "source-index.sqlite", PROJECTION_MAX_BYTES = 64 * 1024 * 1024;
const POINTER = "source-index-current.json";
const ownedName = (name: string) => name === PROJECTION_FILE || /^source-index-[a-f0-9-]{36}\.sqlite$/u.test(name);
function activeFile(stateRoot: string): string {
  try {
    const pointer = JSON.parse(narrativeFile(stateRoot, POINTER));
    if (pointer.version !== 1 || !ownedName(pointer.file)) throw new Error("index-pointer-invalid");
    return pointer.file;
  } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return PROJECTION_FILE; throw error; }
}
/** Retired caches are disposable, but a live reader keeps its database until it releases SQLite. */
function reclaimRetired(stateRoot: string, current: string) {
  for (const name of readdirSync(stateRoot).filter(ownedName).filter(name => name !== current).slice(0, 4)) {
    const path = join(stateRoot, name); let db: DatabaseSync | undefined;
    try {
      const st = lstatSync(path); if (!st.isFile() || st.isSymbolicLink()) continue;
      db = new DatabaseSync(path); db.exec("PRAGMA busy_timeout=0; BEGIN EXCLUSIVE");
      // This cache has been retired from the pointer, so new readers cannot choose it.
      unlinkSync(path); db.exec("ROLLBACK");
    } catch { /* A busy or damaged retired cache stays inspectable; never disturb its readers. */ }
    finally { db?.close(); }
  }
}
export interface ProjectionFile { path: string; key: string | null; factId: string | null; freshness: string; disposition: string }
export interface ProjectionGeneration { id: string; view: string; subject: string | null; locator: string; extractor: string; complete: boolean; files: ProjectionFile[] }
export function projectionIdentity(workspace: string): string | null {
  try {
    const admin = execFileSync("git", ["rev-parse", "--absolute-git-dir"], { cwd: workspace, encoding: "utf8", timeout: 1000, stdio: ["ignore", "pipe", "pipe"] }).trim();
    const st = statSync(admin), where = workContext(workspace);
    if (!st.isDirectory() || st.birthtimeMs <= 0 || where.worktree !== realpathSync(workspace) ||
        where.locator !== `fs:${st.dev}:${st.ino}:${st.birthtimeMs}`) return null;
    return where.locator;
  } catch { return null; }
}

export class ProjectionStore {
  readonly database: DatabaseSync;
  readonly fts: boolean;
  readonly #state: string;
  readonly #file: string;
  constructor(stateRoot: string, workspace: string, locator: string, rebuild = false) {
    mkdirSync(stateRoot, { recursive: true, mode: 0o700 });
    this.#state = realpathSync(stateRoot);
    const active = activeFile(this.#state);
    // Recovery uses a fresh filename, so a corrupt/old connection cannot write into its replacement.
    // This is a cache pointer, not another runtime or task authority.
    if (rebuild) {
      reclaimRetired(this.#state, active);
      if (readdirSync(this.#state).filter(ownedName).length >= 4) throw new Error("index-retired-capacity; close readers and remove inspected damaged cache files");
    }
    this.#file = rebuild ? `source-index-${randomUUID()}.sqlite` : active;
    const path = join(this.#state, this.#file);
    try { const st = lstatSync(path); if (!st.isFile() || st.isSymbolicLink() || st.size > PROJECTION_MAX_BYTES) throw new Error("index-capacity-or-invalid-file"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    this.database = new DatabaseSync(path);
    try {
      const db = this.database;
      db.exec("PRAGMA busy_timeout=50; PRAGMA foreign_keys=ON; PRAGMA max_page_count=16384");
      const version = Number(db.prepare("PRAGMA user_version").get()!["user_version"]);
      if (version !== 0 && version !== 1) throw new Error("index-schema-unavailable");
      if (version === 0 && db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().length) throw new Error("index-schema-unavailable");
      if (version === 1) {
        const owner = db.prepare("SELECT workspace,locator FROM owner").get();
        if (owner?.["workspace"] === realpathSync(workspace) && owner?.["locator"] === locator) {
          this.fts = !!db.prepare("SELECT name FROM sqlite_master WHERE name='descriptors'").get();
          return;
        }
      }
      db.exec("BEGIN IMMEDIATE");
      if (version === 0) db.exec(`
        CREATE TABLE owner(workspace TEXT NOT NULL, locator TEXT NOT NULL) STRICT;
        CREATE TABLE generation(id TEXT PRIMARY KEY, view TEXT NOT NULL UNIQUE, subject TEXT, locator TEXT NOT NULL, extractor TEXT NOT NULL, complete INTEGER NOT NULL, updated INTEGER NOT NULL) STRICT;
        CREATE TABLE fact(id TEXT PRIMARY KEY, data TEXT NOT NULL) STRICT;
        CREATE TABLE file(generation TEXT NOT NULL REFERENCES generation(id) ON DELETE CASCADE, path TEXT NOT NULL, source_key TEXT, fact_id TEXT REFERENCES fact(id), freshness TEXT NOT NULL, disposition TEXT NOT NULL, PRIMARY KEY(generation,path)) STRICT;
        PRAGMA user_version=1;`);
      const owner = db.prepare("SELECT workspace,locator FROM owner").get();
      if (owner && owner["workspace"] !== realpathSync(workspace)) throw new Error("index-workspace-mismatch");
      if (rebuild || owner && owner["locator"] !== locator) {
        db.exec("DELETE FROM file; DELETE FROM generation; DELETE FROM fact; DELETE FROM owner;");
      }
      if (!db.prepare("SELECT workspace FROM owner").get()) db.prepare("INSERT INTO owner VALUES(?,?)").run(realpathSync(workspace), locator);
      let fts = true;
      try { db.exec("CREATE VIRTUAL TABLE IF NOT EXISTS descriptors USING fts5(generation UNINDEXED,path,descriptor)");
        if (rebuild || owner && owner["locator"] !== locator) db.exec("DELETE FROM descriptors"); }
      catch { fts = false; }
      this.fts = fts;
      db.exec("COMMIT");
      if (rebuild) { durableJson(join(this.#state, POINTER), { version: 1, file: this.#file }); reclaimRetired(this.#state, this.#file); }
    } catch (error) { try { this.database.exec("ROLLBACK"); } catch {} this.database.close(); throw error; }
  }
  snapshot(view: string) {
    const db = this.database;
    db.exec("BEGIN");
    try {
      const generation = db.prepare("SELECT * FROM generation WHERE view=?").get(view);
      const files = new Map<string, ProjectionFile>(), facts = new Map<string, SourceFacts>();
      if (generation) for (const row of db.prepare("SELECT f.*, x.data FROM file f LEFT JOIN fact x ON f.fact_id=x.id WHERE generation=?").all(String(generation["id"]))) {
        const file: ProjectionFile = { path: String(row["path"]), key: row["source_key"] as string | null, factId: row["fact_id"] as string | null,
          freshness: String(row["freshness"]), disposition: String(row["disposition"]) };
        files.set(file.path, file);
        if (file.factId && typeof row["data"] === "string") facts.set(file.factId, JSON.parse(row["data"]) as SourceFacts);
      }
      return { id: generation?.["id"] as string | undefined, extractor: generation?.["extractor"] as string | undefined, files, facts };
    } finally { db.exec("COMMIT"); }
  }
  /** Compare-and-publish after extraction; a competing publisher can only cause a named retry. */
  publish(generation: ProjectionGeneration, facts: Map<string, SourceFacts>, previous?: string): boolean {
    const db = this.database;
    if (activeFile(this.#state) !== this.#file) return false;
    if (generation.id === previous) return true;
    db.exec("BEGIN IMMEDIATE");
    try {
      const active = db.prepare("SELECT id FROM generation WHERE view=?").get(generation.view)?.["id"];
      if (active !== previous) { db.exec("ROLLBACK"); return false; }
      if (active) {
        if (this.fts) db.prepare("DELETE FROM descriptors WHERE generation=?").run(String(active));
        db.prepare("DELETE FROM generation WHERE id=?").run(String(active));
      }
      db.exec("DELETE FROM fact WHERE id NOT IN (SELECT fact_id FROM file WHERE fact_id IS NOT NULL)");
      db.prepare("INSERT INTO generation VALUES(?,?,?,?,?,?,?)").run(generation.id, generation.view, generation.subject, generation.locator, generation.extractor, Number(generation.complete), Date.now());
      const putFact = db.prepare("INSERT OR IGNORE INTO fact VALUES(?,?)"), putFile = db.prepare("INSERT INTO file VALUES(?,?,?,?,?,?)");
      const putSearch = this.fts ? db.prepare("INSERT INTO descriptors VALUES(?,?,?)") : null;
      for (const file of generation.files) {
        const fact = file.factId ? facts.get(file.factId) : null;
        if (file.factId && fact) putFact.run(file.factId, JSON.stringify(fact));
        putFile.run(generation.id, file.path, file.key, file.factId, file.freshness, file.disposition);
        putSearch?.run(generation.id, file.path, fact?.descriptor ?? "");
      }
      // Only the two current views remain. SQLite readers retain their prior snapshot until close.
      db.exec("DELETE FROM fact WHERE id NOT IN (SELECT fact_id FROM file WHERE fact_id IS NOT NULL)");
      db.exec("COMMIT"); return true;
    } catch (error) { try { db.exec("ROLLBACK"); } catch {} throw error; }
  }
  search(generation: string, purpose: string): string[] {
    if (!this.fts) return [];
    const terms = [...new Set(purpose.match(/[\p{L}\p{N}_]{3,}/gu) ?? [])].slice(0, 24);
    if (!terms.length) return [];
    const query = terms.map(term => '"' + term.replaceAll('"', '""') + '"').join(" OR ");
    try { return this.database.prepare("SELECT path FROM descriptors WHERE descriptors MATCH ? AND generation=? ORDER BY rank LIMIT 64").all(query, generation).map(row => String(row["path"])); }
    catch { return []; }
  }
  close() { this.database.close(); }
}

/** Passive and bounded: it never creates a database or refreshes source. */
export function projectionStatus(stateRoot: string, workspace: string) {
  let db: DatabaseSync | undefined;
  try {
    const filename = activeFile(stateRoot), path = join(stateRoot, filename), st = lstatSync(path);
    if (!st.isFile() || st.isSymbolicLink() || st.size > PROJECTION_MAX_BYTES) throw new Error("invalid");
    db = new DatabaseSync(path, { readOnly: true }); db.exec("PRAGMA busy_timeout=50");
    const owner = db.prepare("SELECT workspace,locator FROM owner").get();
    const recordedWorkspace = typeof owner?.["workspace"] === "string" ? owner["workspace"] : null;
    return { status: recordedWorkspace && !existsSync(recordedWorkspace) ? "orphaned-workspace" :
      owner?.["workspace"] === realpathSync(workspace) && owner?.["locator"] === projectionIdentity(workspace) ? "present" : "identity-mismatch",
      recordedWorkspace, recordedLocator: owner?.["locator"] ?? null,
      file: filename, retiredFiles: readdirSync(stateRoot).filter(ownedName).filter(name => name !== filename),
      bytes: st.size, maxBytes: PROJECTION_MAX_BYTES, schema: Number(db.prepare("PRAGMA user_version").get()!["user_version"]),
      generations: db.prepare("SELECT view,extractor,complete,updated,(SELECT count(*) FROM file WHERE generation=g.id) AS paths FROM generation g").all(),
      fts: !!db.prepare("SELECT name FROM sqlite_master WHERE name='descriptors'").get() };
  } catch (error) { return { status: (error as NodeJS.ErrnoException).code === "ENOENT" ? "absent" : "unavailable", maxBytes: PROJECTION_MAX_BYTES }; }
  finally { db?.close(); }
}
export const sourceFactId = (facts: SourceFacts, extractor: string) => digest({ digest: facts.digest, language: facts.language, extractor });
