import { execFile } from "node:child_process";
import { connect } from "node:net";
import { promisify } from "node:util";
const exec = promisify(execFile);

export async function observeClosedPort(port: number): Promise<boolean> {
  if (port !== null && (!Number.isInteger(port) || port < 1 || port > 65535)) return false;
  return new Promise(resolve => {
    const socket = connect({ host: "127.0.0.1", port });
    let finished = false;
    const finish = (closed: boolean) => { if (!finished) { finished = true; socket.destroy(); resolve(closed); } };
    socket.setTimeout(1000, () => finish(false));
    socket.once("connect", () => finish(false));
    socket.once("error", error => finish((error as NodeJS.ErrnoException).code === "ECONNREFUSED"));
  });
}

export interface SimulatorCleanupObservation {
  kind: "simulator-cleanup-observation";
  version: 1;
  udid: string;
  port: number | null;
  state: "Shutdown";
  portClosed: true | null;
  observedAt: string;
}

/** Only known simulator/Metro claims have an observer; missing or ambiguous observations retain ownership. */
export async function observeSimulatorCleanup(resources: readonly string[], probes?: {
  devices: () => Promise<unknown>; portClosed: (port: number) => Promise<boolean>;
}): Promise<SimulatorCleanupObservation | null> {
  if (resources.length < 1 || resources.length > 2) return null;
  const device = resources.find(value => /^ios-simulator:[0-9A-Fa-f-]{36}$/u.test(value));
  const metro = resources.find(value => /^tcp:127\.0\.0\.1:[0-9]+$/u.test(value));
  if (!device || (resources.length === 2 && !metro)) return null;
  const udid = device.slice("ios-simulator:".length), port = metro ? Number(metro.split(":").at(-1)) : null;
  if (port !== null && (!Number.isInteger(port) || port < 1 || port > 65535)) return null;
  if (!probes && process.platform !== "darwin") return null;
  try {
    const raw = probes ? await probes.devices() : JSON.parse((await exec("/usr/bin/xcrun", ["simctl", "list", "devices", "--json"], {
      timeout: 10000, maxBuffer: 4 * 1024 * 1024,
    })).stdout);
    if (!raw || typeof raw !== "object" || !Object.hasOwn(raw, "devices")) return null;
    const groups = (raw as { devices: unknown }).devices;
    if (!groups || typeof groups !== "object" || Array.isArray(groups)) return null;
    const entries = Object.values(groups);
    if (entries.some(group => !Array.isArray(group))) return null;
    const matches = entries.flat().filter(item => item && typeof item === "object" && item.udid?.toUpperCase() === udid.toUpperCase());
    if (matches.length !== 1 || matches[0].state !== "Shutdown") return null;
    if (port !== null && !await (probes?.portClosed ?? observeClosedPort)(port)) return null;
    return { kind: "simulator-cleanup-observation", version: 1, udid, port, state: "Shutdown", portClosed: port === null ? null : true, observedAt: new Date().toISOString() };
  } catch { return null; }
}
