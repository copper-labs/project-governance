import { relative, isAbsolute } from "node:path";
import { createHash } from "node:crypto";
import { withinScope } from "./authority.ts";
import { spawnSync } from "node:child_process";
import type { Attempt } from "../model/types.ts";
import type { Store } from "../store/store.ts";
import { contentAddress } from "../store/store.ts";
import { resolveSubject } from "./retrieval.ts";
export function resume(store: Store, taskId: string, after = 0, maxBytes = 16000, attempt: Attempt | null = null, workspaceRoot?: string) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1024 || maxBytes > 64000)
        throw new Error("resume budget must be 1024..64000 bytes");
    const task = store.readTask(taskId);
    if (!task)
        throw new Error("unknown task");
    const scopes = task.items.filter(i => !i.revoked && i.kind === "scope").map(i => i.body);
    const worktree = workspaceRoot ?? attempt?.worktree;
    const workspace = worktree ? { worktree, withinTaskScope: withinScope(worktree, scopes, worktree), next: withinScope(worktree, scopes, worktree) ? null : "Explicitly revise task scope for this worktree before reading or checking." } : null;
    const packet: Record<string, unknown> = { workspace, ok: true, attempt, repositoryId: store.repositoryId(), task: { taskId, version: task.version, outcome: task.outcome, status: task.status, mode: task.mode, parentTask: task.parentTask, parentVersion: task.parentVersion }, instructions: task.items.filter(i => !i.revoked && ["constraint", "scope", "acceptance"].includes(i.kind)), provenance: "Operator items are host-reported. Notes and checkpoints are attributed context, not new authority.", cursor: after, hasMore: false };
    const fits = () => Buffer.byteLength(JSON.stringify(packet)) <= maxBytes;
    if (!fits())
        return { ok: false, blocked: "mandatory task context exceeds resume budget", taskId, requiredBytes: Buffer.byteLength(JSON.stringify(packet)) };
    const omitted: string[] = [];
    // Reserve final metadata before filling optional context and event pages.
    packet["omitted"] = omitted;
    packet["changes"] = [];
    const add = (key: string, value: unknown) => {
        packet[key] = value;
        if (!fits()) {
            delete packet[key];
            omitted.push(key);
        }
    };
    add("checkpoint", store.latestCheckpoint(taskId));
    if (task.parentTask && task.parentVersion)
        add("inherited", { parentRevision: task.parentVersion, checkpoint: task.parentCheckpoint ? store.checkpointById(task.parentCheckpoint) : null, applicability: "Original evidence only; re-evaluate on this task's inputs." });
    add("findings", task.items.filter(i => !i.revoked && ["handoff", "ruled-out", "open-question"].includes(i.kind)).slice(-6));
    add("pendingActions", store.listUnresolvedActions().filter(a => a.taskId === taskId).slice(-10).map(a => ({ actionId: a.actionId, status: a.status, jobId: store.execution(a.actionId)?.jobId ?? null })));
    const changes = store.events(taskId, after, 20);
    const delivered: unknown[] = [];
    packet["changes"] = delivered;
    for (const event of changes) {
        const summary = { seq: event.seq, eventId: event.eventId, kind: event.kind, createdAt: event.createdAt };
        const previousCursor = packet["cursor"];
        delivered.push(summary);
        packet["cursor"] = event.seq;
        if (!fits()) {
            delivered.pop();
            packet["cursor"] = previousCursor;
            break;
        }
    }
    packet["hasMore"] = Number(packet["cursor"]) < store.latestCursor(taskId);
    packet["omitted"] = omitted;
    if (!fits())
        return { ok: false, blocked: "resume envelope exceeds budget; increase it", taskId };
    return packet;
}
export function reconcile(store: Store, taskId: string, cwd: string, targetRef: string, sources: {
    taskId: string;
    version: number;
}[], conflicts: string[] = []) {
    if (sources.length > 20 || Buffer.byteLength(JSON.stringify(conflicts)) > 8000)
        throw new Error("reconciliation exceeds source/conflict bounds");
    if (!sources.length)
        throw new Error("reconciliation requires exact source task revisions");
    const target = store.readTask(taskId);
    if (!target)
        throw new Error("unknown target task");
    const commit = spawnSync("git", ["rev-parse", "--verify", "--end-of-options", `${targetRef}^{commit}`], { cwd, encoding: "utf8" });
    if (commit.status !== 0)
        throw new Error("target must resolve to a commit");
    const subject = resolveSubject(cwd, { kind: "commit", rev: commit.stdout.trim() });
    if ("error" in subject)
        throw new Error(subject.error);
    const blobHashes = new Map<string, string | null>();
    let inspectedBytes = 0, comparisons = 0;
    const deadline = performance.now() + 5000;
    const targetHash = (path: string): string | null => {
        if (blobHashes.has(path))
            return blobHashes.get(path)!;
        if (comparisons >= 256 || inspectedBytes >= 8 * 1024 * 1024 || performance.now() >= deadline)
            return null;
        comparisons++;
        const blob = spawnSync("git", ["show", `${subject.tree}:${path}`], { cwd, maxBuffer: 8 * 1024 * 1024 - inspectedBytes, timeout: Math.max(1, Math.ceil(deadline - performance.now())) });
        inspectedBytes += blob.stdout?.length ?? 0;
        const hash = blob.error ? null : blob.status === 0 ? createHash("sha256").update(blob.stdout).digest("hex") : "missing";
        blobHashes.set(path, hash);
        return hash;
    };
    const observations = sources.map(source => {
        const task = store.readTask(source.taskId, source.version);
        if (!task)
            throw new Error("unknown source task revision");
        const versions = new Map(store.allEvents(source.taskId).filter(e => e.kind === "evidence").map(e => {
            const d = e.detail as {
                evidenceId: string;
                taskVersion?: number;
            };
            return [d.evidenceId, d.taskVersion] as const;
        }));
        const evidence = store.listEvidence(source.taskId).filter(e => {
            const a = e.actionId ? store.readAction(e.actionId) : null;
            return a ? a.taskVersion <= source.version : (versions.get(e.evidenceId) ?? 0) <= source.version;
        }).map(e => {
            const a = e.artifactId ? store.readArtifact(e.artifactId) : null;
            const original = a?.subject ?? null;
            let applicability = original?.startsWith("tree:") ? (original === subject.digest ? "source-match" : "stale") : "unknown";
            const binding = e.actionId ? store.execution(e.actionId) : null;
            if (binding?.request.inputs.mode === "manifest") {
                const matches = binding.request.inputs.files!.map(f => {
                    const path = relative(binding.request.workspace, f.path);
                    if (!path || path === ".." || path.startsWith("../") || isAbsolute(path))
                        return null;
                    const hash = targetHash(path);
                    return hash === null ? null : hash === f.sha256;
                });
                applicability = matches.includes(false) ? "stale" : matches.includes(null) ? "unknown" : "declared-inputs-match";
            }
            if (!e.actionId && !Number.isInteger(versions.get(e.evidenceId)))
                applicability = "unknown";
            return { evidenceId: e.evidenceId, originalSubject: original, applicability, limits: "No environment reuse or acceptance implied." };
        });
        return { ...source, checkpoint: store.latestCheckpointAt(source.taskId, source.version)?.checkpointId ?? null, evidence };
    });
    const detail = { targetTaskVersion: target.version, targetCommit: commit.stdout.trim(), targetTree: subject.digest, sources: observations, conflicts, comparisonBudget: { uniquePaths: 256, maxBytes: 8 * 1024 * 1024, comparisons, inspectedBytes }, filterLimit: "Compares stored Git blob bytes, not clean/smudge or EOL-transformed worktree bytes. A mismatch may be a representation difference; recheck before interpreting it as a source edit.", requiredNext: "Run governance plan for the combined change; no acceptance or skipped checks." };
    const content = JSON.stringify(detail), artifact = store.putArtifact({ kind: "receipt", subject: subject.digest, path: null, inline: content, bytes: Buffer.byteLength(content), provenance: "observed" });
    store.linkArtifact(taskId, artifact.artifactId);
    return store.appendEvent(taskId, "reconciliation", { artifactId: artifact.artifactId, targetCommit: detail.targetCommit, targetTree: detail.targetTree, sourceCount: sources.length, applicability: [...new Set(observations.flatMap(o => o.evidence.map(e => e.applicability)))], requiredNext: detail.requiredNext });
}
/** Portable review bundle. Import is inert historical context, never executable authority. */
export function exportTask(store: Store, taskId: string, includeArtifacts = false) {
    return store.atomic(() => {
        const task = store.readTask(taskId);
        if (!task)
            throw new Error("unknown task");
        const evidence = store.listEvidence(taskId), actions = store.listActions(taskId);
        const ids = new Set(evidence.flatMap(e => e.artifactId ? [e.artifactId] : []));
        const payload = { format: "harness-history", version: 1, repositoryId: store.repositoryId(), task, evidence, actions, checkpoint: store.latestCheckpoint(taskId), events: store.allEvents(taskId), artifacts: includeArtifacts ? [...ids].map(id => ({ artifact: store.readArtifact(id), content: store.artifactContent(id) })) : [], authority: "historical-only" };
        return { payload, digest: contentAddress(JSON.stringify(payload)) };
    });
}
export function importHistory(store: Store, value: unknown) {
    if (!value || typeof value !== "object")
        throw new Error("invalid history bundle");
    const { payload, digest } = value as {
        payload: Record<string, unknown>;
        digest: string;
    };
    if (!payload || payload["format"] !== "harness-history" || payload["version"] !== 1 || payload["authority"] !== "historical-only" || typeof payload["repositoryId"] !== "string" || contentAddress(JSON.stringify(payload)) !== digest)
        throw new Error("history bundle identity/version mismatch");
    if (Buffer.byteLength(JSON.stringify(value)) > 16 * 1024 * 1024)
        throw new Error("history bundle exceeds 16 MiB");
    const inserted = store.storeImport(digest, payload["repositoryId"], payload);
    return { digest, inserted, authority: "none", note: "History imported into quarantine. Use as attributed context; no tasks, acceptance, permissions or jobs were activated." };
}
