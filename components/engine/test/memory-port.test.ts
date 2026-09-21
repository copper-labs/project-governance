import { test } from "node:test";
import assert from "node:assert/strict";
import { retrieveMemory, type MemoryProvider, type MemoryQuery, type MemoryReference, type MemoryResponse } from "../src/memory-port.ts";

const query: MemoryQuery = { scope: { repository: "repo-a", workspace: null, task: null }, purpose: "related proof", generation: 3, deadlineMs: 50, maxResults: 4, maxBytes: 8192, dataClasses: ["metadata"] };
const reference: MemoryReference = { version: 1, id: "evidence-1", eventId: "event-1", scope: query.scope, kind: "fact", revision: "source-1", contentDigest: `sha256:${"a".repeat(64)}`, origin: "artifact:1", owner: "engine", observedAt: "2026-09-20T00:00:00Z", labelOrigin: "machine", supersedes: null, withdrawn: false };
function fake(overrides: Partial<MemoryResponse> = {}): MemoryProvider {
  const response: MemoryResponse = { version: 1, state: "ready", projection: { generation: 3, watermark: "event-1", complete: true }, candidates: [reference], omissions: [], method: "fake-v1", ...overrides };
  return { id: "fake", capabilities: () => ({ version: 1, project: true, retrieve: true, withdraw: true, cancellation: true }),
    open: async () => {}, close: async () => {}, project: async () => response.projection, withdraw: async () => response.projection, retrieve: async () => response };
}

test("optional memory excludes stale, withdrawn and foreign references; duplicates do not inflate coverage", async () => {
  const provider = fake({ candidates: [reference, reference, { ...reference, id: "withdrawn", withdrawn: true },
    { ...reference, id: "foreign", scope: { ...query.scope, repository: "repo-b" } }, { ...reference, id: "stale", revision: "source-0" }] });
  const result = await retrieveMemory(provider, query, candidate => candidate.revision === "source-1");
  assert.deepEqual(result.candidates, [reference]);
  assert.equal(result.state, "degraded");
  assert.deepEqual(result.omissions.sort(), ["duplicate-reference", "scope-mismatch", "withdrawn-or-stale-reference"]);
});

test("projection lag, omission and response shape remain explicit; empty results prove no absence", async () => {
  assert.equal((await retrieveMemory(fake({ projection: { generation: 2, watermark: "old", complete: true } }), query, () => true)).state, "unavailable");
  assert.equal((await retrieveMemory(fake({ projection: { generation: 3, watermark: "gap", complete: false } }), query, () => true)).state, "unavailable");
  const missing = await retrieveMemory(fake({ candidates: [], omissions: ["provider has partial history"] }), query, () => true);
  assert.equal(missing.state, "degraded");
  assert.deepEqual(missing.candidates, []);
  const invalid = fake(); invalid.retrieve = async () => ({ version: 9 });
  assert.equal((await retrieveMemory(invalid, query, () => true)).state, "unavailable");
});

test("unavailable or non-cooperative memory cannot hold the execution path", async () => {
  assert.equal((await retrieveMemory(null, query, () => true)).omissions[0], "provider-disabled");
  const provider = fake(); let aborted = false;
  provider.retrieve = async (_, signal) => { signal.addEventListener("abort", () => { aborted = true; }); return new Promise(() => {}); };
  const result = await retrieveMemory(provider, { ...query, deadlineMs: 10 }, () => true);
  assert.equal(result.state, "unavailable"); assert.equal(aborted, true);
  const cancelled = new AbortController(); cancelled.abort();
  assert.equal((await retrieveMemory(provider, query, () => true, cancelled.signal)).omissions[0], "cancelled");
});

test("retrieval enforces byte limits before exposing candidate references", async () => {
  const result = await retrieveMemory(fake(), { ...query, maxBytes: 1 }, () => true);
  assert.deepEqual(result.candidates, []); assert.equal(result.state, "degraded");
  assert.ok(result.omissions.includes("result-budget"));
});
