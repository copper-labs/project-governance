import { existsSync, realpathSync } from "node:fs";
import { Store } from "../../harness/src/store/store.ts";
import { defaultDbPath, sessionId, workContext } from "../../harness/src/store/location.ts";
import { resolveTaskContext } from "./decision-task-binding.ts";

/** Inspect the existing continuity owner; a sibling binding is evidence, never a routing target. */
export function contextWorkspaceIdentity(workspace: string, explicitSession?: string, options: { deadlineAt?: number } = {}) {
  const root = realpathSync(workspace), session = sessionId(explicitSession);
  const empty = { workspace: root, bindings: [] as Array<{ workspace: string; locator: string; taskId: string; revision: string; attemptId: string }>,
    invalidBindings: 0, truncated: false, alignmentRequired: false, paidSelectionAllowed: true, targetSelection: "not-performed" as const };
  if (!session) return { ...empty, status: "session-unavailable" as const };
  let store: Store | undefined;
  try {
    const database = defaultDbPath(root, options.deadlineAt);
    if (!existsSync(database)) return { ...empty, status: "task-store-unavailable" as const };
    const canonicalDatabase = realpathSync(database);
    store = new Store(database, { readOnly: true, busyTimeoutMs: 100 });
    const observed = store.sessionBindings(session);
    let truncated = observed.truncated;
    let invalidBindings = 0;
    const bindings: typeof empty.bindings = [];
    for (const recorded of observed.bindings) {
      if (options.deadlineAt !== undefined && performance.now() >= options.deadlineAt) { truncated = true; break; }
      try {
        if (recorded.taskStatus !== "open" || recorded.taskVersion !== recorded.currentTaskVersion || recorded.taskWorktree !== recorded.worktree)
          throw new Error("Task binding changed");
        const candidate = realpathSync(recorded.worktree), where = workContext(candidate, options.deadlineAt);
        if (candidate !== recorded.worktree || candidate !== recorded.path || where.worktree !== candidate ||
            where.locator !== recorded.locator || realpathSync(defaultDbPath(candidate, options.deadlineAt)) !== canonicalDatabase)
          throw new Error("Workspace identity changed");
        bindings.push({ workspace: candidate, locator: where.locator, taskId: recorded.taskId,
          revision: String(recorded.taskVersion), attemptId: recorded.attemptId });
      } catch {
        if (options.deadlineAt !== undefined && performance.now() >= options.deadlineAt) { truncated = true; break; }
        invalidBindings++;
      }
    }
    const local = (options.deadlineAt === undefined || performance.now() < options.deadlineAt) && Boolean(resolveTaskContext(root,
      { session, ...(options.deadlineAt === undefined ? {} : { deadlineAt: options.deadlineAt }) }).context);
    if (options.deadlineAt !== undefined && performance.now() >= options.deadlineAt) truncated = true;
    // A verified local bind owns this workspace, even if this session has older sibling bindings.
    const alignmentRequired = !truncated && !local && bindings.some(binding => binding.workspace !== root);
    const status = local ? "local-bound" : truncated ? "binding-scan-incomplete"
      : bindings.length > 1 ? "ambiguous-bindings" : alignmentRequired ? "external-binding"
      : invalidBindings ? "binding-unverified" : "session-unbound";
    return { ...empty, status, bindings, invalidBindings, truncated, alignmentRequired,
      paidSelectionAllowed: local || !alignmentRequired && !truncated };
  } catch {
    return options.deadlineAt !== undefined && performance.now() >= options.deadlineAt
      ? { ...empty, status: "binding-scan-incomplete" as const, truncated: true, paidSelectionAllowed: false }
      : { ...empty, status: "binding-inspection-unavailable" as const };
  }
  finally { store?.close(); }
}

/** Known directories only. Do not claim that a recorded binding proves the operator's new intent. */
export function contextWorkspaceAlignmentMessage(identity: ReturnType<typeof contextWorkspaceIdentity>) {
  if (identity.paidSelectionAllowed) return "";
  const workspaces = identity.bindings.filter(binding => binding.workspace !== identity.workspace).map(binding => binding.workspace);
  const shown = workspaces.slice(0, 2).map(path => path.length > 512 ? path.slice(0, 509) + "..." : path);
  return `Governance native context is local to ${JSON.stringify(identity.workspace)}. ` +
    (workspaces.length ? `This session has active explicit task bindings in ${JSON.stringify(shown)}${workspaces.length > shown.length ? ` and ${workspaces.length - shown.length} more recorded checkouts` : ""}. ` : "The session binding inventory is incomplete. ") +
    "Hosted selection is paused for this native entry; local required guidance remains available. " +
    "At a pause seam, align the chat and its commands with the intended existing checkout using the host's supported workspace operation. " +
    "If the host cannot reattach this chat, resume its checkpoint in a chat attached to that same existing directory. " +
    "No new branch or worktree is needed. No sibling packet, task binding, permission or spending was transferred.";
}
