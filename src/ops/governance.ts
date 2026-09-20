import { spawnSync } from "node:child_process";
import type { Store } from "../store/store.ts";
import { fileDigest, executablePath } from "./execution.ts";
import { withinScope } from "./authority.ts";
/** Ask the public owner for selection. Do not reproduce selection or reinterpret gate policy. */
export function governancePlan(store: Store, taskId: string, cwd: string, command: string, stage: string, staged: boolean) {
    const task = store.readTask(taskId);
    if (!task)
        throw new Error("unknown task");
    const scope = task.items.filter(i => !i.revoked && i.kind === "scope").map(i => i.body);
    if (!withinScope(cwd, scope, cwd))
        throw new Error("governance workspace outside task scope");
    if (!["pre-commit", "pre-push", "manual"].includes(stage))
        throw new Error("unsupported governance stage");
    const executable = executablePath(command), argv = ["plan", "--stage", stage, "--mode", "impacted", "--json", ...(staged ? ["--staged"] : [])];
    const r = spawnSync(executable, argv, { cwd, encoding: "utf8", timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
    if (r.status !== 0 || r.error)
        throw new Error("governance plan unavailable; use the existing owner directly");
    const plan: unknown = JSON.parse(r.stdout);
    const receipt = JSON.stringify({ executable, executableDigest: fileDigest(executable), argv, cwd, plan });
    const artifact = store.putArtifact({ kind: "receipt", subject: null, path: null, inline: receipt, bytes: Buffer.byteLength(receipt), provenance: "observed" });
    store.linkArtifact(taskId, artifact.artifactId);
    store.appendEvent(taskId, "governance-plan", { artifactId: artifact.artifactId, stage, staged });
    return { ok: true, artifactId: artifact.artifactId, plan, note: "Selection from governance. This is neither test execution nor task acceptance." };
}
