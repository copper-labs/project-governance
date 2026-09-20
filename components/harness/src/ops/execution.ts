import { spawnSync } from "node:child_process";
import { readFileSync, realpathSync, mkdirSync, writeFileSync, statSync } from "node:fs";
import { resolve, join, isAbsolute, delimiter } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { contentAddress, type Store } from "../store/store.ts";
import type { Action, BatchRequest, ExecutionBinding } from "../model/types.ts";
import { prepareAction, beginAction, cancelAction } from "./actions.ts";
import { authorize, defaultPolicy, withinScope } from "./authority.ts";
export interface Executor {
    executable: string;
    digest: string;
    stateRoot: string;
    submit(request: BatchRequest, requestPath: string): Record<string, unknown>;
    result(jobId: string): Record<string, unknown>;
    wait(jobId: string, seconds: number): void;
    status(jobId: string): Record<string, unknown>;
    cancel(jobId: string): Record<string, unknown>;
}
export function executablePath(command: string): string {
    const candidates = isAbsolute(command) ? [command] : command.includes("/") ? [resolve(command)] : (process.env["PATH"] ?? "").split(delimiter).map(p => join(p, command));
    for (const p of candidates)
        try {
            if (statSync(p).isFile())
                return realpathSync(p);
        }
        catch { /* next PATH entry */ }
    throw new Error(`executable unavailable: ${command}`);
}
export const fileDigest = (path: string): string => createHash("sha256").update(readFileSync(path)).digest("hex");
/** Only the published CLI/JSON protocol crosses the repository boundary. */
export class GovernanceExecutor implements Executor {
    executable: string;
    digest: string;
    stateRoot: string;
    constructor(command: string, stateRoot?: string) {
        this.executable = executablePath(command);
        this.digest = fileDigest(this.executable);
        this.stateRoot = resolve(stateRoot ?? process.env["HARNESS_AGENT_STATE"] ?? join(homedir(), ".local/share/harness-agents"));
    }
    call(args: string[], timeout = 35000): Record<string, unknown> {
        if (fileDigest(this.executable) !== this.digest)
            throw new Error("execution owner executable changed");
        const r = spawnSync(this.executable, args, { encoding: "utf8", timeout, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, HARNESS_AGENT_STATE: this.stateRoot } });
        if (r.error)
            throw new Error(`execution owner unavailable: ${r.error.message}`);
        let value: unknown;
        try {
            value = JSON.parse(r.stdout);
        }
        catch {
            throw new Error("execution owner returned invalid JSON; preserve the action and inspect its owner");
        }
        if (!value || typeof value !== "object" || Array.isArray(value))
            throw new Error("execution owner response must be an object");
        const obj = value as Record<string, unknown>;
        if (r.status !== 0 || obj["error"] && obj["job_id"] === undefined)
            throw new Error(`execution owner refused request: ${String(obj["error"] ?? r.status).slice(0, 1000)}`);
        return obj;
    }
    submit(_request: BatchRequest, path: string) { return this.call(["batch", "--request-file", path]); }
    result(jobId: string) { return this.call(["result", jobId]); }
    status(jobId: string) { return this.call(["status", jobId]); }
    cancel(jobId: string) { return this.call(["cancel", jobId]); }
    wait(jobId: string, seconds: number): void {
        if (!Number.isFinite(seconds) || seconds < 0 || seconds > 30)
            throw new Error("wait must be between 0 and 30 seconds");
        if (seconds > 0)
            try {
                this.call(["wait", jobId, "--until-terminal"], Math.ceil(seconds * 1000));
            }
            catch (error) {
                if (!/ETIMEDOUT|cleanup needs project recovery/i.test((error as Error).message))
                    throw error;
            }
    }
}
function object(value: unknown, name: string): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error(`${name} must be an object`);
    return value as Record<string, unknown>;
}
function keys(o: Record<string, unknown>, allowed: string[]): void {
    if (Object.keys(o).some(k => !allowed.includes(k)))
        throw new Error("unknown batch field");
}
function strings(v: unknown, name: string): string[] {
    if (!Array.isArray(v) || v.some(x => typeof x !== "string" || !x || x.includes("\0")))
        throw new Error(`invalid ${name}`);
    return v as string[];
}
function directory(p: string): string {
    if (!isAbsolute(p) || !statSync(p).isDirectory())
        throw new Error("batch roots must be existing absolute directories");
    return realpathSync(p);
}
function positive(v: unknown): number {
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0 || v > 604800)
        throw new Error("invalid deadline");
    return v;
}
export function validateBatch(value: unknown, action: Action, cwd: string): BatchRequest {
    const v = object(value, "batch");
    keys(v, ["version", "workspace", "idempotency_key", "timeout_seconds", "inputs", "output_roots", "cleanup_required", "host", "cases"]);
    if (v["version"] !== 1 || typeof v["workspace"] !== "string")
        throw new Error("batch version 1 and workspace required");
    const workspace = directory(v["workspace"]);
    if (workspace !== realpathSync(cwd))
        throw new Error("batch workspace differs from invocation workspace");
    const i = object(v["inputs"], "inputs");
    keys(i, ["mode", "roots", "files"]);
    if (!["manifest", "declared-roots"].includes(String(i["mode"])))
        throw new Error("unknown input binding mode");
    const roots = [...new Set(strings(i["roots"], "input roots").map(directory))].sort();
    const outputs = [...new Set(strings(v["output_roots"] ?? [], "output roots").map(directory))].sort();
    if (!roots.length || [workspace, ...roots, ...outputs].some(p => !withinScope(p, action.scope, cwd)))
        throw new Error("batch root outside action scope");
    const files: {
        path: string;
        sha256: string;
    }[] = [];
    if (i["mode"] === "manifest") {
        if (!Array.isArray(i["files"]) || !i["files"].length || i["files"].length > 2000)
            throw new Error("manifest needs files");
        for (const raw of i["files"]) {
            const f = object(raw, "manifest file");
            keys(f, ["path", "sha256"]);
            if (typeof f["path"] !== "string" || !isAbsolute(f["path"]) || typeof f["sha256"] !== "string" || !/^[a-f0-9]{64}$/.test(f["sha256"]))
                throw new Error("invalid manifest entry");
            const path = realpathSync(f["path"]);
            if (!withinScope(path, roots, cwd) || files.some(f => f.path === path))
                throw new Error("manifest path outside roots or duplicated");
            if (fileDigest(path) !== f["sha256"])
                throw new Error("manifest bytes changed before submission");
            files.push({ path, sha256: f["sha256"] });
        }
    }
    else if (i["files"] !== undefined && (!Array.isArray(i["files"]) || i["files"].length))
        throw new Error("declared roots cannot carry an unchecked manifest");
    const cases: BatchRequest["cases"] = [];
    if (!Array.isArray(v["cases"]) || !v["cases"].length || v["cases"].length > 100)
        throw new Error("batch needs 1 to 100 cases");
    for (const raw of v["cases"]) {
        const c = object(raw, "case");
        keys(c, ["id", "argv", "timeout_seconds", "expected_exit_codes", "depends_on", "result_receipt"]);
        if (typeof c["id"] !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(c["id"]) || cases.some(x => x.id === c["id"]))
            throw new Error("invalid/duplicate case id");
        const argv = strings(c["argv"], "argv");
        if (!argv.length || !isAbsolute(argv[0]!))
            throw new Error("case executable must be absolute");
        argv[0] = executablePath(argv[0]!);
        const codes = c["expected_exit_codes"];
        if (!Array.isArray(codes) || !codes.length || codes.length > 16 || codes.some(x => !Number.isInteger(x) || x < 0 || x > 255))
            throw new Error("explicit expected exit codes required");
        const dependencies = strings(c["depends_on"] ?? [], "dependencies");
        if (dependencies.some(d => !cases.some(x => x.id === d)))
            throw new Error("dependency must name an earlier case");
        if (c["result_receipt"] !== undefined && typeof c["result_receipt"] !== "boolean")
            throw new Error("invalid result receipt requirement");
        cases.push({ id: c["id"], argv, timeout_seconds: positive(c["timeout_seconds"]), expected_exit_codes: codes as number[], depends_on: dependencies, ...(c["result_receipt"] === undefined ? {} : { result_receipt: c["result_receipt"] as boolean }) });
    }
    if (typeof v["cleanup_required"] !== "boolean" || !["codex", "claude", "unknown"].includes(String(v["host"])))
        throw new Error("explicit cleanup and host declarations required");
    const request: BatchRequest = { version: 1, workspace, idempotency_key: action.actionId, timeout_seconds: positive(v["timeout_seconds"]), inputs: { mode: i["mode"] as "manifest" | "declared-roots", roots, ...(i["mode"] === "manifest" ? { files } : {}) }, output_roots: outputs, cleanup_required: v["cleanup_required"], host: v["host"] as BatchRequest["host"], cases };
    if (Buffer.byteLength(JSON.stringify(request)) > 250000)
        throw new Error("batch too large");
    return request;
}
export function submitCheck(store: Store, action: Action, value: unknown, executor: Executor, authorityRef: string, cwd: string): Action {
    if (!authorityRef.trim())
        throw new Error("host authority reference required; commands are not authorized by their presence alone");
    const current = store.readTask(action.taskId);
    if (!current || current.version !== action.taskVersion || action.status !== "authorized")
        throw new Error("task revised or action not authorized");
    const verdict = authorize({ operation: "check", scope: action.scope, destination: null, policyRevision: action.policyRevision, targets: [cwd] }, defaultPolicy(), current, cwd);
    if (!verdict.ok)
        throw new Error(verdict.reason);
    const request = validateBatch(value, action, cwd);
    const binding: ExecutionBinding = { actionId: action.actionId, request, requestDigest: contentAddress(JSON.stringify(request)), authorityRef, executor: executor.executable, executorDigest: executor.digest, stateRoot: executor.stateRoot, jobId: null, result: null, createdAt: new Date().toISOString() };
    if (!store.directory)
        throw new Error("execution requires a durable store");
    store.saveExecution(binding);
    const requestPath = join(store.directory, "requests", `${action.actionId}.json`);
    mkdirSync(join(store.directory, "requests"), { recursive: true, mode: 0o700 });
    writeFileSync(requestPath, JSON.stringify(request), { flag: "wx", mode: 0o600 });
    const prepared = prepareAction(store, action, [], "read the linked governance job; never replay uncertain submission");
    // Revision and status are rechecked transactionally at this dispatch boundary.
    const running = beginAction(store, prepared);
    let response: Record<string, unknown> | null = null;
    try {
        response = executor.submit(request, requestPath);
        store.appendEvent(action.taskId, "submission-response", { actionId: action.actionId, response });
        if (![1, 2].includes(Number(response["protocol_version"])))
            throw new Error("unsupported submit protocol");
        if (typeof response["job_id"] !== "string" || !/^[A-Za-z0-9_.-]{1,100}$/.test(response["job_id"]))
            throw new Error("owner returned no usable job identity");
        store.linkJob(action.actionId, response["job_id"]);
        return running;
    }
    catch (error) {
        const reason = `submission response uncertain: ${(error as Error).message}; inspect owner, do not submit again; response=${JSON.stringify(response)}`;
        try {
            return store.transitionAction(action.actionId, running.revision, "outcome-unknown", { refusedReason: reason });
        }
        catch {
            throw new Error(`${reason}; local recording failed; action=${action.actionId}`);
        }
    }
}
export function executorFor(binding: ExecutionBinding): GovernanceExecutor {
    const e = new GovernanceExecutor(binding.executor, binding.stateRoot ?? undefined);
    if (e.digest !== binding.executorDigest)
        throw new Error("execution owner changed; use the original owner to reconcile");
    return e;
}
/** Canonical JSON required by the public governance batch fingerprint contract. */
export function inputFingerprint(request: BatchRequest): string {
    const canonical = (v: unknown): string => Array.isArray(v) ? `[${v.map(canonical).join(",")}]` : v !== null && typeof v === "object" ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(",")}}` : JSON.stringify(v);
    const inputs = { ...request.inputs, files: request.inputs.files ?? [] };
    const ascii = canonical(inputs).replace(/[\u007f-\uffff]/g, c => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
    return createHash("sha256").update(ascii).digest("hex");
}
export function collectResult(store: Store, actionId: string, executor?: Executor): {
    action: Action;
    pending: boolean;
    passed: boolean | null;
    established: boolean;
    result: Record<string, unknown> | null;
} {
    const action = store.readAction(actionId), binding = store.execution(actionId);
    if (!action || !binding)
        throw new Error("no execution binding");
    if (binding.result)
        return { action, pending: false, passed: binding.result["harness_passed"] === true, established: binding.result["harness_established"] === true || binding.result["harness_passed"] === true, result: binding.result };
    if (!binding.jobId)
        return { action, pending: true, passed: null, established: false, result: null };
    const owner = executor ?? executorFor(binding);
    if (owner.executable !== binding.executor || owner.digest !== binding.executorDigest || owner.stateRoot !== binding.stateRoot)
        throw new Error("wrong execution owner");
    const r = owner.result(binding.jobId);
    if (r["job_id"] !== binding.jobId)
        throw new Error("result job identity mismatch");
    if (r["ready"] !== true) {
        try {
            const status = owner.status(binding.jobId);
            if (status["job_id"] !== binding.jobId)
                throw new Error("status job identity mismatch");
            return { action, pending: true, passed: null, established: false, result: { ...r, stage: status["stage"] ?? null, elapsed_seconds: status["elapsed_seconds"] ?? null } };
        }
        catch (error) {
            return { action, pending: true, passed: null, established: false, result: { ...r, stage: null, statusError: (error as Error).message } };
        }
    }
    if (r["protocol_version"] !== 1)
        throw new Error("unsupported terminal protocol");
    if (r["kind"] !== "test-batch" || r["workspace"] !== binding.request.workspace || r["cleanup_confirmed"] !== true || !Array.isArray(r["cases"]))
        throw new Error("terminal result is not a cleaned, attributable batch");
    const cases = r["cases"] as Record<string, unknown>[];
    if (cases.length !== binding.request.cases.length || cases.some((c, i) => c["id"] !== binding.request.cases[i]!.id || !["passed", "failed", "blocked", "not-run"].includes(String(c["outcome"]))))
        throw new Error("result case identity/outcome mismatch");
    if (r["input_binding"] !== binding.request.inputs.mode || r["input_fingerprint"] !== inputFingerprint(binding.request))
        throw new Error("result input binding mismatch");
    if (!["succeeded", "failed", "blocked", "cancelled", "interrupted", "timed_out"].includes(String(r["state"])))
        throw new Error("unknown terminal result state");
    const validity = r["input_validity"];
    const established = r["assessment_allowed"] === true && (validity === (binding.request.inputs.mode === "manifest" ? "manifest-verified" : "declared-scope-only"));
    const passed = established && r["state"] === "succeeded" && cases.every((c, i) => c["outcome"] === "passed" && Number.isInteger(c["exit_code"]) && binding.request.cases[i]!.expected_exit_codes.includes(c["exit_code"] as number) && !c["reason"]);
    const failed = established && r["state"] === "failed" && cases.some((c, i) => c["outcome"] === "failed" && Number.isInteger(c["exit_code"]) && Number(c["exit_code"]) >= 0 && !binding.request.cases[i]!.expected_exit_codes.includes(c["exit_code"] as number) && !c["reason"]);
    const result = { ...r, harness_passed: passed, harness_established: passed || failed };
    const receipt = store.putArtifact({ kind: "receipt", subject: binding.request.inputs.mode === "manifest" ? `manifest:${contentAddress(JSON.stringify(binding.request.inputs.files))}` : null, path: null, inline: JSON.stringify({ requestDigest: binding.requestDigest, owner: binding.executor, result }), bytes: Buffer.byteLength(JSON.stringify({ requestDigest: binding.requestDigest, owner: binding.executor, result })), provenance: "observed" });
    store.finishExecution(actionId, result, receipt.artifactId, passed ? "confirmed" : failed ? "refuted" : "unconfirmed", passed ? `Declared checks passed (${validity}); completeness and task acceptance remain separate.` : failed ? "Declared check assertions failed; task acceptance remains separate." : "No complete check claim established: blocked, interrupted, invalid inputs or incomplete evidence.");
    return { action: store.readAction(actionId)!, pending: false, passed, established: passed || failed, result };
}
/** Recovery observes the owner. It neither changes live work nor starts a new job. */
export function recoverExecutions(store: Store): unknown[] {
    return store.listUnresolvedActions().map(a => {
        try {
            recoverJobLink(store, a.actionId);
            return collectResult(store, a.actionId);
        }
        catch (error) {
            return { actionId: a.actionId, unchanged: true, error: (error as Error).message };
        }
    });
}
/** Explicit host cancellation does not fabricate cleanup or silence an uncertain live job. */
export function cancelCheck(store: Store, actionId: string, authorityRef: string, owner?: Executor) {
    if (!authorityRef.trim())
        throw new Error("authority reference required");
    const a = store.readAction(actionId);
    if (!a)
        throw new Error("unknown action");
    if (["completed", "verified", "cancelled", "refused"].includes(a.status))
        return { action: a, alreadyTerminal: true };
    recoverJobLink(store, actionId);
    store.appendEvent(a.taskId, "cancellation-requested", { actionId, authorityRef });
    const binding = store.execution(actionId);
    if(binding?.jobId&&["proposed","authorized","prepared"].includes(a.status))throw new Error("linked job in pre-dispatch state; inspect owner before cancellation");
    if (["proposed", "authorized", "prepared"].includes(a.status))
        return { action: cancelAction(store, a, `host cancellation: ${authorityRef}`), pending: false };
    if (!binding?.jobId)
        throw new Error("submission uncertain without linked job; inspect recorded submission-response, do not assert cancellation");
    const executor = owner ?? executorFor(binding);
    if (executor.executable !== binding.executor || executor.digest !== binding.executorDigest || executor.stateRoot !== binding.stateRoot)
        throw new Error("wrong execution owner");
    executor.cancel(binding.jobId);
    return collectResult(store, actionId, executor);
}
/** Recover an acknowledged job whose local link write failed, from its durable submit response. */
export function recoverJobLink(store: Store, actionId: string): void {
    const binding = store.execution(actionId), a = store.readAction(actionId);
    if (!binding || !a || binding.jobId)
        return;
    const event = store.allEvents(a.taskId).findLast(e => e.kind === "submission-response" && (e.detail as {
        actionId?: string;
    }).actionId === actionId);
    const response = (event?.detail as {
        response?: Record<string, unknown>;
    } | undefined)?.response;
    if (response && [1, 2].includes(Number(response["protocol_version"])) && typeof response["job_id"] === "string" && /^[A-Za-z0-9_.-]{1,100}$/.test(response["job_id"]))
        store.linkJob(actionId, response["job_id"]);
}
