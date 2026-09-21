import { collectCommandGroup } from "./command-group-members.ts";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { digest, durableJson, object } from "./core.ts";
import { narrativeFile } from "./narrative-inputs.ts";
import { commandProcesses, recordedCommandMembers, recoverCommandOwner } from "./command-owner-recovery.ts";
import { reconcileCommand } from "./command-recovery.ts";
import { deliverCommandCompletion } from "./completion-delivery.ts";
import { processFingerprint } from "./process-owner.ts";

const SELF = fileURLToPath(import.meta.url);
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** A detached guardian must acknowledge ownership before the worker may launch native work. */
export async function startCommandGuardian(directory: string, requestDigest: string): Promise<void> {
  const guardian = spawn(process.execPath, [SELF, "--guardian", directory, requestDigest], {
    detached: true, stdio: "ignore", env: { PATH: process.env.PATH, HOME: process.env.HOME },
  });
  let failed = false;
  guardian.on("error", () => { failed = true; }); guardian.unref();
  const until = Date.now() + 5000;
  while (Date.now() < until && !failed) {
    const path = join(directory, "guardian.json");
    if (existsSync(path)) {
      const record = object(JSON.parse(narrativeFile(directory, "guardian.json")));
      if (record.pid === guardian.pid) {
        if (record.requestDigest !== requestDigest || !record.fingerprint ||
            processFingerprint(Number(record.pid)) !== record.fingerprint) throw new Error("Guardian acknowledgment mismatch");
        return;
      }
    }
    await pause(20);
  }
  throw new Error("Command guardian did not acknowledge startup");
}

async function guard(directory: string, requestDigest: string): Promise<void> {
  const read = (name: string) => object(JSON.parse(narrativeFile(directory, name)));
  const request = read("request.json");
  if (digest(request) !== requestDigest) throw new Error("Guardian request mismatch");
  const owner = read("owner.json");
  if (owner.requestDigest !== requestDigest || !owner.fingerprint) throw new Error("Guardian owner mismatch");
  const fingerprint = processFingerprint(process.pid);
  if (!fingerprint) throw new Error("Guardian identity unavailable");
  durableJson(join(directory, "guardian.json"), { version: 1, requestDigest, pid: process.pid, fingerprint });
  const known = new Map<number, string>();
  if (existsSync(join(directory, "group-members.json"))) {
    const launch = read("launch.json");
    recordedCommandMembers(directory, requestDigest, object(launch.child).processGroup);
    for (const entry of read("group-members.json").members as Array<{pid:number;fingerprint:string}>) known.set(entry.pid, entry.fingerprint);
  }
  const collect = () => {
    if (!existsSync(join(directory, "launch.json"))) return;
    const launch = read("launch.json");
    if (launch.state !== "spawned") return;
    const child = object(launch.child);
    if (launch.requestDigest !== requestDigest || !Number.isSafeInteger(child.pid) || Number(child.pid) < 2 ||
        child.processGroup !== child.pid || typeof child.fingerprint !== "string" || !child.fingerprint) throw new Error("Guardian launch identity mismatch");
    if (!known.size) known.set(Number(child.pid), child.fingerprint);
    return collectCommandGroup(directory, requestDigest, Number(child.pid), known);
  };
  while (true) {
    if (existsSync(join(directory, "result.json"))) {
      const receipt = read("result.json");
      if (receipt.requestDigest !== requestDigest) throw new Error("Guardian result mismatch");
      if (receipt.cleanup === "confirmed") return;
    }
    collect();
    // A failed ps call throws, preserving obligations instead of treating inspection failure as death.
    if (!commandProcesses().some(row => row.pid === owner.pid)) break;
    await pause(250);
  }
  const launch = read("launch.json");
  if (launch.requestDigest !== requestDigest || launch.state !== "spawned" || digest(launch.owner) !== digest({ pid: owner.pid, fingerprint: owner.fingerprint }))
    throw new Error("Guardian launch unresolved");
  const child = object(launch.child);
  if (!Number.isSafeInteger(child.pid) || Number(child.pid) < 2 || child.processGroup !== child.pid || !child.fingerprint)
    throw new Error("Guardian child identity unavailable");
  for (const signal of ["SIGTERM", "SIGKILL"] as const) {
    const rows = commandProcesses();
    const members = collect() ?? [];
    if (!members.length && !rows.some(row => row.pid === child.pid || row.group === child.processGroup)) break;
    if (!members.length) throw new Error("Guardian group has no matching recorded member; cleanup unresolved");
    for (const member of members) {
      if (processFingerprint(member.pid) !== member.fingerprint) continue;
      try { process.kill(member.pid, signal); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
    }
    const grace = object(request.operation).terminationGraceMs ?? 1000;
    if (!Number.isSafeInteger(grace) || Number(grace) < 1 || Number(grace) > 30000) throw new Error("Invalid termination grace");
    const until = Date.now() + (signal === "SIGTERM" ? Number(grace) : 2000);
    while (Date.now() < until) {
      const remaining = collect() ?? [];
      if (!remaining.length && !commandProcesses().some(row => row.pid === child.pid || row.group === child.processGroup)) break;
      await pause(50);
    }
  }
  recoverCommandOwner(directory, requestDigest, "runtime:command-guardian");
  reconcileCommand(directory, requestDigest);
  try { deliverCommandCompletion(directory, requestDigest); } catch { /* Execution evidence remains independent. */ }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href && process.argv[2] === "--guardian") {
  const directory = process.argv[3]!, requestDigest = process.argv[4]!;
  guard(directory, requestDigest).catch(() => {
    // Bounded, non-secret status: failed recovery never fabricates terminal execution or cleanup.
    try { if (existsSync(directory)) durableJson(join(directory, "guardian-status.json"), { version: 1, requestDigest, state: "unresolved" }); } catch { /* Leave original evidence intact. */ }
    process.exitCode = 2;
  });
}
