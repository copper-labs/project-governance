import { object, text } from "./core.ts";
import { ProviderSession } from "./provider-session.ts";
import { permissionDenied } from "./provider-permission.ts";
import type { ProviderToolEvidence } from "./provider-completion.ts";
const CATEGORIES: Record<string, string> = { view_file: "read", list_dir: "read", find_by_name: "read", grep_search: "read",
  write_to_file: "edit", replace_file_content: "edit", multi_replace_file_content: "edit", run_command: "command",
  command_status: "command", send_command_input: "command", read_url_content: "web", search_web: "web", open_browser_url: "browser" };

/** Antigravity may emit early events; bound them until native identity is verified. */
export class GeminiStream {
  readonly #session: ProviderSession;
  readonly #tools = new Map<string, ProviderToolEvidence>();
  readonly #denied: unknown[] = [];
  readonly #emit: (event: { kind: string; text?: string; tool?: string; state?: string }) => void;
  #pending: Record<string, unknown>[] = []; #pendingBytes = 0; #textBytes = 0;
  #initialized = false; #failed = false; #done = false; #usage: unknown = null;
  constructor(expected: { model: string; effort: string; conversationId?: string; requiredTools: string[] }, emit: (event: { kind: string; text?: string; tool?: string; state?: string }) => void) {
    this.#session = new ProviderSession({ ...expected, permissions: "always-proceed" }); this.#emit = emit;
  }
  accept(value: unknown) {
    if (this.#failed || this.#done) throw new Error("Gemini stream is already terminal");
    try { this.#accept(object(value)); } catch (error) { this.#failed = true; throw error; }
  }
  #accept(item: Record<string, unknown>) {
    text(item.event, "Gemini event", 128);
    if (item.event === "init") {
      const init = object(item.init);
      this.#session.initialize({ model: init.model, session: item.conversation_id, permissions: init.permission_mode, effort: init.effort });
      this.#initialized = true; this.#emit({ kind: "started" });
      const pending = this.#pending; this.#pending = []; this.#pendingBytes = 0;
      for (const event of pending) this.accept(event);
      return;
    }
    if (item.event === "result" && object(item.result).status !== "SUCCESS") throw new Error("Gemini native terminal failure");
    if (!this.#initialized) {
      this.#pendingBytes += Buffer.byteLength(JSON.stringify(item));
      if (this.#pending.length >= 256 || this.#pendingBytes > 1_048_576) throw new Error("Gemini pre-init event buffer exceeded limit");
      this.#pending.push(structuredClone(item)); return;
    }
    if (item.conversation_id) this.#session.session(item.conversation_id);
    if (item.event === "step_update") {
      const update = object(item.step_update);
      if (update.conversation_id) this.#session.session(update.conversation_id);
      if (update.step_type === "agent_response" && update.text_delta) {
        if (typeof update.text_delta !== "string") throw new Error("Invalid Gemini public text");
        this.#textBytes += Buffer.byteLength(update.text_delta);
        if (this.#textBytes > 2_000_000) throw new Error("Public response exceeds 2 MB");
        for (let offset = 0; offset < update.text_delta.length; offset += 4000) this.#emit({ kind: "text", text: update.text_delta.slice(offset, offset + 4000) });
      }
      if (update.step_type === "tool") {
        this.#session.assertToolAdmission();
        const info = object(update.tool_info ?? {}), name = text(update.tool_name || info.name || "unknown", "Gemini tool", 256);
        if (!Number.isSafeInteger(update.step_index) || Number(update.step_index) < 0) throw new Error("Invalid Gemini tool identity");
        const id = String(update.step_index), state = text(update.state, "Gemini tool state", 128);
        if (!this.#tools.has(id) && this.#tools.size >= 5000) throw new Error("Tool evidence exceeds 5000 operations");
        const previous = this.#tools.get(id);
        if (previous && previous.name !== name) throw new Error("Gemini tool identity changed");
        const tool: ProviderToolEvidence = { name, category: CATEGORIES[name] ?? (name.includes("browser") ? "browser" : name), state };
        if (info.error) {
          tool.error = true;
          if (permissionDenied(info.error)) this.#denied.push({ tool_id: id, resolved: false });
        } else if (state !== "DONE" && previous?.error) tool.error = previous.error;
        for (const denial of this.#denied) if (denial && typeof denial === "object" && !Array.isArray(denial) && object(denial).tool_id === id) object(denial).resolved = state === "DONE" && !tool.error;
        this.#tools.set(id, tool); this.#emit({ kind: "tool", tool: name, state });
      }
    } else if (item.event === "result") {
      const result = object(item.result);
      if (result.conversation_id) this.#session.session(result.conversation_id);
      if (result.denied_actions !== undefined && !Array.isArray(result.denied_actions)) throw new Error("Invalid Gemini denials");
      this.#denied.push(...(result.denied_actions as unknown[] ?? []));
      this.#session.complete(result.structured_output ?? JSON.parse(typeof result.response === "string" ? result.response : "null"));
      this.#done = true; this.#usage = structuredClone(result.usage ?? null);
    }
  }
  finish() {
    if (this.#failed) throw new Error("Gemini stream failed validation");
    return { identity: this.#session.identity(), ...this.#session.finish([...this.#tools.values()], this.#denied), usage: structuredClone(this.#usage) };
  }
}
