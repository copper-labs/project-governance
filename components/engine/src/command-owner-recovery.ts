import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmdirSync, statSync } from "node:fs";
import { hostname } from "node:os";
import { join, resolve } from "node:path";
import { digest, durableJson, object, text } from "./core.ts";
import { narrativeFile } from "./narrative-inputs.ts";
import { observeCommand, type CommandReceipt } from "./process-owner.ts";

/** Successful full process enumeration is required; an inspection failure is not absence. */
export function commandProcesses(): Array<{ pid: number; parent: number; group: number }> {
  const output = execFileSync("/bin/ps", ["-axo", "pid=,ppid=,pgid="], { encoding: "utf8", timeout: 5000, maxBuffer: 8 * 1024 * 1024 });
  const rows = output.trim().split("\n").map(line => {
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s*$/.exec(line);
    if (!match) throw new Error("Invalid process enumeration");
    return { pid: Number(match[1]), parent: Number(match[2]), group: Number(match[3]) };
  });
  if (!rows.some(row => row.pid === process.pid)) throw new Error("Incomplete process enumeration");
  return rows;
}

/** Recorded children remain cleanup obligations even after leaving the original group. */
export function recordedCommandMembers(directory: string, requestDigest: string, group: unknown) {
  if (!existsSync(join(directory, "group-members.json"))) return { digest: null, pids: [] as number[] };
  const record = object(JSON.parse(narrativeFile(directory, "group-members.json")));
  if (record.version !== 1 || record.requestDigest !== requestDigest || record.group !== group ||
      !Array.isArray(record.members) || record.members.length > 4096 || record.identityDigest !== digest(record.members))
    throw new Error("Recorded group membership identity mismatch");
  const pids = record.members.map(value => {
    const member = object(value);
    if (!Number.isSafeInteger(member.pid) || Number(member.pid) < 2 || typeof member.fingerprint !== "string" || !member.fingerprint)
      throw new Error("Invalid recorded process member");
    return Number(member.pid);
  });
  if (new Set(pids).size !== pids.length) throw new Error("Duplicate recorded process member");
  return { digest: digest(record), pids };
}

/** Recover evidence only after owner and recorded group have disappeared. Never signals or replays. */
export function recoverCommandOwner(directory: string, requestDigest: string, authority: string) {
  directory = resolve(directory); text(authority, "recovery authority");
  const read = (name: string) => object(JSON.parse(narrativeFile(directory, name)));
  const request = read("request.json");
  if (request.version !== 1 || digest(request) !== requestDigest) throw new Error("Owner recovery request mismatch");
  const lock = join(directory, "owner-recovery.lock");
  mkdirSync(lock, { mode: 0o700 });
  try {
    const prior = observeCommand(directory, requestDigest);
    if (prior.receipt && hasConfirmedCommandCleanup(directory, prior.receipt)) return prior;
    if (existsSync(join(directory, "owner-recovery.json"))) throw new Error("Existing recovery evidence does not match; refusing replacement");
    const launch = read("launch.json"), owner = object(launch.owner), child = object(launch.child);
    if (launch.version !== 1 || launch.requestDigest !== requestDigest || launch.state !== "spawned" ||
        launch.host !== hostname() || typeof launch.startedAt !== "string" || !Number.isFinite(Date.parse(launch.startedAt)) ||
        !Number.isSafeInteger(owner.pid) || Number(owner.pid) < 2 || !owner.fingerprint ||
        !Number.isSafeInteger(child.pid) || Number(child.pid) < 2 || child.processGroup !== child.pid || !child.fingerprint ||
        digest(read("owner.json")) !== digest({ pid: owner.pid, fingerprint: owner.fingerprint, requestDigest }))
      throw new Error("Complete local launch acknowledgment required for owner recovery");
    const members = recordedCommandMembers(directory, requestDigest, child.processGroup);
    const rows = commandProcesses();
    // Refuse reused PIDs as well: this port needs no authority to signal another process.
    if (rows.some(row => row.pid === owner.pid || row.pid === child.pid || row.group === child.processGroup || members.pids.includes(row.pid)))
      throw new Error("Owner or child process group still present; recovery cannot confirm cleanup");
    const endedAt = new Date().toISOString(), log = join(directory, "output.log");
    const receipt: CommandReceipt = prior.receipt ?? { version: 1, requestDigest, state: "unknown", cleanup: "confirmed",
      exitCode: null, signal: null, reason: "owner-lost", startedAt: launch.startedAt, endedAt,
      durationMs: Math.max(0, Date.parse(endedAt) - Date.parse(launch.startedAt)), log,
      logBytes: existsSync(log) ? statSync(log).size : 0 };
    durableJson(join(directory, "owner-recovery.json"), { version: 1, requestDigest, authority,
      mode: prior.receipt ? "cleanup-confirmation" : "owner-loss",
      launchDigest: digest(launch), receiptDigest: digest(receipt), host: hostname(), observedAt: endedAt,
      ownerAbsent: true, groupAbsent: true, membersAbsent: true, membersDigest: members.digest });
    if (!prior.receipt) durableJson(join(directory, "result.json"), receipt);
    return observeCommand(directory, requestDigest);
  } finally { rmdirSync(lock); }
}

/** Unknown execution may release resources only with independently bound absence evidence. */
export function hasConfirmedCommandCleanup(directory: string, receipt: CommandReceipt): boolean {
  if (receipt.cleanup === "confirmed" && receipt.state !== "unknown") return true;
  if (!existsSync(join(directory, "owner-recovery.json"))) return false;
  if (receipt.cleanup === "confirmed" && receipt.reason !== "owner-lost") return false;
  const evidence = object(JSON.parse(narrativeFile(directory, "owner-recovery.json")));
  const launch = object(JSON.parse(narrativeFile(directory, "launch.json")));
  const members = recordedCommandMembers(directory, receipt.requestDigest, object(launch.child).processGroup);
  return evidence.membersAbsent === true && evidence.membersDigest === members.digest && (receipt.cleanup === "confirmed" || evidence.mode === "cleanup-confirmation") &&
    evidence.host === launch.host && typeof evidence.authority === "string" && Boolean(evidence.authority.trim()) &&
    evidence.version === 1 && evidence.requestDigest === receipt.requestDigest &&
    evidence.receiptDigest === digest(receipt) && evidence.launchDigest === digest(launch) &&
    evidence.ownerAbsent === true && evidence.groupAbsent === true;
}
