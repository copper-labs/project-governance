import { credentialEnvironment } from "./credential-environment.ts";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { digest, durableJson, fileDigest, object } from "./core.ts";
import { commandEnvironment, processFingerprint } from "./process-owner.ts";
import { ResourceRegistry } from "./resources.ts";
import { executeWorkflow } from "./workflow-executor.ts";
import { WorkflowStore, type WorkflowRun } from "./workflow-store.ts";
import { observePhysicalCleanup } from "./physical-cleanup.ts";
import { observeSimulatorCleanup } from "./simulator-cleanup.ts";
import { retainRuntimeReader, releaseRuntimeReader, type RuntimeReader } from "./runtime-reader.ts";

const WORKER = fileURLToPath(import.meta.url);
interface WorkerRequest {
  version: 1; database: string; runId: string; bindingDigest: string;
  registry: string; commandsDirectory: string; workerDigest: string;
  generation?: RuntimeReader | null;
}
export interface WorkerObservation {
  run: WorkflowRun; worker: "pending" | "alive" | "stopped" | "terminal";
}

/** Reserve dispatch once. A lost acknowledgment never authorizes another worker launch. */
export function dispatchWorkflow(database: string, runId: string, workersDirectory: string, registry: string): string {
  const store = new WorkflowStore(database);
  let run: WorkflowRun;
  try { run = store.read(runId); } finally { store.close(); }
  const directory = join(resolve(workersDirectory), run.id);
  const request: WorkerRequest = { version: 1, database: resolve(database), runId: run.id,
    bindingDigest: digest(run.binding), registry: resolve(registry), commandsDirectory: join(directory, "commands"), workerDigest: fileDigest(WORKER) };
  mkdirSync(dirname(directory), { recursive: true, mode: 0o700 });
  const existing = () => {
    const file = join(directory, "request.json");
    if (!existsSync(file)) throw new Error("workflow dispatch unresolved; reservation lacks a committed request");
    const captured = JSON.parse(readFileSync(file, "utf8")) as WorkerRequest;
    const { generation: _generation, ...identity } = captured;
    if (digest(identity) !== digest(request)) throw new Error("workflow dispatch identity conflict");
    return directory;
  };
  if (existsSync(directory)) return existing();
  if (run.state !== "queued") throw new Error("only a queued workflow can be dispatched");
  // Reject incompatible host state synchronously, before reserving a worker or retaining a runtime reader.
  const resources = new ResourceRegistry(registry); resources.close();
  const environment = { ...commandEnvironment({}), ...credentialEnvironment([...new Set(Object.values(run.binding.recipe.operations).flatMap(op => op.credentialEnv ?? []))]) };
  try { mkdirSync(directory, { mode: 0o700 }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    return existing();
  }
  request.generation = retainRuntimeReader(`workflow:${run.id}`);
  durableJson(join(directory, "request.json"), request);
  const child = spawn(process.execPath, [WORKER, "--worker", directory, digest(request)], {
    detached: true, stdio: "ignore", env: environment,
  });
  child.on("error", () => { /* Preserve uncertain dispatch; no retry can assume absence of effects. */ });
  child.unref();
  return directory;
}

/** The task database is authoritative. Worker liveness is observation, never success or cleanup proof. */
export function observeWorkflow(directory: string): WorkerObservation {
  const request = JSON.parse(readFileSync(join(directory, "request.json"), "utf8")) as WorkerRequest;
  const store = new WorkflowStore(request.database);
  let run: WorkflowRun;
  try { run = store.read(request.runId); } finally { store.close(); }
  if (digest(run.binding) !== request.bindingDigest) throw new Error("workflow binding changed");
  if (["succeeded", "failed", "cancelled", "blocked"].includes(run.state)) return { run, worker: "terminal" };
  const path = join(directory, "owner.json");
  if (!existsSync(path)) return { run, worker: "pending" };
  const ack = object(JSON.parse(readFileSync(path, "utf8")));
  if (ack["requestDigest"] !== digest(request)) throw new Error("workflow worker identity mismatch");
  return { run, worker: processFingerprint(Number(ack["pid"])) === ack["fingerprint"] ? "alive" : "stopped" };
}

async function worker(directory: string, expectedDigest: string): Promise<void> {
  const request = JSON.parse(readFileSync(join(directory, "request.json"), "utf8")) as WorkerRequest;
  if (request.version !== 1 || digest(request) !== expectedDigest || request.workerDigest !== fileDigest(WORKER)) throw new Error("workflow worker/request changed");
  const fingerprint = processFingerprint(process.pid);
  if (!fingerprint) throw new Error("workflow worker identity unavailable");
  durableJson(join(directory, "owner.json"), { requestDigest: expectedDigest, pid: process.pid, fingerprint });
  const store = new WorkflowStore(request.database);
  let registry: ResourceRegistry;
  try { registry = new ResourceRegistry(request.registry); }
  catch (error) {
    // No command or resource acquisition has occurred at this boundary. Preserve a bounded diagnostic.
    const message = error instanceof Error ? error.message : "";
    const reason = message.startsWith("RESOURCE_PROTOCOL_MIGRATION_REQUIRED:") ? "resource-protocol-migration-required"
      : message.startsWith("RESOURCE_PROTOCOL_INCOMPATIBLE:") ? "resource-protocol-incompatible" : "resource-registry-unavailable";
    try {
      durableJson(join(directory,"startup-failure.json"),{version:1,requestDigest:expectedDigest,reason,effects:"not-started"});
      store.blockUnstarted(request.runId,request.bindingDigest,reason);
      releaseRuntimeReader(request.generation ?? null);
    } finally {store.close();}
    process.exitCode=2;
    return;
  }
  const cancel = () => store.cancel(request.runId, "host:worker-signal");
  process.on("SIGTERM", cancel); process.on("SIGINT", cancel);
  try {
    if (digest(store.read(request.runId).binding) !== request.bindingDigest) throw new Error("workflow binding changed");
    await executeWorkflow(store, request.runId, { commandsDirectory: request.commandsDirectory, registry,
      // Unknown resource types remain held; supported device claims require host readback.
      observeCleanup: async (observedRun, leases) => {
        const resources = leases.map(lease => lease.resource);
        const observation = await observeSimulatorCleanup(resources) ?? await observePhysicalCleanup(resources);
        if (!observation) return null;
        const receipt = { runId: observedRun.id, bindingDigest: request.bindingDigest, leases, observation };
        // Preserve actual readback before permitting the registry to release these generations.
        durableJson(join(directory, "resource-cleanup.json"), receipt);
        return digest(receipt);
      } });
    const completed = store.read(request.runId);
    if (["succeeded", "failed", "cancelled", "blocked"].includes(completed.state) &&
        !registry.inspect().some(lease => lease.operation === request.runId && lease.state === "held")) {
      releaseRuntimeReader(request.generation ?? null);
    }
  } catch {
    const run = store.read(request.runId);
    if (run.owner && run.state === "running") store.transition(run.id, run.owner, run.revision, "unknown");
    process.exitCode = 2;
  } finally {
    process.off("SIGTERM", cancel); process.off("SIGINT", cancel);
    registry.close(); store.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href && process.argv[2] === "--worker") {
  worker(process.argv[3]!, process.argv[4]!).catch(() => { process.exitCode = 2; });
}
