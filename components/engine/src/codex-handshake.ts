import { object, text } from "./core.ts";
import { ProviderSession } from "./provider-session.ts";
import { PROVIDER_FINAL_SCHEMA } from "./provider-schema.ts";

/** Explicit JSON-RPC handshake; the process owner transports messages and owns the server lifetime. */
export class CodexHandshake {
  readonly session: ProviderSession;
  readonly #request: { model: string; effort: string; workspace: string; prompt: string; conversationId?: string; requiredTools: string[] };
  #phase = 0; #conversation: string | null = null; #turn: string | null = null; #failed = false;
  constructor(request: { model: string; effort: string; workspace: string; prompt: string; conversationId?: string; requiredTools: string[] }) {
    text(request.workspace, "Codex workspace"); text(request.prompt, "Codex assignment", 500000);
    this.#request = structuredClone(request);
    this.session = new ProviderSession({ ...request, permissions: "dangerFullAccess" });
  }
  initial() { return { id: 0, method: "initialize", params: { clientInfo: { name: "harness_agent", version: "1.0" } } }; }
  get turnId() { return this.#turn; }
  get conversationId() { return this.#conversation; }
  response(raw: unknown): Record<string, unknown>[] {
    if (this.#failed) throw new Error("Codex handshake failed");
    try {
      const item = object(raw);
      if (item.error || item.id !== this.#phase || this.#phase > 2) throw new Error("Codex response failed or arrived out of order");
      const value = object(item.result ?? {}), request = this.#request;
      if (this.#phase === 0) {
        this.#phase = 1;
        return [{ method: "initialized", params: {} }, { id: 1, method: request.conversationId ? "thread/resume" : "thread/start",
          params: { model: request.model, cwd: request.workspace, approvalPolicy: "never", sandbox: "danger-full-access",
            config: { model_reasoning_effort: request.effort }, ...(request.conversationId ? { threadId: request.conversationId } : {}) } }];
      }
      if (this.#phase === 1) {
        if (value.approvalPolicy !== "never" || value.cwd !== request.workspace) throw new Error("Codex initialized different authority or workspace");
        const conversation = text(object(value.thread).id, "Codex thread", 256);
        this.session.initialize({ model: value.model, session: conversation, permissions: object(value.sandbox).type, effort: value.reasoningEffort });
        this.#conversation = conversation; this.#phase = 2;
        return [{ id: 2, method: "turn/start", params: { threadId: conversation, input: [{ type: "text", text: request.prompt }],
          model: request.model, effort: request.effort, outputSchema: PROVIDER_FINAL_SCHEMA } }];
      }
      this.#turn = text(object(value.turn).id, "Codex turn", 256); this.#phase = 3;
      return [];
    } catch (error) { this.#failed = true; throw error; }
  }
  notification(raw: unknown) {
    if (this.#failed) throw new Error("Codex handshake failed");
    try {
      const item = object(raw), method = text(item.method, "Codex notification", 256), params = object(item.params ?? {});
      if (params.threadId) this.session.session(params.threadId);
      if (params.turnId && (!this.#turn || params.turnId !== this.#turn)) throw new Error("Codex event identifies an unexpected turn");
      if (method === "model/rerouted") throw new Error("Codex rerouted the requested model");
      return { method, params };
    } catch (error) { this.#failed = true; throw error; }
  }
}
