import { linkSync, lstatSync, mkdirSync, openSync, closeSync, fsyncSync, realpathSync, rmSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { Store } from "../../harness/src/store/store.ts";
import { defaultDbPath, workContext } from "../../harness/src/store/location.ts";
import type { LedgerEvent, Task } from "../../harness/src/model/types.ts";
import { digest, durableJson, fileDigest, object, text } from "./core.ts";
import { boundedOutcomeReader } from "./decision-outcomes.ts";
import { contextStateRoot } from "./context-command.ts";
import { providerEvaluationCost } from "./release-evaluation-cost.ts";
import { readReleaseEvaluation } from "./release-evaluation.ts";
import type { EvaluationReference } from "./release-evaluation-types.ts";

const hash = (value: unknown): value is string => typeof value === "string" && /^sha256:[a-f0-9]{64}$/u.test(value);
const list = (value: unknown, limit: number) => {
  if (!Array.isArray(value) || value.length > limit) throw new Error("Invalid selected evaluation list");
  return value;
};
const missing = (error: unknown) => ["ENOENT", "EACCES", "EPERM"].includes(String((error as NodeJS.ErrnoException)?.code));
const within = (root: string, path: string) => { const part = relative(root, path); return part === "" || part !== ".." && !part.startsWith("../") && !isAbsolute(part); };

/** Freeze explicitly selected task revisions and original evidence links; never infer an experimental arm or acceptance. */
export function captureReleaseEvaluation(workspace: string, requestPath: string, outputDirectory: string) {
  workspace = realpathSync(workspace); requestPath = resolve(requestPath); outputDirectory = resolve(outputDirectory);
  const parent = realpathSync(dirname(outputDirectory));
  if (parent !== dirname(outputDirectory) || within(workspace, outputDirectory) || !basename(outputDirectory) || lstatSync(outputDirectory, { throwIfNoEntry: false }))
    throw new Error("Evaluation capture requires a new directory outside the checkout with ordinary ancestors");
  const reader = boundedOutcomeReader(), request = reader.read(requestPath), requestDigest = reader.digestFor(requestPath)!;
  if (request.version !== 2 || Object.keys(request).some(key => !["version", "episodes", "evaluation"].includes(key)))
    throw new Error("Capture request reuses outcome manifest version two and its explicit evaluation extension");
  const originals = new Map<string, { reference: EvaluationReference; record: Record<string, unknown> | null }>();
  const reference = (raw: unknown) => {
    const value = object(raw), path = resolve(dirname(requestPath), text(value.path, "selected original path", 4096));
    if (!hash(value.digest)) throw new Error("Selected original requires its exact SHA256 digest");
    const prior = originals.get(path);
    if (prior) { if (prior.reference.digest !== value.digest) throw new Error("Conflicting selected original hashes"); return prior; }
    let record: Record<string, unknown> | null;
    try { record = reader.read(path, value.digest); } catch (error) { if (!missing(error)) throw error; record = null; }
    const result = { reference: { path, digest: value.digest }, record }; originals.set(path, result); return result;
  };
  let store: Store | undefined;
  const tips = new Map<string, Task>(), revisions = new Map<string, { task: Task; revisionEvent: LedgerEvent }>();
  let storeIdentity: { path: string; dev: number; ino: number; locator: string; repositoryId: string } | null = null;
  const taskStore = () => {
    if (!store) {
      const where = workContext(workspace), path = defaultDbPath(workspace), stat = lstatSync(path);
      if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(path) !== path) throw new Error("Canonical task store unavailable");
      store = new Store(path, { readOnly: true });
      storeIdentity = { path, dev: stat.dev, ino: stat.ino, locator: where.locator, repositoryId: store.repositoryId() };
    }
    return store;
  };
  const exactTask = (taskId: string, revision: number) => {
    const key = `${taskId}:${revision}`, prior = revisions.get(key); if (prior) return prior;
    const owner = taskStore(), task = owner.readTask(taskId, revision), revisionEvent = owner.taskRevisionEvent(taskId, revision);
    if (!task || !revisionEvent || task.worktree !== workspace) throw new Error("Task owner lineage missing or belongs to another worktree");
    const detail = object(revisionEvent.detail);
    if (detail.version !== revision || detail.status !== task.status || detail.supersedes !== task.supersedes ||
        task.status === "accepted" && (typeof detail.authorityRef !== "string" || !detail.authorityRef.trim()))
      throw new Error("Task revision lacks its exact original acceptance authority");
    const result = { task, revisionEvent }; revisions.set(key, result); return result;
  };
  const recheckTasks = () => {
    if (!store || !storeIdentity) return;
    const identity = storeIdentity, stat = lstatSync(identity.path);
    if (realpathSync(identity.path) !== identity.path || stat.dev !== identity.dev || stat.ino !== identity.ino ||
        workContext(workspace).locator !== identity.locator || store.repositoryId() !== identity.repositoryId)
      throw new Error("Task store identity changed during capture");
    for (const [id, tip] of tips) if (digest(store.readTask(id)) !== digest(tip)) throw new Error("Task revision changed during capture");
    for (const { task, revisionEvent } of revisions.values()) if (digest(store.readTask(task.taskId, task.version)) !== digest(task) ||
        digest(store.taskRevisionEvent(task.taskId, task.version)) !== digest(revisionEvent))
      throw new Error("Task revision provenance changed during capture");
  };
  try {
    const seen = new Set<string>();
    const episodes = list(request.episodes, 1000).map(raw => {
      const entry = object(raw), id = text(entry.id, "selected episode", 256);
      if (seen.has(id)) throw new Error("Duplicate selected episode"); seen.add(id);
      if (Object.keys(entry).some(key => !["id", "scope", "caller", "decisions", "decisionEvidence", "native", "labels", "observations", "evaluation", "assignment", "taskLineage"].includes(key)))
        throw new Error("Unknown selected episode field");
      const selected = structuredClone(entry), scope = entry.scope === null ? null : object(entry.scope);
      if (scope && (scope.workspace !== workspace || !/^[1-9][0-9]*$/u.test(String(scope.taskRevision)))) throw new Error("Selected episode scope differs from this checkout");
      const caller = reference(entry.caller); selected.caller = caller.reference;
      if (caller.record && (caller.record.version !== 1 || caller.record.id !== id || digest(caller.record.scope) !== digest(entry.scope)))
        throw new Error("Selected caller scope differs from episode");
      const extra = object(selected.evaluation), taskRefs: Array<{ kind: "task"; path: string; digest: string }> = [];
      if (!caller.record && (entry.taskLineage !== undefined || scope && list(extra.providerJobs ?? [], 64).length))
        throw new Error("Task lineage and scoped provider links require the selected original caller");
      if (entry.taskLineage !== undefined) {
        if (!scope) throw new Error("Task lineage requires an exact episode task scope");
        const lineage = object(entry.taskLineage), from = lineage.fromRevision, through = lineage.throughRevision;
        if (Object.keys(lineage).some(key => !["fromRevision", "throughRevision"].includes(key)) || !Number.isSafeInteger(from) || !Number.isSafeInteger(through) ||
            Number(from) < 1 || Number(through) < Number(from) || Number(through) - Number(from) >= 1000 || String(from) !== scope.taskRevision)
          throw new Error("Explicit task lineage must start at the selected revision");
        const taskId = text(scope.taskId, "selected task", 256), tip = taskStore().readTask(taskId);
        if (!tip || tip.version !== through || tip.worktree !== workspace) throw new Error("Explicit task lineage must end at the current exact owner revision");
        tips.set(taskId, tip);
        for (let version = Number(from); version <= Number(through); version++) {
          const captured = exactTask(taskId, version);
          if (version > Number(from) && captured.task.supersedes !== version - 1) throw new Error("Task owner lineage is not contiguous");
          const path = join(outputDirectory, "tasks", `${digest(taskId).slice(7, 39)}-${version}.json`);
          taskRefs.push({ kind: "task", path, digest: "" });
        }
      }
      selected.evaluation = { ...extra, evidence: list(extra.evidence ?? [], 256).map(rawRef => {
        const ref = object(rawRef); if (ref.kind === "task") throw new Error("Task evidence must come from explicit canonical taskLineage capture");
        return { ...ref, ...reference(ref).reference };
      }), providerJobs: list(extra.providerJobs ?? [], 64).map(rawJob => {
        const job = object(rawJob), requestRef = reference(job.request), resultRef = reference(job.result);
        if (requestRef.record && scope) {
          const binding = object(requestRef.record.decisionBinding ?? {}).task;
          const task: Record<string, unknown> | null = binding ? object(binding) : null;
          if (!task || task.workspace !== workspace || task.taskId !== scope.taskId ||
              !/^[1-9][0-9]*$/u.test(String(task.revision)) || entry.taskLineage === undefined ||
              Number(task.revision) < Number(object(entry.taskLineage).fromRevision) || Number(task.revision) > Number(object(entry.taskLineage).throughRevision))
            throw new Error("Selected provider job is not linked to this captured task lineage");
        }
        const selectedJob = { ...job, request: requestRef.reference, result: resultRef.reference };
        if (requestRef.record && resultRef.record) try {
          providerEvaluationCost(selectedJob, rawRef => {
            const capture = reference(rawRef); if (!capture.record) throw Object.assign(new Error("Selected provider artifact unavailable"), { code: "ENOENT" });
            return { reference: capture.reference, record: capture.record };
          });
        } catch (error) { if (!missing(error)) throw error; }
        return selectedJob;
      }) };
      selected.decisionEvidence = list(entry.decisionEvidence ?? [], 64).map(rawRef => { const ref = object(rawRef); return { ...ref, ...reference(ref).reference }; });
      const explicitDecisions = new Set((selected.decisionEvidence as Array<Record<string, unknown>>).map(ref => String(ref.receiptId)));
      if (list(entry.decisions, 64).some(id => typeof id !== "string" || !explicitDecisions.has(id))) throw new Error("Every selected decision needs an explicit original reference");
      selected.native = list(entry.native ?? [], 16).map(rawRef => { const ref = object(rawRef); return { ...ref, ...reference(ref).reference }; });
      if (list(object(selected.evaluation).evidence, 256).length + taskRefs.length > 256)
        throw new Error("Selected task lineage and evidence exceed the existing evaluation envelope; no revision was omitted");
      delete selected.taskLineage;
      return { selected, taskRefs };
    });
    recheckTasks();
    mkdirSync(outputDirectory, { mode: 0o700 });
    for (const { task, revisionEvent } of revisions.values()) durableJson(join(outputDirectory, "tasks", `${digest(task.taskId).slice(7, 39)}-${task.version}.json`), {
      version: 1, kind: "task-owner-capture", observedAt: new Date().toISOString(), repositoryId: storeIdentity!.repositoryId,
      workspace, task, revisionEvent });
    const manifest = { version: 2, evaluation: request.evaluation, episodes: episodes.map(({ selected, taskRefs }) => ({ ...selected,
      evaluation: { ...object(selected.evaluation), evidence: [...list(object(selected.evaluation).evidence, 256),
        ...taskRefs.map(ref => ({ ...ref, digest: fileDigest(ref.path) }))] } })),
      capture: { version: 1, request: { path: requestPath, digest: requestDigest }, taskStore: storeIdentity,
        originalsRequired: true, meaning: "Only selected task revisions are frozen here; original receipt paths and exact hashes remain required for later evaluation." } };
    const prepared = join(outputDirectory, "manifest.prepared.json"); durableJson(prepared, manifest);
    const report = readReleaseEvaluation(contextStateRoot(workspace), prepared);
    for (const capture of originals.values()) if (capture.record) boundedOutcomeReader().read(capture.reference.path, capture.reference.digest);
    boundedOutcomeReader().read(requestPath, requestDigest);
    recheckTasks();
    const path = join(outputDirectory, "manifest.json"); linkSync(prepared, path); rmSync(prepared);
    const fd = openSync(outputDirectory, "r"); try { fsyncSync(fd); } finally { closeSync(fd); }
    return { version: 1, status: "captured" as const, manifest: { path, digest: fileDigest(path) }, taskRevisions: revisions.size,
      originalReferences: originals.size, unavailableOriginals: [...originals.values()].filter(capture => capture.record === null).length,
      evaluation: { episodes: report.episodes.length, accepted: report.episodes.filter(episode => episode.acceptance === "accepted").length,
        reopened: report.episodes.filter(episode => episode.acceptance === "reopened").length, issues: report.issues.map(issue => ({ episode: issue.episode, code: issue.code })) },
      originalsRequired: true, acceptance: "read-only canonical task owner; never inferred from labels or checks", mutations: "new-output-directory-only" };
  } finally { store?.close(); }
}
