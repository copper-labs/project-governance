import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { narrativeFile } from "./narrative-inputs.ts";
import { observeClosedPort } from "./simulator-cleanup.ts";
import { object } from "./core.ts";
const exec = promisify(execFile);
type ProbeKind = "details" | "apps" | "processes";

async function deviceProbe(udid: string, kind: ProbeKind): Promise<unknown> {
  const directory = mkdtempSync(join(tmpdir(), "governance-device-observation-"));
  try {
    const file = join(directory, "result.json");
    await exec("/usr/bin/xcrun", ["devicectl", "device", "info", kind, "--device", udid, "--json-output", file],
      { timeout: 15000, maxBuffer: 1024 * 1024 });
    const envelope = object(JSON.parse(narrativeFile(directory, file)));
    if (object(envelope.info).outcome !== "success") throw new Error("Device readback did not succeed");
    return envelope.result;
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

/** Missing connectivity or ambiguous app identity cannot release a physical-device claim. */
export async function observePhysicalCleanup(resources: readonly string[], probes?: {
  device: (udid: string, kind: ProbeKind) => Promise<unknown>;
  portClosed: (port: number) => Promise<boolean>;
}) {
  if (![2, 3].includes(resources.length) || (!probes && process.platform !== "darwin")) return null;
  const device = resources.find(value => /^ios-device:(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{8}-[0-9a-fA-F]{16})$/u.test(value));
  const metro = resources.find(value => /^tcp:127\.0\.0\.1:[0-9]+$/u.test(value));
  if (!device || (resources.length === 3 && !metro)) return null;
  const udid = device.slice("ios-device:".length), appPrefix = `ios-app:${udid}:`;
  const app = resources.find(value => value.startsWith(appPrefix));
  const bundleId = app?.slice(appPrefix.length), port = metro ? Number(metro.split(":").at(-1)) : null;
  if (!bundleId || !/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/u.test(bundleId) || (port !== null && (!Number.isInteger(port) || port < 1 || port > 65535))) return null;
  try {
    const probe = probes?.device ?? deviceProbe;
    const details = object(await probe(udid, "details"));
    if (object(details.hardwareProperties).udid !== udid || object(details.deviceProperties).bootState !== "booted" || typeof details.identifier !== "string") return null;
    const apps = object(await probe(udid, "apps")), processes = object(await probe(udid, "processes"));
    if (apps.deviceIdentifier !== details.identifier || processes.deviceIdentifier !== details.identifier || !Array.isArray(apps.apps) || !Array.isArray(processes.runningProcesses)) return null;
    const matches = apps.apps.map(item => object(item)).filter(item => item.bundleIdentifier === bundleId);
    if (matches.length !== 1 || typeof matches[0]!.url !== "string") return null;
    const appUrl = new URL(matches[0]!.url);
    if (appUrl.protocol !== "file:" || appUrl.host || !appUrl.pathname.endsWith(".app/")) return null;
    for (const raw of processes.runningProcesses) {
      const process = object(raw);
      if (typeof process.executable !== "string" || !Number.isSafeInteger(process.processIdentifier)) return null;
      const executable = new URL(process.executable);
      if (executable.protocol !== "file:" || executable.host) return null;
      if (executable.pathname.startsWith(appUrl.pathname)) return null;
    }
    if (port !== null && !await (probes?.portClosed ?? observeClosedPort)(port)) return null;
    return { kind: "physical-cleanup-observation", version: 1, udid, deviceIdentifier: details.identifier,
      bundleId, appUrl: appUrl.href, appProcessAbsent: true, port, portClosed: port === null ? null : true, observedAt: new Date().toISOString() };
  } catch { return null; }
}
