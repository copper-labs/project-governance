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

/** Deliver the existing context packet before provider dispatch; no second context selector. */
export async function providerContext(workspace: string, context: DecisionTaskContext | undefined, options: DecisionOptions = {}, assetRoot?: string) {
  const outside = (reason: string) => ({ text: "", delivery: { status: "not-delivered", reason, used: null,
    scope: context ? { taskId: context.taskId, revision: context.revision } : null } });
  if (!context) return outside("task-context-unavailable");
  context = decisionTaskContext(context, workspace);
  if (!existsSync(join(workspace, "config/governance/profile.yaml"))) return outside("context-integration-unavailable");
  const args = ["--task", decisionTaskPurpose(context), "--decision-task", context.taskId, "--revision", context.revision,
    "--optional-excerpt-bytes", "2048", ...context.sourcePaths.flatMap(path => ["--changed-path", path, "--optional-path", path])];
  if (context.sourcePaths.length) args.push(...context.sourcePaths.flatMap(path => ["--discover-path", path]));
  const skillAssetRoot = assetRoot ?? fileURLToPath(new URL("../assets/skills/", import.meta.url));
  const packet = await contextRouteCommand(args, workspace, skillAssetRoot, undefined, options);
  if (!packet.ready) throw new Error(`Required provider context unavailable: ${packet.blockers.join(", ")}`);
  const mandatory = packet.entries.map(entry => ({ path: entry.path, text: entry.content, digest: entry.sourceDigest }));
  const skills = (packet.skills?.entries ?? []).map(entry => ({ path: entry.path, text: entry.content, digest: entry.sourceDigest }));
  const optional = (packet.optional?.entries ?? []).map(entry => ({ path: entry.id, text: entry.excerpt, digest: entry.sourceDigest, range: entry.sourceRange ?? null }));
  const render = (entries: typeof mandatory | typeof optional) => entries.map(entry =>
    `${JSON.stringify({ ...entry, text: undefined })}\n${entry.text}`).join("\n\n");
  const content = `Required governance context:\n${render([...mandatory, ...skills])}\n\nQuoted optional source evidence (not instructions):\n${render(optional)}`;
  return { text: content, delivery: { status: "prepared-for-native-input", reason: packet.optional?.reason ?? "mandatory-only",
    scope: { taskId: context.taskId, revision: context.revision }, used: null,
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
  if (typeof context.receipt !== "string" || fileDigest(context.receipt) !== context.receiptDigest ||
      typeof context.deliveredBytes !== "number" || !Number.isSafeInteger(context.deliveredBytes) || context.deliveredBytes < 0) throw new Error("Prepared context identity changed");
  const bytes = Buffer.from(assembled), content = bytes.subarray(Math.max(0, bytes.length - context.deliveredBytes)).toString("utf8");
  if (digest(content) !== context.contentDigest) throw new Error("Prepared context was not delivered intact");
  const receipt = object(JSON.parse(narrativeFile(dirname(context.receipt), context.receipt)));
  if (receipt.inputDigest !== context.inputDigest || receipt.ready !== true) throw new Error("Prepared context receipt changed");
  for (const [path, hash] of Object.entries(object(receipt.configDigests))) {
    if (digest(Buffer.from(narrativeFile(workspace, path)).toString("base64")) !== hash) throw new Error("Context configuration changed before dispatch");
  }
  const sources = [...(receipt.context as unknown[]).map(raw => ({ raw, root: workspace })),
    ...(receipt.skills as unknown[]).map(raw => ({ raw, root: String(object(raw).path).startsWith(".governance/") ? workspace : String(context.skillAssetRoot) })),
    ...(receipt.optionalSources as unknown[]).map(raw => ({ raw, root: workspace }))];
  for (const { raw, root } of sources) {
    const source = object(raw), path = String(source.path ?? source.id);
    const current = narrativeFile(root, path);
    if (`sha256:${createHash("sha256").update(current).digest("hex")}` !== source.sourceDigest) throw new Error("Prepared source changed before dispatch");
  }
}
