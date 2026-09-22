import { realpathSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { text } from "./core.ts";
import { providerBinding, type NativeProvider } from "./provider-binding.ts";
import { claudeCommand } from "./claude-command.ts";
import { geminiCommand, geminiInput } from "./gemini-command.ts";
import type { CommandRequest } from "./process-owner.ts";
import { resourceRegistryPath } from "./resources.ts";
import { workspaceClaim } from "./workspace-claims.ts";
import { providerAssignment, type ProviderAssignment } from "./provider-assignment.ts";
import type { ProviderGuard } from "./provider-guard.ts";

/** Plan native transport only. The job admission layer must establish assignment authority and workspace claims. */
export function providerCommand(request: {
  id: string; provider: NativeProvider; workspace: string; additionalRoots?: string[];
  prompt: string; model?: string; effort?: string; executable?: string; config?: string;
  conversationId?: string; requiredTools?: string[]; deadlineMs: number; outputLimit: number;
  access?: "reader" | "writer" | "exclusive"; registry?: string;
  idleTimeoutMs?: number;
  assignment?: { role: string; constraints: string; context: string };
}, directory: string, guard?: ProviderGuard): Omit<CommandRequest, "version" | "ownerDigest"> {
  text(request.id, "provider job id", 256);
  text(request.prompt, "provider assignment", 500000);
  if (Buffer.byteLength(request.prompt) > 500000) throw new Error("Provider assignment exceeds 500 KB");
  if (!Number.isSafeInteger(request.deadlineMs) || request.deadlineMs < 0 || request.deadlineMs > 604800000) throw new Error("Invalid provider deadline");
  if (request.idleTimeoutMs !== undefined && (!Number.isSafeInteger(request.idleTimeoutMs) || request.idleTimeoutMs < 0 || request.idleTimeoutMs > 604800000)) throw new Error("Invalid provider idle timeout");
  if (!Number.isSafeInteger(request.outputLimit) || request.outputLimit < 1 || request.outputLimit > 64 * 1024 * 1024) throw new Error("Invalid provider output limit");
  const canonicalDirectory = (path: string) => {
    const canonical = realpathSync(text(path, "provider workspace"));
    if (!statSync(canonical).isDirectory()) throw new Error("Provider workspace must be a directory");
    return canonical;
  };
  const workspace = canonicalDirectory(request.workspace);
  if (request.additionalRoots && (!Array.isArray(request.additionalRoots) || request.additionalRoots.length > 64)) throw new Error("Too many provider workspace roots");
  const additionalRoots = [...new Set((request.additionalRoots ?? []).map(canonicalDirectory))].filter(root => root !== workspace);
  const requiredTools = request.requiredTools ?? [];
  if (!Array.isArray(requiredTools) || requiredTools.length > 128) throw new Error("Invalid required provider tools");
  for (const tool of requiredTools) text(tool, "required provider tool", 256);
  const binding = providerBinding(request.provider, request);
  const session = request.conversationId === undefined ? {} : { conversationId: text(request.conversationId, "provider conversation", 256) };
  if (session.conversationId?.startsWith("-")) throw new Error("Invalid provider conversation");
  if (guard && (request.provider !== "claude" || request.access !== "reader" || requiredTools.some(tool =>
    !guard.tools.includes(tool === "read" ? "Read" : tool)))) throw new Error("Assignment is incompatible with guarded read tools");
  const common = { executable: binding.backend, model: binding.model, effort: binding.effort, additionalRoots, ...session, ...(guard ? { guard } : {}) };
  // Codex's full-access session receives authorized roots in its assignment, not a native CLI flag.
  if (request.provider === "codex" && additionalRoots.length && !request.assignment) throw new Error("Codex additional roots require a structured assignment");
  const argv = request.provider === "claude" ? claudeCommand(common)
    : request.provider === "gemini" ? geminiCommand({ ...common, workspace, timeoutSeconds: request.deadlineMs / 1000 }, resolve(directory))
    : [binding.backend, "app-server", "--stdio"];
  const assignment: ProviderAssignment | undefined = request.assignment ? { ...request.assignment,
    task: request.prompt, workspace, additionalRoots, requiredTools: [...new Set(requiredTools)], access: request.access ?? "exclusive" } : undefined;
  const prompt = assignment ? providerAssignment(assignment) : request.prompt;
  return {
    id: request.id, operation: { argv, cwd: workspace, env: { ...guard?.environment }, expectedExitCodes: [0], effect: "local" },
    deadlineMs: request.deadlineMs, outputLimit: request.outputLimit,
    ...(request.idleTimeoutMs !== undefined ? { idleTimeoutMs: request.idleTimeoutMs } : {}),
    stdin: request.provider === "gemini" ? geminiInput(prompt) : prompt,
    ...(assignment ? { assignment } : {}),
    provider: { kind: request.provider, model: binding.model, effort: binding.effort, ...session, requiredTools: [...new Set(requiredTools)], additionalRoots, access: request.access ?? "exclusive", ...(guard ? { guard } : {}) },
    coordination: { registry: resolve(request.registry ?? resourceRegistryPath()), resources: [workspaceClaim([workspace, ...additionalRoots], request.access ?? "exclusive", request.id,
      session.conversationId ? { provider: request.provider, conversationId: session.conversationId } : undefined)] },
  };
}
