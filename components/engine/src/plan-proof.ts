import { readFileSync, realpathSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { digest } from "./core.ts";
import { readCheckRecord } from "./check-status.ts";
import { checkRunRoot } from "./check-run.ts";
import { observeCommand } from "./process-owner.ts";
import { ValidationSubject, readSubjectSource, resolveChangeScope, safeSubjectPath, worktreeBytes, type ChangeScope } from "./change-subject.ts";
import type { Packs } from "./pack-configuration.ts";
import type { Finding } from "./checker-results.ts";
import { resolveTaskContext, taskBindingReceipt } from "./decision-task-binding.ts";
import { decodePlanBytes, normalizedPlanContent, parseImplementationPlan, planBytesDigest, type ParsedImplementationPlan, type PlanItem } from "./implementation-plan.ts";

const runIdentity = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(value);
const proofDigest = (value: unknown): value is string => typeof value === "string" && /^sha256:[a-f0-9]{64}$/u.test(value);
const referenceText = (value: unknown, maximum: number): value is string => typeof value === "string" && Boolean(value.trim()) && value.length <= maximum && !value.includes("\0");
export const planCheckDeclarationDigest = (plan: ParsedImplementationPlan, item: PlanItem) => digest({ version: 1, item, specifications: plan.declaration.specifications });

/** Exact source comparisons tolerate parsed bookkeeping slots, never a new source/config/requirement change. */
function sameCandidate(root: string, directory: string, original: ChangeScope, current: ChangeScope, plan: ParsedImplementationPlan) {
  if (original.scope !== "changed" || !original.subject_digest || original.base_ref !== current.base_ref || Boolean(original.unborn) !== Boolean(current.unborn)) return false;
  if (original.records.length !== current.records.length) return false;
  const packet = readCheckRecord(join(directory, "packet/change-packet.json"));
  if (!packet || packet.subject_digest !== original.subject_digest || !Array.isArray(packet.records) || packet.records.length !== original.records.length) return false;
  const normalized = (scope: ChangeScope, captured: boolean) => scope.records.map((record, index) => {
    const sides = Object.fromEntries((["before", "after"] as const).map(side => {
      const source = record[side]; if (!source) return [side, null];
      const bytes = captured ? readFileSync(join(directory, "packet", `${index}-${side}.source`)) : readSubjectSource(root, source);
      if (captured && planBytesDigest(bytes).slice(7) !== (packet.records as Array<Record<string, unknown>>)[index]![`${side}_sha256`]) throw new Error("Original source snapshot changed");
      const normalized = record.path === plan.path && side === "after" && source.file_type === "regular" ? normalizedPlanContent(parseImplementationPlan(plan.path, decodePlanBytes(bytes))) : bytes;
      return [side, { file_type: source.file_type, digest: planBytesDigest(normalized) }];
    }));
    return { status: record.status, path: record.path, previous_path: record.previous_path, changed_ranges: record.path === plan.path ? [] : record.changed_ranges, ...sides };
  });
  return digest(normalized(original, true)) === digest(normalized(current, false));
}
function qualifiedInputs(command: Record<string, unknown>, subject: ValidationSubject, scope: ChangeScope, historical: boolean) {
  const manifest = command["input_manifest"];
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) return false;
  const input = manifest as Record<string, unknown>;
  if (input.version !== 1 || input.status !== "complete" || !Array.isArray(input.files) || !input.files.length) return false;
  const seen = new Set<string>();
  for (const entry of input.files) {
    if (!entry || typeof entry !== "object") return false;
    const file = entry as Record<string, unknown>;
    if (typeof file.path !== "string" || seen.has(file.path) || typeof file.sha256 !== "string" || !/^(?:sha256:)?[a-f0-9]{64}$/u.test(file.sha256)) return false;
    safeSubjectPath(file.path);
    seen.add(file.path);
  }
  if (historical) return true;
  // Explicit candidate scopes omit clean dependencies. Re-read their current input view, not the immutable comparison base.
  const staged = scope.mode === "staged" ? new ValidationSubject(subject.root, resolveChangeScope(subject.root, { staged: true, paths: [...seen] })) : null;
  for (const file of input.files as Array<{ path: string; sha256: string }>) {
    const current = staged ? { bytes: staged.read(file.path), type: "regular" } : worktreeBytes(subject.root, file.path);
    if (current.type !== "regular" || planBytesDigest(current.bytes).slice(7) !== file.sha256.replace(/^sha256:/u, "")) return false;
  }
  return true;
}
/** Read original check intent and native command owners. Summary JSON and caller-supplied paths cannot certify proof. */
export function qualifyPlanCheck(options: { plan: ParsedImplementationPlan; item: PlanItem; subject: ValidationSubject; scope: ChangeScope; packs: Packs; runId: string; runsRoot?: string; historical?: boolean }) {
  const { plan, item, subject, scope, packs, runId } = options;
  if (!item.check || !runIdentity(runId)) throw new Error("Original native check identity required");
  const directory = join(realpathSync(options.runsRoot ?? checkRunRoot()), runId);
  if (realpathSync(directory) !== directory) throw new Error("Original check directory must be canonical");
  const intent = readCheckRecord(join(directory, "run.json")), result = readCheckRecord(join(directory, "result.json")), dispatch = readCheckRecord(join(directory, "dispatch.json"));
  if (!intent || !result || intent.id !== runId || result.run_id !== runId || result.kind !== "project-governance-check-run" || result.version !== 1 || intent.version !== 1 || typeof intent.root !== "string" || (!options.historical && intent.root !== subject.root) || result.status !== "passed" || result.termination_reason !== "completed" || digest(result.plan) !== digest(intent.plan) || (!options.historical && intent.packs_digest !== digest(JSON.parse(JSON.stringify(packs))))) throw new Error("Check proof is failed, unrelated or incomplete");
  if (!options.historical && !sameCandidate(subject.root, directory, intent.scope as ChangeScope, scope, plan)) throw new Error("Check candidate inputs are stale or unqualified");
  let historicalLimit: "original-plan-unreachable" | undefined;
  if (options.historical) {
    const captured = intent.scope as ChangeScope, index = captured.records.findIndex(record => record.path === plan.path);
    // A sibling checkout may lack the original Git objects. Portable references bind declarations
    // separately; inspect a retained plan snapshot whenever one exists, without reading sibling files.
    if (index >= 0 || intent.root === subject.root) {
      let bytes: Buffer | undefined;
      try { bytes = index >= 0 ? readFileSync(join(directory, "packet", `${index}-after.source`)) : new ValidationSubject(subject.root, captured).read(plan.path); }
      catch (error) {
        // Missing local Git history differs from a conflicting retained snapshot or unreadable store.
        let missingBase = false;
        if (index < 0 && captured.base_ref && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(captured.base_ref)) {
          try { missingBase = execFileSync("git", ["cat-file", "--batch-check=%(objectname) %(objecttype)"], {
            cwd: subject.root, input: `${captured.base_ref}\n`, encoding: "utf8", timeout: 1000, maxBuffer: 4096,
            stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_NO_REPLACE_OBJECTS: "1" },
          }) === `${captured.base_ref} missing\n`; } catch { /* Unqualified Git failures remain blocking. */ }
        }
        if (!missingBase) throw error;
        historicalLimit = "original-plan-unreachable";
      }
      if (bytes) {
        const original = parseImplementationPlan(plan.path, decodePlanBytes(bytes));
        const declared = original.declaration.batches.flatMap(batch => batch.items).find(entry => entry.id === item.id);
        if (!declared || digest(declared) !== digest(item) || digest(original.declaration.specifications) !== digest(plan.declaration.specifications)) throw new Error("Retained proof belongs to a different check or specification declaration");
      }
    }
  }
  const execution = intent.plan as { stage: string; status: string; execution_order: string[] };
  if (execution.stage !== item.check.stage || execution.status !== "ready" || !Array.isArray(result.results) || !result.blocked || Object.keys(result.blocked).length) throw new Error("Check stage or completion mismatch");
  const current = options.historical ? { taskId: null, revision: null } : taskBindingReceipt(resolveTaskContext(subject.root));
  const binding = dispatch?.taskBinding as Record<string, unknown> | undefined;
  if (!options.historical && binding?.status === "bound" && !current.taskId && !item.check.task_id) throw new Error("Current task binding is unavailable for task-bound proof");
  const originalTask = options.historical && binding?.status === "bound" && typeof binding.taskId === "string" && typeof binding.revision === "string"
    ? { taskId: binding.taskId, revision: binding.revision } : null;
  const taskId = item.check.task_id ?? current.taskId ?? originalTask?.taskId, taskRevision = item.check.task_revision ?? current.revision ?? originalTask?.revision;
  if (taskId && (!binding || binding.status !== "bound" || binding.taskId !== taskId || binding.revision !== taskRevision)) throw new Error("Check task identity or revision mismatch");
  if (current.taskId && (current.taskId !== taskId || current.revision !== taskRevision)) throw new Error("Current task binding changed");
  for (const id of item.check.packs) {
    if (!execution.execution_order.includes(id)) throw new Error("Required verification pack did not run");
    const completed = (result.results as Array<Record<string, unknown>>).filter(pack => pack.pack_id === id);
    if (completed.length !== 1 || completed[0]!.status !== "passed" || !Array.isArray(completed[0]!.commands) || !completed[0]!.commands.length) throw new Error("Verification pack is incomplete");
    const declared = (dispatch?.packs as Packs | undefined)?.[id] ?? packs[id]!;
    const commandIndices = declared.commands.flatMap((entry, index) => {
      const stages = entry && typeof entry === "object" ? (entry as Record<string, unknown>).stages : undefined;
      return !Array.isArray(stages) || !stages.length || stages.includes(item.check!.stage) ? [index] : [];
    });
    let applicable = false;
    for (const [position, raw] of (completed[0]!.commands as Array<Record<string, unknown>>).entries()) {
      if (raw.status !== "passed" && raw.status !== "not-applicable") throw new Error("Verification command did not pass");
      if (raw.process_failure || raw.integrity_failure) throw new Error("Verification command lacks qualified process evidence");
      if (raw.command_receipt) {
        const nativeDirectory = join(directory, digest(id).slice(7), `command-${commandIndices[position]}`);
        const request = readCheckRecord(join(nativeDirectory, "request.json"));
        if (!request) throw new Error("Native command intent unavailable");
        const observed = observeCommand(nativeDirectory, digest(request));
        if (observed.state !== "terminal" || !observed.receipt || observed.receipt.cleanup !== "confirmed" || observed.receipt.state !== "succeeded" || digest(observed.receipt) !== digest(raw.command_receipt) || !qualifiedInputs(raw, subject, scope, options.historical === true)) throw new Error("Native command cleanup or complete input evidence unavailable");
      } else if (declared.commands.some(entry => !entry || typeof entry !== "object" || !("builtin" in entry))) throw new Error("Custom check lacks native input proof");
      const lint = raw.lint_evidence as Record<string, unknown> | undefined;
      if (raw.status === "passed" && (declared.lint === undefined || lint && Number.isSafeInteger(lint.checked_count) && Number(lint.checked_count) > 0)) applicable = true;
    }
    if (!applicable) throw new Error("Required verification pack is not applicable or checked zero lint files");
  }
  return { kind: "native-check", run_id: runId, result_digest: digest(result), subject_digest: intent.scope && (intent.scope as ChangeScope).subject_digest, stage: item.check.stage, packs: item.check.packs,
    declaration_digest: planCheckDeclarationDigest(plan, item), task_id: taskId ?? null, task_revision: taskRevision ?? null,
    ...(historicalLimit ? { historical_limit: historicalLimit } : {}),
    limits: "Executed declared checks; built-in claims use the original check-run result. Product acceptance and current candidate freshness remain separate." };
}

/** Portable history binds declarations; unavailable local originals cannot certify a new completion. */
export function historicalPlanProofFindings(options: { plan: ParsedImplementationPlan; item: PlanItem; reference: unknown; subject: ValidationSubject; scope: ChangeScope; packs: Packs; runsRoot?: string }): Finding[] {
  const { plan, item, reference, subject } = options;
  const failure = (message: string): Finding[] => [{ rule_id: "implementation-plan.proof-invalid", severity: "blocking", path: plan.path, item_id: item.id, message }];
  const unavailable = (reason: string): Finding[] => [{ rule_id: "implementation-plan.historical-proof-unavailable", severity: "advisory", path: plan.path, item_id: item.id, reason,
    message: "Original check proof is unavailable for this workspace. Recorded historical metadata matches the check and specification declarations; it does not establish current candidate freshness." }];
  if (!item.check || !reference || typeof reference !== "object" || Array.isArray(reference)) return failure("Completed verification has no valid original native check reference.");
  const retained = reference as Record<string, unknown>;
  if (retained.kind !== "native-check" || !runIdentity(retained.run_id) || !proofDigest(retained.result_digest) || !proofDigest(retained.subject_digest) || !proofDigest(retained.declaration_digest) ||
      retained.declaration_digest !== planCheckDeclarationDigest(plan, item) || !referenceText(retained.stage, 100) || retained.stage !== item.check.stage ||
      !Array.isArray(retained.packs) || retained.packs.some(value => !referenceText(value, 100)) || digest(retained.packs) !== digest(item.check.packs) ||
      !((retained.task_id === null && retained.task_revision === null) || (referenceText(retained.task_id, 200) && referenceText(retained.task_revision, 100))) ||
      (item.check.task_id !== undefined && (retained.task_id !== item.check.task_id || retained.task_revision !== item.check.task_revision)))
    return failure("Retained check reference is malformed or conflicts with the current check or specification declarations.");
  let directory: string;
  try {
    directory = join(realpathSync(options.runsRoot ?? checkRunRoot()), retained.run_id);
    if (realpathSync(directory) !== directory) return failure("Original check directory is not canonical.");
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT" ? unavailable("originals-missing") : failure("Original check store is unsafe or unreadable.");
  }
  try {
    const intent = readCheckRecord(join(directory, "run.json"));
    const result = readCheckRecord(join(directory, "result.json"));
    if (!intent || !result || digest(result) !== retained.result_digest) return failure("Retained native check originals are incomplete or conflict with the recorded result digest.");
    const proof = qualifyPlanCheck({ ...options, runId: retained.run_id, historical: true });
    for (const field of ["run_id", "result_digest", "subject_digest", "declaration_digest", "stage", "packs", "task_id", "task_revision"])
      if (digest(retained[field]) !== digest(proof[field as keyof typeof proof])) return failure("Retained native check originals conflict with the recorded historical reference.");
    return proof.historical_limit ? unavailable(proof.historical_limit) : intent.root !== subject.root ? unavailable("different-workspace") : [];
  } catch { return failure("Retained native check originals are conflicting, incomplete or unqualified."); }
}
