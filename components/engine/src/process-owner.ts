import { commandProcesses, recordedCommandMembers } from "./command-owner-recovery.ts";
import { startCommandGuardian } from "./command-guardian.ts";
import { deliverCommandCompletion, type CompletionTarget } from "./completion-delivery.ts";
import { CodexStream } from "./codex-stream.ts";
import { GeminiStream } from "./gemini-stream.ts";
import { ClaudeStream } from "./claude-stream.ts";
import { ProviderFrames } from "./provider-frames.ts";
import { credentialEnvironment } from "./credential-environment.ts";
import { ResourceRegistry, type Lease } from "./resources.ts";
import type { ProviderAssignment } from "./provider-assignment.ts";
import { providerRuntime } from "./provider-runtime.ts";
import { retainRuntimeReader, releaseRuntimeReader, type RuntimeReader } from "./runtime-reader.ts";
import { spawn, execFileSync } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, statSync, writeSync } from "node:fs";
import { join, resolve } from "node:path";
import { hostname } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { digest, durableJson, fileDigest, object, text } from "./core.ts";
import type { CommandOperation } from "./workflow-types.ts";

export interface CommandRequest {
  version: 1; id: string; operation: CommandOperation; deadlineMs: number; outputLimit: number;
  ownerDigest: string; stdin?: string;
  idleTimeoutMs?: number;
  completion?: CompletionTarget;
  coordination?: { registry: string; resources: string[] };
  assignment?: ProviderAssignment;
  runtime?: ReturnType<typeof providerRuntime>;
  parent?: { directory: string; requestDigest: string; resultDigest: string };
  provider?: { kind: "claude" | "gemini" | "codex"; model: string; effort: string; conversationId?: string; requiredTools: string[]; additionalRoots?: string[]; access?: "reader" | "writer" | "exclusive" };
}
export interface CommandReceipt {
  version: 1; requestDigest: string; state: "succeeded" | "failed" | "cancelled" | "unknown";
  exitCode: number | null; signal: string | null; reason: string; cleanup: "confirmed" | "unknown";
  startedAt: string; endedAt: string; durationMs: number; log: string; logBytes: number; stdout?: string; stderr?: string; providerResult?: string; providerResultDigest?: string; providerEvents?: string;
}
export interface CommandObservation { state: "pending" | "unknown" | "terminal"; receipt: CommandReceipt | null }
const OWNER = fileURLToPath(import.meta.url);
export function processOwnerDigest(): string { return fileDigest(OWNER); }
const ENVIRONMENT = ["PATH", "HOME", "USER", "LOGNAME", "TMPDIR", "TMP", "TEMP", "LANG", "LC_ALL", "SHELL", "DEVELOPER_DIR", "JAVA_HOME", "ANDROID_HOME", "ANDROID_SDK_ROOT", "CI"];

/** Local development inherits tool locations, not ambient model/publisher credentials. CI adds isolation externally. */
export function commandEnvironment(extra: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of ENVIRONMENT) if (process.env[key] !== undefined) env[key] = process.env[key]!;
  return { ...env, ...extra };
}

/** A process start fingerprint is checked before signalling a recorded PID. */
export function processFingerprint(pid: number): string | null {
  if (!Number.isSafeInteger(pid) || pid < 2) return null;
  try { return execFileSync("/bin/ps", ["-p", String(pid), "-o", "lstart="], { encoding: "utf8", timeout: 2000 }).trim() || null; }
  catch { return null; }
}

/** Persisted submission is idempotent, including the uncertain interval before process acknowledgment. */
export function submitCommand(directory: string, request: Omit<CommandRequest, "ownerDigest" | "version">): { directory: string; requestDigest: string; submitted: boolean } {
  directory = resolve(directory);
  const bound: CommandRequest = { ...request, version: 1, ownerDigest: fileDigest(OWNER) };
  validateCommandRequest(bound);
  const hash = digest(bound);
  const existing = () => {
    const path = join(directory, "request.json");
    if (!existsSync(path)) throw new Error("command submission unresolved; request persistence was interrupted");
    if (digest(JSON.parse(readFileSync(path, "utf8"))) !== hash) throw new Error("command submission identity conflict");
    return { directory, requestDigest: hash, submitted: false };
  };
  if (existsSync(directory)) return existing();
  const environment = { ...commandEnvironment({}), ...credentialEnvironment(request.operation.credentialEnv), ...(request.completion ? { CODEX_HOME: request.completion.home } : {}) };
  try { mkdirSync(directory, { mode: 0o700 }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    return existing();
  }
  durableJson(join(directory, "request.json"), bound);
  if (request.runtime) {
    const reader = retainRuntimeReader(`command:${hash}`);
    if (!reader || reader.registry !== request.runtime.registry || reader.revision !== request.runtime.revision || reader.directory !== request.runtime.directory) throw new Error("Command runtime changed before dispatch; retained reader requires reconciliation");
    durableJson(join(directory, "generation.json"), { requestDigest: hash, reader });
  }
  const child = spawn(process.execPath, [OWNER, "--worker", directory, hash], {
    detached: true, stdio: "ignore", env: environment,
  });
  child.on("error", () => {
    // No second submission: observe the absent acknowledgment as unresolved.
  });
  child.unref();
  return { directory, requestDigest: hash, submitted: true };
}

/** Observation never dispatches or retries work, even when all process handles have disappeared. */
export function observeCommand(directory: string, requestDigest: string): CommandObservation {
  const receipt = join(directory, "result.json");
  if (existsSync(receipt)) {
    if (statSync(receipt).size > 65_536) throw new Error("oversized command receipt");
    const raw = object(JSON.parse(readFileSync(receipt, "utf8")));
    if (raw["version"] !== 1 || raw["requestDigest"] !== requestDigest ||
        !["succeeded", "failed", "cancelled", "unknown"].includes(String(raw["state"])) ||
        !["confirmed", "unknown"].includes(String(raw["cleanup"]))) throw new Error("command receipt identity/shape mismatch");
    if (raw.providerResult !== undefined && (raw.providerResult !== join(resolve(directory), "provider-result.json") ||
        raw.providerResultDigest !== fileDigest(String(raw.providerResult)))) throw new Error("provider result identity mismatch");
    return { state: "terminal", receipt: raw as unknown as CommandReceipt };
  }
  const ack = join(directory, "owner.json");
  if (!existsSync(ack)) return { state: "unknown", receipt: null };
  const owner = object(JSON.parse(readFileSync(ack, "utf8")));
  if (owner["requestDigest"] !== requestDigest) throw new Error("command owner identity mismatch");
  return { state: processFingerprint(Number(owner["pid"])) === owner["fingerprint"] ? "pending" : "unknown", receipt: null };
}

/** Read only complete public records after a cursor; observation never restarts provider work. */
export function observeProviderEvents(directory: string, requestDigest: string, after = 0, limit = 100) {
  if (!Number.isSafeInteger(after) || after < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new Error("Invalid provider event cursor or limit");
  const request = JSON.parse(readFileSync(join(directory, "request.json"), "utf8"));
  if (digest(request) !== requestDigest || !request.provider) throw new Error("Provider event request identity mismatch");
  const path = join(directory, "provider-events.jsonl");
  if (!existsSync(path)) return { events: [], cursor: after };
  if (statSync(path).size > 4 * 1024 * 1024) throw new Error("Oversized provider progress");
  const content = readFileSync(path, "utf8");
  const lines = content.slice(0, content.lastIndexOf("\n") + 1).split("\n").filter(Boolean);
  const events: Record<string, unknown>[] = [];
  for (const [index, line] of lines.entries()) {
    const event = object(JSON.parse(line));
    if (event.version !== 1 || event.requestDigest !== requestDigest || event.sequence !== index + 1) throw new Error("Provider event identity mismatch");
    if (index + 1 > after && events.length < limit) events.push(event);
  }
  return { events, cursor: events.length ? Number(events.at(-1)!.sequence) : after };
}

/** The actual owner consumes cancellation; callers never signal a guessed process tree. */
export function cancelCommand(directory: string, requestDigest: string, authorityRef: string): void {
  text(authorityRef, "cancellation authority");
  durableJson(join(directory, "cancel.json"), { requestDigest, authorityRef });
}

export async function waitCommand(directory: string, requestDigest: string, milliseconds: number): Promise<CommandObservation> {
  const until = Date.now() + Math.min(Math.max(0, milliseconds), 30_000);
  let observed: CommandObservation;
  do {
    observed = observeCommand(directory, requestDigest);
    if (observed.state === "terminal" || Date.now() >= until) return observed;
    await new Promise(resolve => setTimeout(resolve, Math.min(50, Math.max(1, until - Date.now()))));
  } while (true);
}

export function validateCommandRequest(request: CommandRequest): void {
  const grace = request.operation.terminationGraceMs;
  if (grace !== undefined && (!Number.isSafeInteger(grace) || grace < 1 || grace > 30000)) throw new Error("Invalid termination grace");
  if (request.version !== 1 || !Number.isSafeInteger(request.deadlineMs) || request.deadlineMs < (request.provider ? 0 : 1) || request.deadlineMs > (request.provider ? 604_800_000 : 86_400_000)) throw new Error("invalid command deadline/version");
  if (request.idleTimeoutMs !== undefined && (!request.provider || !Number.isSafeInteger(request.idleTimeoutMs) || request.idleTimeoutMs < 0 || request.idleTimeoutMs > 604_800_000)) throw new Error("invalid provider idle timeout");
  if (!Number.isSafeInteger(request.outputLimit) || request.outputLimit < 1 || request.outputLimit > 64 * 1024 * 1024) throw new Error("invalid command output limit");
  text(request.id, "command id");
  if (request.stdin !== undefined && (typeof request.stdin !== "string" || Buffer.byteLength(request.stdin) > 500_000)) throw new Error("invalid command stdin; maximum 500 KB");
  if (request.coordination && (!request.coordination.registry.startsWith("/") || !Array.isArray(request.coordination.resources) || !request.coordination.resources.length)) throw new Error("Invalid command coordination");
  if (request.provider !== undefined) {
    if (!["claude", "gemini", "codex"].includes(request.provider.kind) || !Array.isArray(request.provider.requiredTools)) throw new Error("Invalid command provider");
    if (request.provider.kind === "codex" && (request.stdin === undefined || !request.stdin.trim())) throw new Error("Codex assignment stdin is required");
    text(request.provider.model, "provider model", 256); text(request.provider.effort, "provider effort", 64);
    if (request.provider.conversationId !== undefined) text(request.provider.conversationId, "provider session", 256);
    for (const tool of request.provider.requiredTools) text(tool, "required provider tool", 256);
  }
  if (!request.operation.argv.length || !request.operation.argv[0]?.startsWith("/") || !request.operation.cwd.startsWith("/")) throw new Error("command requires absolute executable/workspace");
}

async function execute(directory: string, expectedDigest: string): Promise<void> {
  const request = JSON.parse(readFileSync(join(directory, "request.json"), "utf8")) as CommandRequest;
  validateCommandRequest(request);
  if (digest(request) !== expectedDigest || request.ownerDigest !== fileDigest(OWNER)) throw new Error("command worker/request changed");
  closeSync(openSync(join(directory, "worker.claim"), "wx", 0o600));
  let generation: RuntimeReader | null = null;
  if (request.runtime) {
    const record = object(JSON.parse(readFileSync(join(directory, "generation.json"), "utf8")));
    if (record.requestDigest !== expectedDigest) throw new Error("Command generation identity mismatch");
    generation = record.reader as RuntimeReader;
    const current = providerRuntime(request.operation.cwd, { GOVERNANCE_GENERATION_REGISTRY: generation.registry,
      GOVERNANCE_GENERATION_TOKEN: generation.token, GOVERNANCE_GENERATION_OWNER: generation.owner });
    if (digest(current) !== digest(request.runtime)) throw new Error("Command destination runtime changed before execution");
  }
  const fingerprint = processFingerprint(process.pid);
  if (!fingerprint) throw new Error("command owner identity unavailable");
  durableJson(join(directory, "owner.json"), { pid: process.pid, fingerprint, requestDigest: expectedDigest });
  await startCommandGuardian(directory, expectedDigest);
  const started = Date.now(), startedAt = new Date(started).toISOString(), log = join(directory, "output.log");
  let registry: ResourceRegistry | undefined, leases: Lease[] = [];
  if (request.coordination) {
    try {
      registry = new ResourceRegistry(request.coordination.registry);
      leases = registry.acquire(request.coordination.resources, expectedDigest, expectedDigest);
      durableJson(join(directory, "claims.json"), { requestDigest: expectedDigest, registry: registry.path, leases });
    } catch {
      registry?.close();
      durableJson(join(directory, "result.json"), { version: 1, requestDigest: expectedDigest, state: "failed",
        exitCode: null, signal: null, reason: "resource-admission-failed", cleanup: leases.length ? "unknown" : "confirmed",
        startedAt, endedAt: new Date().toISOString(), durationMs: Date.now() - started, log, logBytes: 0 });
      if (!leases.length) releaseRuntimeReader(generation, true);
      try { deliverCommandCompletion(directory, expectedDigest); } catch { /* Preserve the original admission result. */ }
      return;
    }
  }
  const fd = openSync(log, "wx", 0o600), stdout = join(directory, "stdout.log"), stderr = join(directory, "stderr.log");
  const stdoutFd = openSync(stdout, "wx", 0o600), stderrFd = openSync(stderr, "wx", 0o600);
  const providerEvents = request.provider ? join(directory, "provider-events.jsonl") : undefined;
  const eventsFd = providerEvents ? openSync(providerEvents, "wx", 0o600) : null;
  let eventBytes = 0, eventSequence = 0;
  let bytes = 0, reason = "exit", requestedStop = false, closed = false, killTimer: ReturnType<typeof setTimeout> | undefined;
  // A crash between intent and acknowledgment is unresolved, never permission to replay.
  durableJson(join(directory, "launch.json"), { version: 1, requestDigest: expectedDigest,
    state: "intent", host: hostname(), owner: { pid: process.pid, fingerprint }, startedAt });
  const child = spawn(request.operation.argv[0]!, request.operation.argv.slice(1), {
    cwd: request.operation.cwd, env: { ...commandEnvironment(request.operation.env), ...credentialEnvironment(request.operation.credentialEnv) }, detached: true, stdio: [request.stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"],
  });
  const group = child.pid;
  if (group) {
    try {
      durableJson(join(directory, "launch.json"), { version: 1, requestDigest: expectedDigest,
        state: "spawned", host: hostname(), owner: { pid: process.pid, fingerprint }, startedAt,
        child: { pid: group, processGroup: group, fingerprint: processFingerprint(group) } });
    } catch (error) {
      // This live owner still owns the freshly spawned group even if persistence fails.
      try { process.kill(-group, "SIGKILL"); } catch { /* Preserve unresolved launch evidence. */ }
      throw error;
    }
  }
  const groupAlive = () => { if (!group) return false; try { process.kill(-group, 0); return true; } catch { return false; } };
  const signal = (value: NodeJS.Signals) => { if (group) { try { process.kill(-group, value); } catch { /* Group may have exited between observation and signal. */ } } };
  const stop = (why: string) => {
    if (requestedStop) return; requestedStop = true; reason = why; signal("SIGTERM");
    killTimer = setTimeout(() => signal("SIGKILL"), request.operation.terminationGraceMs ?? 1000);
  };
  if (request.stdin !== undefined && request.provider?.kind !== "codex") {
    child.stdin!.on("error", () => stop("input-write-failed"));
    child.stdin!.end(request.stdin, "utf8");
  }
  let lastActivity = performance.now();
  const logChunk = (chunk: Buffer, stream: number) => {
    if (closed) return;
    if (chunk.length) lastActivity = performance.now();
    const remaining = request.outputLimit - bytes;
    try { if (remaining > 0) { const part = chunk.subarray(0, remaining); writeSync(fd, part); writeSync(stream, part); bytes += part.length; } }
    catch { stop("log-write-failed"); }
    if (chunk.length > remaining) stop("output-limit");
  };
  const emit = (event: { kind: string; text?: string; tool?: string; state?: string }) => {
    const line = JSON.stringify({ version: 1, requestDigest: expectedDigest, sequence: ++eventSequence, ...event }) + "\n";
    eventBytes += Buffer.byteLength(line);
    if (eventBytes > 4 * 1024 * 1024) throw new Error("Provider public progress exceeds limit");
    writeSync(eventsFd!, line);
  };
  const codex = request.provider?.kind === "codex" ? new CodexStream({ ...request.provider, workspace: request.operation.cwd, prompt: request.stdin! }, emit) : null;
  const provider = codex ?? (request.provider ? new (request.provider.kind === "claude" ? ClaudeStream : GeminiStream)(request.provider, emit) : null);
  let protocolTimer: ReturnType<typeof setTimeout> | undefined;
  const send = (messages: Record<string, unknown>[]) => {
    const input = messages.map(message => JSON.stringify(message) + "\n").join("");
    if (Buffer.byteLength(input) + (child.stdin?.writableLength ?? 0) > 1_048_576) throw new Error("Provider pending input exceeds limit");
    if (input) child.stdin!.write(input);
  };
  const frames = provider ? new ProviderFrames(event => {
    if (codex) {
      send(codex.accept(event));
      if ((codex.done || codex.stopRequested) && !protocolTimer) {
        child.stdin!.end();
        protocolTimer = setTimeout(() => stop(codex.stopRequested ? "provider-blocked" : "provider-completed"), codex.stopRequested ? 200 : 2000);
      }
    } else provider.accept(event);
  }) : null;
  if (codex) {
    child.stdin!.on("error", () => stop("input-write-failed"));
    send([codex.initial()]);
  }
  child.stdout?.on("data", chunk => {
    logChunk(chunk, stdoutFd);
    if (frames && !requestedStop) { try { frames.push(chunk); } catch { stop("provider-stream-invalid"); } }
  });
  child.stderr?.on("data", chunk => logChunk(chunk, stderrFd));
  const onSignal = () => stop("cancelled"); process.on("SIGTERM", onSignal); process.on("SIGINT", onSignal);
  const deadline = request.deadlineMs ? setTimeout(() => stop("deadline"), request.deadlineMs) : undefined;
  const idle = request.idleTimeoutMs ? setInterval(() => {
    if (performance.now() - lastActivity >= request.idleTimeoutMs!) stop("idle-timeout");
  }, Math.min(100, request.idleTimeoutMs)) : undefined;
  const cancel = setInterval(() => {
    if (!existsSync(join(directory, "cancel.json"))) return;
    try { const marker = object(JSON.parse(readFileSync(join(directory, "cancel.json"), "utf8"))); if (marker["requestDigest"] === expectedDigest && marker["authorityRef"]) stop("cancelled"); }
    catch { /* Invalid cancellation data grants no authority. */ }
  }, 100);
  let exitCode: number | null = null, exitSignal: string | null = null;
  try {
    await new Promise<void>(resolve => {
      child.once("error", () => { reason = "spawn-failed"; resolve(); });
      child.once("close", (code, sig) => { exitCode = code; exitSignal = sig; resolve(); });
    });
    // Native children occasionally leave a background descendant; it remains this owner's obligation.
    if (groupAlive()) { signal("SIGTERM"); await new Promise(resolve => setTimeout(resolve, 100)); }
    if (groupAlive()) { signal("SIGKILL"); await new Promise(resolve => setTimeout(resolve, 100)); }
  } finally {
    closed = true; clearTimeout(deadline); clearInterval(idle); clearInterval(cancel); if (killTimer) clearTimeout(killTimer); if (protocolTimer) clearTimeout(protocolTimer);
    process.off("SIGTERM", onSignal); process.off("SIGINT", onSignal); closeSync(fd); closeSync(stdoutFd); closeSync(stderrFd); if (eventsFd !== null) closeSync(eventsFd);
  }
  let providerResult: string | undefined;
  if (frames && provider && ["exit", "provider-completed", "provider-blocked"].includes(reason)) {
    try {
      frames.end();
      const result = provider.finish();
      providerResult = join(directory, "provider-result.json");
      durableJson(providerResult, { version: 1, requestDigest: expectedDigest, ...result });
      if (result.state !== "succeeded") reason = "provider-blocked";
    } catch { reason = "provider-stream-invalid"; }
  }
  let cleanup: "unknown" | "confirmed" = "unknown";
  try {
    const recorded = recordedCommandMembers(directory, expectedDigest, group);
    const rows = commandProcesses();
    if (!groupAlive() && !rows.some(row => recorded.pids.includes(row.pid))) cleanup = "confirmed";
  } catch { /* Incomplete process inventory cannot confirm cleanup. */ }
  const success = reason === "provider-completed" || (reason === "exit" && exitCode !== null && request.operation.expectedExitCodes.includes(exitCode));
  const receipt: CommandReceipt = { version: 1, requestDigest: expectedDigest,
    state: cleanup === "unknown" ? "unknown" : reason === "cancelled" ? "cancelled" : success ? "succeeded" : "failed",
    exitCode, signal: exitSignal, reason, cleanup, startedAt, endedAt: new Date().toISOString(), durationMs: Date.now() - started, log, logBytes: bytes, stdout, stderr, ...(providerEvents ? { providerEvents } : {}), ...(providerResult ? { providerResult, providerResultDigest: fileDigest(providerResult) } : {}) };
  durableJson(join(directory, "result.json"), receipt);
  if (registry) {
    try { if (cleanup === "confirmed") registry.release(leases, digest(receipt)); }
    finally { registry.close(); }
  }
  if (cleanup === "confirmed") releaseRuntimeReader(generation, true);
  try { deliverCommandCompletion(directory, expectedDigest); } catch { /* Delivery is independent of execution and cleanup evidence. */ }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href && process.argv[2] === "--worker") {
  execute(process.argv[3]!, process.argv[4]!).catch(() => { process.exitCode = 2; });
}
