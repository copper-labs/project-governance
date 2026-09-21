import { discoverContext } from "./context-discovery.ts";
import { resolveChangeScope, ValidationSubject } from "./change-subject.ts";
import { parseArgs } from "node:util";
import { realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { narrativeFile } from "./narrative-inputs.ts";
import { JevDecisionAdapter, type Candidate, type DecisionOptions, type DecisionConfig, type DecisionProvider } from "./decisions.ts";
import { loadProfileDecisionConfig } from "./decision-configuration.ts";
import { buildContextPacket } from "./context-packet.ts";
import { checkRunRoot } from "./check-run.ts";
import { digest, durableJson } from "./core.ts";
import { evaluateContext, type ContextEvaluationCase } from "./context-evaluation.ts";

export function contextStateRoot(root: string): string {
  return join(checkRunRoot(), "..", "context", digest(realpathSync(root)).slice(7));
}

/** Evaluation is operator-invoked and shares the runtime adapter's explicit data-sharing policy. */
export async function contextEvaluationCommand(args: string[], root: string, options: DecisionOptions = {}) {
  const { values } = parseArgs({ args, strict: true, allowPositionals: false, options: {
    dataset: { type: "string" }, "decision-config": { type: "string" },
  } });
  if (!values.dataset) throw new Error("An evaluation dataset is required");
  const cases = JSON.parse(narrativeFile(root, values.dataset)) as ContextEvaluationCase[];
  if (!Array.isArray(cases)) throw new Error("Evaluation dataset must be a list");
  const config: DecisionConfig = values["decision-config"]
    ? JSON.parse(narrativeFile(root, values["decision-config"])) as DecisionConfig : loadProfileDecisionConfig(root);
  const stateRoot = contextStateRoot(root);
  const result = await evaluateContext(cases, new JevDecisionAdapter(config, join(stateRoot, "provider-health.json")), options);
  const receiptId = randomUUID();
  durableJson(join(stateRoot, "evaluations", `${receiptId}.json`), {
    ...result, receiptId, workspace: realpathSync(root), createdAt: new Date().toISOString(),
  });
  return { ...result, receiptId };
}

/** Explicit source inputs are captured once; the receipt records advice without copying source contents. */
export async function contextCommand(args: string[], root: string, suppliedProvider?: DecisionProvider, options: DecisionOptions = {}) {
  const { values } = parseArgs({ args, strict: true, allowPositionals: false, options: {
    purpose: { type: "string" }, revision: { type: "string" },
    "discover-path": { type: "string", multiple: true },
    "required-path": { type: "string", multiple: true }, "optional-path": { type: "string", multiple: true },
    "optional-excerpt-bytes": { type: "string" },
    "maximum-bytes": { type: "string", default: "16384" }, "decision-config": { type: "string" },
  } });
  if (!values.purpose?.trim() || !values.revision?.trim()) throw new Error("Context purpose and revision are required");
  const canonicalRoot = realpathSync(root);
  const discovery = values["discover-path"]?.length
    ? discoverContext(new ValidationSubject(canonicalRoot, resolveChangeScope(canonicalRoot, { baseRef: "HEAD" })), values["discover-path"])
    : null;
  const explicit = new Set([...values["required-path"] ?? [], ...values["optional-path"] ?? []]);
  const optionalPaths = [...values["optional-path"] ?? [], ...(discovery?.paths ?? []).filter(path => !explicit.has(path))];
  const paths = [...values["required-path"] ?? [], ...optionalPaths];
  if (paths.length > 128) throw new Error("Too many context paths");
  const capture = (path: string): Candidate => {
    const full = resolve(canonicalRoot, path), actual = realpathSync(full), child = relative(canonicalRoot, actual);
    if (!child || child.startsWith("..") || isAbsolute(child) || actual !== full) throw new Error("Context source escapes workspace or uses a symlink alias");
    const excerpt = narrativeFile(canonicalRoot, path);
    return { id: relative(canonicalRoot, full).split("\\").join("/"),
      sourceDigest: `sha256:${createHash("sha256").update(excerpt).digest("hex")}`, excerpt };
  };
  const required = (values["required-path"] ?? []).map(capture);
  const optional = optionalPaths.map(capture);
  const config: DecisionConfig = values["decision-config"]
    ? JSON.parse(narrativeFile(canonicalRoot, values["decision-config"])) as DecisionConfig : loadProfileDecisionConfig(canonicalRoot);
  const stateRoot = contextStateRoot(canonicalRoot);
  const provider = suppliedProvider ?? new JevDecisionAdapter(config, join(stateRoot, "provider-health.json"));
  const packet = await buildContextPacket({ taskRevision: values.revision, purpose: values.purpose, required, optional,
    maximumBytes: Number(values["maximum-bytes"]), ...(values["optional-excerpt-bytes"] !== undefined ? { optionalExcerptBytes: Number(values["optional-excerpt-bytes"]) } : {}) }, provider, options);
  const receiptId = randomUUID();
  const staleSources = [...required, ...optional].filter(candidate => {
    try { return capture(candidate.id).sourceDigest !== candidate.sourceDigest; }
    catch { return true; }
  }).map(candidate => candidate.id);
  durableJson(join(stateRoot, "receipts", `${receiptId}.json`), {
    version: 1, receiptId, workspace: canonicalRoot, createdAt: new Date().toISOString(), inputDigest: packet.inputDigest,
    taskRevision: packet.taskRevision, sources: [...required, ...optional].map(({ id, sourceDigest }) => ({ id, sourceDigest })),
    selected: packet.entries.map(entry => entry.id), omitted: packet.omitted, decision: packet.decision,
    reason: packet.reason, measurement: packet.measurement,
    discovery,
    outcome: staleSources.length ? "refused-stale-source" : "delivered", staleSources,
    requiredContextAuthority: "caller-supplied; does not replace governance context routing",
  });
  if (staleSources.length) throw new Error("Context sources changed while preparing the packet");
  return { ...packet, receiptId, discovery, requiredContextAuthority: "caller-supplied; does not replace governance context routing" };
}
