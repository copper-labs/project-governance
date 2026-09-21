import { object, text } from "./core.ts";
import { CodexHandshake } from "./codex-handshake.ts";
import { codexCallback } from "./codex-callback.ts";
import { permissionDenied } from "./provider-permission.ts";
import type { ProviderToolEvidence } from "./provider-completion.ts";
const CATEGORIES: Record<string, string> = { commandExecution: "command", fileChange: "edit", webSearch: "web", imageView: "image", mcpToolCall: "mcp", dynamicToolCall: "dynamic", collabToolCall: "delegation" };

/** One native turn; outgoing messages are handed back to the existing process owner. */
export class CodexStream {
  readonly #handshake: CodexHandshake;
  readonly #emit: (event: { kind: string; text?: string; tool?: string; state?: string }) => void;
  readonly #tools = new Map<string, ProviderToolEvidence>();
  readonly #denied: unknown[] = [];
  readonly #streamed = new Set<string>();
  #bytes = 0; #answer: string | null = null; #failed = false; #done = false; #stop = false; #usage: unknown = null;
  constructor(request: { model: string; effort: string; workspace: string; prompt: string; conversationId?: string; requiredTools: string[] }, emit: (event: { kind: string; text?: string; tool?: string; state?: string }) => void) {
    this.#handshake = new CodexHandshake(request); this.#emit = emit;
  }
  initial() { return this.#handshake.initial(); }
  get done() { return this.#done; }
  get stopRequested() { return this.#stop; }
  #text(value: unknown) {
    if (typeof value !== "string") throw new Error("Invalid Codex public text");
    this.#bytes += Buffer.byteLength(value);
    if (this.#bytes > 2_000_000) throw new Error("Public response exceeds 2 MB");
    for (let offset = 0; offset < value.length; offset += 4000) this.#emit({ kind: "text", text: value.slice(offset, offset + 4000) });
  }
  accept(value: unknown): Record<string, unknown>[] {
    if (this.#failed) throw new Error("Codex stream failed validation");
    try { return this.#accept(object(value)); } catch (error) { this.#failed = true; throw error; }
  }
  #accept(item: Record<string, unknown>): Record<string, unknown>[] {
    if (Object.hasOwn(item, "id") && Object.hasOwn(item, "method")) {
      const callback = codexCallback(item, { conversationId: this.#handshake.conversationId, turnId: this.#handshake.turnId });
      this.#denied.push(callback.denial); this.#stop = true; this.#emit({ kind: "denied" }); return callback.messages;
    }
    if (this.#stop) return [];
    if (this.#done) throw new Error("Codex event arrived after terminal turn");
    if (Object.hasOwn(item, "id")) {
      const messages = this.#handshake.response(item);
      if (item.id === 1) this.#emit({ kind: "started" });
      return messages;
    }
    const { method, params } = this.#handshake.notification(item);
    if (method === "item/agentMessage/delta") {
      this.#text(params.delta); this.#streamed.add(text(params.itemId, "Codex message id", 256));
      if (this.#streamed.size > 5000) throw new Error("Too many Codex messages");
    } else if (["item/started", "item/completed"].includes(method)) {
      const value = object(params.item), completed = method === "item/completed";
      const kind = text(value.type, "Codex item type", 128), key = text(value.id, "Codex item id", 256);
      if (kind === "agentMessage" && completed) {
        const answer = typeof value.text === "string" ? value.text : "";
        if (!this.#streamed.delete(key) && answer) this.#text(answer);
        if (value.phase === "final_answer" || answer.trimStart().startsWith("{")) this.#answer = answer;
      } else if (CATEGORIES[kind]) {
        this.#handshake.session.assertToolAdmission();
        const name = text(value.tool || kind, "Codex tool", 256);
        const previous = this.#tools.get(key);
        if (previous && previous.name !== name) throw new Error("Codex tool identity changed");
        if (!previous && this.#tools.size >= 5000) throw new Error("Too many Codex tools");
        const status = value.status ?? (completed ? "completed" : "inProgress");
        let state = status === "completed" ? "DONE" : ["failed", "declined"].includes(String(status)) ? "ERROR" : "ACTIVE";
        let error = status === "declined" ? "Permission denied" : value.error;
        if (completed && ((kind === "commandExecution" && value.exitCode !== 0) || (kind === "dynamicToolCall" && value.success === false))) { state = "ERROR"; error ||= "Native tool failed"; }
        const tool: ProviderToolEvidence = { name, category: CATEGORIES[kind]!, state };
        if (error) {
          tool.error = true;
          if (permissionDenied(error)) this.#denied.push({ tool_id: key, resolved: false });
        } else if (state !== "DONE" && previous?.error) tool.error = true;
        for (const denial of this.#denied) if (denial && typeof denial === "object" && object(denial).tool_id === key) object(denial).resolved = state === "DONE" && !tool.error;
        this.#tools.set(key, tool); this.#emit({ kind: "tool", tool: name, state });
      }
    } else if (method === "turn/completed") {
      const turn = object(params.turn);
      if (!this.#handshake.turnId || turn.id !== this.#handshake.turnId || turn.status !== "completed") throw new Error("Codex terminal turn failed or identity differs");
      this.#handshake.session.complete(JSON.parse(this.#answer ?? "null")); this.#done = true;
    } else if (method === "thread/tokenUsage/updated") this.#usage = structuredClone(params.tokenUsage ?? {});
    return [];
  }
  finish() {
    if (this.#failed) throw new Error("Codex stream failed validation");
    if (this.#stop) return { identity: this.#handshake.conversationId ? { ...this.#handshake.session.identity(), turnId: this.#handshake.turnId } : null, state: "blocked", completion: null, usage: structuredClone(this.#usage), reason: "parent-assistance-required" };
    return { identity: { ...this.#handshake.session.identity(), turnId: this.#handshake.turnId }, ...this.#handshake.session.finish([...this.#tools.values()], this.#denied), usage: structuredClone(this.#usage) };
  }
}
