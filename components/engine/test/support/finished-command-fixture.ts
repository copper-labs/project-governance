import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { processFingerprint } from "../../src/process-owner.ts";

/** Terminal command proof can precede the owner and guardian's final bookkeeping. */
export async function removeFinishedCommandFixture(root: string, jobs: string[]) {
  const processes = jobs.flatMap(job => ["owner.json", "guardian.json"].flatMap(name => {
    const path = join(root, job, name);
    return existsSync(path) ? [JSON.parse(readFileSync(path, "utf8")) as { pid: number; fingerprint: string }] : [];
  }));
  const live = () => processes.filter(process => processFingerprint(process.pid) === process.fingerprint);
  const until = Date.now() + 5000;
  while (live().length && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(live().length, 0, "fixture processes must finish before removing their evidence");
  rmSync(root, { recursive: true, force: true });
}
