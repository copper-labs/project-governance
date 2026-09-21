import { object, text } from "./core.ts";
import { reconcileProviderCompletion, type ProviderToolEvidence } from "./provider-completion.ts";

/** Common identity and terminal gates; native adapters still own their wire format and process. */
export class ProviderSession {
  readonly #expected: { model: string; effort: string; permissions: string; conversationId?: string; requiredTools: string[] };
  #conversation: string | null;
  #initialized = false;
  #reportedEffort: string | null = null;
  #completed = false;
  #completion: unknown;
  constructor(expected: { model: string; effort: string; permissions: string; conversationId?: string; requiredTools: string[] }) {
    text(expected.model, "provider model", 256); text(expected.effort, "provider effort", 64);
    text(expected.permissions, "provider permissions", 128);
    if (expected.conversationId !== undefined) text(expected.conversationId, "provider session", 256);
    this.#expected = structuredClone(expected); this.#conversation = expected.conversationId ?? null;
  }
  session(value: unknown) {
    const identity = text(value, "provider session", 256);
    if (this.#conversation !== null && identity !== this.#conversation) throw new Error("Provider session differs from requested or initialized session");
    this.#conversation = identity;
  }
  model(value: unknown) {
    if (value !== this.#expected.model) throw new Error("Provider selected a different model");
  }
  initialize(value: unknown) {
    if (this.#initialized) throw new Error("Provider emitted duplicate initialization");
    const init = object(value, "provider initialization");
    this.model(init.model); this.session(init.session);
    if (init.permissions !== this.#expected.permissions) throw new Error("Provider permissions differ from request");
    if (init.effort !== undefined && init.effort !== null && init.effort !== this.#expected.effort) throw new Error("Provider selected a different reasoning effort");
    this.#reportedEffort = typeof init.effort === "string" ? init.effort : null;
    this.#initialized = true;
    return { model: this.#expected.model, session: this.#conversation, effort: init.effort ?? null, permissions: init.permissions };
  }
  identity() {
    if (!this.#initialized) throw new Error("Provider identity is not verified");
    return { conversationId: this.#conversation!, model: this.#expected.model,
      requestedEffort: this.#expected.effort, reportedEffort: this.#reportedEffort, permissions: this.#expected.permissions };
  }
  assertToolAdmission() {
    if (!this.#initialized) throw new Error("Tool evidence arrived before verified initialization");
    if (this.#completed) throw new Error("Tool evidence arrived after completion");
  }
  complete(value: unknown) {
    if (!this.#initialized) throw new Error("Provider completed without verified initialization");
    if (this.#completed) throw new Error("Provider emitted duplicate completion");
    this.#completion = structuredClone(value); this.#completed = true;
  }
  finish(tools: ProviderToolEvidence[], denied: unknown[]) {
    if (!this.#initialized || !this.#completed) throw new Error("Provider stream ended without a verified terminal result");
    return reconcileProviderCompletion(this.#completion, tools, denied, this.#expected.requiredTools);
  }
}
