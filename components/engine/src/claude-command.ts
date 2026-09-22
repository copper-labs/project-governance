import { isAbsolute } from "node:path";
import { text } from "./core.ts";
import { PROVIDER_FINAL_SCHEMA } from "./provider-schema.ts";
import { type ProviderGuard, validateProviderGuard } from "./provider-guard.ts";

/** Pure invocation planning; caller must supply validated assignment authority and explicit selection. */
export function claudeCommand(request: { executable: string; model: string; effort: string; additionalRoots: string[]; conversationId?: string; guard?: ProviderGuard }) {
  text(request.executable, "Claude executable"); text(request.model, "Claude model", 256); text(request.effort, "Claude effort", 64);
  if (!isAbsolute(request.executable) || request.model.startsWith("-") || request.effort.startsWith("-")) throw new Error("Invalid native Claude selection");
  if (request.guard) { validateProviderGuard(request.guard); if (request.guard.executable !== request.executable) throw new Error("Guard executable differs"); }
  const argv = [request.executable, "--print", "--output-format", "stream-json", "--verbose", "--include-partial-messages",
    "--permission-mode", request.guard ? "dontAsk" : "bypassPermissions", "--tools", request.guard ? request.guard.tools.join(",") : "default", "--model", request.model, "--effort", request.effort,
    "--settings", JSON.stringify(request.guard?.settings ?? { fallbackModel: [] }), "--json-schema", JSON.stringify(PROVIDER_FINAL_SCHEMA)];
  if (request.guard) argv.push("--restricted", "--safe-mode", "--disable-slash-commands", "--setting-sources", "", "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}', "--disallowedTools", "mcp__*");
  for (const root of request.additionalRoots) {
    text(root, "additional workspace"); if (!isAbsolute(root)) throw new Error("Additional workspace must be absolute");
    argv.push("--add-dir", root);
  }
  if (request.conversationId !== undefined) {
    text(request.conversationId, "Claude conversation", 256);
    if (request.conversationId.startsWith("-")) throw new Error("Invalid Claude conversation");
    argv.push("--resume", request.conversationId);
  }
  return argv;
}
