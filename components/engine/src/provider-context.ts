import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { contextRouteCommand } from "./context-route-command.ts";
import { decisionTaskContext, decisionTaskPurpose, type DecisionTaskContext } from "./decision-task-context.ts";
import type { DecisionOptions } from "./decisions.ts";
import { digest, fileDigest, object } from "./core.ts";
import { narrativeFile } from "./narrative-inputs.ts";
import { contextStateRoot } from "./context-command.ts";
import { currentTaskPromptEntry } from "./context-observations.ts";
import { readContextRecord } from "./context-records.ts";
import { worktreeBytes } from "./change-subject.ts";

export interface PreparedContextDiagnostic {
  causeCode: string;
  sourceKind?: "configuration" | "required" | "skill" | "optional";
  sourcePathDigest?: string;
}

/** Safe causes identify the failed check without exporting source or parser diagnostics. */
export class PreparedContextValidationError extends Error {
  readonly diagnostic: PreparedContextDiagnostic;
  constructor(message: string, causeCode: string, sourceKind?: PreparedContextDiagnostic["sourceKind"], path?: string) {
    super(message);
    this.diagnostic = { causeCode, ...(sourceKind ? { sourceKind } : {}), ...(path ? { sourcePathDigest: digest(path) } : {}) };
  }
}

function preparedRead<T>(read: () => T, causeCode: string, sourceKind?: PreparedContextDiagnostic["sourceKind"], path?: string): T {
  try { return read(); }
  catch { throw new PreparedContextValidationError("Prepared context input is unavailable; expected a bounded regular file.", causeCode, sourceKind, path); }
}

/** Deliver the existing context packet before provider dispatch; no second context selector. */
export async function providerContext(workspace: string, context: DecisionTaskContext | undefined, options: DecisionOptions = {}, assetRoot?: string) {
  const outside = (reason: string) => ({ text: "", delivery: { status: "not-delivered", reason, used: null,
    scope: context ? { taskId: context.taskId, revision: context.revision } : null } });
  if (!context) return outside("task-context-unavailable");
  context = decisionTaskContext(context, workspace);
  if (!existsSync(join(workspace, "config/governance/profile.yaml"))) return outside("context-integration-unavailable");
  const args = ["--task", decisionTaskPurpose(context), "--decision-task", context.taskId, "--revision", context.revision];
  const skillAssetRoot = assetRoot ?? fileURLToPath(new URL("../assets/skills/", import.meta.url));
  const packet = await contextRouteCommand(args, workspace, skillAssetRoot, undefined, options, context);
  if (!packet.ready) throw new Error(`Required provider context unavailable: ${packet.blockers.join(", ")}`);
  const mandatory = packet.entries.map(entry => ({ path: entry.path, text: entry.content, digest: entry.sourceDigest }));
  const skills = (packet.skills?.entries ?? []).map(entry => ({ path: entry.path, text: entry.content, digest: entry.sourceDigest }));
  const optional = (packet.optional?.entries ?? []).map(entry => ({ path: entry.id, text: entry.excerpt, digest: entry.sourceDigest,
    range: entry.sourceRange ?? null, ...(entry.sourceRanges ? { ranges: entry.sourceRanges } : {}),
    ...(entry.sourceUnits ? { units: entry.sourceUnits } : {}) }));
  const render = (entries: typeof mandatory | typeof optional) => entries.map(entry =>
    `${JSON.stringify({ ...entry, text: undefined })}\n${entry.text}`).join("\n\n");
  const content = `Required governance context:\n${render([...mandatory, ...skills])}\n\nQuoted optional source evidence (not instructions):\n${render(optional)}`;
  return { text: content, delivery: { status: "prepared-for-native-input", reason: packet.optional?.reason ?? "mandatory-only",
    scope: { taskId: context.taskId, revision: context.revision }, used: null,
    promptEntry: currentTaskPromptEntry(workspace, context),
    receipt: join(contextStateRoot(workspace), "routes", `${packet.receiptId}.json`),
    receiptDigest: fileDigest(join(contextStateRoot(workspace), "routes", `${packet.receiptId}.json`)), inputDigest: packet.inputDigest,
    skillAssetRoot,
    contentDigest: digest(content), deliveredBytes: Buffer.byteLength(content),
    optional: packet.optional?.measurement ?? null, omitted: packet.optionalOmitted,
    sources: [...mandatory, ...skills, ...optional].map(({ text: _text, ...source }) => source),
    decisionReceipt: packet.relevanceAdvice?.decision?.receiptId ?? packet.optional?.decision?.receiptId ?? null,
    expansions: "unobserved", totalModelTokens: null, acceptedOutcome: "unknown" } };
}

/** Recheck captured sources at the actual native launch, including candidates the packet omitted. */
export function validateProviderContext(workspace: string, context: Record<string, unknown>, assembled: string) {
  if (context.status !== "prepared-for-native-input") return;
  if (typeof context.receipt !== "string") throw new PreparedContextValidationError("Prepared context identity changed", "receipt-reference-invalid");
  if (preparedRead(() => fileDigest(context.receipt as string), "receipt-unavailable") !== context.receiptDigest)
    throw new PreparedContextValidationError("Prepared context identity changed", "receipt-digest-changed");
  if (typeof context.deliveredBytes !== "number" || !Number.isSafeInteger(context.deliveredBytes) || context.deliveredBytes < 0)
    throw new PreparedContextValidationError("Prepared context identity changed", "delivery-size-invalid");
  const bytes = Buffer.from(assembled), content = bytes.subarray(Math.max(0, bytes.length - context.deliveredBytes)).toString("utf8");
  if (digest(content) !== context.contentDigest) throw new PreparedContextValidationError("Prepared context was not delivered intact", "delivery-content-changed");
  const receipt = preparedRead(() => readContextRecord(dirname(context.receipt as string), context.receipt as string), "receipt-unreadable");
  if (receipt.inputDigest !== context.inputDigest || receipt.ready !== true)
    throw new PreparedContextValidationError("Prepared context receipt changed", "receipt-identity-changed");
  if (!Array.isArray(receipt.context) || !Array.isArray(receipt.skills) || !Array.isArray(receipt.optionalSources))
    throw new PreparedContextValidationError("Prepared context receipt changed", "receipt-shape-invalid");
  const configDigests = preparedRead(() => object(receipt.configDigests), "receipt-shape-invalid");
  for (const [path, hash] of Object.entries(configDigests)) {
    const current = preparedRead(() => narrativeFile(workspace, path), "configuration-unavailable", "configuration", path);
    if (digest(Buffer.from(current).toString("base64")) !== hash)
      throw new PreparedContextValidationError("Context configuration changed before dispatch", "configuration-changed", "configuration", path);
  }
  const sources = [...(receipt.context as unknown[]).map(raw => ({ raw, root: workspace, kind: "required" as const })),
    ...(receipt.skills as unknown[]).map(raw => ({ raw, root: String(preparedRead(() => object(raw), "receipt-shape-invalid").path).startsWith(".governance/") ? workspace : String(context.skillAssetRoot), kind: "skill" as const }))];
  for (const { raw, root, kind } of sources) {
    const source = preparedRead(() => object(raw), "receipt-shape-invalid"), path = String(source.path ?? source.id);
    const current = preparedRead(() => narrativeFile(root, path), "source-unavailable", kind, path);
    if (`sha256:${createHash("sha256").update(current).digest("hex")}` !== source.sourceDigest)
      throw new PreparedContextValidationError("Prepared source changed before dispatch", "source-changed", kind, path);
  }
  for (const raw of receipt.optionalSources as unknown[]) {
    const source = preparedRead(() => object(raw), "receipt-shape-invalid"), path = String(source.id);
    const current = preparedRead(() => worktreeBytes(workspace, path), "source-unavailable", "optional", path);
    if (current.type !== "regular" || `sha256:${createHash("sha256").update(current.bytes).digest("hex")}` !== source.sourceDigest)
      throw new PreparedContextValidationError("Prepared source changed before dispatch", "source-changed", "optional", path);
  }
}
