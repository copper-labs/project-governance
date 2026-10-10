import { closeSync, constants, existsSync, fstatSync, lstatSync, openSync, readSync, readdirSync, realpathSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { commandProcesses, hasConfirmedCommandCleanup } from "./command-owner-recovery.ts";
import { reconcileCommand } from "./command-recovery.ts";
import { checkRunRoot } from "./check-run.ts";
import { readCheckRecord } from "./check-status.ts";
import { digest, durableJson, fileDigest, object } from "./core.ts";
import { observeCommand } from "./process-owner.ts";
import { releaseRuntimeReader, type RuntimeReader } from "./runtime-reader.ts";
import { RuntimeGenerations } from "./runtime-generations.ts";
import { inspectRuntimeGeneration } from "./runtime-inspection.ts";
import { narrativeFile } from "./narrative-inputs.ts";
import { safeSubjectPath } from "./change-subject.ts";

export class CheckRecoveryRefusal extends Error {}

// This published generation guarantees packet publication before every checker. Version alone
// cannot establish that ordering for an old failure which discarded its preparation phase.
const LEGACY_PREPARATION = {
  runtimeVersion: "4.2.0",
  archiveDigest: "sha256:9ae75656aac95318a361fd6390689b52abdbe3adce881e2ec18caae81ae30abf",
  treeDigest: "sha256:7d404559ff4960fde1e67944cacc5be23b719f60fb98e6905c40c7c61522f00e",
  workerDigest: "sha256:df62feb9d9be20a2d8fd3e29cf55d0d6805fc8458e2e0793485fdd984a5382b4",
  sourceLimitBytes: 16 * 1024 * 1024,
} as const;

/** Hash only a bounded retained witness. No source body is persisted or delivered to a checker. */
function impossibleInput(workspace: string, source: Record<string, unknown>, deadline: number) {
  if (source.kind !== "worktree" || source.file_type !== "regular" || typeof source.path !== "string" ||
      typeof source.identity !== "string" || !/^sha256:[a-f0-9]{64}$/u.test(source.identity)) return null;
  let fd: number | undefined;
  try {
    const path = safeSubjectPath(source.path), ancestors = [workspace];
    for (const part of path.split("/").slice(0, -1)) ancestors.push(join(ancestors.at(-1)!, part));
    const directories = ancestors.map(path => ({ path, stat: lstatSync(path, { bigint: true }) }));
    if (directories.some(({ stat }) => !stat.isDirectory())) return null;
    fd = openSync(join(workspace, path), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const before = fstatSync(fd, { bigint: true }), maximum = 512 * 1024 * 1024;
    if (!before.isFile() || before.size <= BigInt(LEGACY_PREPARATION.sourceLimitBytes) || before.size > BigInt(maximum)) return null;
    const hash = createHash("sha256"), chunk = Buffer.alloc(64 * 1024); let bytes = 0;
    for (;;) {
      if (performance.now() >= deadline) return null;
      const length = readSync(fd, chunk, 0, Math.min(chunk.length, Number(before.size) - bytes + 1), null);
      if (!length) break;
      bytes += length; if (bytes > Number(before.size)) return null;
      hash.update(chunk.subarray(0, length));
    }
    const after = fstatSync(fd, { bigint: true });
    if (bytes !== Number(before.size) || before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs ||
        directories.some(({ path, stat }) => { const current = lstatSync(path, { bigint: true });
          return !current.isDirectory() || stat.dev !== current.dev || stat.ino !== current.ino || stat.mtimeNs !== current.mtimeNs || stat.ctimeNs !== current.ctimeNs; }) ||
        `sha256:${hash.digest("hex")}` !== source.identity) return null;
    return { source_kind: "worktree", path_digest: digest(path), identity: source.identity, size_bytes: bytes, limit_bytes: LEGACY_PREPARATION.sourceLimitBytes };
  } catch { return null; }
  finally { if (fd !== undefined) closeSync(fd); }
}

/** Resolve only an authenticated old preparation reservation; acceptance remains unknown. */
function reconcileStoppedPreparation(id: string, root: string, directory: string, workspace: string) {
  const read = (name: string) => {
    try {
      const bytes = narrativeFile(directory, name, 16 * 1024 * 1024);
      return { value: object(JSON.parse(bytes)), hash: `sha256:${createHash("sha256").update(bytes).digest("hex")}` };
    } catch { throw new CheckRecoveryRefusal("Stopped preparation evidence is unavailable or invalid"); }
  };
  const snapshots = { "dispatch.json": read("dispatch.json"), "run.json": read("run.json"), "failure.json": read("failure.json") };
  const work = snapshots["dispatch.json"].value, intent = snapshots["run.json"].value, failure = snapshots["failure.json"].value;
  const plan = object(work.plan), owner = object(intent.owner);
  const started = Date.parse(String(intent.started_at)), ended = Date.parse(String(failure.ended_at));
  if (work.version !== 1 || work.id !== id || work.runsRoot !== root || work.root !== workspace ||
      intent.version !== 1 || intent.id !== id || intent.root !== workspace || intent.state !== "running" ||
      digest(intent.plan) !== digest(plan) || digest(intent.scope) !== digest(work.scope) || intent.packs_digest !== digest(work.packs) ||
      intent.trigger !== work.trigger || !Array.isArray(plan.execution_order) || plan.execution_order.some(value => typeof value !== "string") ||
      failure.version !== 1 || failure.id !== id || failure.reason !== "worker-incomplete" ||
      Object.keys(failure).sort().join(",") !== "ended_at,id,reason,version" || !Number.isFinite(started) || !Number.isFinite(ended) || ended < started ||
      !Number.isSafeInteger(owner.pid) || Number(owner.pid) < 2 || typeof owner.fingerprint !== "string" || !owner.fingerprint)
    throw new CheckRecoveryRefusal("Stopped preparation recovery binding differs");
  const reader = object(work.generation) as unknown as RuntimeReader;
  if (reader.owner !== `check:${id}` || !Number.isSafeInteger(reader.revision) || reader.revision < 1 ||
      typeof reader.token !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(reader.token) ||
      typeof reader.registry !== "string" || !existsSync(reader.registry) || realpathSync(reader.registry) !== reader.registry ||
      typeof reader.directory !== "string" || !existsSync(reader.directory) || realpathSync(reader.directory) !== reader.directory)
    throw new CheckRecoveryRefusal("Stopped preparation runtime reservation mismatch");
  const verifyGeneration = () => {
    try {
      const original = inspectRuntimeGeneration(reader.directory);
      const worker = join(reader.directory, "node_modules/@organta/project-governance/dist/engine/src/check-worker.js");
      if (original.runtimeVersion !== LEGACY_PREPARATION.runtimeVersion || original.archiveDigest !== LEGACY_PREPARATION.archiveDigest ||
          original.installedTree.digest !== LEGACY_PREPARATION.treeDigest || work.workerDigest !== LEGACY_PREPARATION.workerDigest ||
          realpathSync(worker) !== worker || fileDigest(worker) !== work.workerDigest ||
          intent.runtimeVersion !== original.runtimeVersion || intent.archiveDigest !== original.archiveDigest)
        throw new Error("unsupported original identity");
    } catch { throw new CheckRecoveryRefusal("Stopped preparation requires the qualified original 4.2.0 generation"); }
  };
  verifyGeneration();
  const receiptName = "preparation-reader-recovery.json";
  const noEffects = () => {
    const allowed = new Set(["dispatch.json", "run.json", "failure.json", "worker.claim", receiptName]);
    if (readdirSync(directory).some(name => !allowed.has(name)))
      throw new CheckRecoveryRefusal("Stopped preparation has packet, command or unexpected evidence");
  };
  const claimIdentity = () => {
    let fd: number;
    try { fd = openSync(join(directory, "worker.claim"), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK); }
    catch { throw new CheckRecoveryRefusal("Stopped preparation requires the original worker claim"); }
    try {
      const claim = fstatSync(fd, { bigint: true });
      if (!claim.isFile() || claim.size !== 0n) throw new CheckRecoveryRefusal("Stopped preparation requires an empty regular worker claim");
      return digest({ dev: String(claim.dev), ino: String(claim.ino), mode: String(claim.mode), mtime: String(claim.mtimeNs), ctime: String(claim.ctimeNs) });
    } finally { closeSync(fd); }
  };
  const absent = () => {
    if (commandProcesses().some(row => row.pid === owner.pid)) throw new CheckRecoveryRefusal("Check worker is present or its PID was reused");
  };
  noEffects(); absent();
  // Even erased packet evidence cannot hide execution: this pinned identity was too large for
  // the original reader; any different or smaller bytes would instead fail its identity check.
  const scope = object(work.scope), changes = scope.records;
  if (!Array.isArray(changes)) throw new CheckRecoveryRefusal("Stopped preparation requires an impossible pinned input");
  let impossible: (NonNullable<ReturnType<typeof impossibleInput>> & { record: number; side: "before" | "after" }) | undefined;
  let witnessSource: Record<string, unknown> | undefined;
  const witnessDeadline = performance.now() + 5000;
  for (const [record, raw] of changes.entries()) {
    const change = object(raw);
    for (const side of ["before", "after"] as const) {
      if (!change[side] || typeof change[side] !== "object" || Array.isArray(change[side])) continue;
      const source = object(change[side]), witness = impossibleInput(workspace, source, witnessDeadline);
      if (witness) { impossible = { record, side, ...witness }; witnessSource = source; break; }
    }
    if (impossible || performance.now() >= witnessDeadline) break;
  }
  if (!impossible || !witnessSource) throw new CheckRecoveryRefusal("Stopped preparation requires an impossible pinned input");
  const boundSource = witnessSource, boundWitness = impossible;
  const records = Object.fromEntries(Object.entries(snapshots).map(([name, record]) => [name, record.hash]));
  records["worker.claim"] = claimIdentity();
  const recovery = { version: 1, kind: "project-governance-check-preparation-reader-recovery", run_id: id, workspace,
    records, worker: owner, original_identity: LEGACY_PREPARATION, impossible_input: boundWitness, cleanup: "confirmed", commands_started: false,
    reader, original_status: "outcome-unknown" };
  const retained = readCheckRecord(join(directory, receiptName));
  if (retained && digest(retained) !== digest(recovery)) throw new CheckRecoveryRefusal("Stopped preparation recovery receipt differs");
  const generations = new RuntimeGenerations(reader.registry);
  try {
    const reservation = () => {
      const state = generations.state(), held = state.readers.find(row => row.token === reader.token);
      if (held ? held.owner !== reader.owner || held.revision !== reader.revision || state.revision !== reader.revision || state.directory !== reader.directory : !retained)
        throw new CheckRecoveryRefusal("Stopped preparation runtime reader ownership mismatch");
    };
    const unchanged = () => {
      absent(); noEffects(); verifyGeneration(); reservation();
      const witness = impossibleInput(workspace, boundSource, performance.now() + 5000);
      if (!witness || digest({ record: boundWitness.record, side: boundWitness.side, ...witness }) !== digest(boundWitness))
        throw new CheckRecoveryRefusal("Stopped preparation pinned input changed");
      for (const [name, record] of Object.entries(snapshots)) if (read(name).hash !== record.hash)
        throw new CheckRecoveryRefusal("Stopped preparation evidence changed");
      if (claimIdentity() !== records["worker.claim"]) throw new CheckRecoveryRefusal("Stopped preparation worker claim changed");
      const receipt = readCheckRecord(join(directory, receiptName));
      if (receipt && digest(receipt) !== digest(recovery)) throw new CheckRecoveryRefusal("Stopped preparation recovery receipt differs");
    };
    unchanged();
    if (!retained) durableJson(join(directory, receiptName), recovery);
    unchanged();
    generations.releaseConfirmed(reader.token, reader.owner, reader.revision);
    return { state: "reconciled", run_id: id, original_status: "outcome-unknown", cleanup: "confirmed", commands: 0,
      receipt: { path: join(directory, receiptName), digest: digest(recovery) } };
  } finally { generations.close(); }
}

/** Release a proven stopped check's exact reservation, without replaying work or rewriting its result. */
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
    const work = read("dispatch.json"), intent = read("run.json"), result = readCheckRecord(join(directory, "result.json"));
    if (!result) return reconcileStoppedPreparation(id, root, directory, workspace);
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
