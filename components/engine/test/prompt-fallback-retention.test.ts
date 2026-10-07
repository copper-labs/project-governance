/** Preparation failures remain replayable errors without becoming accepted work. */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promptContext } from "../src/prompt-context.ts";
import { readPreparedPrompt } from "../src/context-packet-replay.ts";
import { contextStateRoot } from "../src/context-command.ts";
import { digest } from "../src/core.ts";

test("preparation error retains an exact failed packet for replay and duplicate native delivery", async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "prompt-error-retention-")));
  const oldState = process.env.XDG_STATE_HOME, oldToken = process.env.JEV_TOKEN, oldFetch = globalThis.fetch;
  let calls = 0;
  process.env.XDG_STATE_HOME = join(root, "state");
  process.env.JEV_TOKEN = "";
  globalThis.fetch = async () => { calls++; throw new Error("Provider dispatch is forbidden in this fixture"); };
  t.after(() => {
    globalThis.fetch = oldFetch;
    if (oldState === undefined) delete process.env.XDG_STATE_HOME; else process.env.XDG_STATE_HOME = oldState;
    if (oldToken === undefined) delete process.env.JEV_TOKEN; else process.env.JEV_TOKEN = oldToken;
    rmSync(root, { recursive: true, force: true });
  });
  execFileSync("git", ["init", "--quiet"], { cwd: root, stdio: "pipe" });
  const assets = resolve("src/project_governance_runtime/assets/skills");
  const event = { hook_event_name: "UserPromptSubmit", session_id: "synthetic-session", turn_id: "synthetic-turn",
    cwd: root, prompt: "Synthetic progress request" };

  // Missing configuration exercises the ordinary catch before selection or provider calls.
  const first: any = await promptContext("codex", event, root, { environment: {}, assetRoot: assets });
  const state = contextStateRoot(root), entryDir = join(state, "prompt-entries");
  const entry = JSON.parse(readFileSync(join(entryDir, readdirSync(entryDir)[0]!), "utf8"));
  const output = first.hookSpecificOutput.additionalContext;
  assert.equal(entry.status, "failed");
  assert.equal(entry.acceptedOutcome, undefined);
  assert.equal(entry.packetDigest, digest(output));
  assert.equal(entry.packetBytes, Buffer.byteLength(output));
  assert.equal(entry.packetLimitBytes, 24000);

  const replay = readPreparedPrompt(root, entry.entryId, assets, "synthetic-session");
  assert.equal(replay.text, output);
  assert.equal(replay.route, null);
  assert.equal(replay.entry.status, "failed");
  const second: any = await promptContext("codex", event, root, { environment: {}, assetRoot: assets });
  assert.equal(second.hookSpecificOutput.additionalContext, output);
  assert.equal(calls, 0);

  const packetPath = join(state, "prompt-packets", entry.entryId + ".json");
  const packet = JSON.parse(readFileSync(packetPath, "utf8"));
  writeFileSync(packetPath, JSON.stringify({ ...packet, text: output + " altered" }));
  assert.throws(() => readPreparedPrompt(root, entry.entryId, assets, "synthetic-session"),
    (error: any) => error.code === "entry-packet-invalid");
  writeFileSync(packetPath, JSON.stringify(packet));
  assert.throws(() => readPreparedPrompt(root, entry.entryId, assets, "another-session"),
    (error: any) => error.code === "entry-session-mismatch");
  assert.equal(calls, 0);
});
