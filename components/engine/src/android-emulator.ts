import { execFile } from "node:child_process";
import { readdirSync, realpathSync, lstatSync } from "node:fs";
import { basename, dirname, isAbsolute } from "node:path";
import { promisify } from "node:util";
import { digest, object, text } from "./core.ts";
import { observeClosedPort } from "./simulator-cleanup.ts";
import { commandEnvironment } from "./process-owner.ts";
import { outsideRoots } from "./provider-guard.ts";
const exec = promisify(execFile);

export interface AndroidEmulatorAdapter {
  serial: string; adb: string; lockPath: string;
  capacity?: { beforeStage: string; minimumAvailableBytes: number };
}
export function androidEmulatorAdapter(value: unknown, workspace?: string): AndroidEmulatorAdapter {
  const raw = object(value), keys = ["serial", "adb", "lockPath", "capacity"];
  if (Object.keys(raw).some(key => !keys.includes(key))) throw new Error("Unknown Android adapter setting");
  const serial = text(raw.serial, "emulator serial", 64), match = /^emulator-(\d+)$/u.exec(serial);
  const port = match ? Number(match[1]) : 0;
  if (port < 5554 || port > 5682 || port % 2 !== 0) throw new Error("Android adapter needs an exact supported emulator port");
  const adb = text(raw.adb, "adb executable"), lockPath = text(raw.lockPath, "adapter lock path");
  if (!isAbsolute(adb) || !isAbsolute(lockPath)) throw new Error("Android adapter paths must be absolute");
  if (workspace) outsideRoots(adb, [realpathSync(workspace)]);
  let capacity: AndroidEmulatorAdapter["capacity"];
  if (raw.capacity !== undefined) {
    const declaration = object(raw.capacity);
    if (Object.keys(declaration).some(key => !["beforeStage", "minimumAvailableBytes"].includes(key)) ||
        !Number.isSafeInteger(declaration.minimumAvailableBytes) || Number(declaration.minimumAvailableBytes) <= 0) throw new Error("Invalid adapter capacity requirement");
    capacity = { beforeStage: text(declaration.beforeStage, "capacity stage", 128), minimumAvailableBytes: Number(declaration.minimumAvailableBytes) };
  }
  return { serial, adb, lockPath, ...(capacity ? { capacity } : {}) };
}
async function adb(config: AndroidEmulatorAdapter, args: string[]) {
  return (await exec(config.adb, args, { timeout: 5000, maxBuffer: 65536, env: commandEnvironment({}) })).stdout;
}
function devices(output: string) {
  const lines = output.trim().split(/\r?\n/u);
  if (lines.shift()?.trim() !== "List of devices attached") throw new Error("ADB inventory unavailable");
  const entries = lines.filter(line => line.trim()).map(line => {
    const match = /^(\S+)\s+(device|offline|unauthorized|recovery|sideload|bootloader)(?:\s+.*)?$/u.exec(line.trim());
    if (!match) throw new Error("Ambiguous ADB inventory");
    return { serial: match[1]!, state: match[2]! };
  });
  if (new Set(entries.map(item => item.serial)).size !== entries.length) throw new Error("Duplicate ADB identity");
  return entries;
}

/** An opted-in adapter supplies the threshold. Unknown capacity refuses install; no device data is deleted. */
export async function observeAndroidCapacity(raw: AndroidEmulatorAdapter, workspace: string, probe = adb) {
  if (typeof workspace !== "string" || !isAbsolute(workspace)) throw new Error("Android observer requires an absolute workspace");
  const config = androidEmulatorAdapter(raw, workspace);
  if (!config.capacity) return { state: "not-requested" as const, serial: config.serial, availableBytes: null };
  const base = { serial: config.serial, minimumAvailableBytes: config.capacity.minimumAvailableBytes, observedAt: new Date().toISOString() };
  try {
    const inventory = devices(await probe(config, ["devices"]));
    if (inventory.find(item => item.serial === config.serial)?.state !== "device") throw new Error("Exact emulator is not online");
    const output = await probe(config, ["-s", config.serial, "shell", "df", "-Pk", "/data"]);
    const lines = output.trim().split(/\r?\n/u);
    if (lines.length !== 2 || !/\b(?:1024|1K)-blocks\b/u.test(lines[0]!)) throw new Error("Unsupported capacity observation");
    const match = /^\S+\s+(\d+)\s+(\d+)\s+(\d+)\s+\d+%\s+\/data$/u.exec(lines[1]!.trim());
    if (!match) throw new Error("Capacity target differs");
    const total = Number(match[1]) * 1024, availableBytes = Number(match[3]) * 1024;
    if (!Number.isSafeInteger(total) || !Number.isSafeInteger(availableBytes) || availableBytes < 0 || availableBytes > total) throw new Error("Invalid capacity units");
    return { ...base, state: availableBytes >= config.capacity.minimumAvailableBytes ? "ready" as const : "insufficient" as const,
      availableBytes, evidenceDigest: digest(output), reason: availableBytes >= config.capacity.minimumAvailableBytes ? null : "Free emulator storage before retrying this install; no automatic erase or rebuild was performed." };
  } catch { return { ...base, state: "unknown" as const, availableBytes: null, reason: "Exact emulator capacity could not be established; install was not started." }; }
}

/** Target absence, closed console/ADB/claimed ports and adapter lock absence are all required. */
export async function observeAndroidEmulatorCleanup(resources: readonly string[], raw: AndroidEmulatorAdapter, workspace: string, probes?: {
  devices: () => Promise<string>; portClosed: (port: number) => Promise<boolean>; lockAbsent: (path: string) => Promise<boolean>;
}) {
  if (typeof workspace !== "string" || !isAbsolute(workspace)) throw new Error("Android observer requires an absolute workspace");
  try {
    const config = androidEmulatorAdapter(raw, workspace), expected = `android-emulator:${config.serial}`;
    if (!resources.includes(expected) || new Set(resources).size !== resources.length || resources.some(resource => resource !== expected && !/^tcp:127\.0\.0\.1:\d+$/u.test(resource))) return null;
    const inventory = devices(probes ? await probes.devices() : await adb(config, ["devices"]));
    if (inventory.some(item => item.serial === config.serial)) return null;
    const port = Number(config.serial.slice("emulator-".length)), ports = [...new Set([port, port + 1, ...resources.filter(item => item !== expected).map(item => Number(item.split(":").at(-1)))])];
    for (const value of ports) if (!await (probes?.portClosed ?? observeClosedPort)(value)) return null;
    const absent = probes ? await probes.lockAbsent(config.lockPath) : (() => {
      const parent = dirname(config.lockPath);
      if (!lstatSync(parent).isDirectory() || realpathSync(parent) !== parent) return false;
      return !readdirSync(parent).includes(basename(config.lockPath));
    })();
    if (!absent) return null;
    return { kind: "android-emulator-cleanup-observation", version: 1, serial: config.serial, targetAbsent: true, portsClosed: ports,
      lockPath: config.lockPath, lockAbsent: true, inventoryDigest: digest(inventory), observedAt: new Date().toISOString() };
  } catch { return null; }
}
