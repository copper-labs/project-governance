import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const packet = JSON.parse(readFileSync(process.env.PROJECT_GOVERNANCE_CHANGE_PACKET, "utf8"));
const source = packet.records.find(record => record.path === "src/owner-lifecycle.mjs");
if (!source?.after_path) throw new Error("Lifecycle source is absent from the captured subject");
const { releaseOwner } = await import(`data:text/javascript;base64,${readFileSync(source.after_path).toString("base64")}`);

test("release keeps another owner in the same worktree", () => {
  const sibling = { owner: "sibling", workspace: "same-worktree" };
  const unrelated = { owner: "other", workspace: "other-worktree" };
  const owners = [{ owner: "ending", workspace: "same-worktree" }, sibling, unrelated];
  assert.deepEqual(releaseOwner(owners, "ending", "same-worktree"), [sibling, unrelated]);
  assert.equal(owners.length, 3, "Release must not mutate the caller's owner inventory");
});
