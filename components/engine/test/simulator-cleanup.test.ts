import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { observeClosedPort, observeSimulatorCleanup } from "../src/simulator-cleanup.ts";
const udid = "12345678-1234-1234-1234-123456789ABC";
const resources = [`ios-simulator:${udid}`, "tcp:127.0.0.1:18273"];
test("device and Metro claims require independent exact cleanup readback", async () => {
  const probes = { devices: async () => ({ devices: { ios: [{ udid, state: "Shutdown" }] } }), portClosed: async () => true };
  const observation = await observeSimulatorCleanup(resources, probes);
  assert.equal(observation?.udid, udid);
  assert.equal(observation?.port, 18273);
  assert.equal(observation?.state, "Shutdown");
  assert.equal(observation?.portClosed, true);
  assert.ok(Number.isFinite(Date.parse(observation!.observedAt)));
  assert.equal(await observeSimulatorCleanup(resources, { ...probes, portClosed: async () => false }), null);
  for (const state of ["Booted", "Booting", "Unknown"]) assert.equal(await observeSimulatorCleanup(resources, {
    ...probes, devices: async () => ({ devices: { ios: [{ udid, state }] } }),
  }), null);
  const standalone = await observeSimulatorCleanup([resources[0]!], { ...probes, portClosed: async () => { throw new Error("No Metro claim"); } });
  assert.equal(standalone?.state, "Shutdown");
  assert.equal(standalone?.port, null);
  assert.equal(standalone?.portClosed, null);
  assert.equal(await observeSimulatorCleanup([...resources, "unrecognized"], probes), null);
  assert.equal(await observeSimulatorCleanup(resources, { ...probes, devices: async () => { throw new Error("unavailable"); } }), null);
});
test("loopback probe distinguishes a listening service from a closed port", async () => {
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  assert.equal(await observeClosedPort(port), false);
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  assert.equal(await observeClosedPort(port), true);
});
