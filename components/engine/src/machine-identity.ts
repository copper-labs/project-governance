import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { hostname } from "node:os";

const marker = /^machine:sha256:[a-f0-9]{64}$/u;
type Sources = { read: (path: string) => string; run: (command: string, args: string[]) => string };
const sources: Sources = {
  read: path => readFileSync(path, "utf8"),
  run: (command, args) => execFileSync(command, args, { encoding: "utf8", timeout: 2000, maxBuffer: 128 * 1024, stdio: ["ignore", "pipe", "pipe"] }),
};

/** Read an OS identity locally; raw identifiers and command errors never enter receipts. */
export function readMachineIdentity(platform: string = process.platform, io: Sources = sources): string | null {
  let raw: string | undefined;
  try {
    if (platform === "darwin") raw = /"IOPlatformUUID"\s*=\s*"([a-f0-9-]+)"/iu.exec(io.run("/usr/sbin/ioreg", ["-rd1", "-c", "IOPlatformExpertDevice"]))?.[1];
    else if (platform === "linux") {
      for (const path of ["/etc/machine-id", "/var/lib/dbus/machine-id"]) {
        try { const value = io.read(path).trim(); if (/^[a-f0-9]{32}$/iu.test(value) && !/^0+$/u.test(value)) { raw = value; break; } } catch { /* Try the documented nonprivileged fallback. */ }
      }
    } else if (platform === "win32") raw = /MachineGuid\s+REG_SZ\s+([a-f0-9-]+)/iu.exec(io.run("C:\\Windows\\System32\\reg.exe", ["query", "HKLM\\SOFTWARE\\Microsoft\\Cryptography", "/v", "MachineGuid"]))?.[1];
  } catch { return null; }
  if (!raw || !(platform === "linux" ? /^[a-f0-9]{32}$/iu : /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu).test(raw) || /^[0-]+$/u.test(raw)) return null;
  return "machine:sha256:" + createHash("sha256").update("project-governance-machine-v1\0" + platform + "\0" + raw.toLowerCase()).digest("hex");
}
let cached: string | undefined;
export function localMachineIdentity(): string | null { return cached ?? (cached = readMachineIdentity() ?? undefined) ?? null; }
export function requireMachineIdentity(): string {
  const id = localMachineIdentity(); if (!id) throw new Error("Stable local machine identity unavailable"); return id;
}
export const validMachineIdentity = (value: unknown): value is string => typeof value === "string" && marker.test(value);

/** Legacy records keep their exact name guard; never infer or rewrite their original machine. */
export function sameMachineIdentity(recorded: { host?: unknown; machineId?: unknown }, observed: { host?: unknown; machineId?: unknown }): boolean {
  if (recorded.machineId !== undefined) return validMachineIdentity(recorded.machineId) && validMachineIdentity(observed.machineId) && recorded.machineId === observed.machineId;
  return typeof recorded.host === "string" && !!recorded.host && recorded.host === observed.host &&
    (observed.machineId === undefined || validMachineIdentity(observed.machineId));
}
export function isLocalMachine(recorded: { host?: unknown; machineId?: unknown }): boolean {
  const machineId = localMachineIdentity(); return sameMachineIdentity(recorded, { host: hostname(), ...(machineId ? { machineId } : {}) });
}
