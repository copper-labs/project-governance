import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { digest, durableJson } from "../src/core.ts";
import { readPilotAssignment, recordDecisionEpisode } from "../src/decision-episodes.ts";

test("off episodes need no model receipt and publication never replaces an earlier observation", t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "pilot-episode-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const scope = { workspace: root, taskId: "task", taskRevision: "1" };
  const path = join(root, "assignment.json");
  const raw = { version: 1, id: "assignment", episodeId: "episode", experiment: "diagnosis", definitionVersion: "1", arm: "off",
    assignedAt: "2026-09-21T00:00:00Z", groupingUnit: "task", sourceRevision: "source", scope };
  durableJson(path, raw);
  const selected = readPilotAssignment(path, scope, Date.parse("2026-09-21T01:00:00Z"));
  const capture = { ...selected, caller: "workflow-status" as const, entryKind: "workflow-observe" as const,
    native: { runId: "run", runDigest: digest("run"), stagesDigest: digest([]), eventIds: [], eventsDigest: digest([]) },
    exposure: { mode: "off", delivered: false }, decisions: [] };
  const first = recordDecisionEpisode(root, capture);
  const bytes = readFileSync(first.episode.path, "utf8");
  assert.deepEqual(JSON.parse(bytes).decisions, []);
  assert.deepEqual(recordDecisionEpisode(root, capture), first);
  assert.throws(() => recordDecisionEpisode(root, { ...capture, exposure: { mode: "auto" } }), /episode-id-already-used/);
  assert.equal(readFileSync(first.episode.path, "utf8"), bytes);
  assert.throws(() => readPilotAssignment(path, { ...scope, taskRevision: "2" }, Date.now()), /scope conflicts/);
  assert.throws(() => readPilotAssignment(path, scope, Date.parse("2026-09-20T00:00:00Z")), /precede observation/);
  durableJson(path, { ...raw, episodeId: "../escape" });
  assert.throws(() => readPilotAssignment(path, scope, Date.now()), /episode identifier/);
});
