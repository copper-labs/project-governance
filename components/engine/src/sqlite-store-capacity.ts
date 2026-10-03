import type { DatabaseSync } from "node:sqlite";

// Retained accounting needs room to grow without renewing paid allowances or deleting identities.
export const SQLITE_STORE_MAX_BYTES = 512 * 1024 * 1024;

/** Apply the same byte ceiling to SQLite writes, including databases with a nondefault page size. */
export function setSqliteStoreCapacity(database: DatabaseSync): void {
  const pageSize = Number(database.prepare("PRAGMA page_size").get()?.page_size);
  if (!Number.isSafeInteger(pageSize) || pageSize < 512 || pageSize > 65536) throw new Error("Invalid SQLite page size");
  database.exec(`PRAGMA max_page_count=${Math.floor(SQLITE_STORE_MAX_BYTES / pageSize)}`);
}
