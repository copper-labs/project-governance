import { execFileSync } from "node:child_process";
import { processHasExited } from "./process-state.ts";

export interface ProcessIdentity { pid: number; fingerprint: string; incarnation?: string }
export interface CommandProcess { pid: number; parent: number; group: number; incarnation?: string }

/** Unknown or truncated start metadata cannot identify an incarnation. */
export function isProcessFingerprint(value: unknown): value is string {
  return typeof value === "string" && /^[A-Z][a-z]{2} [A-Z][a-z]{2} +\d{1,2} \d{2}:\d{2}:\d{2} \d{4}$/u.test(value)
    && Number.isFinite(Date.parse(`${value} GMT`));
}

/** A complete inventory carries start identities with ancestry; missing identity never means absence. */
export function parseCommandProcesses(output: string, observer: number): CommandProcess[] {
  const rows = output.trim().split("\n").map(line => {
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.+\S)\s*$/u.exec(line);
    if (!match || !isProcessFingerprint(match[5]))
      throw new Error("Invalid process incarnation inventory");
    const [pid, parent, group] = [Number(match[1]), Number(match[2]), Number(match[3])];
    if (![pid, parent, group].every(value => Number.isSafeInteger(value) && value! >= 0))
      throw new Error("Invalid process incarnation numbers");
    return { pid: pid!, parent: parent!, group: group!, state: match[4]!, incarnation: match[5]! };
  });
  if (new Set(rows.map(row => row.pid)).size !== rows.length || !rows.some(row => row.pid === observer))
    throw new Error("Incomplete process incarnation inventory");
  return rows.filter(row => !processHasExited(row.state)).map(({ state: unused, ...row }) => row);
}

/** One successful native enumeration binds each PID, start time, parent and group together. */
export function commandProcesses(): CommandProcess[] {
  return parseCommandProcesses(execFileSync("/bin/ps", ["-axo", "pid=,ppid=,pgid=,stat=,lstart="], {
    encoding: "utf8", timeout: 5000, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, LC_ALL: "C", TZ: "UTC0" },
  }), process.pid);
}

/** Legacy records require PID absence; qualified new records distinguish a positive replacement identity. */
export function commandProcessesPresent(rows: readonly CommandProcess[], identities: readonly ProcessIdentity[],
  group: number | undefined, positive: boolean): boolean {
  for (const identity of identities) {
    if (!Number.isSafeInteger(identity.pid) || identity.pid < 2 || typeof identity.fingerprint !== "string" || !identity.fingerprint.trim())
      throw new Error("Process incarnation identity unavailable");
    const current = rows.find(row => row.pid === identity.pid);
    if (positive && !isProcessFingerprint(identity.incarnation)) throw new Error("Recorded process incarnation unavailable");
    if (current && !positive) return true;
    if (current && !isProcessFingerprint(current.incarnation)) throw new Error("Current process incarnation unavailable");
    if (current && current.incarnation === identity.incarnation) return true;
  }
  // An unanchored surviving group is ambiguous even when its leader PID has been reused.
  return group !== undefined && rows.some(row => row.group === group);
}

/** Retain every proven incarnation; a reused descendant needs current ancestry before it is adopted. */
export function observeCommandIncarnations(rows: readonly CommandProcess[], group: number,
  known: Map<number, string>, history: Map<string, ProcessIdentity>,
  capture: (row: CommandProcess & { incarnation: string }) => ProcessIdentity | undefined): ProcessIdentity[] {
  const observed = rows.map(row => {
    if (!isProcessFingerprint(row.incarnation)) throw new Error("Current process incarnation unavailable");
    return { ...row, incarnation: row.incarnation };
  });
  const live = new Set(observed.filter(row => known.get(row.pid) === row.incarnation).map(row => row.pid));
  const anchored = observed.some(row => row.group === group && live.has(row.pid));
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of observed) {
      if (known.get(row.pid) === row.incarnation || !(live.has(row.parent) || (anchored && row.group === group))) continue;
      const identity = capture(row);
      if (!identity) continue;
      if (identity.pid !== row.pid || identity.incarnation !== row.incarnation || !identity.fingerprint)
        throw new Error("Captured process incarnation differs from ancestry inventory");
      known.set(row.pid, row.incarnation); live.add(row.pid); changed = true;
      history.set(JSON.stringify([row.pid, row.incarnation]), identity);
      if (history.size > 4096) throw new Error("Owned process tree exceeds tracking bound");
    }
  }
  return [...history.values()].filter(identity => rows.some(row => row.pid === identity.pid && row.incarnation === identity.incarnation));
}

/** Keep the legacy diagnostic fingerprint while selecting only an explicitly recorded UTC incarnation. */
export function commandIdentityFields(value: unknown): ProcessIdentity {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Process identity unavailable");
  const raw = value as Record<string, unknown>;
  if (!Number.isSafeInteger(raw.pid) || Number(raw.pid) < 2 || typeof raw.fingerprint !== "string" || !raw.fingerprint)
    throw new Error("Process identity unavailable");
  return { pid: Number(raw.pid), fingerprint: raw.fingerprint,
    ...(typeof raw.incarnation === "string" ? { incarnation: raw.incarnation } : {}) };
}
