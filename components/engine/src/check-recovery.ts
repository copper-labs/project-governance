import { existsSync, readdirSync, realpathSync, statSync } from "node:fs";
import { join } from "node:path";
import { commandProcesses, hasConfirmedCommandCleanup } from "./command-owner-recovery.ts";
import { reconcileCommand } from "./command-recovery.ts";
import { checkRunRoot } from "./check-run.ts";
import { readCheckRecord } from "./check-status.ts";
import { digest, durableJson, object } from "./core.ts";
import { observeCommand } from "./process-owner.ts";
import { releaseRuntimeReader, type RuntimeReader } from "./runtime-reader.ts";
import { RuntimeGenerations } from "./runtime-generations.ts";

export class CheckRecoveryRefusal extends Error {}

/** Release a stopped terminal check's exact reservation, without replaying work or rewriting its result. */
export function reconcileCheckRun(id: string, options: { root?: string; workspace?: string } = {}) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(id)) throw new CheckRecoveryRefusal("Invalid check run id");
  const root = realpathSync(options.root ?? checkRunRoot()), directory = join(root, id);
  if (!existsSync(directory)) throw new CheckRecoveryRefusal("Check run is unavailable");
  if (realpathSync(directory) !== directory) throw new CheckRecoveryRefusal("Check recovery directory uses an alias");
  const workspace = realpathSync(options.workspace ?? process.cwd());
  const read = (name: string) => {
    const value = readCheckRecord(join(directory, name));
    if (!value) throw new CheckRecoveryRefusal(`Check recovery requires ${name}`);
    return value;
  };
  // The existing registry reconciler is transactional and replay-safe. No crash-prone outer lock.
  {
    const work = read("dispatch.json"), intent = read("run.json"), result = read("result.json");
    if (!intent.owner) throw new CheckRecoveryRefusal("Check worker ownership has not been established");
    const plan = object(work.plan), owner = object(intent.owner);
    if (work.version !== 1 || work.id !== id || work.runsRoot !== root || work.root !== workspace ||
        intent.version !== 1 || intent.id !== id || intent.root !== workspace ||
        digest(intent.plan) !== digest(plan) || digest(intent.scope) !== digest(work.scope) || intent.packs_digest !== digest(work.packs) ||
        result.version !== 1 || result.run_id !== id || result.run_directory !== directory || digest(result.plan) !== digest(plan) ||
        !["passed", "warning", "failed"].includes(String(result.status)) || !Array.isArray(result.results) ||
        !Array.isArray(plan.execution_order) || plan.execution_order.some(value => typeof value !== "string") ||
        !Number.isSafeInteger(owner.pid) || Number(owner.pid) < 2 || typeof owner.fingerprint !== "string" || !owner.fingerprint)
      throw new CheckRecoveryRefusal("Terminal check recovery binding differs");
    const reader = work.generation === null ? null : object(work.generation) as unknown as RuntimeReader;
    if (reader && (reader.owner !== `check:${id}` || !Number.isSafeInteger(reader.revision) || reader.revision < 1 ||
        typeof reader.token !== "string" || !reader.token || typeof reader.registry !== "string" ||
        !existsSync(reader.registry) || typeof reader.directory !== "string" || !existsSync(reader.directory)))
      throw new CheckRecoveryRefusal("Check runtime reservation mismatch");
    if (reader) {
      const generations = new RuntimeGenerations(reader.registry);
      try {
        const state = generations.state(), held = state.readers.find(row => row.token === reader.token);
        if (held && (held.owner !== reader.owner || held.revision !== reader.revision ||
            state.revision !== reader.revision || state.directory !== reader.directory))
          throw new CheckRecoveryRefusal("Check runtime reader ownership mismatch");
      } finally { generations.close(); }
    }
    const absent = () => {
      // A reused PID also refuses recovery; lack of a matching fingerprint is not absence proof.
      if (commandProcesses().some(row => row.pid === owner.pid)) throw new CheckRecoveryRefusal("Check worker is present or its PID was reused");
    };
    absent();
    const expected = new Map<string, string>();
    for (const rawPack of result.results) {
      const pack = object(rawPack);
      if (!plan.execution_order.includes(pack.pack_id) || !Array.isArray(pack.commands)) throw new CheckRecoveryRefusal("Invalid terminal check pack");
      for (const rawCommand of pack.commands) {
        const command = object(rawCommand);
        if (command.request_digest === undefined) {
          if (command.command_receipt) throw new CheckRecoveryRefusal("Native command identity missing");
          continue;
        }
        const hash = String(command.request_digest);
        if (!/^sha256:[a-f0-9]{64}$/u.test(hash) || expected.has(hash) ||
            (command.command_receipt && object(command.command_receipt).requestDigest !== hash)) throw new CheckRecoveryRefusal("Native command identity mismatch");
        expected.set(hash, String(pack.pack_id));
      }
    }
    const commands: Array<{ directory: string; requestDigest: string; receiptDigest: string }> = [];
    const packDirectories = new Map((plan.execution_order as string[]).map(pack => [digest(pack).slice(7), pack]));
    for (const name of readdirSync(directory)) {
      if (!/^[a-f0-9]{64}$/u.test(name)) continue;
      const pack = packDirectories.get(name), path = join(directory, name);
      if (!pack || realpathSync(path) !== path || !statSync(path).isDirectory()) throw new CheckRecoveryRefusal("Unbound check command directory");
      for (const child of readdirSync(path).filter(name => /^command-\d+$/u.test(name))) {
        const commandDirectory = join(path, child);
        if (realpathSync(commandDirectory) !== commandDirectory) throw new CheckRecoveryRefusal("Command recovery directory uses an alias");
        const request = readCheckRecord(join(commandDirectory, "request.json"));
        if (!request || request.version !== 1 || request.id !== `${id}:${pack}:${child.slice(8)}` ||
            object(request.operation).cwd !== workspace) throw new CheckRecoveryRefusal("Original check command binding differs");
        const hash = digest(request), observed = observeCommand(commandDirectory, hash);
        if (expected.get(hash) !== pack || commands.some(command => command.requestDigest === hash)) throw new CheckRecoveryRefusal("Unbound native command");
        if (observed.state !== "terminal" || !observed.receipt || !hasConfirmedCommandCleanup(commandDirectory, observed.receipt))
          throw new CheckRecoveryRefusal("Confirmed native command cleanup required");
        commands.push({ directory: commandDirectory, requestDigest: hash, receiptDigest: digest(observed.receipt) });
      }
    }
    if (commands.length !== expected.size) throw new CheckRecoveryRefusal("Native command evidence is missing");
    const records = { "dispatch.json": digest(work), "run.json": digest(intent), "result.json": digest(result) };
    const unchanged = () => {
      absent();
      for (const [name, hash] of Object.entries(records)) if (digest(read(name)) !== hash) throw new CheckRecoveryRefusal("Check recovery evidence changed");
      for (const command of commands) if (digest(observeCommand(command.directory, command.requestDigest).receipt) !== command.receiptDigest)
        throw new CheckRecoveryRefusal("Command receipt changed during check recovery");
    };
    unchanged();
    for (const command of commands) reconcileCommand(command.directory, command.requestDigest);
    unchanged();
    const recovery = { version: 1, kind: "project-governance-check-reader-recovery", run_id: id, workspace,
      records, worker: owner, cleanup: "confirmed", commands, reader, original_status: result.status };
    const retained = readCheckRecord(join(directory, "reader-recovery.json"));
    if (retained && digest(retained) !== digest(recovery)) throw new CheckRecoveryRefusal("Check recovery receipt differs");
    if (!retained) durableJson(join(directory, "reader-recovery.json"), recovery);
    releaseRuntimeReader(reader, true);
    return { state: "reconciled", run_id: id, original_status: result.status, cleanup: "confirmed",
      commands: commands.length, receipt: { path: join(directory, "reader-recovery.json"), digest: digest(recovery) } };
  }
}
