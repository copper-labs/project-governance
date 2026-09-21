import { DatabaseSync } from "node:sqlite";
import { lstatSync, realpathSync } from "node:fs";
import { defaultDbPath } from "../../harness/src/store/location.ts";

/** Inspect the standard continuity store without creating it, migrating schema or consulting executors. */
export function continuityMigrationInventory(workspace: string) {
  workspace = realpathSync(workspace);
  const path = defaultDbPath(workspace);
  const entry = lstatSync(path, {throwIfNoEntry: false});
  const scope = "standard-store-exact-worktree";
  if (!entry) return {path, scope, state: "absent", customStores: "not-discovered"};
  if (!entry.isFile() || realpathSync(path) !== path) throw new Error("Continuity inventory requires a canonical regular database");
  const database = new DatabaseSync(path, {readOnly: true});
  try {
    database.exec("BEGIN");
    const version = database.prepare("SELECT value FROM meta WHERE key='schema_version'").get()?.value;
    if (!["4", "5", "6"].includes(String(version))) throw new Error("Unsupported continuity schema for migration inventory");
    const tasks = database.prepare("SELECT count(*) AS count FROM task WHERE worktree=?").get(workspace)?.count;
    const states = database.prepare("SELECT a.status,count(*) AS count FROM action a JOIN task t ON t.task_id=a.task_id WHERE t.worktree=? GROUP BY a.status ORDER BY a.status").all(workspace);
    const unresolved = database.prepare(`SELECT a.action_id AS actionId,a.task_id AS taskId,a.status,e.job_id AS jobId
      FROM action a JOIN task t ON t.task_id=a.task_id LEFT JOIN execution e ON e.action_id=a.action_id
      WHERE t.worktree=? AND (a.status IN ('prepared','in-progress','outcome-unknown') OR
      (a.status='authorized' AND e.action_id IS NOT NULL)) ORDER BY a.action_id LIMIT 1001`).all(workspace);
    const truncated = unresolved.length > 1000;
    return {path, scope, state: "inspected", schema: Number(version), tasks, actionStates: states,
      unresolved: unresolved.slice(0,1000), truncated, executionDrain: unresolved.length ? "unresolved" : "no-unresolved-ledger-actions",
      ownership: "recorded-owner-retained", customStores: "not-discovered", processDrain: "unverified"};
  } finally {database.close();}
}
