import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { Store } from "../../harness/src/store/store.ts";
import { withinScope } from "../../harness/src/ops/authority.ts";
import { resolve } from "node:path";
import { canonical, digest, text } from "./core.ts";
import { recipeDigest, type RunBinding, type RunState, type StageResult, type StageState } from "./workflow-types.ts";

export interface WorkflowRun {
  id: string; binding: RunBinding; state: RunState; revision: number;
  owner: string | null; cancelRequested: boolean; createdAt: string; updatedAt: string;
}
export interface WorkflowStage { id: string; state: StageState; result: StageResult | null }
const RUN_EDGES: Record<RunState, RunState[]> = {
  queued: ["running", "cancelled", "blocked"], running: ["reconciling", "succeeded", "failed", "cancelled", "blocked", "unknown"],
  reconciling: ["succeeded", "failed", "cancelled", "unknown"], unknown: ["reconciling"],
  succeeded: [], failed: [], cancelled: [], blocked: [],
};

/** Workflow records share the canonical task database; no duplicate mutable task model exists. */
export class WorkflowStore {
  readonly #db: DatabaseSync;
  readonly path: string;
  constructor(path: string) {
    this.path = path;
    if (path === ":memory:") throw new Error("workflow execution requires a persistent ledger");
    const continuity = new Store(path); continuity.close();
    this.#db = new DatabaseSync(path);
    this.#db.exec("PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL");
    try {
      this.#atomic(() => {
        const version = this.#db.prepare("SELECT value FROM meta WHERE key='engine_schema'").get();
        if (version && !["1", "2"].includes(String(version["value"]))) throw new Error("unsupported engine schema; preserve the store");
        this.#db.exec(`
          CREATE TABLE IF NOT EXISTS engine_action_binding (
            action_id TEXT PRIMARY KEY REFERENCES action(action_id), binding_digest TEXT NOT NULL
          ) STRICT;
          CREATE TABLE IF NOT EXISTS engine_run (
            id TEXT PRIMARY KEY, operation_id TEXT UNIQUE NOT NULL, binding TEXT NOT NULL,
            state TEXT NOT NULL, revision INTEGER NOT NULL, owner TEXT, cancel_requested INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL, updated_at TEXT NOT NULL
          ) STRICT;
          CREATE TABLE IF NOT EXISTS engine_stage (
            run_id TEXT NOT NULL REFERENCES engine_run(id), id TEXT NOT NULL, state TEXT NOT NULL, result TEXT,
            PRIMARY KEY(run_id,id)
          ) STRICT;
          CREATE TABLE IF NOT EXISTS engine_event (
            sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, run_id TEXT NOT NULL REFERENCES engine_run(id),
            at TEXT NOT NULL, kind TEXT NOT NULL, data TEXT NOT NULL
          ) STRICT;
          CREATE TABLE IF NOT EXISTS engine_projection (
            scope TEXT PRIMARY KEY, generation INTEGER NOT NULL, watermark INTEGER NOT NULL, incomplete INTEGER NOT NULL,
            withdrawals TEXT NOT NULL
          ) STRICT;
          INSERT INTO meta VALUES('engine_schema','2') ON CONFLICT(key) DO UPDATE SET value='2';
        `);
        this.#db.exec("INSERT OR IGNORE INTO engine_projection VALUES('repository',1,0,1,'[]')");
        // All canonical fact/intent mutations invalidate optional projections in the same transaction,
        // including writes performed through the existing continuity API or another process.
        for (const table of ["task", "task_item", "action", "artifact", "evidence", "task_artifact"]) {
          for (const change of ["INSERT", "UPDATE", "DELETE"]) {
            this.#db.exec(`CREATE TRIGGER IF NOT EXISTS engine_projection_${table}_${change}
              AFTER ${change} ON ${table} BEGIN
                UPDATE engine_projection SET generation=generation+1,incomplete=1 WHERE scope='repository';
              END;`);
          }
        }
      });
    } catch (error) { this.#db.close(); throw error; }
  }

  #atomic<T>(fn: () => T): T {
    this.#db.exec("BEGIN IMMEDIATE");
    try { const result = fn(); this.#db.exec("COMMIT"); return result; }
    catch (error) { try { this.#db.exec("ROLLBACK"); } catch { /* Preserve the original transaction failure. */ } throw error; }
  }

  #event(runId: string, kind: string, data: unknown): void {
    this.#db.prepare("INSERT INTO engine_event(id,run_id,at,kind,data) VALUES(?,?,?,?,?)")
      .run(randomUUID(), runId, new Date().toISOString(), kind, canonical(data));
    // Constant-size intent invalidation cannot grow an unbounded mandatory outbox.
    this.#db.prepare("INSERT INTO engine_projection VALUES('repository',1,0,1,'[]') ON CONFLICT(scope) DO UPDATE SET generation=generation+1,incomplete=1").run();
  }

  #current(binding: RunBinding, requireBinding = true): void {
    const task = this.#db.prepare("SELECT version,status FROM task WHERE task_id=? ORDER BY version DESC LIMIT 1").get(binding.taskId);
    const action = this.#db.prepare("SELECT * FROM action WHERE action_id=?").get(binding.actionId);
    if (!task || task["version"] !== binding.taskVersion || task["status"] !== "open") throw new Error("workflow task is stale or not open");
    if (!action || action["task_id"] !== binding.taskId || action["task_version"] !== binding.taskVersion ||
        action["policy_revision"] !== binding.recipe.policyRevision || !["authorized", "prepared", "in-progress"].includes(String(action["status"]))) {
      throw new Error("workflow action is not authorized for this task/policy");
    }
    if (action["operation"] !== "check" || action["destination"] !== null) {
      throw new Error("workflow requires a local check action");
    }
    if (requireBinding) {
      const approved = this.#db.prepare("SELECT binding_digest FROM engine_action_binding WHERE action_id=?").get(binding.actionId);
      if (!approved || approved["binding_digest"] !== digest(binding)) throw new Error("workflow does not match the host-approved action binding");
    }
    const scope = JSON.parse(String(action["scope"])) as string[];
    const recipe = binding.recipe;
    if (!withinScope(recipe.workspace, scope, recipe.workspace) ||
        Object.values(recipe.operations).some(op => !withinScope(op.cwd, scope, recipe.workspace)) ||
        recipe.inputs.some(input => !withinScope(resolve(recipe.workspace, input.path), scope, recipe.workspace))) {
      throw new Error("workflow exceeds authorized action scope");
    }
  }

  /** Trusted host adapter binds one authorized action to exact commands, inputs and run identity. */
  authorizeWorkflow(binding: RunBinding): void {
    text(binding.authorityRef, "host authority reference"); text(binding.operationId, "operation id");
    if (recipeDigest(binding.recipe) !== binding.recipeDigest) throw new Error("recipe digest mismatch");
    this.#atomic(() => {
      this.#current(binding, false);
      const hash = digest(binding);
      const prior = this.#db.prepare("SELECT binding_digest FROM engine_action_binding WHERE action_id=?").get(binding.actionId);
      if (prior && prior["binding_digest"] !== hash) throw new Error("action already bound to a different workflow");
      this.#db.prepare("INSERT OR IGNORE INTO engine_action_binding VALUES(?,?)").run(binding.actionId, hash);
    });
  }

  /** Submission persists exact identity before a worker exists; retries attach to the same run. */
  submit(binding: RunBinding): WorkflowRun {
    text(binding.authorityRef, "host authority reference"); text(binding.operationId, "operation id");
    if (recipeDigest(binding.recipe) !== binding.recipeDigest) throw new Error("recipe digest mismatch");
    const encoded = canonical(JSON.parse(JSON.stringify(binding)));
    return this.#atomic(() => {
      const prior = this.#db.prepare("SELECT id,binding FROM engine_run WHERE operation_id=?").get(binding.operationId);
      if (prior) {
        if (prior["binding"] !== encoded) throw new Error("workflow submission identity conflict");
        return this.read(String(prior["id"]));
      }
      this.#current(binding);
      const id = randomUUID(), now = new Date().toISOString();
      this.#db.prepare("INSERT INTO engine_run VALUES(?,?,?,'queued',1,NULL,0,?,?)").run(id, binding.operationId, encoded, now, now);
      for (const stage of binding.recipe.stages) this.#db.prepare("INSERT INTO engine_stage VALUES(?,?,'pending',NULL)").run(id, stage.id);
      this.#event(id, "submitted", { recipeDigest: binding.recipeDigest, actionId: binding.actionId });
      return this.read(id);
    });
  }

  read(id: string): WorkflowRun {
    const row = this.#db.prepare("SELECT * FROM engine_run WHERE id=?").get(id);
    if (!row) throw new Error("unknown workflow run");
    return { id, binding: JSON.parse(String(row["binding"])) as RunBinding, state: String(row["state"]) as RunState,
      revision: Number(row["revision"]), owner: row["owner"] === null ? null : String(row["owner"]),
      cancelRequested: row["cancel_requested"] === 1, createdAt: String(row["created_at"]), updatedAt: String(row["updated_at"]) };
  }

  /** Compare-and-set makes two observers harmless; no stale worker can advance a newer owner. */
  claim(id: string, expectedRevision: number, owner: string): WorkflowRun {
    text(owner, "worker owner");
    return this.#atomic(() => {
      const run = this.read(id); this.#current(run.binding);
      if (run.state !== "queued" || run.revision !== expectedRevision || run.owner !== null) throw new Error("workflow already claimed or stale");
      this.#db.prepare("UPDATE engine_run SET state='running',owner=?,revision=revision+1,updated_at=? WHERE id=?")
        .run(owner, new Date().toISOString(), id);
      this.#event(id, "claimed", { owner }); return this.read(id);
    });
  }

  /** A startup refusal may close only an untouched queued run; it grants no execution authority. */
  blockUnstarted(id: string, bindingDigest: string, reason: string): WorkflowRun {
    text(reason, "startup refusal reason");
    return this.#atomic(() => {
      const run = this.read(id);
      if (digest(run.binding) !== bindingDigest || run.state !== "queued" || run.owner !== null ||
          this.stages(id).some(stage => stage.state !== "pending")) throw new Error("Workflow already started or binding changed");
      this.#db.prepare("UPDATE engine_stage SET state='blocked' WHERE run_id=?").run(id);
      this.#db.prepare("UPDATE engine_run SET state='blocked',revision=revision+1,updated_at=? WHERE id=?")
        .run(new Date().toISOString(),id);
      this.#event(id,"startup-blocked",{reason});
      return this.read(id);
    });
  }

  stage(id: string, owner: string, stageId: string, next: StageState, result: StageResult | null = null): void {
    this.#atomic(() => {
      const run = this.read(id);
      if (run.owner !== owner || run.state !== "running") throw new Error("stale workflow owner");
      const spec = run.binding.recipe.stages.find(s => s.id === stageId);
      if (!spec) throw new Error("unknown stage");
      const prior = this.stages(id).find(s => s.id === stageId)!;
      if (next === "running") {
        if (prior.state !== "pending") throw new Error("stage cannot be replayed");
        if (!spec.cleanup) {
          this.#current(run.binding);
          if (run.cancelRequested) throw new Error("workflow cancellation requested");
          if (spec.dependsOn.some(dep => this.stages(id).find(s => s.id === dep)?.state !== "succeeded")) throw new Error("stage dependency is not satisfied");
        }
      } else if (prior.state !== "running" && !(prior.state === "pending" && ["blocked", "cancelled"].includes(next))) {
        throw new Error("illegal stage transition");
      }
      if (result && result.state !== next) throw new Error("stage result/state mismatch");
      this.#db.prepare("UPDATE engine_stage SET state=?,result=? WHERE run_id=? AND id=?").run(next, result ? canonical(result) : null, id, stageId);
      this.#event(id, `stage:${next}`, { stageId, result });
    });
  }

  /** Reserve cleanup-only continuation after external worker/command absence verification. */
  claimPendingCleanup(id: string, revision: number, stagesDigest: string, worker: { pid: number; fingerprint: string }): WorkflowRun {
    if (!Number.isSafeInteger(worker.pid) || worker.pid < 2 || !worker.fingerprint) throw new Error("Cleanup worker identity required");
    return this.#atomic(() => {
      const run = this.read(id), stages = this.stages(id);
      if (!run.owner || run.state !== "unknown" || run.revision !== revision || digest(stages) !== stagesDigest)
        throw new Error("Cleanup continuation is stale or already reserved");
      if (stages.some(stage => ["running", "unknown"].includes(stage.state) || stage.result?.cleanup === "unknown"))
        throw new Error("Original command effects remain unresolved");
      for (const stage of stages) {
        if (stage.state === "pending" && !run.binding.recipe.stages.find(spec => spec.id === stage.id)!.cleanup)
          this.#db.prepare("UPDATE engine_stage SET state='blocked' WHERE run_id=? AND id=?").run(id, stage.id);
      }
      this.#db.prepare("UPDATE engine_run SET state='running',revision=revision+1,updated_at=? WHERE id=?")
        .run(new Date().toISOString(), id);
      this.#event(id, "cleanup-continuation-reserved", { revision, stagesDigest, worker });
      return this.read(id);
    });
  }

  /** Commit an owner-absence verifier's observations atomically; this grants no dispatch authority. */
  recordWorkerRecovery(id: string, expectedRevision: number, expectedStagesDigest: string,
    bindingDigest: string, evidenceDigest: string, observations: Array<{ id: string; result: StageResult }>): WorkflowRun {
    if (!/^sha256:[a-f0-9]{64}$/u.test(evidenceDigest)) throw new Error("Worker recovery evidence digest required");
    return this.#atomic(() => {
      const run = this.read(id), stages = this.stages(id);
      if (!run.owner || !["running", "unknown"].includes(run.state) || run.revision !== expectedRevision ||
          digest(run.binding) !== bindingDigest || digest(stages) !== expectedStagesDigest)
        throw new Error("Worker recovery observation is stale or mismatched");
      const seen = new Set<string>();
      for (const observation of observations) {
        const prior = stages.find(stage => stage.id === observation.id);
        if (seen.has(observation.id) || !prior || !["running", "unknown"].includes(prior.state))
          throw new Error("Worker recovery cannot replace settled or unstarted stages");
        seen.add(observation.id);
        const result = observation.result;
        if (!["succeeded", "failed", "cancelled", "unknown"].includes(result.state) ||
            (result.state !== "unknown" && result.cleanup !== "confirmed") ||
            (result.state === "succeeded" && result.inputValidity !== "valid"))
          throw new Error("Worker recovery result remains unverified");
      }
      for (const observation of observations) {
        this.#db.prepare("UPDATE engine_stage SET state=?,result=? WHERE run_id=? AND id=?")
          .run(observation.result.state, canonical(observation.result), id, observation.id);
      }
      // Pending cleanup and resource obligations remain unresolved until separately reconciled.
      this.#db.prepare("UPDATE engine_run SET state='unknown',revision=revision+1,updated_at=? WHERE id=?")
        .run(new Date().toISOString(), id);
      this.#event(id, "worker-recovery-observed", { evidenceDigest, observations });
      return this.read(id);
    });
  }

  transition(id: string, owner: string, expectedRevision: number, next: RunState): WorkflowRun {
    return this.#atomic(() => {
      const run = this.read(id);
      if (run.owner !== owner || run.revision !== expectedRevision || !RUN_EDGES[run.state].includes(next)) throw new Error("illegal or stale workflow transition");
      if (["succeeded", "failed", "cancelled"].includes(next)) {
        const stages = this.stages(id);
        if (stages.some(s => ["pending", "running", "unknown"].includes(s.state) || s.result?.cleanup === "unknown")) throw new Error("workflow effects remain unresolved");
        if (next === "succeeded" && stages.some(s => s.state !== "succeeded" || s.result?.inputValidity !== "valid")) throw new Error("workflow proof incomplete");
      }
      this.#db.prepare("UPDATE engine_run SET state=?,revision=revision+1,updated_at=? WHERE id=?").run(next, new Date().toISOString(), id);
      this.#event(id, `run:${next}`, {}); return this.read(id);
    });
  }

  cancel(id: string, authorityRef: string): void {
    text(authorityRef, "cancellation authority");
    this.#atomic(() => {
      this.read(id); this.#db.prepare("UPDATE engine_run SET cancel_requested=1 WHERE id=?").run(id);
      this.#event(id, "cancel-requested", { authorityRef });
    });
  }

  cleanupWorker(id: string): { pid: number; fingerprint: string } | null {
    const row = this.#db.prepare("SELECT data FROM engine_event WHERE run_id=? AND kind='cleanup-continuation-reserved' ORDER BY sequence DESC LIMIT 1").get(id);
    if (!row) return null;
    const worker = JSON.parse(String(row["data"])).worker;
    if (!worker || !Number.isSafeInteger(worker.pid) || worker.pid < 2 || typeof worker.fingerprint !== "string" || !worker.fingerprint)
      throw new Error("Cleanup worker identity is unconfirmed");
    return worker;
  }

  stages(id: string): WorkflowStage[] {
    return this.#db.prepare("SELECT id,state,result FROM engine_stage WHERE run_id=? ORDER BY rowid").all(id)
      .map(r => ({ id: String(r["id"]), state: String(r["state"]) as StageState, result: r["result"] === null ? null : JSON.parse(String(r["result"])) as StageResult }));
  }
  events(id: string, after = 0): unknown[] {
    return this.#db.prepare("SELECT sequence,at,kind,data FROM engine_event WHERE run_id=? AND sequence>? ORDER BY sequence LIMIT 100").all(id, after)
      .map(r => ({ ...r, data: JSON.parse(String(r["data"])) as unknown }));
  }
  projectionStatus(): { generation: number; watermark: number; complete: boolean } {
    const row = this.#db.prepare("SELECT generation,watermark,incomplete FROM engine_projection WHERE scope='repository'").get()!;
    return { generation: Number(row["generation"]), watermark: Number(row["watermark"]), complete: row["incomplete"] === 0 };
  }

  /** A provider acknowledgment cannot erase an invalidation committed during projection. */
  acknowledgeProjection(generation: number): boolean {
    if (!Number.isSafeInteger(generation) || generation < 1) throw new Error("invalid projection generation");
    return this.#atomic(() => {
      const current = this.projectionStatus();
      if (current.generation !== generation) return false;
      this.#db.prepare("UPDATE engine_projection SET watermark=?,incomplete=0 WHERE scope='repository' AND generation=?").run(generation, generation);
      return true;
    });
  }

  close(): void { this.#db.close(); }
}
