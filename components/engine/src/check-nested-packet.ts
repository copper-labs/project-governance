/** Verify the bound large-packet parent before preparing a nested dependency check. */
import { assertExactPacketComparison, type ExactPacketComparison } from "./change-packet.ts";
import { createHash } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join } from "node:path";
import { subjectDigest, worktreeBytes, type ChangeScope } from "./change-subject.ts";
import { readCheckRecord } from "./check-status.ts";
import { digest } from "./core.ts";
import { processLiveFingerprint } from "./process-owner.ts";
import { runtimeExecutionIdentity } from "./runtime-execution-identity.ts";

export const LARGE_PACKET_PARENT_ENV = "PROJECT_GOVERNANCE_LARGE_IMMUTABLE_PARENT";

/** A native dependency child can use its live hook’s immutable subject and existing packet limits. */
export function nestedImmutablePacket(root: string, selection: {
  trigger: string; packs: string[]; stage: string | null; mode: string;
  paths: string[]; staged?: boolean; baseRef?: string; candidateRef?: string; detached: boolean;
}, env = process.env): { scope: ChangeScope; deadlineAt: number; candidateRef?: string; runId: string; largeImmutable: boolean; exactComparison?: ExactPacketComparison } | null {
  const id = env[LARGE_PACKET_PARENT_ENV];
  if (id === undefined || selection.trigger !== "manual" ||
      selection.packs.length !== 1 || selection.packs[0] !== "dependencies") return null;
  const invalid = () => new Error("Nested dependency check requires its exact live immutable parent");
  const path = env.PROJECT_GOVERNANCE_CHANGE_PACKET;
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(id) || env.PROJECT_GOVERNANCE_RUN_ID !== id ||
      env.PROJECT_GOVERNANCE_ROOT !== root || !path || !isAbsolute(path) || realpathSync(path) !== path ||
      selection.detached || selection.mode !== "impacted" || selection.paths.length) throw invalid();
  const directory = dirname(dirname(path));
  if (basename(directory) !== id || path !== join(directory, "packet/change-packet.json") ||
      basename(dirname(directory)) !== "check-runs" || basename(dirname(dirname(directory))) !== "project-governance") throw invalid();
  const dispatch = readCheckRecord(join(directory, "dispatch.json"));
  const intent = readCheckRecord(join(directory, "run.json"));
  const owner = intent?.owner as { pid?: number; fingerprint?: string } | undefined;
  const deadlineAt = dispatch?.deadlineAt;
  const runtime = runtimeExecutionIdentity();
  if (!dispatch || !intent || dispatch.id !== id || intent.id !== id || dispatch.version !== 1 || intent.version !== 1 ||
      dispatch.root !== root || intent.root !== root || dispatch.trigger !== "hook" || intent.trigger !== "hook" ||
      intent.state !== "running" || intent.runtimeVersion !== runtime.runtimeVersion ||
      intent.archiveDigest !== runtime.archiveDigest || !owner?.pid || !owner.fingerprint || processLiveFingerprint(owner.pid) !== owner.fingerprint ||
      existsSync(join(directory, "result.json")) || existsSync(join(directory, "failure.json")) ||
      typeof deadlineAt !== "number" || !Number.isSafeInteger(deadlineAt) || deadlineAt <= Date.now()) throw invalid();
  const scope = dispatch.scope as ChangeScope;
  const largeImmutable = dispatch.largeImmutablePacket === true;
  if (scope?.scope !== "changed" || (!largeImmutable && !scope.candidate_tree) || scope.unborn || !scope.base_ref || !scope.subject_digest ||
      scope.subject_digest !== subjectDigest(scope.records) || digest(scope) !== digest(intent.scope) ||
      env.PROJECT_GOVERNANCE_SUBJECT_DIGEST !== scope.subject_digest) throw invalid();
  const exactComparison = dispatch.exactPacketComparison as ExactPacketComparison | undefined;
  if (digest(exactComparison ?? null) !== digest(intent.exact_packet_comparison ?? null)) throw invalid();
  if (exactComparison !== undefined) {
    if (dispatch.stage !== "pre-push" || !largeImmutable || !exactComparison || typeof exactComparison !== "object" ||
        Object.keys(exactComparison).sort().join(",") !== "base,candidate") throw invalid();
    assertExactPacketComparison(scope, exactComparison);
  }
  const { bytes, type } = worktreeBytes(dirname(path), basename(path));
  if (type !== "regular" || createHash("sha256").update(bytes).digest("hex") !== env.PROJECT_GOVERNANCE_CHANGE_PACKET_SHA256) throw invalid();
  const packet = JSON.parse(bytes.toString("utf8"));
  for (const key of ["kind", "version", "scope", "mode", "base_ref", "candidate_ref", "candidate_tree", "subject_digest"] as const)
    if (packet[key] !== scope[key]) throw invalid();
  if (dispatch.stage === "pre-commit" && scope.mode === "staged" && !scope.candidate_ref &&
      selection.stage === "pre-commit" && selection.staged === true && !selection.baseRef && !selection.candidateRef)
    return { scope, deadlineAt, runId: id, largeImmutable };
  if (dispatch.stage === "pre-push" && scope.mode === "changed" && scope.candidate_ref &&
      selection.stage === "pre-pr" && !selection.staged && selection.baseRef === scope.base_ref &&
      (!selection.candidateRef || selection.candidateRef === scope.candidate_ref))
    return { scope, deadlineAt, candidateRef: scope.candidate_ref, runId: id, largeImmutable, ...(exactComparison ? { exactComparison } : {}) };
  throw invalid();
}
