import { opendirSync, lstatSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { narrativeFile } from "./narrative-inputs.ts";
import { object } from "./core.ts";

/** Cached references can prioritize originals, but can never replace the receipt inventory. */
export function recentReceipts(root: string, collections: string[], options: {
  limit: number; since?: number; maximumBytes?: number; predicate?: (value: Record<string, unknown>) => boolean;
  prioritized?: Array<{ collection: string; name: string }>;
}) {
  const candidates: Array<{ collection: string; name: string; value: Record<string, unknown>; at: number }> = [];
  let invalid = 0, scanned = 0, readBytes = 0, scanComplete = true;
  const visited = new Set<string>(), directories = new Map<string, string | null>();
  const directoryFor = (collection: string) => {
    if (!directories.has(collection)) {
      let directory: string | null = null;
      try {
        if (!collections.includes(collection) || !/^[a-z][a-z-]{0,63}$/u.test(collection)) throw new Error("Invalid collection");
        directory = join(root, collection);
        const stat = lstatSync(directory);
        if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(directory) !== directory) throw new Error("Invalid collection");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") { invalid++; scanComplete = false; }
        directory = null;
      }
      directories.set(collection, directory);
    }
    return directories.get(collection);
  };
  const inspect = (collection: string, name: string): boolean => {
    const key = `${collection}/${name}`;
    if (visited.has(key)) return true;
    if (scanned >= 10000) { scanComplete = false; return false; }
    visited.add(key); scanned++;
    if (!/^[a-f0-9-]+\.json$/u.test(name)) return true;
    const directory = directoryFor(collection);
    if (!directory) return true;
    try {
      const stat = lstatSync(join(directory, name));
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 256 * 1024) throw new Error("Invalid receipt");
      if (readBytes + stat.size > (options.maximumBytes ?? 16 * 1024 * 1024)) { scanComplete = false; return false; }
      readBytes += stat.size;
      const value = object(JSON.parse(narrativeFile(directory, name)));
      const at = Date.parse(String(value.createdAt ?? value.capturedAt));
      if (!Number.isFinite(at)) throw new Error("Receipt time unavailable");
      if (at >= (options.since ?? -Infinity) && (!options.predicate || options.predicate(value)))
        candidates.push({ collection, name, value, at });
    } catch { invalid++; }
    return true;
  };
  for (const hint of (options.prioritized ?? []).slice(0, 1000)) {
    if (!collections.includes(hint.collection) || !/^[a-f0-9-]+\.json$/u.test(hint.name)) { invalid++; continue; }
    if (!inspect(hint.collection, hint.name)) break;
  }
  outer: for (const collection of collections) {
    const directory = directoryFor(collection);
    if (!directory) continue;
    let handle: ReturnType<typeof opendirSync> | undefined;
    try {
      handle = opendirSync(directory);
      for (let entry = handle.readSync(); entry; entry = handle.readSync())
        if (!inspect(collection, entry.name)) break outer;
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") { invalid++; scanComplete = false; } }
    finally { handle?.closeSync(); }
  }
  candidates.sort((a, b) => b.at - a.at || a.name.localeCompare(b.name));
  return { records: candidates.slice(0, options.limit), invalid, scanned, readBytes, scanComplete,
    truncated: !scanComplete || candidates.length > options.limit,
    selection: scanComplete ? "newest-matching-capture-first; bounded-receipt-scan" : "newest-matching-within-partial-scan; bounded-receipt-scan" };
}
