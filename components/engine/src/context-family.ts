/** Bind retrieval continuation to one observed turn, without making that observation task authority. */
import { join } from "node:path";
import { digest, durableJson, object } from "./core.ts";
import { contextStateRoot } from "./context-command.ts";
import { currentTaskRefresh, latestSessionPrompt, promptEntryTaskBinding, readPromptEntry } from "./context-observations.ts";
import { sessionId, workContext } from "../../harness/src/store/location.ts";
import { resolveTaskContext, taskBindingReceipt } from "./decision-task-binding.ts";
import { DatabaseSync } from "node:sqlite";
import { DECISION_BUDGET_FILE } from "./decision-budget.ts";
import { beginContextRequest, finishContextRequest, abandonContextRequest, type BudgetScope } from "./decision-budget.ts";
import { narrativeFile } from "./narrative-inputs.ts";
import type { MetadataCursor } from "./context-metadata.ts";
import { ContextRouteError } from "./context-route-errors.ts";

export function expansionIdentity(workspace: string, entryId: string, caller?: string) {
  if (process.env.HARNESS_AGENT_ANCESTRY || process.env.GOVERNANCE_PARENT_TASK || process.env.GOVERNANCE_PARENT_LOCK_DIGEST)
    throw new ContextRouteError("delegated-worker", "A delegated worker cannot spend the parent prompt's context allowance");
  const session = sessionId(caller), entry = readPromptEntry(workspace, entryId);
  if (!session || entry.session !== session || latestSessionPrompt(workspace, session).entry?.entryId !== entryId ||
      entry.worktreeLocator !== workContext(workspace).locator || entry.provider !== "codex") throw new ContextRouteError("entry-session-mismatch", "Context expansion requires the current observed entry in this worktree and host session");
  const current = resolveTaskContext(workspace, { session }), prior = promptEntryTaskBinding(workspace, entry);
  const refresh = currentTaskRefresh(workspace, entry, taskBindingReceipt(current));
  if (prior && (!current.context || (current.context.taskId !== prior.taskId || current.context.revision !== prior.revision) && !refresh) || !prior && current.context)
    throw new ContextRouteError("entry-task-mismatch", "Context expansion task association is missing, closed or mismatched");
  const frozen = object(entry.scope);
  if (frozen.workspace !== entry.workspace || typeof frozen.taskId !== "string" || typeof frozen.taskRevision !== "string") throw new Error("Context entry accounting scope is unavailable");
  return { session, scope: current.context ? { workspace, taskId: current.context.taskId, taskRevision: current.context.revision } : frozen as unknown as BudgetScope,
    transitionId: refresh?.id ?? null,
    revision: current.context ? `task:${current.context.taskId}@${current.context.revision}` : frozen.taskRevision as string };
}

/** Select the next existing continuation slot; admission still owns concurrency and spending. */
export function nextContextExpansion(workspace: string, entryId: string, request?: string): 1 | 2 {
  let database: DatabaseSync | undefined;
  try {
    database = new DatabaseSync(join(contextStateRoot(workspace), DECISION_BUDGET_FILE), { readOnly: true });
    database.exec("PRAGMA busy_timeout=100");
    if (request) {
      const repeated = database.prepare("SELECT step FROM context_request WHERE family=? AND identity=? AND step>0 ORDER BY step DESC LIMIT 1").get(entryId, request);
      if (repeated) return Number(repeated.step) as 1 | 2;
    }
    const previous = database.prepare("SELECT cursor_digest FROM context_request WHERE family=? AND step=1").get(entryId);
    return previous?.cursor_digest ? 2 : 1;
  } catch { return 1; }
  finally { database?.close(); }
}
const cursorPath = (state: string, entry: string, step: number) => join(state, "context-cursors", `${entry}-${step}.json`);
export function beginContextSelection(workspace: string, entry: string, step: number, request: string) {
  const state = contextStateRoot(workspace), admission = beginContextRequest(state, entry, step, request);
  let previous: MetadataCursor | undefined, status = admission.status;
  try {
    const expected = "previousDigest" in admission ? admission.previousDigest : "cursorDigest" in admission ? admission.cursorDigest : undefined;
    if (expected) {
      const value = object(JSON.parse(narrativeFile(state, cursorPath(state, entry, status === "duplicate" ? step : step - 1))));
      if (digest(value) !== expected || value.entry !== entry || value.version !== 1) throw new Error("cursor differs");
      previous = value.cursor as MetadataCursor;
      if (previous.version !== 1 || !Array.isArray(previous.batches)) throw new Error("invalid cursor");
    }
  } catch {
    if (status === "reserved") abandonContextRequest(state, entry, step, request);
    status = "cursor-unavailable";
  }
  return { status, previous, paid: status === "reserved", replay: status === "duplicate" };
}
export function finishContextSelection(workspace: string, entry: string, step: number, request: string, cursor: MetadataCursor) {
  const state = contextStateRoot(workspace), value = { version: 1, entry, step, cursor };
  if (Buffer.byteLength(JSON.stringify(value)) > 1024 * 1024) return false;
  try { durableJson(cursorPath(state, entry, step), value); return finishContextRequest(state, entry, step, request, digest(value)); }
  catch { return false; }
}
