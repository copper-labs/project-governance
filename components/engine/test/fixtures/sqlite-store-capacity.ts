import { DatabaseSync } from "node:sqlite";
import { statSync } from "node:fs";
import { digest } from "../../src/core.ts";
import { budgetScopeId } from "../../src/decision-budget.ts";

export const LEGACY_STORE_MAX_BYTES = 8 * 1024 * 1024;

/** Real closed retrieval history, not provider input bytes or invalid trailing file padding. */
export function seedClosedBudgetHistory(path: string, workspace: string) {
  const database = new DatabaseSync(path), first = { workspace, taskId: "historical-0", taskRevision: "1#context-selection" };
  try {
    database.exec("PRAGMA foreign_keys=ON; BEGIN IMMEDIATE");
    const insertScope = database.prepare("INSERT INTO scope VALUES(?,?,?,?,256,25600,1,1)");
    const insertReservation = database.prepare("INSERT INTO reservation VALUES(?,?,?,?,1)");
    for (let index = 0; index < 128; index++) {
      const scope = { ...first, taskId: `historical-${index}` }, id = budgetScopeId(scope);
      insertScope.run(id, workspace, scope.taskId, scope.taskRevision);
      for (let event = 0; event < 256; event++) {
        const eventId = digest(`historical-event-${event}`).slice(7);
        insertReservation.run(digest({ scope: id, eventId }).slice(7, 39), id, eventId, 100);
      }
    }
    database.exec("COMMIT");
    return { scope: first, eventId: digest("historical-event-0").slice(7), bytes: statSync(path).size };
  } finally { database.close(); }
}

/** SQLite can retain allocated pages after pruning; keep a valid freelist and original store data. */
export function growStorePastLegacyLimit(path: string): number {
  const database = new DatabaseSync(path);
  try {
    database.exec("CREATE TABLE capacity_fixture(value BLOB); INSERT INTO capacity_fixture VALUES(zeroblob(9437184)); DROP TABLE capacity_fixture;");
  } finally { database.close(); }
  return statSync(path).size;
}
