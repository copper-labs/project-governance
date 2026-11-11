import {requireMachineIdentity,isLocalMachine,sameMachineIdentity} from "./machine-identity.ts";
import { existsSync, mkdirSync, rmdirSync, statSync } from "node:fs";
import { hostname } from "node:os";
import { join, resolve } from "node:path";
import { digest, durableJson, object, text } from "./core.ts";
import { narrativeFile } from "./narrative-inputs.ts";
import { observeCommand, type CommandReceipt } from "./process-owner.ts";
import { commandProcesses, commandProcessesPresent, commandIdentityFields, isProcessFingerprint, type ProcessIdentity } from "./command-processes.ts";
export { commandProcesses } from "./command-processes.ts";

/** Recorded children remain cleanup obligations even after leaving the original group. */
export function recordedCommandMembers(directory: string, requestDigest: string, group: unknown) {
  if (!existsSync(join(directory, "group-members.json"))) return { digest: null, pids: [] as number[], members: [] as ProcessIdentity[], processIdentityVersion: undefined as 1 | undefined, processIdentityTimezone: undefined as string | undefined };
  const record = object(JSON.parse(narrativeFile(directory, "group-members.json")));
  if (record.version !== 1 || record.requestDigest !== requestDigest || record.group !== group ||
      !Array.isArray(record.members) || record.members.length > 4096 || record.identityDigest !== digest(record.members) ||
      record.processIdentityVersion !== undefined && record.processIdentityVersion !== 1)
    throw new Error("Recorded group membership identity mismatch");
  const members = record.members.map(value => {
    const member = object(value);
    if (!Number.isSafeInteger(member.pid) || Number(member.pid) < 2 || typeof member.fingerprint !== "string" || !member.fingerprint)
      throw new Error("Invalid recorded process member");
    return commandIdentityFields(member);
  });
  const identities = members.map(member => record.processIdentityVersion === 1 ? JSON.stringify([member.pid, member.incarnation]) : String(member.pid));
  if (new Set(identities).size !== identities.length) throw new Error("Duplicate recorded process member");
  return { digest: digest(record), pids: [...new Set(members.map(member => member.pid))], members,
    processIdentityVersion: record.processIdentityVersion as 1 | undefined,
    processIdentityTimezone: typeof record.processIdentityTimezone === "string" ? record.processIdentityTimezone : undefined };
}

/** Only the original request, launch and complete member history can enable positive incarnation proof. */
export function commandIncarnationTracking(request: { processIdentityVersion?: unknown; processIdentityTimezone?: unknown }, launch: Record<string, unknown>,
  members: ReturnType<typeof recordedCommandMembers>, owner?: Record<string, unknown>): boolean {
  const version = request.processIdentityVersion;
  if (version !== undefined && version !== 1 || launch.processIdentityVersion !== version || members.processIdentityVersion !== version)
    throw new Error("Command process incarnation contract differs");
  if (request.processIdentityTimezone !== (version === 1 ? "UTC" : undefined) ||
      launch.processIdentityTimezone !== request.processIdentityTimezone || members.processIdentityTimezone !== request.processIdentityTimezone)
    throw new Error("Command process incarnation timezone differs");
  if (version === undefined) return false;
  const child = object(launch.child), launchedOwner = object(launch.owner);
  if (![launchedOwner.incarnation, child.incarnation, ...members.members.map(member => member.incarnation)].every(isProcessFingerprint))
    throw new Error("Original UTC process incarnation identity unavailable");
  if (!owner || digest(owner) !== digest({ ...commandIdentityFields(launchedOwner), requestDigest: digest(request),
      processIdentityVersion: 1, processIdentityTimezone: "UTC" })) throw new Error("Original process owner incarnation differs");
  if (!members.digest || !members.members.some(member => member.pid === child.pid && member.incarnation === child.incarnation))
    throw new Error("Original process incarnation history missing");
  return true;
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
        !isLocalMachine(launch) || typeof launch.startedAt !== "string" || !Number.isFinite(Date.parse(launch.startedAt)) ||
        !Number.isSafeInteger(owner.pid) || Number(owner.pid) < 2 || !owner.fingerprint ||
        !Number.isSafeInteger(child.pid) || Number(child.pid) < 2 || child.processGroup !== child.pid || !child.fingerprint ||
        digest(read("owner.json")) !== digest({ ...commandIdentityFields(owner), requestDigest,
          ...(request.processIdentityVersion === 1 ? { processIdentityVersion: 1, processIdentityTimezone: "UTC" } : {}) }))
      throw new Error("Complete local launch acknowledgment required for owner recovery");
    const members = recordedCommandMembers(directory, requestDigest, child.processGroup);
    const rows = commandProcesses();
    const positive = commandIncarnationTracking(request, launch, members, read("owner.json"));
    const identities = [commandIdentityFields(owner), commandIdentityFields(child), ...members.members];
    if (commandProcessesPresent(rows, identities, Number(child.processGroup), positive))
      throw new Error("Owner or child process group still present; recovery cannot confirm cleanup");
    const endedAt = new Date().toISOString(), log = join(directory, "output.log");
    const originalIdentity = request.executionIdentity === undefined ? {} : object(request.executionIdentity);
    if (request.executionIdentity !== undefined && (typeof originalIdentity.runtimeVersion !== "string" ||
        originalIdentity.archiveDigest !== null && !/^sha256:[a-f0-9]{64}$/u.test(String(originalIdentity.archiveDigest)))) throw new Error("Invalid original execution identity");
    const receipt: CommandReceipt = prior.receipt ?? { version: 1,
      ...(request.executionIdentity === undefined ? {} : { runtimeVersion: String(originalIdentity.runtimeVersion), archiveDigest: originalIdentity.archiveDigest as string | null }),
      requestDigest, state: "unknown", cleanup: "confirmed",
      exitCode: null, signal: null, reason: "owner-lost", startedAt: launch.startedAt, endedAt,
      durationMs: Math.max(0, Date.parse(endedAt) - Date.parse(launch.startedAt)), log,
      logBytes: existsSync(log) ? statSync(log).size : 0 };
    if (digest(read("request.json")) !== requestDigest || digest(read("launch.json")) !== digest(launch) ||
        recordedCommandMembers(directory, requestDigest, child.processGroup).digest !== members.digest)
      throw new Error("Original process incarnation evidence changed during recovery");
    durableJson(join(directory, "owner-recovery.json"), { version: 1, requestDigest, authority,
      mode: prior.receipt ? "cleanup-confirmation" : "owner-loss", ...(positive ? { processIdentityVersion: 1, processIdentityTimezone: "UTC", incarnationEvidence: {
        version: 1, timezone: "UTC", inventoryDigest: digest(rows), identities: identities.map(identity => ({ ...identity,
          currentIncarnation: rows.find(row => row.pid === identity.pid)?.incarnation ?? null })),
      } } : {}),
      launchDigest: digest(launch), receiptDigest: digest(receipt), host: hostname(),
      ...(launch.machineId === undefined ? {} : { machineId: requireMachineIdentity() }), observedAt: endedAt,
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
  const request = object(JSON.parse(narrativeFile(directory, "request.json")));
  if (digest(request) !== receipt.requestDigest) return false;
  const positive = commandIncarnationTracking(request, launch, members, object(JSON.parse(narrativeFile(directory, "owner.json"))));
  if (evidence.processIdentityVersion !== (positive ? 1 : undefined) || evidence.processIdentityTimezone !== (positive ? "UTC" : undefined)) return false;
  if (positive) {
    const observed = object(evidence.incarnationEvidence), owner = object(launch.owner), child = object(launch.child);
    const expected = [commandIdentityFields(owner), commandIdentityFields(child), ...members.members];
    if (observed.version !== 1 || observed.timezone !== "UTC" || !/^sha256:[a-f0-9]{64}$/u.test(String(observed.inventoryDigest)) || !Array.isArray(observed.identities)) return false;
    const identities = observed.identities.map(value => object(value));
    const starts = new Map<unknown, unknown>();
    for (const identity of identities) {
      if (starts.has(identity.pid) && starts.get(identity.pid) !== identity.currentIncarnation) return false;
      starts.set(identity.pid, identity.currentIncarnation);
    }
    if (digest(identities.map(identity => commandIdentityFields(identity))) !== digest(expected) ||
        identities.some(identity => identity.currentIncarnation !== null &&
          (!isProcessFingerprint(identity.currentIncarnation) || identity.currentIncarnation === identity.incarnation))) return false;
  }
  return evidence.membersAbsent === true && evidence.membersDigest === members.digest && (receipt.cleanup === "confirmed" || evidence.mode === "cleanup-confirmation") &&
    sameMachineIdentity(launch,evidence) && typeof evidence.authority === "string" && Boolean(evidence.authority.trim()) &&
    evidence.version === 1 && evidence.requestDigest === receipt.requestDigest &&
    evidence.receiptDigest === digest(receipt) && evidence.launchDigest === digest(launch) &&
    evidence.ownerAbsent === true && evidence.groupAbsent === true;
}
