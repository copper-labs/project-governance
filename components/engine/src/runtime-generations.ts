import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { existsSync, lstatSync, mkdirSync } from "node:fs";
import { inspectRuntimeGeneration } from "./runtime-inspection.ts";
import { digest, text } from "./core.ts";

/** Installation coordination only; task state and execution authority remain in their existing ledgers. */
export class RuntimeGenerations {
  readonly #db: DatabaseSync;
  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    if (existsSync(path) && lstatSync(path).isSymbolicLink()) throw new Error("Generation registry cannot be a symlink");
    this.#db = new DatabaseSync(path);
    try {
      this.#db.exec("PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL; BEGIN IMMEDIATE");
      const version = this.#db.prepare("PRAGMA user_version").get()!["user_version"];
      if (![0, 1, 2, 3, 4, 5, 6, 7].includes(Number(version))) throw new Error("Unsupported installation protocol");
      if (version === 0) {
        if (this.#db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().length) throw new Error("Unknown installation registry");
        this.#db.exec(`CREATE TABLE current (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, directory TEXT, previous TEXT, written INTEGER NOT NULL);
          INSERT INTO current VALUES(1,0,NULL,NULL,0);
          CREATE TABLE readers (token TEXT PRIMARY KEY, revision INTEGER NOT NULL, owner TEXT NOT NULL);
          PRAGMA user_version=1;`);
      }
      if (version === 0 || version === 1) this.#db.exec("CREATE TABLE maintenance (id INTEGER PRIMARY KEY CHECK(id=1), token TEXT NOT NULL, owner TEXT NOT NULL);");
      if (Number(version) < 3) this.#db.exec("CREATE TABLE activations (operation TEXT PRIMARY KEY, revision INTEGER NOT NULL, directory TEXT NOT NULL);");
      if (Number(version) < 4) this.#db.exec("CREATE TABLE finalizations (token TEXT PRIMARY KEY, owner TEXT NOT NULL, revision INTEGER NOT NULL, receipt TEXT NOT NULL); PRAGMA user_version=4;");
      if (Number(version) < 5) this.#db.exec(`ALTER TABLE activations RENAME TO prior_activations;
        CREATE TABLE activations (operation TEXT PRIMARY KEY, revision INTEGER NOT NULL, directory TEXT);
        INSERT INTO activations SELECT * FROM prior_activations; DROP TABLE prior_activations; PRAGMA user_version=5;`);
      if (Number(version) < 6) this.#db.exec("CREATE TABLE repair_requirements (token TEXT PRIMARY KEY, owner TEXT NOT NULL, digest TEXT NOT NULL); PRAGMA user_version=6;");
      if (Number(version) < 7) this.#db.exec(`CREATE TABLE completion_requirements (token TEXT NOT NULL, owner TEXT NOT NULL, kind TEXT NOT NULL, digest TEXT NOT NULL, PRIMARY KEY(token,kind));
        INSERT INTO completion_requirements SELECT token,owner,'preservedInputsDigest',digest FROM repair_requirements;
        DROP TABLE repair_requirements; PRAGMA user_version=7;`);
      this.#db.exec("COMMIT");
    } catch (error) { try { this.#db.exec("ROLLBACK"); } catch {} this.#db.close(); throw error; }
  }
  close() { this.#db.close(); }
  state() {
    const row = this.#db.prepare("SELECT * FROM current WHERE id=1").get()!;
    return { revision: Number(row.revision), directory: row.directory as string | null,
      previous: row.previous as string | null, written: row.written === 1,
      maintenance: this.#db.prepare("SELECT token,owner FROM maintenance WHERE id=1").get() ?? null,
      readers: this.#db.prepare("SELECT token,revision,owner FROM readers ORDER BY token").all() };
  }
  #transaction<T>(operation: () => T): T {
    this.#db.exec("BEGIN IMMEDIATE");
    try { const result = operation(); this.#db.exec("COMMIT"); return result; }
    catch (error) { try { this.#db.exec("ROLLBACK"); } catch { /* Preserve the original transaction failure. */ } throw error; }
  }
  activation(operation: string) {
    return this.#db.prepare("SELECT revision,directory FROM activations WHERE operation=?").get(operation) ?? null;
  }
  activate(directory: string, expectedRevision: number, maintenanceToken?: string, operation?: string) {
    const verified = inspectRuntimeGeneration(directory);
    return this.#transaction(() => {
      const state = this.state();
      if (state.maintenance && state.maintenance.token !== maintenanceToken) throw new Error("Installation maintenance ownership required");
      if (state.revision !== expectedRevision || state.readers.length) throw new Error("Activation requires current revision and drained readers");
      if (state.directory === verified.directory) return state;
      this.#db.prepare("UPDATE current SET revision=revision+1,previous=directory,directory=?,written=0 WHERE id=1").run(verified.directory);
      if (operation) this.#db.prepare("INSERT INTO activations VALUES(?,?,?)").run(operation, state.revision + 1, verified.directory);
      return this.state();
    });
  }
  acquire(owner: string, maintenanceToken?: string) {
    return this.#acquire(owner,maintenanceToken,false);
  }
  reserveStartupTask(taskId:string,expected?:{token:string;revision:number;directory:string;owner:string}) {
    if(!/^sha256:[a-f0-9]{64}$/u.test(taskId))throw new Error("Invalid startup task identity");
    if(expected && (expected.owner!==`startup-task:${taskId}` || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(expected.token)))throw new Error("Invalid planned startup reader");
    return this.#acquire(`startup-task:${taskId}`,undefined,true,expected);
  }
  #acquire(owner:string,maintenanceToken:string|undefined,reuse:boolean,expected?:{token:string;revision:number;directory:string}) {
    text(owner, "runtime reader owner");
    return this.#transaction(() => {
      const state = this.state();
      if (state.maintenance && state.maintenance.token !== maintenanceToken) throw new Error("Runtime admission stopped for maintenance");
      if (!state.directory) throw new Error("No active generation");
      if(expected && (expected.revision!==state.revision || expected.directory!==state.directory))throw new Error("Planned startup generation changed");
      if(reuse) {
        const existing=this.#db.prepare("SELECT token,revision FROM readers WHERE owner=?").all(owner);
        if(existing.length>1 || (existing[0] && existing[0].revision!==state.revision))throw new Error("Startup reader identity requires reconciliation");
        if(existing[0]) {
          if(expected && existing[0].token!==expected.token)throw new Error("Planned startup reader changed");
          return {token:String(existing[0].token),revision:state.revision,directory:state.directory,owner};
        }
      }
      const token = expected?.token??randomUUID();
      this.#db.prepare("INSERT INTO readers VALUES(?,?,?)").run(token, state.revision, owner);
      return { token, revision: state.revision, directory: state.directory, owner };
    });
  }
  markWritten(token: string, owner: string) {
    return this.#transaction(() => {
      const row = this.#db.prepare("SELECT revision FROM readers WHERE token=? AND owner=?").get(token, owner);
      if (!row || row.revision !== this.state().revision) throw new Error("Current reader required before writes");
      this.#db.prepare("UPDATE current SET written=1 WHERE id=1").run();
    });
  }
  retain(parentToken: string, parentOwner: string, owner: string, maintenanceToken?: string) {
    text(owner, "runtime reader owner");
    return this.#transaction(() => {
      const parent = this.#db.prepare("SELECT revision FROM readers WHERE token=? AND owner=?").get(parentToken, parentOwner);
      const state = this.state();
      if (state.maintenance && state.maintenance.token !== maintenanceToken) throw new Error("Runtime admission stopped for maintenance");
      if (!parent || parent.revision !== state.revision || !state.directory) throw new Error("Current parent reader required");
      const token = randomUUID();
      this.#db.prepare("INSERT INTO readers VALUES(?,?,?)").run(token, state.revision, owner);
      // Detached work can outlive its caller; reservation itself crosses the possible-write boundary.
      this.#db.prepare("UPDATE current SET written=1 WHERE id=1").run();
      return { token, revision: state.revision, directory: state.directory, owner };
    });
  }
  release(token: string, owner: string) {
    if (this.#db.prepare("DELETE FROM readers WHERE token=? AND owner=?").run(token, owner).changes !== 1) throw new Error("Runtime reader ownership mismatch");
  }
  /** A startup handoff consumes the reader without ending the task's ownership obligation. */
  retireStartupReader(reader: { token: string; owner: string; revision: number; directory: string }): boolean {
    if (!/^startup-task:sha256:[a-f0-9]{64}$/u.test(reader.owner)) throw new Error("Startup reader required");
    return this.#transaction(() => {
      if (this.state().maintenance?.owner === `startup-update:${digest(reader)}`) return false;
      const row = this.#db.prepare("SELECT owner,revision FROM readers WHERE token=?").get(reader.token);
      if (row && (row.owner !== reader.owner || row.revision !== reader.revision)) throw new Error("Startup reader ownership changed");
      if (row) this.#db.prepare("DELETE FROM readers WHERE token=? AND owner=? AND revision=?").run(reader.token, reader.owner, reader.revision);
      return true;
    });
  }
  /** A confirmed cleanup may be replayed; an existing reader must still match its exact reservation. */
  releaseConfirmed(token: string, owner: string, revision: number): boolean {
    return this.#transaction(() => {
      const row = this.#db.prepare("SELECT owner,revision FROM readers WHERE token=?").get(token);
      if (!row) return false;
      if (row.owner !== owner || row.revision !== revision) throw new Error("Runtime reader ownership mismatch");
      this.#db.prepare("DELETE FROM readers WHERE token=? AND owner=? AND revision=?").run(token, owner, revision);
      return true;
    });
  }
  rollback(expectedRevision: number, maintenanceToken?: string, operation?: string, legacy = false) {
    return this.#transaction(() => {
      const state = this.state();
      if (state.maintenance && state.maintenance.token !== maintenanceToken) throw new Error("Installation maintenance ownership required");
      if (maintenanceToken) this.assertNoRepair(maintenanceToken);
      if (state.revision !== expectedRevision || state.readers.length || state.written || (!state.previous && !(legacy && operation && state.maintenance))) throw new Error("Rollback unavailable; drain and forward-repair after writes");
      if (state.previous) inspectRuntimeGeneration(state.previous);
      this.#db.prepare("UPDATE current SET revision=revision+1,directory=previous,previous=NULL,written=0 WHERE id=1").run();
      if (operation) this.#db.prepare("INSERT INTO activations VALUES(?,?,?)").run(operation, state.revision + 1, state.previous);
      return this.state();
    });
  }
  beginMaintenance(owner: string, expectedRevision: number, operationToken?: string) {
    text(owner, "maintenance owner");
    if (operationToken !== undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(operationToken))
      throw new Error("Maintenance operation token must be a UUID v4");
    return this.#transaction(() => {
      const state = this.state();
      if (operationToken && state.maintenance?.token === operationToken && state.maintenance.owner === owner && state.revision === expectedRevision)
        return { token: operationToken, owner, revision: state.revision };
      if (operationToken && this.#db.prepare("SELECT 1 FROM finalizations WHERE token=?").get(operationToken))
        throw new Error("Maintenance operation already finalized");
      if (state.maintenance || state.revision !== expectedRevision) throw new Error("Maintenance already owned or revision changed");
      const token = operationToken ?? randomUUID();
      this.#db.prepare("INSERT INTO maintenance VALUES(1,?,?)").run(token, owner);
      return { token, owner, revision: state.revision };
    });
  }
  /** Exchange exactly one parent reservation for exclusion in a single SQLite transaction. */
  beginStartupMaintenance(reader:{token:string;owner:string;revision:number;directory:string},operationToken:string) {
    if(!/^startup-task:sha256:[a-f0-9]{64}$/u.test(reader.owner) || !reader.token || !Number.isSafeInteger(reader.revision) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(operationToken))
      throw new Error("Exact startup reservation and operation token required");
    const owner=`startup-update:${digest(reader)}`;
    return this.#transaction(()=>{
      const state=this.state();
      if(state.revision!==reader.revision || state.directory!==reader.directory)throw new Error("Startup generation changed");
      if(state.maintenance?.token===operationToken && state.maintenance.owner===owner && !state.readers.length)
        return {token:operationToken,owner,revision:state.revision};
      if(state.maintenance || this.#db.prepare("SELECT 1 FROM finalizations WHERE token=?").get(operationToken))
        throw new Error("Startup maintenance already owned or finalized");
      const held=state.readers[0];
      if(state.readers.length!==1 || held?.token!==reader.token || held.owner!==reader.owner || held.revision!==reader.revision)
        throw new Error("Startup update requires the sole recorded parent reservation");
      this.#db.prepare("INSERT INTO maintenance VALUES(1,?,?)").run(operationToken,owner);
      this.#db.prepare("DELETE FROM readers WHERE token=? AND owner=? AND revision=?").run(reader.token,reader.owner,reader.revision);
      return {token:operationToken,owner,revision:state.revision};
    });
  }
  /** Restore the original reservation only before activation, without reopening an admission gap. */
  cancelStartupMaintenance(reader:{token:string;owner:string;revision:number;directory:string},operationToken:string,restoration?:string) {
    const owner=`startup-update:${digest(reader)}`,restored={...reader,revision:reader.revision+(restoration?2:0)};
    const receipt=restoration?{kind:"startup-restored",reader:restored,previousReader:reader,restoration}:{kind:"startup-cancelled",reader};
    return this.#transaction(()=>{
      const state=this.state();
      if(state.revision!==restored.revision || state.directory!==reader.directory)
        throw new Error("Startup cancellation requires the original generation");
      if(restoration){
        const activation=this.activation(restoration);
        if(!activation || activation.revision!==state.revision || activation.directory!==state.directory || state.previous!==null)
          throw new Error("Startup restoration identity differs");
      }
      const prior=this.#db.prepare("SELECT owner,revision,receipt FROM finalizations WHERE token=?").get(operationToken);
      if(prior){
        if(prior.owner!==owner || prior.revision!==state.revision || digest(JSON.parse(String(prior.receipt)))!==digest(receipt))
          throw new Error("Startup cancellation receipt differs");
        return restored;
      }
      if(state.maintenance?.token!==operationToken || state.maintenance.owner!==owner || state.readers.length)
        throw new Error("Startup cancellation requires exact drained maintenance");
      if(restoration && state.written)throw new Error("Startup restoration cannot discard writes");
      this.assertNoRepair(operationToken);
      this.#db.prepare("INSERT INTO readers VALUES(?,?,?)").run(restored.token,restored.revision,restored.owner);
      this.#db.prepare("INSERT INTO finalizations VALUES(?,?,?,?)").run(operationToken,owner,state.revision,JSON.stringify(receipt));
      this.#db.prepare("DELETE FROM maintenance WHERE id=1 AND token=? AND owner=?").run(operationToken,owner);
      return restored;
    });
  }
  /** After verified commit/readback, retain hook evidence and atomically restore the parent's reader. */
  finishStartupMaintenance(reader:{token:string;owner:string;revision:number;directory:string},operationToken:string,
    receipt:{lockDigest:string;readback:string;workspace:string;commit:string}) {
    if(!/^sha256:[a-f0-9]{64}$/u.test(receipt.lockDigest) || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(receipt.commit) ||
      !receipt.workspace || !receipt.readback)throw new Error("Verified startup completion identity required");
    const owner=`startup-update:${digest(reader)}`,savedReceipt={...receipt,startupReader:reader};
    return this.#transaction(()=>{
      const state=this.state();
      if(state.revision!==reader.revision+1 || !state.directory || state.directory===reader.directory)
        throw new Error("Startup completion requires the activated successor generation");
      const restored={...reader,revision:state.revision,directory:state.directory};
      const prior=this.#db.prepare("SELECT owner,revision,receipt FROM finalizations WHERE token=?").get(operationToken);
      if(prior){
        if(prior.owner!==owner || prior.revision!==state.revision || digest(JSON.parse(String(prior.receipt)))!==digest(savedReceipt))
          throw new Error("Startup completion receipt differs");
        return {reader:restored,state,replayed:true};
      }
      if(state.maintenance?.token!==operationToken || state.maintenance.owner!==owner || state.readers.length)
        throw new Error("Startup completion requires owned drained maintenance");
      this.assertNoRepair(operationToken);
      this.#db.prepare("INSERT INTO readers VALUES(?,?,?)").run(restored.token,restored.revision,restored.owner);
      this.#db.prepare("INSERT INTO finalizations VALUES(?,?,?,?)").run(operationToken,owner,state.revision,JSON.stringify(savedReceipt));
      this.#db.prepare("DELETE FROM maintenance WHERE id=1 AND token=? AND owner=?").run(operationToken,owner);
      return {reader:restored,state:this.state(),replayed:false};
    });
  }
  requireRepair(token: string, owner: string, digest: string) {
    return this.requireCompletion(token, owner, "preservedInputsDigest", digest);
  }
  requireCompletion(token: string, owner: string, kind: "preservedInputsDigest" | "hostInstructionsDigest" | "legacyHistoryDigest", digest: string) {
    text(digest, "completion requirement digest");
    return this.#transaction(() => {
      const existing = this.#db.prepare("SELECT owner,digest FROM completion_requirements WHERE token=? AND kind=?").get(token, kind);
      if (existing) {
        if (existing.owner !== owner || existing.digest !== digest) throw new Error("Completion requirement identity differs");
        return;
      }
      const state = this.state();
      if (state.maintenance?.token !== token || state.maintenance.owner !== owner || state.readers.length) throw new Error("Completion requirement needs owned drained maintenance");
      this.#db.prepare("INSERT INTO completion_requirements VALUES(?,?,?,?)").run(token, owner, kind, digest);
    });
  }
  assertNoRepair(token: string) {
    if (this.#db.prepare("SELECT token FROM completion_requirements WHERE token=? AND kind='preservedInputsDigest'").get(token)) throw new Error("Forward repair preservation readback required");
    if (this.#db.prepare("SELECT token FROM completion_requirements WHERE token=? AND kind='legacyHistoryDigest'").get(token)) throw new Error("Legacy history readback required");
    if (this.#db.prepare("SELECT token FROM completion_requirements WHERE token=?").get(token)) throw new Error("Host instruction completion readback required");
  }
  endMaintenance(token: string, owner: string) {
    this.assertNoRepair(token);
    if (this.#db.prepare("DELETE FROM maintenance WHERE id=1 AND token=? AND owner=?").run(token, owner).changes !== 1) throw new Error("Maintenance ownership mismatch");
  }
  finalization(token: string, owner: string): { revision: number; receipt: { lockDigest: string; readback: string; workspace: string; preservedInputsDigest?: string; hostInstructionsDigest?: string; legacyHistoryDigest?: string } } | null {
    const row = this.#db.prepare("SELECT revision,receipt FROM finalizations WHERE token=? AND owner=?").get(token, owner);
    return row ? { revision: Number(row.revision), receipt: JSON.parse(String(row.receipt)) } : null;
  }
  finishMaintenance(token: string, owner: string, revision: number, receipt: { lockDigest: string; readback: string; workspace: string; preservedInputsDigest?: string; hostInstructionsDigest?: string; legacyHistoryDigest?: string }) {
    return this.#transaction(() => {
      const state = this.state();
      if (state.revision !== revision || state.readers.length || state.written) throw new Error("Activation readback no longer identifies a drained pre-write generation");
      for (const requirement of this.#db.prepare("SELECT owner,kind,digest FROM completion_requirements WHERE token=?").all(token)) {
        const observed = requirement.kind === "preservedInputsDigest" ? receipt.preservedInputsDigest : requirement.kind === "hostInstructionsDigest" ? receipt.hostInstructionsDigest : requirement.kind === "legacyHistoryDigest" ? receipt.legacyHistoryDigest : undefined;
        if (requirement.owner !== owner || requirement.digest !== observed) throw new Error(requirement.kind === "preservedInputsDigest" ? "Forward repair preservation readback required" : requirement.kind === "legacyHistoryDigest" ? "Legacy history readback required" : "Host instruction completion readback required");
      }
      if (this.#db.prepare("DELETE FROM maintenance WHERE id=1 AND token=? AND owner=?").run(token, owner).changes !== 1) throw new Error("Maintenance ownership mismatch");
      this.#db.prepare("INSERT INTO finalizations VALUES(?,?,?,?)").run(token, owner, revision, JSON.stringify(receipt));
      return this.state();
    });
  }
}
