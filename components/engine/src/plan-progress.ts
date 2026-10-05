import { closeSync, constants, fchmodSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { canonical } from "./core.ts";
import { worktreeBytes, ValidationSubject, resolveChangeScope, type ChangeScope } from "./change-subject.ts";
import type { Packs } from "./pack-configuration.ts";
import { decodePlanBytes, implementationPlanFindings, normalizedPlanContent, parseImplementationPlan, type ParsedImplementationPlan } from "./implementation-plan.ts";
import { qualifyPlanCheck } from "./plan-proof.ts";

export function inspectImplementationBatch(plan: ParsedImplementationPlan, batchId: string) {
  const batch = plan.declaration.batches.find(batch => batch.id === batchId);
  if (!batch) throw new Error("Unknown implementation batch");
  return { version: 1, path: plan.path, plan_digest: plan.digest, batch: batch.id, depends_on: batch.depends_on,
    items: batch.items.map(item => ({ ...item, completed: plan.slots.get(item.id)!.completed, evidence: plan.slots.get(item.id)!.evidence })), acceptance: "caller-declared; verification proves only its named checks" };
}
export interface PlanProgressRequest { version: 1; expected_digest: string; batch: string; updates: Array<{ id: string; completed: boolean; run_id?: string; reason?: string }> }

/** Participating writers serialize one compare-and-swap. A crashed claim is a visible refusal, never silently stolen. */
export function updateImplementationProgress(options: { subject: ValidationSubject; scope: ChangeScope; packs: Packs; path: string; request: PlanProgressRequest; runsRoot?: string }) {
  const { packs, path, request } = options;
  // Re-capture now, not at command dispatch. A producer can change source while a check runs.
  const initialScope = options.scope;
  const scope = resolveChangeScope(options.subject.root, initialScope.mode === "all" ? { all: true } : initialScope.mode === "staged" ? { staged: true } : {
    baseRef: initialScope.base_ref ?? "HEAD", ...(initialScope.mode === "explicit" ? { paths: initialScope.records.flatMap(record => record.previous_path ? [record.path, record.previous_path] : [record.path]) } : {}),
  });
  const subject = new ValidationSubject(options.subject.root, scope);
  if (Object.keys(request).some(key => !["version", "expected_digest", "batch", "updates"].includes(key)) || request.version !== 1 || !/^sha256:[a-f0-9]{64}$/u.test(request.expected_digest) || !Array.isArray(request.updates) || !request.updates.length || request.updates.some(update => !update || typeof update !== "object" || Object.keys(update).some(key => !["id", "completed", "run_id", "reason"].includes(key))) || new Set(request.updates.map(item => item.id)).size !== request.updates.length) throw new Error("Invalid progress update");
  const initial = worktreeBytes(subject.root, path);
  if (initial.type !== "regular") throw new Error("Plan must be an ordinary repository file");
  const plan = parseImplementationPlan(path, decodePlanBytes(initial.bytes));
  const captured = parseImplementationPlan(path, decodePlanBytes(subject.read(path)));
  if (normalizedPlanContent(captured) !== normalizedPlanContent(plan)) throw new Error("Live plan differs from the selected candidate; only bookkeeping slots may differ");
  const batch = plan.declaration.batches.find(batch => batch.id === request.batch);
  if (!batch || request.updates.some(update => !batch.items.some(item => item.id === update.id) || typeof update.completed !== "boolean")) throw new Error("Unknown or invalid progress item");
  const findings = implementationPlanFindings(subject, path, packs);
  if (findings.length) throw new Error("Plan check declarations or specification references are unresolved");
  const repeated = request.updates.every(update => {
    const slot = plan.slots.get(update.id)!;
    return slot.completed === update.completed && slot.evidence.some(entry => entry && typeof entry === "object" && (entry as Record<string, unknown>).request && canonical((entry as Record<string, unknown>).request) === canonical({ expected_digest: request.expected_digest, ...update }));
  });
  if (repeated) return { status: "unchanged", ...inspectImplementationBatch(plan, batch.id) };
  if (plan.digest !== request.expected_digest) throw new Error("Plan changed; inspect the selected batch before retrying");
  const future = new Map([...plan.slots].map(([id, slot]) => [id, slot.completed]));
  request.updates.forEach(update => future.set(update.id, update.completed));
  const patches: Array<{ start: number; end: number; text: string }> = [];
  for (const update of request.updates) {
    const slot = plan.slots.get(update.id)!, item = slot.item;
    if (update.completed && (item.requires.some(id => !future.get(id)) || batch.depends_on.some(id => plan.declaration.batches.find(batch => batch.id === id)!.items.some(item => !future.get(item.id))))) throw new Error("Implementation prerequisite is incomplete");
    if (update.completed && item.kind === "closeout" && batch.items.some(item => item.kind !== "closeout" && !future.get(item.id))) throw new Error("Closeout requires completed implementation and declared verification");
    if (!update.completed && (!update.reason?.trim() || update.reason.length > 1000)) throw new Error("Invalidation needs a bounded reason");
    if (item.kind !== "verification" && update.run_id) throw new Error("Only verification items bind native check runs");
    const proof = update.completed && item.kind === "verification" ? qualifyPlanCheck({ plan, item, subject, scope, packs, runId: update.run_id ?? "", ...(options.runsRoot ? { runsRoot: options.runsRoot } : {}) }) : { kind: update.completed ? "caller-declaration" : "invalidation", ...(update.reason ? { reason: update.reason } : {}) };
    const evidence = [...slot.evidence, { ...proof, request: { expected_digest: request.expected_digest, ...update } }];
    patches.push({ start: slot.stateOffset, end: slot.stateOffset + 1, text: update.completed ? "x" : " " }, { start: slot.evidenceStart, end: slot.evidenceEnd, text: JSON.stringify(evidence) });
  }
  // A caller cannot invalidate a prerequisite while leaving dependent completion green.
  for (const batch of plan.declaration.batches) for (const item of batch.items) if (future.get(item.id) && (
    item.requires.some(id => !future.get(id)) || batch.depends_on.some(id => plan.declaration.batches.find(batch => batch.id === id)!.items.some(item => !future.get(item.id))) ||
    item.kind === "closeout" && batch.items.some(other => other.kind !== "closeout" && !future.get(other.id)))) throw new Error("Dependent item must be invalidated with its prerequisite");
  const next = patches.sort((a, b) => b.start - a.start).reduce((text, patch) => text.slice(0, patch.start) + patch.text + text.slice(patch.end), plan.content);
  const absolute = join(subject.root, path), claim = `${absolute}.progress.lock`, temporary = `${absolute}.${randomUUID()}.tmp`;
  mkdirSync(claim, { mode: 0o700 });
  try {
    const original = lstatSync(absolute);
    if (!original.isFile() || original.isSymbolicLink() || !worktreeBytes(subject.root, path).bytes.equals(initial.bytes)) throw new Error("Concurrent plan edit refused");
    const fd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, original.mode & 0o777);
    try { writeFileSync(fd, next, "utf8"); fchmodSync(fd, original.mode & 0o777); fsyncSync(fd); } finally { closeSync(fd); }
    if (!readFileSync(absolute).equals(initial.bytes)) throw new Error("Concurrent plan edit refused");
    renameSync(temporary, absolute);
    const directory = openSync(dirname(absolute), "r"); try { fsyncSync(directory); } finally { closeSync(directory); }
  } finally {
    try { unlinkSync(temporary); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    rmdirSync(claim);
  }
  return { status: "updated", ...inspectImplementationBatch(parseImplementationPlan(path, next), batch.id) };
}
