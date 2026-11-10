import { test } from "node:test";
import assert from "node:assert/strict";
import { coworkErrorCode } from "../src/cowork-errors.ts";

test("fixed Cowork diagnostics explain Git refusals without returning private content", () => {
  assert.equal(coworkErrorCode(new Error("Git has an active operation: index.lock")), "cowork-git-operation-active");
  assert.equal(coworkErrorCode(new Error("Git operation has unresolved conflicts")), "cowork-git-conflicts");
  assert.equal(coworkErrorCode(new Error("Git operation requires a branch")), "cowork-git-branch-required");
  assert.equal(coworkErrorCode(new Error("cowork-registration-stale")), "cowork-registration-stale");
  assert.equal(coworkErrorCode(new Error("private document excerpt")), "cowork-operation-failed");
});
