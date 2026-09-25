import { existsSync } from "node:fs";
import { isAbsolute, relative } from "node:path";
import { Store } from "../../harness/src/store/store.ts";
import { defaultDbPath, workContext } from "../../harness/src/store/location.ts";
import { digest } from "./core.ts";
import { contextTerms } from "./context-metadata.ts";

export interface HistoryCandidate {
  id: string; kind: "task"; revision: string; observedAt: string; sourceDigest: string;
  status: string; workspace: string | null; summary: string; authority: "historical-background";
  sourceHints: string[];
}
export interface HistorySelection {
  state: "ready" | "unavailable"; candidates: HistoryCandidate[]; inspected: number; omissions: string[];
}

/** Optional local lookup reads the existing repository store, never a second graph or task owner. */
export function readContextHistory(workspace: string, purpose: string, currentTask?: string): HistorySelection {
  let store: Store | undefined;
  try {
    const where = workContext(workspace), path = defaultDbPath(where.worktree);
    if (!existsSync(path)) return { state: "unavailable", candidates: [], inspected: 0, omissions: ["history-store-absent"] };
    store = new Store(path, { readOnly: true, busyTimeoutMs: 100 });
    const recent = store.recentTaskReferences(32), query = contextTerms(purpose);
    const matches = recent.filter(task => task.taskId !== currentTask).map(task => ({ task,
      score: [...contextTerms(task.summary)].filter(term => query.has(term)).length }))
      .filter(item => item.score > 0).sort((a, b) => b.score - a.score || b.task.observedAt.localeCompare(a.task.observedAt));
    const candidates: HistoryCandidate[] = []; let bytes = 0;
    for (const { task } of matches) {
      // A concurrent revision invalidates this historical projection, not current-source retrieval.
      const current = store.readTask(task.taskId);
      if (current?.version !== task.version) continue;
      const sourceHints = current.worktree ? current.items.filter(item => item.kind === "scope" && !item.revoked && isAbsolute(item.body))
        .map(item => relative(current.worktree!, item.body)).filter(path => path && !path.startsWith("../") && path !== ".." && !isAbsolute(path)).slice(0, 8) : [];
      const candidate: HistoryCandidate = { id: task.taskId, kind: "task", revision: String(task.version), observedAt: task.observedAt,
        sourceDigest: digest(task), status: task.status, workspace: task.worktree, summary: task.summary.slice(0, 500), authority: "historical-background", sourceHints };
      const size = Buffer.byteLength(JSON.stringify(candidate));
      if (candidates.length >= 3 || bytes + size > 2048) break;
      candidates.push(candidate); bytes += size;
    }
    return { state: "ready", candidates, inspected: recent.length,
      omissions: [...(recent.length === 32 ? ["recent-32-window-not-complete-history"] : []), ...(matches.length > candidates.length ? ["history-result-budget"] : [])] };
  } catch { return { state: "unavailable", candidates: [], inspected: 0, omissions: ["history-unavailable-or-schema-mismatch"] }; }
  finally { store?.close(); }
}
