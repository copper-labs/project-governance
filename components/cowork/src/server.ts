declare const GOVERNANCE_PLUGIN_VERSION: string;
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import { COWORK_INPUTS } from "../../engine/src/cowork-request.ts";
import { coworkEffect } from "../../engine/src/cowork-operations.ts";
import { invokeRegistered, registrationInventory } from "./transport.ts";

const server = new McpServer({ name: "project-governance", version: GOVERNANCE_PLUGIN_VERSION });
const result = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value) }] });
server.registerTool("governance_projects", {
  description: "List projects registered on this Mac. Registration does not change their pinned Governance versions.",
  inputSchema: z.object({}).strict(), annotations: { readOnlyHint: true, openWorldHint: false },
}, async () => {
  try {
    const inventory = registrationInventory();
    return result({ projects: inventory.valid.map(item => ({ project_id: item.project_id, label: item.label,
      runtime_version: item.runtime_version, status: "registered", readiness: "verified-on-invocation" })), problems: inventory.problems });
  } catch { return { ...result({ error: "Cannot read Governance registrations. Run setup again." }), isError: true }; }
});
for (const [operation, schema] of Object.entries(COWORK_INPUTS)) {
  if (operation === "register") continue;
  server.registerTool(`governance_${operation.replaceAll("-", "_")}`, {
    description: `Native Governance ${operation}. Uses the registered Mac checkout and its pinned runtime. Never automatically retry mutations after a disconnected response.`,
    inputSchema: z.fromJSONSchema(schema as Parameters<typeof z.fromJSONSchema>[0]),
    annotations: { readOnlyHint: coworkEffect(operation) === "read", destructiveHint: ["file-apply", "commit"].includes(operation),
      idempotentHint: coworkEffect(operation) === "read", openWorldHint: ["context", "check-start", "check-output", "commit"].includes(operation) },
  }, async input => {
    try {
      const value = await invokeRegistered(operation, input as Record<string, unknown>);
      return { ...result(value), ...(value && typeof value === "object" && "status" in value && value.status === "failed" ? { isError: true } : {}) };
    }
    catch (error) { return { ...result({ error: error instanceof Error ? error.message : "Governance operation failed." }), isError: true }; }
  });
}
await server.connect(new StdioServerTransport());
