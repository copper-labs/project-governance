import { existsSync } from "node:fs";
import { join } from "node:path";
import { digest, durableJson } from "./core.ts";
import { commandProcesses } from "./command-owner-recovery.ts";
import { processFingerprint } from "./process-owner.ts";

export interface GroupMember { pid: number; fingerprint: string }

/** Discover group peers and descendants only from matching recorded process identities. */
export function collectCommandGroup(directory: string, requestDigest: string, group: number, known: Map<number, string>): GroupMember[] {
  const before = digest([...known]);
  const rows = commandProcesses();
  const live = new Set(rows.filter(row => known.has(row.pid) && processFingerprint(row.pid) === known.get(row.pid)).map(row => row.pid));
  const anchored = rows.some(row => row.group === group && live.has(row.pid));
  // A detached child retains its parent relationship until it exits or is reparented.
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) {
      if (known.has(row.pid) || !(live.has(row.parent) || (anchored && row.group === group))) continue;
      const fingerprint = processFingerprint(row.pid);
      if (!fingerprint) continue;
      known.set(row.pid, fingerprint); live.add(row.pid); changed = true;
      if (known.size > 4096) throw new Error("Owned process tree exceeds tracking bound");
    }
  }
  const members = [...known].map(([pid, fingerprint]) => ({ pid, fingerprint }));
  const current = members.filter(member => rows.some(row => row.pid === member.pid) && processFingerprint(member.pid) === member.fingerprint);
  if (before !== digest([...known]) || !existsSync(join(directory, "group-members.json"))) durableJson(join(directory, "group-members.json"), { version: 1, requestDigest, group, members, identityDigest: digest(members) });
  return current;
}
