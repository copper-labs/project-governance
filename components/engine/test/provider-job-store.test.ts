import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { listProviderJobs, managedProviderDirectory } from "../src/provider-job-store.ts";

test("managed listing is non-creating, workspace scoped and bounded across malformed entries", () => {
  const root = mkdtempSync(join(tmpdir(), "provider-store-")), previous = process.env.XDG_STATE_HOME;
  process.env.XDG_STATE_HOME = join(root, "state");
  try {
    assert.deepEqual(listProviderJobs(root).jobs, []);
    assert.equal(existsSync(join(root, "state")), false);
    const path = managedProviderDirectory(root, "job");
    assert.equal(managedProviderDirectory(root, "job"), path);
    mkdirSync(join(root, "other"));
    assert.notEqual(managedProviderDirectory(join(root, "other"), "job"), path);
    mkdirSync(path);
    symlinkSync(root, join(dirname(path), "f".repeat(64)));
    const listed = listProviderJobs(root);
    assert.equal(listed.invalid, 2);
    assert.equal(listed.jobs.length, 0);
    assert.equal(listProviderJobs(root, 1).truncated, true);
    assert.throws(() => listProviderJobs(root, 0), /limit/);
  } finally {
    if (previous === undefined) delete process.env.XDG_STATE_HOME; else process.env.XDG_STATE_HOME = previous;
    rmSync(root, { recursive: true, force: true });
  }
});
