#!/usr/bin/env -S node --experimental-strip-types
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";
import { readFileSync, statSync, existsSync } from "node:fs";
import { governancePlan } from "./ops/governance.ts";
import { Store } from "./store/store.ts";
import { workContext, defaultDbPath, sessionId } from "./store/location.ts";
import { authorize, defaultPolicy } from "./ops/authority.ts";
import { proposeAction, authorizeAction } from "./ops/actions.ts";
import { GovernanceExecutor, submitCheck, collectResult, recoverExecutions, cancelCheck, executorFor, executablePath } from "./ops/execution.ts";
import { resolveSubject, retrieve, discoverPaths } from "./ops/retrieval.ts";
import { report, touch, recordPaths } from "./ops/concurrency.ts";
import { resume, reconcile, exportTask, importHistory } from "./ops/continuity.ts";
import { adapterBlock, initRepo } from "./ops/adapter.ts";
import type { TaskItem, TaskStatus, Usage } from "./model/types.ts";
const HELP = `harness — task continuity and evidence, not an agent or process supervisor
  init [--apply] [--file AGENTS.md|CLAUDE.md]   preview or install host routing
  task create --outcome TEXT --scope PATH [--constraint TEXT] [--acceptance TEXT] [--exploring]
  task list [--all]
  task show|fork --task ID [--outcome TEXT]
  task revise --task ID --expected-version N [--note TEXT] [--constraint TEXT] [--acceptance TEXT]
              [--scope PATH] [--ruled-out TEXT] [--revoke N] [--status STATUS] [--authority-ref REF]
  resume --task ID [--session ID] [--parent-attempt ID] [--after N] [--budget BYTES]
  checkpoint --task ID --summary TEXT --next TEXT [--evidence ID] [--subject DIGEST]
  context get --task ID [--at worktree|staged|REV] [--path PATH] [--mandatory PATH]
  artifact read --task ID --artifact ID [--offset N] [--length N]
  budget set --task ID --bytes N --authority-ref REF
  paths --task ID --session ID --mode read|write --path PATH
  status [--task ID] [--session ID] [--release]
  governance plan --task ID [--executor PATH] [--stage pre-commit|pre-push|manual] [--staged]
  check run --task ID --authority-ref REF [--request-file FILE | -- COMMAND ARGS...]
            [--executor PATH] [--state-root PATH] [--wait SECONDS]
  check result --action ID [--wait SECONDS]
  check cancel --action ID --authority-ref REF
  recover                                  observe existing execution owners only
  reconcile --task ID --target REV --source TASK_ID@VERSION [--conflict TEXT]
  usage [--task ID]
  usage record --task ID --file FILE        native incremental usage, stable source/measurementId
  export --task ID [--include-artifacts]    selected historical bundle
  import --file FILE | import show --digest DIGEST
  events --task ID [--after N]
  host hook                                JSON stdin; bounded resume for a bound session
  doctor                                   local prerequisites; no host qualification claim
Global: --db PATH (default: Git common dir/harness/harness.db), --session ID
Check run/result exit codes: 0 success, 1 established failed assertions, 2 blocked/refused/invalid/unconfirmed, 3 pending.
Check cancel reports cancellation status: 0 acknowledged/terminal, 3 pending, 2 refused/unknown.\n`;
const BOOLEANS = new Set(["all", "exploring", "apply", "include-artifacts", "release", "help", "staged"]);
const ALLOWED = new Set([...BOOLEANS, "file", "outcome", "scope", "constraint", "acceptance", "task", "expected-version", "note", "ruled-out", "open-question", "revoke", "status", "authority-ref", "session", "parent-attempt", "after", "budget", "summary", "next", "evidence", "subject", "at", "path", "mandatory", "artifact", "offset", "length", "bytes", "mode", "request-file", "executor", "state-root", "wait", "action", "target", "source", "conflict", "digest", "db", "stage"]);
function parse(argv: string[]) {
    const flags: Record<string, string[]> = {}, words: string[] = [], command: string[] = [];
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]!;
        if (a === "--") {
            command.push(...argv.slice(i + 1));
            break;
        }
        if (!a.startsWith("--")) {
            words.push(a);
            continue;
        }
        const key = a.slice(2);
        if (!ALLOWED.has(key))
            throw new Error(`unknown option --${key}`);
        const v = BOOLEANS.has(key) ? "true" : argv[++i];
        if (!v || v.startsWith("--"))
            throw new Error(`--${key} requires a value`);
        (flags[key] ??= []).push(v);
    }
    return { flags, words, command };
}
function jsonFile(path: string): unknown {
    if (statSync(path).size > 16 * 1024 * 1024)
        throw new Error("input exceeds 16 MiB");
    return JSON.parse(readFileSync(path, "utf8"));
}
function emit(value: unknown, code = 0): void { process.stdout.write(JSON.stringify(value, null, 2) + "\n"); process.exitCode = code; }
interface ContinuityCommandOptions { groups?: readonly string[]; }
function commandHelp(groups?: readonly string[]): string {
    if (!groups) return HELP;
    let include = false;
    return HELP.split("\n").filter((line, index) => {
        if (index === 0 || line.startsWith("Global:")) return true;
        const command = /^  (\S+)/u.exec(line);
        if (command) include = groups.includes(command[1]!);
        else if (!/^\s/u.test(line)) include = false;
        return include;
    }).join("\n") + "\nUse unified workflow/check commands for execution and host-instructions/startup for host integration.\n";
}
function main(argv: string[], options: ContinuityCommandOptions = {}): void {
    const { flags, words, command } = parse(argv), [group, verb] = words;
    const one = (key: string) => flags[key]?.[0];
    const require = (key: string) => {
        const v = one(key);
        if (!v)
            throw new Error(`--${key} required`);
        return v;
    };
    const number = (key: string, otherwise: number) => {
        const n = Number(one(key) ?? otherwise);
        if (!Number.isSafeInteger(n) || n < 0)
            throw new Error(`--${key} must be a nonnegative integer`);
        return n;
    };
    if (!group || group === "help" || flags["help"]) {
        process.stdout.write(commandHelp(options.groups));
        return;
    }
    if (options.groups && !options.groups.includes(group))
        throw new Error("This continuity command requires the unified workflow/check or host-instructions/startup surface");
    const where = workContext(process.cwd()), root = where.worktree;
    let who = sessionId(one("session")), taskId = one("task") ?? null;
    const store = new Store(one("db") ? resolve(one("db")!) : defaultDbPath(root));
    const workspaceId = store.workspace(where.locator, root);
    const needTask = () => {
        const id = taskId ?? store.boundAttempt(who ?? "", workspaceId)?.taskId;
        if (!id)
            throw new Error("explicit --task required; no session binding exists");
        taskId = id;
        return store.readTask(id) ?? (() => { throw new Error("unknown task"); })();
    };
    const operationAllowed = (operation: "read" | "record", task: ReturnType<typeof needTask>) => {
        const scope = task.items.filter(i => !i.revoked && i.kind === "scope").map(i => i.body);
        const verdict = authorize({ operation, scope, targets: [], destination: null, policyRevision: defaultPolicy().revision }, defaultPolicy(), task, root);
        if (!verdict.ok)
            throw new Error(verdict.reason);
    };
    const observeCheck = (id: string, wait: number, providedOwner?: GovernanceExecutor) => {
        const binding = store.execution(id);
        if (!binding)
            throw new Error("unknown execution");
        if (wait > 30)
            throw new Error("wait must be 0..30 seconds");
        let waitError: string | null = null;
        try {
            const owner = binding.result || !binding.jobId ? undefined : providedOwner ?? executorFor(binding);
            if (owner && binding.jobId)
                try {
                    owner.wait(binding.jobId, wait);
                }
                catch (error) {
                    waitError = (error as Error).message;
                }
            const r = collectResult(store, id, owner);
            taskId = r.action.taskId;
            return emit({ ok: r.passed === true, actionId: id, jobId: binding.jobId, waitError, ...r }, r.pending ? 3 : !r.established ? 2 : r.passed ? 0 : 1);
        }
        catch (error) {
            return emit({ ok: false, actionId: id, jobId: binding.jobId, action: store.readAction(id), waitError, error: (error as Error).message }, 2);
        }
    };
    const needSession = () => {
        if (!who)
            throw new Error("stable --session or HARNESS_SESSION is required for this operation");
        return who;
    };
    const item = (kind: TaskItem["kind"], body: string, provenance: TaskItem["provenance"]): Omit<TaskItem, "seq" | "revoked"> => ({ kind, body, provenance });
    try {
        if (group === "init") {
            if (!flags["apply"])
                return emit({ ok: true, preview: adapterBlock(), next: "Install explicitly with init --apply; host hooks remain opt-in." });
            return emit({ ok: true, files: initRepo(root, flags["file"]) });
        }
        if (group === "doctor")
            return emit({ ok: true, node: process.version, governanceVersion: process.env["GOVERNANCE_CONTINUITY_VERSION"] ?? null, repositoryId: store.repositoryId(), workspaceId, sessionIdentity: who ? "available" : "unknown", executor: existsSync(process.env["GOVERNANCE_CONTINUITY_EXECUTOR"] ?? join(root, ".governance/runtime/bin/harness-agent")) ? "present; not qualified" : "not installed here; pass --executor", hostHooks: "unqualified; use an explicit host probe before installation", tokens: "native incremental observations only; otherwise unknown" });
        if (group === "task" && verb === "create") {
            const task = store.createTask(require("outcome"), [...(flags["scope"] ?? [root]).map(p => item("scope", resolve(root, p), "operator")), ...(flags["constraint"] ?? []).map(p => item("constraint", p, "operator")), ...(flags["acceptance"] ?? []).map(p => item("acceptance", p, "operator"))], { ...where, ...(who ? { session: who } : {}), mode: flags["exploring"] ? "explore" : "implement" });
            taskId = task.taskId;
            if (who)
                store.bind(taskId, who, workspaceId, root);
            return emit({ ok: true, task, provenance: "host-reported intent" });
        }
        if (group === "task" && verb === "list")
            return emit({ ok: true, tasks: store.listTasks().filter(t => flags["all"] || t.worktree === root).map(t => ({ taskId: t.taskId, version: t.version, status: t.status, outcome: t.outcome, worktree: t.worktree, parentTask: t.parentTask })), boundTask: who ? store.boundAttempt(who, workspaceId)?.taskId ?? null : null });
        if (group === "task" && verb === "show")
            return emit({ ok: true, task: needTask(), checkpoint: store.latestCheckpoint(taskId!), usage: store.usageTotals(taskId!) });
        if (group === "task" && verb === "fork") {
            const parent = needTask();
            const child = store.forkTask(parent.taskId, { ...where, ...(who ? { session: who } : {}), ...(flags["exploring"] ? { mode: "explore" as const } : {}) }, one("outcome") ? { outcome: one("outcome")! } : {});
            taskId = child.taskId;
            if (who)
                store.bind(taskId, who, workspaceId, root);
            return emit({ ok: true, task: child, note: "Inherited findings retain original applicability; no actions or acceptance were copied." });
        }
        if (group === "task" && verb === "revise") {
            const task = needTask();
            require("expected-version");
            const added: Omit<TaskItem, "seq" | "revoked">[] = [];
            for (const [flag, kind, provenance] of [["note", "handoff", "hypothesis"], ["ruled-out", "ruled-out", "hypothesis"], ["open-question", "open-question", "hypothesis"], ["constraint", "constraint", "operator"], ["acceptance", "acceptance", "operator"], ["scope", "scope", "operator"]] as const)
                for (const body of flags[flag] ?? [])
                    added.push(item(kind, flag === "scope" ? resolve(root, body) : body, provenance));
            const revised = store.atomic(() => {
                const changed = store.reviseTask(task.taskId, added, { expectedVersion: number("expected-version", task.version), ...(one("outcome") ? { outcome: one("outcome")! } : {}), ...(one("status") ? { status: one("status") as TaskStatus } : {}), revoke: (flags["revoke"] ?? []).map(Number), ...(who ? { session: who } : {}), ...(one("authority-ref") ? { authorityRef: one("authority-ref")! } : {}) });
                if (who && store.boundAttempt(who, workspaceId)?.taskId === task.taskId)
                    store.bind(task.taskId, who, workspaceId, root);
                return changed;
            });
            return emit({ ok: true, task: revised });
        }
        if (group === "resume") {
            const task = needTask();
            const attempt = who ? store.bind(task.taskId, who, workspaceId, root, one("parent-attempt") ?? null) : null;
            const p = resume(store, task.taskId, number("after", 0), number("budget", 16000), attempt, root);
            return emit(p, p.ok ? 0 : 2);
        }
        if (group === "checkpoint") {
            const task = needTask();
            operationAllowed("record", task);
            return emit({ ok: true, checkpoint: store.checkpoint(task.taskId, { summary: require("summary"), next: one("next") ?? "", evidenceIds: flags["evidence"] ?? [], subject: one("subject") ?? null, attemptId: who ? store.boundAttempt(who, workspaceId)?.attemptId ?? null : null }) });
        }
        if (group === "context" && verb === "get") {
            const task = needTask();
            operationAllowed("read", task);
            const at = one("at") ?? "worktree", subject = resolveSubject(root, at === "worktree" ? { kind: "worktree" } : at === "staged" ? { kind: "staged" } : { kind: "commit", rev: at });
            if ("error" in subject)
                return emit({ ok: false, error: subject.error }, 2);
            const scope = task.items.filter(i => !i.revoked && i.kind === "scope").map(i => i.body);
            if (!scope.length)
                throw new Error("task has no declared scope");
            if (!flags["path"]?.length && !flags["mandatory"]?.length)
                return emit({ ok: true, candidates: discoverPaths(root, subject, scope), note: "Choose relevant paths; no source bytes or budget were consumed." });
            if (one("budget"))
                throw new Error("use budget set to change a task ceiling explicitly");
            const r = retrieve(store, root, subject, flags["path"] ?? [], { maxBytes: 262144, usedBytes: 0 }, { scope, taskId: task.taskId, mandatory: flags["mandatory"] ?? [] });
            if (who)
                recordPaths(store, { session: who, workspaceId, taskId: task.taskId, cwd: root, paths: r.artifacts.flatMap(a => a.path ? [a.path] : []), mode: "read" });
            return emit({ ok: !r.blocked, subject, artifacts: r.artifacts.map(a => ({ ...a, inline: store.artifactContent(a.artifactId) })), deferred: r.deferred, unavailable: r.unavailable, budget: r.budget, blocked: r.blocked }, r.blocked ? 2 : 0);
        }
        if (group === "artifact" && verb === "read") {
            const task = needTask(), id = require("artifact");
            operationAllowed("read", task);
            if (!store.taskHasArtifact(task.taskId, id))
                throw new Error("artifact is not linked to this task");
            const offset = number("offset", 0), length = number("length", 16000);
            if (length > 64000)
                throw new Error("artifact page exceeds 64000 bytes");
            const bytes = Buffer.from(store.artifactContent(id));
            if (offset > bytes.length)
                throw new Error("offset exceeds artifact size");
            let end = Math.min(bytes.length, offset + length);
            while (end > offset && end < bytes.length && (bytes[end]! & 0xc0) === 0x80)
                end--;
            if (offset < bytes.length && (bytes[offset]! & 0xc0) === 0x80)
                throw new Error("offset splits a UTF-8 character");
            if (end === offset && offset < bytes.length)
                throw new Error("length cannot hold the next character");
            const budget = store.reserveBytes(task.taskId, end - offset);
            if (!budget)
                return emit({ ok: false, blocked: "task context budget exhausted" }, 2);
            return emit({ ok: true, artifact: { artifactId: id, subject: store.readArtifact(id)?.subject, bytes: bytes.length }, content: bytes.subarray(offset, end).toString("utf8"), nextOffset: end, hasMore: end < bytes.length, budget });
        }
        if (group === "budget" && verb === "set") {
            const task = needTask();
            store.setBudget(task.taskId, number("bytes", 262144), require("authority-ref"));
            return emit({ ok: true, budget: store.budget(task.taskId) });
        }
        if (group === "paths") {
            const task = needTask(), mode = one("mode");
            if (mode !== "read" && mode !== "write")
                throw new Error("mode must be read or write");
            recordPaths(store, { session: needSession(), workspaceId, taskId: task.taskId, cwd: root, paths: flags["path"] ?? [], mode });
            return emit({ ok: true, ...report(store, { session: who, workspaceId, worktree: root, taskId, cwd: root }) });
        }
        if (group === "status") {
            if (flags["release"])
                store.releaseIntents(needSession(), workspaceId);
            return emit({ ok: true, ...report(store, { session: who, workspaceId, worktree: root, taskId, cwd: root }) });
        }
        if (group === "governance" && verb === "plan")
            return emit(governancePlan(store, needTask().taskId, root, one("executor") ?? process.env["GOVERNANCE_CONTINUITY_COMMAND"] ?? join(root, ".governance/runtime/bin/project-governance"), one("stage") ?? "pre-commit", !!flags["staged"]));
        if (group === "check" && verb === "run") {
            const wait = number("wait", 0);
            if (wait > 30)
                throw new Error("wait must be 0..30 seconds");
            if (one("request-file") && command.length)
                throw new Error("choose request file or command, not both");
            const task = needTask(), policy = defaultPolicy(), scope = task.items.filter(i => !i.revoked && i.kind === "scope").map(i => i.body);
            const owner = new GovernanceExecutor(one("executor") ?? process.env["GOVERNANCE_CONTINUITY_EXECUTOR"] ?? join(root, ".governance/runtime/bin/harness-agent"), one("state-root"));
            const authorityRef = require("authority-ref");
            const request = one("request-file") ? jsonFile(one("request-file")!) : command.length ? { version: 1, workspace: root, timeout_seconds: 600, inputs: { mode: "declared-roots", roots: [root] }, output_roots: [], cleanup_required: false, host: "unknown", cases: [{ id: "check", argv: [executablePath(command[0]!), ...command.slice(1)], timeout_seconds: 600, expected_exit_codes: [0], depends_on: [] }] } : null;
            if (!request)
                throw new Error("request file or command required");
            const req = { operation: "check" as const, scope, destination: null, policyRevision: policy.revision, targets: [root] };
            let action = proposeAction(store, task.taskId, req);
            action = authorizeAction(store, action, req, policy, root);
            if (action.status === "refused")
                return emit({ ok: false, action }, 2);
            action = submitCheck(store, action, request, owner, authorityRef, root);
            return observeCheck(action.actionId, wait, owner);
        }
        if (group === "check" && verb === "cancel") {
            const r = cancelCheck(store, require("action"), require("authority-ref"));
            const pending = "pending" in r && r.pending;
            return emit({ ok: !pending, ...r }, pending ? 3 : 0);
        }
        if (group === "check" && verb === "result") {
            return observeCheck(require("action"), number("wait", 0));
        }
        if (group === "recover")
            return emit({ ok: true, observations: recoverExecutions(store) });
        if (group === "reconcile") {
            const task = needTask(), sources = (flags["source"] ?? []).map(s => {
                const match = /^(.+)@(\d+)$/.exec(s);
                if (!match)
                    throw new Error("source must be TASK_ID@VERSION");
                return { taskId: match[1]!, version: Number(match[2]) };
            });
            return emit({ ok: true, reconciliation: reconcile(store, task.taskId, root, require("target"), sources, flags["conflict"] ?? []) });
        }
        if (group === "usage" && verb === "record") {
            const task = needTask(), input = jsonFile(require("file")) as Omit<Usage, "usageId" | "recordedAt">;
            if (!input || !input.source || !input.measurementId || !["provider", "worker", "execution"].includes(input.kind))
                throw new Error("incremental usage requires kind, source and stable measurementId");
            return emit({ ok: true, recorded: !!store.recordUsage({ ...input, taskId: task.taskId, actionId: input.actionId ?? null }) });
        }
        if (group === "usage")
            return emit({ ok: true, usage: store.usageTotals(taskId ?? undefined) });
        if (group === "export")
            return emit(exportTask(store, needTask().taskId, !!flags["include-artifacts"]));
        if (group === "import" && verb === "show")
            return emit({ ok: true, authority: "none", history: store.readImport(require("digest")) });
        if (group === "import")
            return emit({ ok: true, ...importHistory(store, jsonFile(require("file"))) });
        if (group === "events") {
            const id = needTask().taskId, after = number("after", 0), events = [];
            let cursor = after;
            for (const event of store.events(id, after, 20)) {
                const value = Buffer.byteLength(JSON.stringify(event.detail)) > 2000 ? { ...event, detail: { omitted: true, note: "Use selected export for full history; reconciliation details have an artifact reference." } } : event;
                if (Buffer.byteLength(JSON.stringify([...events, value])) > 12000)
                    break;
                events.push(value);
                cursor = event.seq;
            }
            return emit({ ok: true, events, cursor, hasMore: cursor < store.latestCursor(id) });
        }
        if (group === "host" && verb === "hook") {
            const raw = readFileSync(0, "utf8");
            if (Buffer.byteLength(raw) > 64000)
                throw new Error("hook input too large");
            const input = JSON.parse(raw) as {
                session_id?: string;
                cwd?: string;
            };
            if (typeof input.session_id !== "string" || !input.session_id.trim())
                throw new Error("hook requires session_id");
            if (input.cwd && resolve(input.cwd) !== root)
                throw new Error("hook workspace differs from process workspace");
            who = input.session_id;
            const bound = store.boundAttempt(who, workspaceId);
            if (!bound)
                return emit({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: "Harness: no task bound to this session. Select the intended task explicitly; do not resume another open task by assumption." } });
            taskId = bound.taskId;
            return emit({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: JSON.stringify(resume(store, bound.taskId, 0, 12000, bound, root)) } });
        }
        throw new Error("unknown command; use harness help");
    }
    finally {
        try {
            touch(store, { session: who, worktree: root, taskId, cwd: root });
        }
        catch { /* advisory */ }
        store.close();
    }
}
/** Shared CLI boundary; importing the module never opens a store or consumes host arguments. */
export function continuityCommand(argv: string[], options: ContinuityCommandOptions = {}): number {
    const previous = process.exitCode;
    process.exitCode = 0;
    try {
        main(argv, options);
        return Number(process.exitCode ?? 0);
    }
    catch (error) {
        emit({ ok: false, error: (error as Error).message }, 2);
        return 2;
    }
    finally { process.exitCode = previous; }
}
if (process.argv[1] && existsSync(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)))
    process.exitCode = continuityCommand(process.argv.slice(2));
