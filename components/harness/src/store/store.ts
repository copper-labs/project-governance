import { DatabaseSync } from "node:sqlite";
import { randomUUID, createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, openSync, fsyncSync, closeSync } from "node:fs";
import { dirname, join } from "node:path";
import { SCHEMA, SCHEMA_VERSION, V5, V6 } from "./schema.ts";
import { ExecutionStateUnavailable, RevisionConflict, type Action, type ActionStatus, type Artifact, type Evidence, type Task, type TaskItem, type TaskMode, type Usage, type Attempt, type Checkpoint, type LedgerEvent, type ExecutionBinding, } from "../model/types.ts";
const now = (): string => new Date().toISOString();
export const contentAddress = (s: string): string => "sha256:" + createHash("sha256").update(s).digest("hex");
/**
 * The operational store.
 *
 * Execution-critical writes are synchronous and durable before the Action they cover; if one
 * cannot be persisted the caller is told and the Action does not run. Analytics writes are
 * best-effort and never block work or change a verdict.
 */
export class Store {
    #db: DatabaseSync;
    readonly directory: string | null;
    #depth = 0;
    constructor(path: string, options: { readOnly?: boolean } = {}) {
        this.directory = path === ":memory:" ? null : dirname(path);
        if (this.directory && !options.readOnly)
            mkdirSync(this.directory, { recursive: true, mode: 0o700 });
        this.#db = new DatabaseSync(path, { readOnly: options.readOnly ?? false });
        this.#db.exec("PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON; PRAGMA synchronous = FULL");
        try {
            const meta = this.#db.prepare("SELECT name FROM sqlite_master WHERE name='meta'").get();
            const old = meta ? this.#db.prepare("SELECT value FROM meta WHERE key='schema_version'").get() as {
                value: string;
            } | undefined : undefined;
            if (options.readOnly) {
                if (Number(old?.value) !== SCHEMA_VERSION) throw new Error("read-only inspection needs the current store schema");
                return;
            }
            if (old && ![4, 5, SCHEMA_VERSION].includes(Number(old.value)))
                throw new Error(`unsupported schema ${old.value}; preserve this store`);
            this.#db.exec("PRAGMA journal_mode = WAL");
            this.atomic(() => {
                this.#db.exec(SCHEMA);
                // Read again under the migration lock: another process may have migrated first.
                const row = this.#db.prepare("SELECT value FROM meta WHERE key='schema_version'").get() as {
                    value: string;
                } | undefined;
                if (!row || Number(row.value) === 4)
                    this.#db.exec(V5);
                if (!row || Number(row.value) < 6)
                    this.#db.exec(V6);
                this.#db.prepare("INSERT OR REPLACE INTO meta(key,value) VALUES('schema_version',?)").run(String(SCHEMA_VERSION));
                this.#db.prepare("INSERT OR IGNORE INTO meta(key,value) VALUES('repository_id',?)").run(randomUUID());
            });
        }
        catch (error) {
            this.#db.close();
            throw error;
        }
    }
    /** A short local transaction. Never hold it while waiting for a process or model. */
    atomic<T>(operation: () => T): T {
        const depth = this.#depth++, marker = `nested_${depth}`;
        try {
            this.#db.exec(depth ? `SAVEPOINT ${marker}` : "BEGIN IMMEDIATE");
            try {
                const value = operation();
                this.#db.exec(depth ? `RELEASE ${marker}` : "COMMIT");
                return value;
            }
            catch (error) {
                this.#db.exec(depth ? `ROLLBACK TO ${marker}; RELEASE ${marker}` : "ROLLBACK");
                throw error;
            }
        }
        finally {
            this.#depth--;
        }
    }
    repositoryId(): string {
        return (this.#db.prepare("SELECT value FROM meta WHERE key='repository_id'").get() as {
            value: string;
        }).value;
    }
    close(): void {
        this.#db.close();
    }
    // ---------------------------------------------------------------- tasks
    createTask(outcome: string, items: Omit<TaskItem, "seq" | "revoked">[], meta: {
        worktree?: string | undefined;
        branch?: string | null | undefined;
        session?: string | undefined;
        parentTask?: string | undefined;
        parentVersion?: number | undefined;
        parentCheckpoint?: string | undefined;
        authorityRef?: string | undefined;
        mode?: TaskMode | undefined;
    } = {}): Task {
        if (!outcome.trim())
            throw new Error("task outcome must not be empty");
        validateItems(items);
        const taskId = randomUUID();
        return this.#writeTaskVersion(taskId, 1, null, outcome, "open", items, meta);
    }
    /**
     * Fork a job, as when a conversation is branched into a new thread or worktree.
     *
     * The child inherits the expensive knowledge - the operator's constraints and what has
     * already been ruled out - and starts its own progress. It is not the same job: closing
     * one does not close the other, and notes do not bleed between them.
     */
    forkTask(taskId: string, meta: {
        worktree?: string | undefined;
        branch?: string | null | undefined;
        session?: string | undefined;
        mode?: TaskMode | undefined;
    } = {}, opts: {
        outcome?: string | undefined;
    } = {}): Task {
        const parent = this.readTask(taskId);
        if (!parent)
            throw new ExecutionStateUnavailable(`no task ${taskId}`);
        // Scope is rewritten to the forking worktree: a branched thread works in its own
        // checkout, and inheriting the parent's path would refuse every action it takes.
        const inherited = parent.items
            .filter((i) => !i.revoked)
            .map((i) => i.kind === "scope" && meta.worktree && parent.worktree && (i.body === parent.worktree || i.body.startsWith(parent.worktree + "/"))
            ? { kind: i.kind, provenance: i.provenance, origin: i.origin ?? `${taskId}@${parent.version}`, body: meta.worktree + i.body.slice(parent.worktree!.length) }
            : { kind: i.kind, provenance: i.provenance, origin: i.origin ?? `${taskId}@${parent.version}`, body: i.body });
        return this.createTask(opts.outcome ?? parent.outcome, inherited, {
            ...meta, parentTask: taskId, parentVersion: parent.version, parentCheckpoint: this.latestCheckpoint(taskId)?.checkpointId, mode: meta.mode ?? parent.mode,
        });
    }
    /**
     * A revision is a new version referencing its predecessor. Unrevoked items carry forward:
     * dropping a constraint is an explicit act, never a side effect of revising.
     */
    reviseTask(taskId: string, added: Omit<TaskItem, "seq" | "revoked">[], opts: {
        outcome?: string;
        status?: Task["status"];
        revoke?: number[];
        session?: string;
        expectedVersion?: number;
        authorityRef?: string;
    } = {}): Task {
        const current = this.readTask(taskId);
        if (!current)
            throw new ExecutionStateUnavailable(`no task ${taskId}`);
        if (opts.expectedVersion !== undefined && opts.expectedVersion !== current.version)
            throw new RevisionConflict(taskId, opts.expectedVersion, current.version);
        validateItems(added);
        if (opts.status && !["open", "needs-input", "accepted", "cancelled"].includes(opts.status))
            throw new Error("invalid task status");
        if ((opts.revoke?.length || opts.status === "accepted") && !opts.authorityRef?.trim())
            throw new Error("a host authority reference is required to revoke or accept; it is host-reported, not independently authenticated");
        if (opts.outcome !== undefined && !opts.outcome.trim())
            throw new Error("task outcome must not be empty");
        const revoke = new Set(opts.revoke ?? []);
        if ([...revoke].some(n => !current.items.some(i => i.seq === n)))
            throw new Error("unknown item to revoke");
        const carried = current.items.map((i) => ({
            kind: i.kind,
            provenance: i.provenance,
            body: i.body,
            origin: i.origin ?? null,
            revoked: i.revoked || revoke.has(i.seq),
        }));
        return this.#writeTaskVersion(taskId, current.version + 1, current.version, opts.outcome ?? current.outcome, opts.status ?? current.status, [...carried, ...added.map((a) => ({ ...a, revoked: false }))], { worktree: current.worktree ?? undefined, branch: current.branch, parentTask: current.parentTask ?? undefined, parentVersion: current.parentVersion ?? undefined, parentCheckpoint: current.parentCheckpoint ?? undefined, authorityRef: opts.authorityRef, session: opts.session, mode: current.mode });
    }
    #writeTaskVersion(taskId: string, version: number, supersedes: number | null, outcome: string, status: Task["status"], items: (Omit<TaskItem, "seq" | "revoked"> & {
        revoked?: boolean;
    })[], meta: {
        worktree?: string | undefined;
        branch?: string | null | undefined;
        session?: string | undefined;
        parentTask?: string | undefined;
        parentVersion?: number | undefined;
        parentCheckpoint?: string | undefined;
        authorityRef?: string | undefined;
        mode?: TaskMode | undefined;
    } = {}): Task {
        const createdAt = now();
        try {
            return this.atomic(() => {
                this.#db
                    .prepare(`INSERT INTO task (task_id, version, supersedes, outcome, status, created_at,
             worktree, branch, parent_task, session, mode, parent_version, parent_checkpoint) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
                    .run(taskId, version, supersedes, outcome, status, createdAt, meta.worktree ?? null, meta.branch ?? null, meta.parentTask ?? null, meta.session ?? null, meta.mode ?? "implement", meta.parentVersion ?? null, meta.parentCheckpoint ?? null);
                const ins = this.#db.prepare("INSERT INTO task_item (task_id, version, seq, kind, provenance, body, revoked, origin) VALUES (?,?,?,?,?,?,?,?)");
                items.forEach((item, i) => ins.run(taskId, version, i, item.kind, item.provenance, item.body, item.revoked ? 1 : 0, item.origin ?? null));
                this.appendEvent(taskId, "task-revision", { version, supersedes, status, session: meta.session ?? null, authorityRef: meta.authorityRef ?? null });
                return this.readTask(taskId, version)!;
            });
        }
        catch (err) {
            throw new ExecutionStateUnavailable(String((err as Error).message));
        }
    }
    /** The newest version, which is the live one. */
    readTask(taskId: string, version?: number): Task | null {
        const t = this.#db
            .prepare(`SELECT * FROM task WHERE task_id = ?${version === undefined ? "" : " AND version = ?"} ORDER BY version DESC LIMIT 1`)
            .get(...(version === undefined ? [taskId] : [taskId, version])) as Record<string, unknown> | undefined;
        if (!t)
            return null;
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
            worktree: (t["worktree"] as string | null) ?? null,
            branch: (t["branch"] as string | null) ?? null,
            parentTask: (t["parent_task"] as string | null) ?? null,
            parentVersion: (t["parent_version"] as number | null) ?? null,
            parentCheckpoint: (t["parent_checkpoint"] as string | null) ?? null,
            session: (t["session"] as string | null) ?? null,
            mode: ((t["mode"] as string | null) ?? "implement") as TaskMode,
            items: items.map((i) => ({
                seq: i["seq"] as number,
                kind: i["kind"] as TaskItem["kind"],
                provenance: i["provenance"] as TaskItem["provenance"],
                body: i["body"] as string,
                revoked: Boolean(i["revoked"]), origin: (i["origin"] as string | null) ?? null,
            })),
        };
    }
    listTasks(): Task[] {
        const ids = this.#db
            .prepare("SELECT DISTINCT task_id FROM task ORDER BY task_id")
            .all() as {
            task_id: string;
        }[];
        return ids.map((r) => this.readTask(r.task_id)!);
    }
    // -------------------------------------------------------------- actions
    insertAction(a: Omit<Action, "revision" | "createdAt" | "updatedAt">): Action {
        const ts = now();
        try {
            this.#db
                .prepare(`INSERT INTO action (action_id, task_id, task_version, operation, scope, destination,
             policy_revision, status, revision, expected_inputs, intended_outputs, reconcile,
             refused_reason, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,1,?,?,?,?,?,?)`)
                .run(a.actionId, a.taskId, a.taskVersion, a.operation, JSON.stringify(a.scope), a.destination, a.policyRevision, a.status, JSON.stringify(a.expectedInputs), JSON.stringify(a.intendedOutputs), a.reconcile, a.refusedReason, ts, ts);
        }
        catch (err) {
            throw new ExecutionStateUnavailable(String((err as Error).message));
        }
        return this.readAction(a.actionId)!;
    }
    /**
     * Compare-and-set on the expected revision. Two processes reading the same prior state
     * cannot both act: the second one's expected revision no longer matches and it is refused.
     */
    transitionAction(actionId: string, expectedRevision: number, status: ActionStatus, patch: Partial<Pick<Action, "reconcile" | "refusedReason" | "intendedOutputs">> = {}): Action {
        return this.atomic(() => {
            const current = this.readAction(actionId);
            if (!current || current.revision !== expectedRevision)
                throw new RevisionConflict(actionId, expectedRevision, current?.revision ?? -1);
            if (!TRANSITIONS[current.status].includes(status))
                throw new Error(`illegal action transition ${current.status} -> ${status}`);
            if (["authorized", "prepared", "in-progress"].includes(status)) {
                const task = this.readTask(current.taskId);
                if (!task || task.version !== current.taskVersion || task.status !== "open")
                    throw new Error("task revised or not open; propose a new action");
            }
            this.#db.prepare(`UPDATE action SET status=?, revision=revision+1, updated_at=?,
        reconcile=COALESCE(?,reconcile), refused_reason=COALESCE(?,refused_reason),
        intended_outputs=COALESCE(?,intended_outputs) WHERE action_id=? AND revision=?`)
                .run(status, now(), patch.reconcile ?? null, patch.refusedReason ?? null, patch.intendedOutputs ? JSON.stringify(patch.intendedOutputs) : null, actionId, expectedRevision);
            this.appendEvent(current.taskId, "action-transition", { actionId, from: current.status, to: status, revision: expectedRevision + 1, reason: patch.refusedReason ?? null });
            return this.readAction(actionId)!;
        });
    }
    readAction(actionId: string): Action | null {
        const r = this.#db.prepare("SELECT * FROM action WHERE action_id = ?").get(actionId) as Record<string, unknown> | undefined;
        return r ? rowToAction(r) : null;
    }
    /** Actions interrupted mid-effect. These are resumed by inspection, never by replay. */
    listUnresolvedActions(): Action[] {
        return (this.#db
            .prepare("SELECT * FROM action WHERE status IN ('prepared','in-progress','outcome-unknown') OR (status='authorized' AND action_id IN (SELECT action_id FROM execution)) ORDER BY created_at")
            .all() as Record<string, unknown>[]).map(rowToAction);
    }
    listActions(taskId: string): Action[] {
        return (this.#db
            .prepare("SELECT * FROM action WHERE task_id = ? ORDER BY created_at")
            .all(taskId) as Record<string, unknown>[]).map(rowToAction);
    }
    // ------------------------------------------------------------ artifacts
    putArtifact(a: Omit<Artifact, "artifactId" | "createdAt"> & {
        artifactId?: string;
    }): Artifact {
        const artifactId = a.artifactId ?? contentAddress(JSON.stringify([a.kind, a.subject, a.path, a.inline]));
        const existing = this.readArtifact(artifactId);
        if (existing) {
            if (existing.kind !== a.kind || existing.subject !== a.subject || existing.path !== a.path || existing.bytes !== a.bytes || (a.inline !== null && this.artifactContent(artifactId) !== a.inline))
                throw new Error("artifact identity collision");
            return existing;
        }
        const createdAt = now();
        let inline = a.inline;
        let blobPath: string | null = null;
        if (inline !== null && Buffer.byteLength(inline) !== a.bytes)
            throw new Error("artifact byte count mismatch");
        if (inline !== null && Buffer.byteLength(inline) > 64000 && this.directory) {
            blobPath = join(this.directory, "artifacts", contentAddress(inline).slice(7));
            mkdirSync(dirname(blobPath), { recursive: true, mode: 0o700 });
            try {
                const fd = openSync(blobPath, "wx", 0o600);
                try {
                    writeFileSync(fd, inline);
                    fsyncSync(fd);
                }
                finally {
                    closeSync(fd);
                }
            }
            catch (error) {
                if ((error as NodeJS.ErrnoException).code !== "EEXIST")
                    throw error;
                if (readFileSync(blobPath, "utf8") !== inline)
                    throw new Error("artifact blob collision");
            }
            const directoryFd = openSync(dirname(blobPath), "r");
            try {
                fsyncSync(directoryFd);
            }
            finally {
                closeSync(directoryFd);
            }
            inline = null;
        }
        this.#db
            .prepare(`INSERT OR IGNORE INTO artifact (artifact_id, kind, subject, path, inline, bytes, provenance, created_at, blob_path)
         VALUES (?,?,?,?,?,?,?,?,?)`)
            .run(artifactId, a.kind, a.subject, a.path, inline, a.bytes, a.provenance, createdAt, blobPath);
        return this.readArtifact(artifactId)!;
    }
    readArtifact(artifactId: string): Artifact | null {
        const r = this.#db.prepare("SELECT * FROM artifact WHERE artifact_id = ?").get(artifactId) as Record<string, unknown> | undefined;
        if (!r)
            return null;
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
        const evidenceId = randomUUID(), createdAt = now();
        try {
            return this.atomic(() => {
                this.#db.prepare(`INSERT INTO evidence(evidence_id,task_id,action_id,artifact_id,claim,observed,establishes,confirmation,criticality,created_at)
          VALUES(?,?,?,?,?,?,?,?,?,?)`).run(evidenceId, e.taskId, e.actionId, e.artifactId, e.claim, e.observed, e.establishes, e.confirmation, e.criticality, createdAt);
                this.appendEvent(e.taskId ?? "unbound", "evidence", { evidenceId, taskVersion: e.taskId ? this.readTask(e.taskId)?.version ?? null : null, actionId: e.actionId, claim: e.claim, confirmation: e.confirmation });
                return { ...e, evidenceId, createdAt };
            });
        }
        catch (error) {
            if (e.criticality === "execution")
                throw new ExecutionStateUnavailable((error as Error).message);
            return null;
        }
    }
    listEvidence(taskId: string): Evidence[] {
        return (this.#db
            .prepare("SELECT * FROM evidence WHERE task_id = ? ORDER BY created_at")
            .all(taskId) as Record<string, unknown>[]).map((r) => ({
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
        for (const value of [u.inputTokens, u.outputTokens, u.durationMs, u.costMicros, u.cachedInputTokens, u.reasoningTokens]) {
            if (value != null && (!Number.isSafeInteger(value) || value < 0))
                throw new Error("usage counts must be nonnegative integers or null");
        }
        if (u.cachedInputTokens != null && (u.inputTokens == null || u.cachedInputTokens > u.inputTokens))
            throw new Error("cached input must be a subset of input");
        if (u.reasoningTokens != null && (u.outputTokens == null || u.reasoningTokens > u.outputTokens))
            throw new Error("reasoning must be a subset of output");
        const usageId = randomUUID();
        const recordedAt = now();
        try {
            this.#db
                .prepare(`INSERT INTO usage (usage_id, task_id, action_id, kind, input_tokens, output_tokens,
             duration_ms, cost_micros, recorded_at, cached_input_tokens, reasoning_tokens, source, measurement_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
                .run(usageId, u.taskId, u.actionId, u.kind, u.inputTokens ?? null, u.outputTokens ?? null, u.durationMs ?? null, u.costMicros ?? null, recordedAt, u.cachedInputTokens ?? null, u.reasoningTokens ?? null, u.source ?? "host-reported", u.measurementId ?? null);
        }
        catch {
            return null;
        }
        return { ...u, usageId, recordedAt };
    }
    usageTotals(taskId?: string) {
        const rows = this.#db.prepare(`SELECT * FROM usage${taskId ? " WHERE task_id=?" : ""}`).all(...(taskId ? [taskId] : [])) as Record<string, unknown>[];
        const fields = { inputTokens: "input_tokens", outputTokens: "output_tokens", cachedInputTokens: "cached_input_tokens", reasoningTokens: "reasoning_tokens", durationMs: "duration_ms", costMicros: "cost_micros" };
        const totals: Record<string, number | null> = {};
        const coverage: Record<string, {
            measured: number;
            missing: number;
        }> = {};
        for (const [name, col] of Object.entries(fields)) {
            const known = rows.filter(r => r[col] !== null);
            totals[name] = known.length ? known.reduce((n, r) => n + Number(r[col]), 0) : null;
            coverage[name] = { measured: known.length, missing: rows.length - known.length };
        }
        return { calls: rows.length, inputTokens: totals["inputTokens"] ?? null, outputTokens: totals["outputTokens"] ?? null, cachedInputTokens: totals["cachedInputTokens"] ?? null, reasoningTokens: totals["reasoningTokens"] ?? null, durationMs: totals["durationMs"] ?? null, costMicros: totals["costMicros"] ?? null, coverage, sources: [...new Set(rows.map(r => String(r["source"])))], interpretation: "Known subtotals only. Missing usage is unknown, not zero; cached/reasoning are subsets." };
    }
    // ------------------------------------------------------- concurrency
    recordActivity(a: {
        session: string;
        worktree: string;
        taskId: string | null;
        treeDigest: string | null;
    }): void {
        try {
            this.#db
                .prepare(`INSERT INTO session_activity (session, worktree, task_id, tree_digest, last_seen)
           VALUES (?,?,?,?,?)
           ON CONFLICT(session, worktree) DO UPDATE SET
             task_id = excluded.task_id,
             tree_digest = excluded.tree_digest,
             last_seen = excluded.last_seen`)
                .run(a.session, a.worktree, a.taskId, a.treeDigest, now());
        }
        catch {
            /* awareness is best-effort and never blocks work */
        }
    }
    readActivity(session: string, worktree: string): {
        taskId: string | null;
        treeDigest: string | null;
        lastSeen: string;
    } | null {
        const r = this.#db
            .prepare("SELECT * FROM session_activity WHERE session = ? AND worktree = ?")
            .get(session, worktree) as Record<string, unknown> | undefined;
        if (!r)
            return null;
        return {
            taskId: (r["task_id"] as string | null) ?? null,
            treeDigest: (r["tree_digest"] as string | null) ?? null,
            lastSeen: r["last_seen"] as string,
        };
    }
    activeSessions(worktree: string, excludingSession: string, since: string): {
        session: string;
        taskId: string | null;
        lastSeen: string;
    }[] {
        return (this.#db
            .prepare(`SELECT session, task_id, last_seen FROM session_activity
           WHERE worktree = ? AND session != ? AND last_seen >= ?
           ORDER BY last_seen DESC`)
            .all(worktree, excludingSession, since) as Record<string, unknown>[]).map((r) => ({
            session: r["session"] as string,
            taskId: (r["task_id"] as string | null) ?? null,
            lastSeen: r["last_seen"] as string,
        }));
    }
    artifactContent(id: string): string {
        const row = this.#db.prepare("SELECT inline,blob_path FROM artifact WHERE artifact_id=?").get(id) as {
            inline: string | null;
            blob_path: string | null;
        } | undefined;
        if (!row)
            throw new Error("unknown artifact");
        if (row.inline !== null)
            return row.inline;
        if (!row.blob_path)
            throw new Error("artifact content unavailable; reference only");
        const content = readFileSync(row.blob_path, "utf8");
        if (contentAddress(content).slice(7) !== row.blob_path.split("/").at(-1))
            throw new Error("artifact content failed integrity check");
        return content;
    }
    linkArtifact(taskId: string, artifactId: string): void {
        this.#db.prepare("INSERT OR IGNORE INTO task_artifact VALUES(?,?)").run(taskId, artifactId);
    }
    taskHasArtifact(taskId: string, artifactId: string): boolean {
        return !!this.#db.prepare("SELECT 1 FROM task_artifact WHERE task_id=? AND artifact_id=?").get(taskId, artifactId);
    }
    budget(taskId: string) {
        const row = this.#db.prepare("SELECT ceiling,used FROM budget WHERE task_id=?").get(taskId) as {
            ceiling: number;
            used: number;
        } | undefined;
        return row ? { ceiling: row.ceiling, used: row.used } : undefined;
    }
    setBudget(taskId: string, ceiling: number, authorityRef: string): void {
        if (!this.readTask(taskId) || !Number.isSafeInteger(ceiling) || ceiling < 0 || !authorityRef.trim())
            throw new Error("budget needs a task, finite nonnegative ceiling and host reference");
        this.atomic(() => {
            const prior = this.budget(taskId);
            if (prior && ceiling < prior.used)
                throw new Error("budget is below bytes already delivered");
            this.#db.prepare("INSERT INTO budget VALUES(?,?,0) ON CONFLICT(task_id) DO UPDATE SET ceiling=excluded.ceiling").run(taskId, ceiling);
            this.appendEvent(taskId, "budget-changed", { ceiling, authorityRef });
        });
    }
    reserveBytes(taskId: string, bytes: number, initialCeiling = 262144): {
        ceiling: number;
        used: number;
    } | null {
        if (!Number.isSafeInteger(bytes) || bytes < 0 || !Number.isSafeInteger(initialCeiling) || initialCeiling < 0)
            throw new Error("invalid byte budget");
        return this.atomic(() => {
            if (!this.readTask(taskId))
                throw new Error("unknown task");
            this.#db.prepare("INSERT OR IGNORE INTO budget VALUES(?,?,0)").run(taskId, initialCeiling);
            const prior = this.budget(taskId)!;
            if (prior.used + bytes > prior.ceiling)
                return null;
            this.#db.prepare("UPDATE budget SET used=used+? WHERE task_id=?").run(bytes, taskId);
            return this.budget(taskId)!;
        });
    }
    appendEvent(taskId: string, kind: string, detail: unknown): LedgerEvent {
        const eventId = randomUUID(), createdAt = now();
        const r = this.#db.prepare("INSERT INTO ledger(event_id,task_id,kind,detail,created_at) VALUES(?,?,?,?,?)").run(eventId, taskId, kind, JSON.stringify(detail), createdAt);
        return { seq: Number(r.lastInsertRowid), eventId, taskId, kind, detail, createdAt };
    }
    events(taskId: string, after = 0, limit = 20): LedgerEvent[] {
        if (!Number.isSafeInteger(after) || after < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100)
            throw new Error("invalid event cursor/limit");
        return (this.#db.prepare("SELECT * FROM ledger WHERE task_id=? AND seq>? ORDER BY seq LIMIT ?").all(taskId, after, limit) as Record<string, unknown>[])
            .map(r => ({ seq: Number(r["seq"]), eventId: String(r["event_id"]), taskId, kind: String(r["kind"]), detail: JSON.parse(String(r["detail"])), createdAt: String(r["created_at"]) }));
    }
    latestCursor(taskId: string): number {
        return Number((this.#db.prepare("SELECT MAX(seq) seq FROM ledger WHERE task_id=?").get(taskId) as {
            seq: number | null;
        }).seq ?? 0);
    }
    workspace(locator: string, path: string): string {
        this.#db.prepare("INSERT INTO workspace VALUES(?,?,?) ON CONFLICT(locator) DO UPDATE SET path=excluded.path").run(randomUUID(), locator, path);
        return (this.#db.prepare("SELECT workspace_id FROM workspace WHERE locator=?").get(locator) as {
            workspace_id: string;
        }).workspace_id;
    }
    bind(taskId: string, session: string, workspaceId: string, worktree: string, parentAttempt: string | null = null): Attempt {
        if (!session.trim())
            throw new Error("stable host session identity required");
        const task = this.readTask(taskId);
        if (!task)
            throw new Error("unknown task");
        if (parentAttempt && !this.readAttempt(parentAttempt))
            throw new Error("unknown parent attempt");
        return this.atomic(() => {
            const prior = this.boundAttempt(session, workspaceId);
            if (prior?.taskId === taskId && prior.taskVersion === task.version)
                return prior;
            const attempt: Attempt = { attemptId: randomUUID(), taskId, taskVersion: task.version, workspaceId, worktree, session, parentAttempt: parentAttempt ?? (prior?.taskId === taskId ? prior.attemptId : null), createdAt: now() };
            this.#db.prepare("INSERT INTO attempt VALUES(?,?,?,?,?,?,?,?)").run(attempt.attemptId, taskId, task.version, workspaceId, worktree, session, attempt.parentAttempt, attempt.createdAt);
            this.#db.prepare("INSERT INTO binding VALUES(?,?,?) ON CONFLICT(session,workspace_id) DO UPDATE SET attempt_id=excluded.attempt_id").run(session, workspaceId, attempt.attemptId);
            this.appendEvent(taskId, "attempt-started", attempt);
            return attempt;
        });
    }
    readAttempt(id: string): Attempt | null {
        const r = this.#db.prepare("SELECT * FROM attempt WHERE attempt_id=?").get(id) as Record<string, unknown> | undefined;
        return r ? { attemptId: id, taskId: String(r["task_id"]), taskVersion: Number(r["task_version"]), workspaceId: String(r["workspace_id"]), worktree: String(r["worktree"]), session: String(r["session"]), parentAttempt: r["parent_attempt"] as string | null, createdAt: String(r["created_at"]) } : null;
    }
    boundAttempt(session: string, workspaceId: string): Attempt | null {
        const r = this.#db.prepare("SELECT attempt_id FROM binding WHERE session=? AND workspace_id=?").get(session, workspaceId) as {
            attempt_id: string;
        } | undefined;
        return r ? this.readAttempt(r.attempt_id) : null;
    }
    checkpoint(taskId: string, input: {
        summary: string;
        next: string;
        evidenceIds: string[];
        subject: string | null;
        attemptId?: string | null;
    }): Checkpoint {
        const task = this.readTask(taskId);
        if (!task)
            throw new Error("unknown task");
        if (!input.summary.trim() || Buffer.byteLength(input.summary + input.next) > 8000)
            throw new Error("checkpoint needs a summary, at most 8000 bytes with next step");
        const evidence = new Set(this.listEvidence(taskId).map(e => e.evidenceId));
        if (input.evidenceIds.some(id => !evidence.has(id)))
            throw new Error("checkpoint references evidence outside this task");
        const attempt = input.attemptId ? this.readAttempt(input.attemptId) : null;
        if (input.attemptId && attempt?.taskId !== taskId)
            throw new Error("checkpoint attempt belongs to another task");
        const c: Checkpoint = { checkpointId: randomUUID(), taskId, taskVersion: task.version, attemptId: input.attemptId ?? null, summary: input.summary, next: input.next, evidenceIds: input.evidenceIds, subject: input.subject, createdAt: now() };
        return this.atomic(() => {
            this.#db.prepare("INSERT INTO checkpoint VALUES(?,?,?,?,?,?,?,?,?)").run(c.checkpointId, taskId, task.version, c.attemptId, c.summary, c.next, JSON.stringify(c.evidenceIds), c.subject, c.createdAt);
            this.appendEvent(taskId, "checkpoint", { checkpointId: c.checkpointId, taskVersion: c.taskVersion });
            return c;
        });
    }
    allEvents(taskId: string): LedgerEvent[] {
        const result: LedgerEvent[] = [];
        let cursor = 0;
        while (true) {
            const page = this.events(taskId, cursor, 100);
            result.push(...page);
            if (page.length < 100)
                return result;
            cursor = page.at(-1)!.seq;
        }
    }
    checkpointById(id: string): Checkpoint | null {
        const r = this.#db.prepare("SELECT * FROM checkpoint WHERE checkpoint_id=?").get(id) as Record<string, unknown> | undefined;
        return r ? { checkpointId: id, taskId: String(r["task_id"]), taskVersion: Number(r["task_version"]), attemptId: r["attempt_id"] as string | null, summary: String(r["summary"]), next: String(r["next"]), evidenceIds: JSON.parse(String(r["evidence_ids"])), subject: r["subject"] as string | null, createdAt: String(r["created_at"]) } : null;
    }
    latestCheckpointAt(taskId: string, version: number): Checkpoint | null {
        const r = this.#db.prepare("SELECT * FROM checkpoint WHERE task_id=? AND task_version<=? ORDER BY rowid DESC LIMIT 1").get(taskId, version) as Record<string, unknown> | undefined;
        return r ? { checkpointId: String(r["checkpoint_id"]), taskId, taskVersion: Number(r["task_version"]), attemptId: r["attempt_id"] as string | null, summary: String(r["summary"]), next: String(r["next"]), evidenceIds: JSON.parse(String(r["evidence_ids"])), subject: r["subject"] as string | null, createdAt: String(r["created_at"]) } : null;
    }
    latestCheckpoint(taskId: string): Checkpoint | null {
        const r = this.#db.prepare("SELECT * FROM checkpoint WHERE task_id=? ORDER BY rowid DESC LIMIT 1").get(taskId) as Record<string, unknown> | undefined;
        return r ? { checkpointId: String(r["checkpoint_id"]), taskId, taskVersion: Number(r["task_version"]), attemptId: r["attempt_id"] as string | null, summary: String(r["summary"]), next: String(r["next"]), evidenceIds: JSON.parse(String(r["evidence_ids"])), subject: r["subject"] as string | null, createdAt: String(r["created_at"]) } : null;
    }
    saveExecution(b: ExecutionBinding): void {
        this.atomic(() => {
            const a = this.readAction(b.actionId);
            if (!a || a.status !== "authorized")
                throw new Error("execution can only bind an authorized action");
            this.#db.prepare("INSERT INTO execution VALUES(?,?,?,?,?,?,?,?,?,?)").run(b.actionId, JSON.stringify(b.request), b.requestDigest, b.authorityRef, b.executor, b.executorDigest, b.stateRoot, b.jobId, b.result ? JSON.stringify(b.result) : null, b.createdAt);
            this.appendEvent(a.taskId, "execution-bound", { actionId: b.actionId, requestDigest: b.requestDigest, authorityRef: b.authorityRef });
        });
    }
    execution(actionId: string): ExecutionBinding | null {
        const r = this.#db.prepare("SELECT * FROM execution WHERE action_id=?").get(actionId) as Record<string, unknown> | undefined;
        return r ? { actionId, request: JSON.parse(String(r["request"])), requestDigest: String(r["request_digest"]), authorityRef: String(r["authority_ref"]), executor: String(r["executor"]), executorDigest: String(r["executor_digest"]), stateRoot: r["state_root"] as string | null, jobId: r["job_id"] as string | null, result: r["result"] ? JSON.parse(String(r["result"])) : null, createdAt: String(r["created_at"]) } : null;
    }
    linkJob(actionId: string, jobId: string): void {
        this.atomic(() => {
            const e = this.execution(actionId);
            if (!e || (e.jobId && e.jobId !== jobId))
                throw new Error("execution job identity conflict");
            this.#db.prepare("UPDATE execution SET job_id=? WHERE action_id=?").run(jobId, actionId);
            this.appendEvent(this.readAction(actionId)!.taskId, "job-linked", { actionId, jobId });
        });
    }
    finishExecution(actionId: string, result: Record<string, unknown>, artifactId: string, confirmation: Evidence["confirmation"], establishes: string): void {
        this.atomic(() => {
            const binding = this.execution(actionId), action = this.readAction(actionId);
            if (!binding || !action)
                throw new Error("unknown execution");
            if (binding.result)
                return; // A competing observer already finalized this receipt.
            if (!["in-progress", "outcome-unknown"].includes(action.status))
                throw new Error("action cannot consume an executor result");
            this.saveResult(actionId, result);
            this.linkArtifact(action.taskId, artifactId);
            this.recordEvidence({ taskId: action.taskId, actionId, artifactId, claim: "declared batch assertions", observed: String(result["state"]), establishes, confirmation, criticality: "execution" });
            const status = result["state"] === "cancelled" ? "cancelled" : "completed";
            this.#db.prepare("UPDATE action SET status=?,revision=revision+1,updated_at=? WHERE action_id=? AND revision=?").run(status, now(), actionId, action.revision);
            this.appendEvent(action.taskId, "action-transition", { actionId, from: action.status, to: status, revision: action.revision + 1 });
            const start = result["started_at"], end = result["finished_at"];
            const elapsed = typeof start === "number" && typeof end === "number" ? Math.round((end - start) * 1000) : NaN;
            const durationMs = Number.isSafeInteger(elapsed) && elapsed >= 0 ? elapsed : null;
            this.recordUsage({ taskId: action.taskId, actionId, kind: "execution", inputTokens: null, outputTokens: null, durationMs, costMicros: null, source: "governance-executor", measurementId: actionId });
        });
    }
    saveResult(actionId: string, result: Record<string, unknown>): void {
        this.#db.prepare("UPDATE execution SET result=? WHERE action_id=?").run(JSON.stringify(result), actionId);
    }
    recordIntent(session: string, workspaceId: string, taskId: string, path: string, mode: "read" | "write", digest: string | null): void {
        this.#db.prepare(`INSERT INTO path_intent VALUES(?,?,?,?,?,?,?) ON CONFLICT(session,workspace_id,task_id,path,mode)
      DO UPDATE SET digest=excluded.digest,seen_at=excluded.seen_at`).run(session, workspaceId, taskId, path, mode, digest, now());
    }
    intents(workspaceId: string) {
        return this.#db.prepare("SELECT session,task_id,path,mode,digest,seen_at FROM path_intent WHERE workspace_id=? AND seen_at>=?")
            .all(workspaceId, new Date(Date.now() - 30 * 60 * 1000).toISOString()) as {
            session: string;
            task_id: string;
            path: string;
            mode: "read" | "write";
            digest: string | null;
            seen_at: string;
        }[];
    }
    releaseIntents(session: string, workspaceId: string): void { this.#db.prepare("DELETE FROM path_intent WHERE session=? AND workspace_id=?").run(session, workspaceId); }
    storeImport(digest: string, sourceRepository: string, payload: unknown): boolean {
        return Number(this.#db.prepare("INSERT OR IGNORE INTO imported_bundle VALUES(?,?,?,?)").run(digest, sourceRepository, JSON.stringify(payload), now()).changes) > 0;
    }
    readImport(digest: string): unknown {
        const r = this.#db.prepare("SELECT payload FROM imported_bundle WHERE digest=?").get(digest) as {
            payload: string;
        } | undefined;
        return r ? JSON.parse(r.payload) : null;
    }
    /** Readable JSON export, a first-class command rather than an occasional convenience. */
    exportJson(): Record<string, unknown> {
        return this.atomic(() => {
            const tables = ["task", "task_item", "action", "artifact", "evidence", "usage", "workspace", "attempt", "checkpoint", "ledger", "execution"];
            const out: Record<string, unknown> = { schemaVersion: SCHEMA_VERSION, repositoryId: this.repositoryId(), exportedAt: now() };
            for (const t of tables)
                out[t] = this.#db.prepare(`SELECT * FROM ${t}`).all();
            return out;
        });
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
const TRANSITIONS: Record<ActionStatus, ActionStatus[]> = {
    proposed: ["authorized", "refused", "cancelled"], authorized: ["prepared", "refused", "cancelled"],
    prepared: ["in-progress", "cancelled", "refused"], "in-progress": ["completed", "cancelled", "outcome-unknown"],
    completed: ["verified"], verified: [], refused: [], cancelled: [], "outcome-unknown": ["completed", "cancelled"],
};
function validateItems(items: Omit<TaskItem, "seq" | "revoked">[]): void {
    for (const i of items)
        if (!["constraint", "acceptance", "scope", "open-question", "ruled-out", "handoff"].includes(i.kind)
            || !["operator", "observed", "hypothesis"].includes(i.provenance) || !i.body.trim() || Buffer.byteLength(i.body) > 8000)
            throw new Error("invalid task item");
}
