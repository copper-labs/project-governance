import { DatabaseSync } from "node:sqlite";
import { randomUUID, createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { SCHEMA, SCHEMA_VERSION } from "./schema.ts";
import {
  ExecutionStateUnavailable,
  RevisionConflict,
  type Action,
  type ActionStatus,
  type Artifact,
  type Evidence,
  type Task,
  type TaskItem,
  type Usage,
} from "../model/types.ts";

const now = (): string => new Date().toISOString();
export const contentAddress = (s: string): string =>
  "sha256:" + createHash("sha256").update(s).digest("hex");

/**
 * The operational store.
 *
 * Execution-critical writes are synchronous and durable before the Action they cover; if one
 * cannot be persisted the caller is told and the Action does not run. Analytics writes are
 * best-effort and never block work or change a verdict.
 */
export class Store {
  #db: DatabaseSync;

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.#db = new DatabaseSync(path);
    // WAL is preferred, but it needs shared memory the filesystem may not provide -- network
    // shares and some mounted volumes refuse it. Fall back rather than failing to start; the
    // rollback journal is slower but equally durable, which is what actually matters here.
    try {
      this.#db.exec("PRAGMA journal_mode = WAL");
    } catch {
      this.#db.exec("PRAGMA journal_mode = DELETE");
    }
    // FULL keeps execution-critical commits durable across a crash, which is the whole point.
    this.#db.exec("PRAGMA synchronous = FULL");
    this.#db.exec("PRAGMA foreign_keys = ON");
    this.#db.exec(SCHEMA);
    const row = this.#db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as
      | { value: string }
      | undefined;
    if (!row) {
      this.#db
        .prepare("INSERT INTO meta (key, value) VALUES ('schema_version', ?)")
        .run(String(SCHEMA_VERSION));
    } else if (Number(row.value) !== SCHEMA_VERSION) {
      throw new ExecutionStateUnavailable(
        `schema version ${row.value} is not ${SCHEMA_VERSION}`,
      );
    }
  }

  close(): void {
    this.#db.close();
  }

  // ---------------------------------------------------------------- tasks

  createTask(outcome: string, items: Omit<TaskItem, "seq" | "revoked">[]): Task {
    const taskId = randomUUID();
    return this.#writeTaskVersion(taskId, 1, null, outcome, "open", items);
  }

  /**
   * A revision is a new version referencing its predecessor. Unrevoked items carry forward:
   * dropping a constraint is an explicit act, never a side effect of revising.
   */
  reviseTask(
    taskId: string,
    added: Omit<TaskItem, "seq" | "revoked">[],
    opts: { outcome?: string; status?: Task["status"]; revoke?: number[] } = {},
  ): Task {
    const current = this.readTask(taskId);
    if (!current) throw new ExecutionStateUnavailable(`no task ${taskId}`);
    const revoke = new Set(opts.revoke ?? []);
    const carried = current.items.map((i) => ({
      kind: i.kind,
      provenance: i.provenance,
      body: i.body,
      revoked: i.revoked || revoke.has(i.seq),
    }));
    return this.#writeTaskVersion(
      taskId,
      current.version + 1,
      current.version,
      opts.outcome ?? current.outcome,
      opts.status ?? current.status,
      [...carried, ...added.map((a) => ({ ...a, revoked: false }))],
    );
  }

  #writeTaskVersion(
    taskId: string,
    version: number,
    supersedes: number | null,
    outcome: string,
    status: Task["status"],
    items: (Omit<TaskItem, "seq" | "revoked"> & { revoked?: boolean })[],
  ): Task {
    const createdAt = now();
    try {
      this.#db.exec("BEGIN IMMEDIATE");
      this.#db
        .prepare(
          "INSERT INTO task (task_id, version, supersedes, outcome, status, created_at) VALUES (?,?,?,?,?,?)",
        )
        .run(taskId, version, supersedes, outcome, status, createdAt);
      const ins = this.#db.prepare(
        "INSERT INTO task_item (task_id, version, seq, kind, provenance, body, revoked) VALUES (?,?,?,?,?,?,?)",
      );
      items.forEach((item, i) =>
        ins.run(taskId, version, i, item.kind, item.provenance, item.body, item.revoked ? 1 : 0),
      );
      this.#db.exec("COMMIT");
    } catch (err) {
      try {
        this.#db.exec("ROLLBACK");
      } catch {
        /* the transaction was never opened */
      }
      throw new ExecutionStateUnavailable(String((err as Error).message));
    }
    return this.readTask(taskId)!;
  }

  /** The newest version, which is the live one. */
  readTask(taskId: string): Task | null {
    const t = this.#db
      .prepare("SELECT * FROM task WHERE task_id = ? ORDER BY version DESC LIMIT 1")
      .get(taskId) as Record<string, unknown> | undefined;
    if (!t) return null;
    const items = this.#db
      .prepare("SELECT * FROM task_item WHERE task_id = ? AND version = ? ORDER BY seq")
      .all(taskId, t["version"] as number) as Record<string, unknown>[];
    return {
      taskId: t["task_id"] as string,
      version: t["version"] as number,
      supersedes: (t["supersedes"] as number | null) ?? null,
      outcome: t["outcome"] as string,
      status: t["status"] as Task["status"],
      createdAt: t["created_at"] as string,
      items: items.map((i) => ({
        seq: i["seq"] as number,
        kind: i["kind"] as TaskItem["kind"],
        provenance: i["provenance"] as TaskItem["provenance"],
        body: i["body"] as string,
        revoked: Boolean(i["revoked"]),
      })),
    };
  }

  listTasks(): Task[] {
    const ids = this.#db
      .prepare("SELECT DISTINCT task_id FROM task ORDER BY task_id")
      .all() as { task_id: string }[];
    return ids.map((r) => this.readTask(r.task_id)!);
  }

  // -------------------------------------------------------------- actions

  insertAction(a: Omit<Action, "revision" | "createdAt" | "updatedAt">): Action {
    const ts = now();
    try {
      this.#db
        .prepare(
          `INSERT INTO action (action_id, task_id, task_version, operation, scope, destination,
             policy_revision, status, revision, expected_inputs, intended_outputs, reconcile,
             refused_reason, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,1,?,?,?,?,?,?)`,
        )
        .run(
          a.actionId, a.taskId, a.taskVersion, a.operation, JSON.stringify(a.scope),
          a.destination, a.policyRevision, a.status, JSON.stringify(a.expectedInputs),
          JSON.stringify(a.intendedOutputs), a.reconcile, a.refusedReason, ts, ts,
        );
    } catch (err) {
      throw new ExecutionStateUnavailable(String((err as Error).message));
    }
    return this.readAction(a.actionId)!;
  }

  /**
   * Compare-and-set on the expected revision. Two processes reading the same prior state
   * cannot both act: the second one's expected revision no longer matches and it is refused.
   */
  transitionAction(
    actionId: string,
    expectedRevision: number,
    status: ActionStatus,
    patch: Partial<Pick<Action, "reconcile" | "refusedReason" | "intendedOutputs">> = {},
  ): Action {
    const ts = now();
    let changed = 0;
    try {
      this.#db.exec("BEGIN IMMEDIATE");
      const res = this.#db
        .prepare(
          `UPDATE action SET status = ?, revision = revision + 1, updated_at = ?,
             reconcile = COALESCE(?, reconcile),
             refused_reason = COALESCE(?, refused_reason),
             intended_outputs = COALESCE(?, intended_outputs)
           WHERE action_id = ? AND revision = ?`,
        )
        .run(
          status, ts, patch.reconcile ?? null, patch.refusedReason ?? null,
          patch.intendedOutputs ? JSON.stringify(patch.intendedOutputs) : null,
          actionId, expectedRevision,
        );
      changed = Number(res.changes);
      this.#db.exec("COMMIT");
    } catch (err) {
      try {
        this.#db.exec("ROLLBACK");
      } catch {
        /* never opened */
      }
      throw new ExecutionStateUnavailable(String((err as Error).message));
    }
    if (changed === 0) {
      const actual = this.readAction(actionId);
      throw new RevisionConflict(actionId, expectedRevision, actual?.revision ?? -1);
    }
    return this.readAction(actionId)!;
  }

  readAction(actionId: string): Action | null {
    const r = this.#db.prepare("SELECT * FROM action WHERE action_id = ?").get(actionId) as
      | Record<string, unknown>
      | undefined;
    return r ? rowToAction(r) : null;
  }

  /** Actions interrupted mid-effect. These are resumed by inspection, never by replay. */
  listUnresolvedActions(): Action[] {
    return (
      this.#db
        .prepare("SELECT * FROM action WHERE status IN ('prepared','in-progress') ORDER BY created_at")
        .all() as Record<string, unknown>[]
    ).map(rowToAction);
  }

  listActions(taskId: string): Action[] {
    return (
      this.#db
        .prepare("SELECT * FROM action WHERE task_id = ? ORDER BY created_at")
        .all(taskId) as Record<string, unknown>[]
    ).map(rowToAction);
  }

  // ------------------------------------------------------------ artifacts

  putArtifact(a: Omit<Artifact, "artifactId" | "createdAt"> & { artifactId?: string }): Artifact {
    const artifactId =
      a.artifactId ?? contentAddress(`${a.kind}\u0000${a.subject ?? ""}\u0000${a.inline ?? a.path ?? ""}`);
    const createdAt = now();
    this.#db
      .prepare(
        `INSERT OR IGNORE INTO artifact (artifact_id, kind, subject, path, inline, bytes, provenance, created_at)
         VALUES (?,?,?,?,?,?,?,?)`,
      )
      .run(artifactId, a.kind, a.subject, a.path, a.inline, a.bytes, a.provenance, createdAt);
    return this.readArtifact(artifactId)!;
  }

  readArtifact(artifactId: string): Artifact | null {
    const r = this.#db.prepare("SELECT * FROM artifact WHERE artifact_id = ?").get(artifactId) as
      | Record<string, unknown>
      | undefined;
    if (!r) return null;
    return {
      artifactId: r["artifact_id"] as string,
      kind: r["kind"] as Artifact["kind"],
      subject: (r["subject"] as string | null) ?? null,
      path: (r["path"] as string | null) ?? null,
      inline: (r["inline"] as string | null) ?? null,
      bytes: r["bytes"] as number,
      provenance: r["provenance"] as Artifact["provenance"],
      createdAt: r["created_at"] as string,
    };
  }

  // ------------------------------------------------------------- evidence

  /**
   * Execution-critical evidence must persist or the caller is told. Analytics evidence is
   * best-effort: a failure is reported as a boolean and never raised into the work.
   */
  recordEvidence(e: Omit<Evidence, "evidenceId" | "createdAt">): Evidence | null {
    const evidenceId = randomUUID();
    const createdAt = now();
    try {
      this.#db
        .prepare(
          `INSERT INTO evidence (evidence_id, task_id, action_id, artifact_id, claim, observed,
             establishes, confirmation, criticality, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          evidenceId, e.taskId, e.actionId, e.artifactId, e.claim, e.observed,
          e.establishes, e.confirmation, e.criticality, createdAt,
        );
    } catch (err) {
      if (e.criticality === "execution") {
        throw new ExecutionStateUnavailable(String((err as Error).message));
      }
      return null; // analytics loss never blocks work
    }
    return { ...e, evidenceId, createdAt };
  }

  listEvidence(taskId: string): Evidence[] {
    return (
      this.#db
        .prepare("SELECT * FROM evidence WHERE task_id = ? ORDER BY created_at")
        .all(taskId) as Record<string, unknown>[]
    ).map((r) => ({
      evidenceId: r["evidence_id"] as string,
      taskId: (r["task_id"] as string | null) ?? null,
      actionId: (r["action_id"] as string | null) ?? null,
      artifactId: (r["artifact_id"] as string | null) ?? null,
      claim: r["claim"] as string,
      observed: r["observed"] as string,
      establishes: r["establishes"] as string,
      confirmation: r["confirmation"] as Evidence["confirmation"],
      criticality: r["criticality"] as Evidence["criticality"],
      createdAt: r["created_at"] as string,
    }));
  }

  // ---------------------------------------------------------------- usage

  /** Token and cost instrumentation. Analytics: a write failure is reported, never raised. */
  recordUsage(u: Omit<Usage, "usageId" | "recordedAt">): Usage | null {
    const usageId = randomUUID();
    const recordedAt = now();
    try {
      this.#db
        .prepare(
          `INSERT INTO usage (usage_id, task_id, action_id, kind, input_tokens, output_tokens,
             duration_ms, cost_micros, recorded_at) VALUES (?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          usageId, u.taskId, u.actionId, u.kind, u.inputTokens, u.outputTokens,
          u.durationMs, u.costMicros, recordedAt,
        );
    } catch {
      return null;
    }
    return { ...u, usageId, recordedAt };
  }

  usageTotals(taskId?: string): {
    calls: number;
    inputTokens: number;
    outputTokens: number;
    durationMs: number;
    costMicros: number;
  } {
    const sql = `SELECT COUNT(*) calls, COALESCE(SUM(input_tokens),0) i, COALESCE(SUM(output_tokens),0) o,
                        COALESCE(SUM(duration_ms),0) d, COALESCE(SUM(cost_micros),0) c
                 FROM usage${taskId ? " WHERE task_id = ?" : ""}`;
    const r = (taskId
      ? this.#db.prepare(sql).get(taskId)
      : this.#db.prepare(sql).get()) as Record<string, number>;
    return {
      calls: r["calls"] ?? 0,
      inputTokens: r["i"] ?? 0,
      outputTokens: r["o"] ?? 0,
      durationMs: r["d"] ?? 0,
      costMicros: r["c"] ?? 0,
    };
  }

  /** Readable JSON export, a first-class command rather than an occasional convenience. */
  exportJson(): Record<string, unknown> {
    const tables = ["task", "task_item", "action", "artifact", "evidence", "usage"];
    const out: Record<string, unknown> = { schemaVersion: SCHEMA_VERSION, exportedAt: now() };
    for (const t of tables) out[t] = this.#db.prepare(`SELECT * FROM ${t}`).all();
    return out;
  }
}

function rowToAction(r: Record<string, unknown>): Action {
  return {
    actionId: r["action_id"] as string,
    taskId: r["task_id"] as string,
    taskVersion: r["task_version"] as number,
    operation: r["operation"] as Action["operation"],
    scope: JSON.parse(r["scope"] as string) as string[],
    destination: (r["destination"] as string | null) ?? null,
    policyRevision: r["policy_revision"] as string,
    status: r["status"] as ActionStatus,
    revision: r["revision"] as number,
    expectedInputs: JSON.parse(r["expected_inputs"] as string) as string[],
    intendedOutputs: JSON.parse(r["intended_outputs"] as string) as string[],
    reconcile: (r["reconcile"] as string | null) ?? null,
    refusedReason: (r["refused_reason"] as string | null) ?? null,
    createdAt: r["created_at"] as string,
    updatedAt: r["updated_at"] as string,
  };
}
