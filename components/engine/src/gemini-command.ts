import { isAbsolute, join } from "node:path";
import { text } from "./core.ts";
import { PROVIDER_FINAL_SCHEMA } from "./provider-schema.ts";

/** Antigravity owns native tools; the shared process owner retains cancellation and deadlines. */
export function geminiCommand(request: { executable: string; workspace: string; model: string; effort: string;
  additionalRoots: string[]; conversationId?: string; timeoutSeconds: number }, directory: string) {
  for (const path of [request.executable, request.workspace, directory, ...request.additionalRoots]) {
    text(path, "Gemini absolute path"); if (!isAbsolute(path)) throw new Error("Gemini paths must be absolute");
  }
  text(request.model, "Gemini model", 200);
  const suffix = /-(low|medium|high)$/u.exec(request.model);
  if (request.model.startsWith("-") || !["low", "medium", "high"].includes(request.effort) || (suffix && suffix[1] !== request.effort)) throw new Error("Gemini model and effort disagree");
  if (!Number.isFinite(request.timeoutSeconds) || request.timeoutSeconds < 0 || request.timeoutSeconds > 604800) throw new Error("Invalid Gemini deadline");
  const nativeTimeout = request.timeoutSeconds ? `${Math.max(1, Math.ceil(request.timeoutSeconds))}s` : "2562047h47m16s";
  const argv = [request.executable, "--input-format", "stream-json", "--output-format", "stream-json", "--model", request.model,
    "--effort", request.effort, "--mode", "accept-edits", "--dangerously-skip-permissions", "--json-schema", JSON.stringify(PROVIDER_FINAL_SCHEMA),
    "--print-timeout", nativeTimeout, "--log-file", join(directory, "provider.log")];
  for (const root of [request.workspace, ...request.additionalRoots]) argv.push("--add-dir", root);
  if (request.conversationId !== undefined) {
    text(request.conversationId, "Gemini conversation", 256);
    if (request.conversationId.startsWith("-")) throw new Error("Invalid Gemini conversation");
    argv.push("--conversation", request.conversationId);
  } else argv.push("--new-project");
  return argv;
}

export function geminiInput(prompt: string): string {
  if (typeof prompt !== "string" || !prompt.trim()) throw new Error("Gemini assignment is required");
  const framed = JSON.stringify({ event: "user", message: { content: prompt } }) + "\n";
  if (Buffer.byteLength(framed) > 500000) throw new Error("Gemini framed assignment exceeds 500 KB");
  return framed;
}
