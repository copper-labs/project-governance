import { permissionDenied } from "./provider-permission.ts";
import { object, text } from "./core.ts";
import { ProviderSession } from "./provider-session.ts";
import type { ProviderToolEvidence } from "./provider-completion.ts";
const CATEGORIES: Record<string, string> = { Read: "read", Glob: "read", Grep: "read", Edit: "edit", Write: "edit", NotebookEdit: "edit", Bash: "command", PowerShell: "command", WebFetch: "web", WebSearch: "web" };

/** Native public events only; private reasoning blocks are never projected into progress. */
export class ClaudeStream {
  readonly #session: ProviderSession;
  readonly #tools = new Map<string, ProviderToolEvidence>();
  readonly #denied: unknown[] = [];
  readonly #emit: (event: { kind: string; text?: string; tool?: string; state?: string }) => void;
  #bytes = 0;
  #failed = false;
  #done = false;
  #usage: unknown = null;
  constructor(expected: { model: string; effort: string; conversationId?: string; requiredTools: string[] },
    emit: (event: { kind: string; text?: string; tool?: string; state?: string }) => void) {
    this.#session = new ProviderSession({ ...expected, permissions: "bypassPermissions" }); this.#emit = emit;
  }
  accept(raw: unknown) {
    if (this.#failed || this.#done) throw new Error("Claude stream is already terminal");
    try { this.#accept(object(raw, "Claude event")); } catch (error) { this.#failed = true; throw error; }
  }
  #model(item: Record<string, unknown>, message: Record<string, unknown>) {
    if (message.model && message.model !== "<synthetic>" && !item.parent_tool_use_id) this.#session.model(message.model);
  }
  #accept(item: Record<string, unknown>) {
    text(item.type, "Claude event type", 128);
    if (item.session_id) this.#session.session(item.session_id);
    if (item.type === "system" && item.subtype === "init") {
      this.#session.initialize({ model: item.model, session: item.session_id, permissions: item.permissionMode, effort: item.effort });
      this.#emit({ kind: "started" });
    } else if (item.type === "stream_event") {
      const event = object(item.event);
      if (event.type === "message_start") this.#model(item, object(event.message));
      if (event.type === "content_block_delta") {
        const delta = object(event.delta);
        if (delta.type === "text_delta") {
          if (typeof delta.text !== "string") throw new Error("Invalid Claude public text");
          this.#bytes += Buffer.byteLength(delta.text);
          if (this.#bytes > 2_000_000) throw new Error("Public response exceeds 2 MB; use artifacts");
          for (let offset = 0; offset < delta.text.length; offset += 4000) this.#emit({ kind: "text", text: delta.text.slice(offset, offset + 4000) });
        }
      }
    } else if (item.type === "assistant") {
      if (item.is_api_error_message) throw new Error("Claude API failure");
      const message = object(item.message); this.#model(item, message);
      if (!Array.isArray(message.content)) throw new Error("Invalid Claude assistant content");
      for (const raw of message.content) {
        const block = object(raw);
        if (block.type !== "tool_use") continue;
        this.#session.assertToolAdmission();
        const id = text(block.id, "tool id", 256), name = text(block.name, "tool name", 256);
        if (this.#tools.has(id)) throw new Error("Duplicate Claude tool identity");
        if (this.#tools.size >= 5000) throw new Error("Tool evidence exceeds 5000 operations");
        this.#tools.set(id, { name, category: CATEGORIES[name] ?? name, state: "ACTIVE" });
        this.#emit({ kind: "tool", tool: name, state: "ACTIVE" });
      }
    } else if (item.type === "user") {
      const message = object(item.message);
      if (!Array.isArray(message.content)) throw new Error("Invalid Claude user content");
      for (const raw of message.content) {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
        const block = object(raw); if (block.type !== "tool_result") continue;
        this.#session.assertToolAdmission();
        const tool = this.#tools.get(text(block.tool_use_id, "tool result id", 256));
        if (!tool) throw new Error("Claude returned evidence for an unknown tool");
        tool.state = block.is_error ? "ERROR" : "DONE";
        if (block.is_error) {
          tool.error = true;
          if (permissionDenied(block.content)) this.#denied.push({ tool_id: block.tool_use_id, resolved: false });
        } else delete tool.error;
        for (const denial of this.#denied) {
          if (denial && typeof denial === "object" && !Array.isArray(denial) && object(denial).tool_id === block.tool_use_id) object(denial).resolved = tool.state === "DONE" && !tool.error;
        }
        this.#emit({ kind: "tool", tool: tool.name, state: tool.state });
      }
    } else if (item.type === "result") {
      if (item.permission_denials !== undefined && !Array.isArray(item.permission_denials)) throw new Error("Invalid Claude permission denials");
      this.#denied.push(...(item.permission_denials as unknown[] ?? []));
      if (item.is_error || item.subtype !== "success") throw new Error("Claude native terminal failure");
      const completion = item.structured_output ?? JSON.parse(typeof item.result === "string" ? item.result : "null");
      this.#session.complete(completion); this.#done = true;
      this.#usage = structuredClone({ usage: item.usage ?? null, models: item.modelUsage ?? null, estimated_cost_usd: item.total_cost_usd ?? null });
    }
  }
  finish() {
    if (this.#failed) throw new Error("Claude stream failed validation");
    return { identity: this.#session.identity(), ...this.#session.finish([...this.#tools.values()], this.#denied), usage: structuredClone(this.#usage) };
  }
}
