import { test } from "node:test";
import assert from "node:assert/strict";
import { observePhysicalCleanup } from "../src/physical-cleanup.ts";
const udid = "00000000-0000000000000001", deviceIdentifier = "fixture-device", bundle = "example.sample.app";
const resources = [`ios-device:${udid}`, `ios-app:${udid}:${bundle}`, "tcp:127.0.0.1:18274"];
const appUrl = "file:///private/apps/fixture/Sample.app/";
const results: Record<string, unknown> = {
  details: { identifier: deviceIdentifier, hardwareProperties: { udid }, deviceProperties: { bootState: "booted" } },
  apps: { deviceIdentifier, apps: [{ bundleIdentifier: bundle, url: appUrl }] },
  processes: { deviceIdentifier, runningProcesses: [{ executable: "file:///private/apps/Other.app/Other", processIdentifier: 19 }] },
};
const probes = (overrides: Record<string, unknown> = {}) => ({ device: async (_udid: string, kind: string) => ({ ...results, ...overrides })[kind], portClosed: async () => true });

test("physical cleanup binds hardware, app container and closed Metro while allowing unrelated apps", async () => {
  const receipt = await observePhysicalCleanup(resources, probes());
  assert.equal(receipt?.udid, udid);
  assert.equal(receipt?.bundleId, bundle);
  assert.equal(receipt?.appProcessAbsent, true);
  assert.equal(await observePhysicalCleanup(resources, { ...probes(), portClosed: async () => false }), null);
  assert.equal(await observePhysicalCleanup(resources, probes({ processes: { deviceIdentifier, runningProcesses: [{ executable: appUrl + "Sample", processIdentifier: 17 }] } })), null);
});

test("disconnect, wrong device, malformed process and absent app do not establish cleanup", async () => {
  assert.equal(await observePhysicalCleanup(resources, { ...probes(), device: async () => { throw new Error("disconnected"); } }), null);
  for (const overrides of [
    { processes: { deviceIdentifier: "other", runningProcesses: [] } },
    { processes: { deviceIdentifier, runningProcesses: [{}] } },
    { apps: { deviceIdentifier, apps: [] } },
    { details: { identifier: deviceIdentifier, hardwareProperties: { udid: "other" }, deviceProperties: { bootState: "booted" } } },
  ]) assert.equal(await observePhysicalCleanup(resources, probes(overrides)), null);
  assert.equal(await observePhysicalCleanup([...resources, "unknown"], probes()), null);
});

test("embedded physical apps need device and app proof without inventing a Metro claim", async () => {
  const receipt = await observePhysicalCleanup(resources.slice(0, 2), {
    ...probes(), portClosed: async () => { throw new Error("No port should be probed"); },
  });
  assert.equal(receipt?.appProcessAbsent, true);
  assert.equal(receipt?.port, null);
  assert.equal(receipt?.portClosed, null);
  assert.equal(await observePhysicalCleanup([resources[0]!, "unknown"], probes()), null);
});
