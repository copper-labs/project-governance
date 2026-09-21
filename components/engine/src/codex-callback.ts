import { object, text } from "./core.ts";

/** Refuse requests outside the delegated native capability, acknowledge them, then interrupt the owned turn. */
export function codexCallback(value: unknown, identity: { conversationId: string | null; turnId: string | null }) {
  const item = object(value), method = text(item.method, "Codex client request", 256);
  if (!((typeof item.id === "string" && item.id.length > 0 && item.id.length <= 256) || Number.isSafeInteger(item.id))) throw new Error("Invalid Codex client request id");
  let response: Record<string, unknown>;
  if (["item/commandExecution/requestApproval", "item/fileChange/requestApproval"].includes(method)) response = { result: { decision: "cancel" } };
  else if (method === "mcpServer/elicitation/request") response = { result: { action: "cancel", content: null, _meta: null } };
  else if (method === "item/tool/requestUserInput") response = { result: { answers: {} } };
  else if (method === "item/tool/call") response = { result: { success: false, contentItems: [{ type: "inputText", text: "Parent-only tool is unavailable to this wrapper" }] } };
  else response = { error: { code: -32601, message: "This wrapper cannot resolve " + method } };
  const messages: Record<string, unknown>[] = [{ id: item.id, ...response }];
  if (identity.turnId !== null) {
    text(identity.turnId, "Codex turn", 256); text(identity.conversationId, "Codex thread", 256);
    messages.push({ id: 9, method: "turn/interrupt", params: { threadId: identity.conversationId, turnId: identity.turnId } });
  }
  return { messages, stopRequested: true, denial: { request: method, reason: "Requires user input, authority, or an unavailable client tool" } };
}
