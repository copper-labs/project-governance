import {isLocalMachine} from "./machine-identity.ts";
import { mkdirSync, rmdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { digest, durableJson, object, text } from "./core.ts";
import { narrativeFile } from "./narrative-inputs.ts";
import { commandProcesses, hasConfirmedCommandCleanup, recordedCommandMembers, commandIncarnationTracking } from "./command-owner-recovery.ts";
import { observeCommand, processFingerprint, processIncarnation, processOwnerDigest } from "./process-owner.ts";
import { startCommandGuardian } from "./command-guardian.ts";
import { reconcileCommand } from "./command-recovery.ts";
import { providerRuntime } from "./provider-runtime.ts";
import { commandProcessesPresent, commandIdentityFields, isProcessFingerprint } from "./command-processes.ts";

/** Resume cleanup supervision only. The original native assignment is never relaunched. */
export async function restartCommandGuardian(directory: string, requestDigest: string, authority: string) {
  directory = resolve(directory); text(authority, "cleanup restart authority");
  const read = (name: string) => object(JSON.parse(narrativeFile(directory, name)));
  const request = read("request.json");
  if (request.version !== 1 || digest(request) !== requestDigest || request.ownerDigest !== processOwnerDigest())
    throw new Error("Cleanup restart requires the original request and runtime owner");
  if (request.runtime && digest(providerRuntime(text(object(request.operation).cwd, "workspace"))) !== digest(request.runtime))
    throw new Error("Cleanup restart runtime generation mismatch");
  const lock = join(directory, "guardian-restart.lock"); mkdirSync(lock, { mode: 0o700 });
  try {
    const observed = observeCommand(directory, requestDigest);
    if (observed.receipt && hasConfirmedCommandCleanup(directory, observed.receipt))
      return { state: "reconciled", reconciliation: reconcileCommand(directory, requestDigest) };
    const owner = read("owner.json"), guardian = read("guardian.json"), launch = read("launch.json");
    if (owner.requestDigest !== requestDigest || guardian.requestDigest !== requestDigest ||
        launch.requestDigest !== requestDigest || launch.state !== "spawned" || !isLocalMachine(launch) ||
        digest(launch.owner) !== digest(commandIdentityFields(owner)) ||
        !Number.isSafeInteger(owner.pid) || Number(owner.pid) < 2 || !owner.fingerprint ||
        !Number.isSafeInteger(guardian.pid) || Number(guardian.pid) < 2 || !guardian.fingerprint)
      throw new Error("Cleanup restart identity evidence incomplete");
    const members = recordedCommandMembers(directory, requestDigest, object(launch.child).processGroup);
    const positive = commandIncarnationTracking(request, launch, members, owner), rows = commandProcesses();
    if (commandProcessesPresent(rows, [commandIdentityFields(owner)], undefined, positive))
      throw new Error("Original worker still present; cleanup restart refused");
    if (positive && (guardian.processIdentityVersion !== 1 || guardian.processIdentityTimezone !== "UTC" || !isProcessFingerprint(guardian.incarnation)))
      throw new Error("Original guardian UTC identity unavailable");
    if (commandProcessesPresent(rows, [commandIdentityFields(guardian)], undefined, positive)) {
      if ((positive ? processIncarnation(Number(guardian.pid)) !== guardian.incarnation : processFingerprint(Number(guardian.pid)) !== guardian.fingerprint)) throw new Error("Guardian PID was reused; cleanup restart refused");
      return { state: "guardian-running", requestDigest };
    }
    durableJson(join(directory, "guardian-restart.json"), { version: 1, requestDigest, authority,
      previousGuardian: guardian, launchDigest: digest(launch), requestedAt: new Date().toISOString() });
    await startCommandGuardian(directory, requestDigest, true);
    const completed = observeCommand(directory, requestDigest);
    if (completed.receipt && hasConfirmedCommandCleanup(directory, completed.receipt))
      return { state: "reconciled", reconciliation: reconcileCommand(directory, requestDigest) };
    return { state: "guardian-running", requestDigest };
  } finally { rmdirSync(lock); }
}
