import { existsSync, constants, closeSync, fstatSync, openSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { digest, object } from "./core.ts";
import { observeCommand, processFingerprint } from "./process-owner.ts";
import { checkRunRoot } from "./check-run.ts";

function readRecord(path: string): Record<string, unknown> | null {
  let fd: number;
  try { fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  try { const stat = fstatSync(fd); if (!stat.isFile() || stat.size > 16 * 1024 * 1024) throw new Error("Invalid run record"); return object(JSON.parse(readFileSync(fd, "utf8"))); }
  finally { closeSync(fd); }
}
/** Observation reports partial native evidence without retrying work or inferring completion from a dead caller. */
export function inspectCheckRun(id: string, root = checkRunRoot()) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(id)) throw new Error("Invalid check run id");
  const directory = join(root, id), intent = readRecord(join(directory, "run.json"));
  if (!intent || intent["id"] !== id || intent["version"] !== 1) throw new Error("Run intent unavailable or invalid");
  const result = readRecord(join(directory, "result.json"));
  if (result) {
    if (result["run_id"] !== id || !["passed", "warning", "failed"].includes(String(result["status"]))) throw new Error("Run result identity mismatch");
    return { run_id: id, state: "terminal", status: result["status"], result };
  }
  const commands: Array<Record<string, unknown>> = [];
  const plan = object(intent["plan"]), order = plan["execution_order"];
  if (!Array.isArray(order) || order.some(value => typeof value !== "string")) throw new Error("Invalid persisted plan");
  for (const pack of order as string[]) {
    const packDirectory = join(directory, digest(pack).slice(7));
    let names: string[];
    try { names = readdirSync(packDirectory); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") continue; throw error; }
    for (const name of names.filter(name => /^command-[0-9]+$/u.test(name)).sort()) {
      const commandDirectory = join(packDirectory, name), request = readRecord(join(commandDirectory, "request.json"));
      if (!request) { commands.push({ pack_id: pack, command: name, state: "outcome-unknown" }); continue; }
      const observation = observeCommand(commandDirectory, digest(request));
      commands.push({ pack_id: pack, command: name, ...observation });
    }
  }
  const owner = intent["owner"] && typeof intent["owner"] === "object" ? object(intent["owner"]) : {};
  const pid = Number(owner["pid"]), fingerprint = owner["fingerprint"];
  const active = Number.isSafeInteger(pid) && pid > 0 && typeof fingerprint === "string" && processFingerprint(pid) === fingerprint;
  const failure = readRecord(join(directory, "failure.json"));
  if (failure && failure["id"] !== id) throw new Error("Run failure identity mismatch");
  const queued = intent["state"] === "queued" && intent["owner"] === null && !failure && !existsSync(join(directory, "worker.claim"));
  return { run_id: id, state: active ? "running" : queued ? "queued" : "incomplete", status: "outcome-unknown", orchestrator_failure: failure, commands };
}
