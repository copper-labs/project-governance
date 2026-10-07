import { canonical, object } from "./core.ts";
import { decisionPayload, parseDecisionEnvelope, decisionNativeUsage, type DecisionRequest2, type QuestionDefinition, type QuestionOutcome } from "./decision-schema.ts";

export type DecisionProviderId = "jev" | "openai";
export interface DecisionProviderIdentity {
  id: DecisionProviderId; adapterVersion: string | null; requestedModel: string | null; returnedModel: string | null;
  modelIdentity: "exact-version" | "mutable-alias" | "historical-unknown"; configurationDigest: string | null;
}
export interface DecisionUsage {
  inputTokens: number | null; outputTokens: number | null;
  cachedInputTokens?: number | null; cacheWriteInputTokens?: number | null; reasoningTokens?: number | null; totalTokens?: number | null;
}
export interface DecisionProviderPolicy {
  concurrency: number; requestsPerMinute: number; estimatedInputTokensPerSecond: number | null; maxRequestBytes: number;
}
export interface DecisionProviderAdapter {
  readonly id: DecisionProviderId; readonly version: string; readonly endpoint: string; readonly credentialName: "JEV_TOKEN" | "OPENAI_API_KEY";
  readonly layouts: readonly string[]; readonly modalities: readonly string[]; readonly policy: DecisionProviderPolicy;
  readonly responseBytes: number; readonly modelIdentity: "exact-version" | "mutable-alias";
  validModel(model: string): boolean;
  payload(request: DecisionRequest2, definitions: Record<string, QuestionDefinition>, model: string): unknown;
  decode(raw: unknown, request: DecisionRequest2, definitions: Record<string, QuestionDefinition>, model: string, payloadDigest: string): { model: string; payloadDigest: string; usage: DecisionUsage; answers: Record<string, QuestionOutcome> };
  usage(raw: unknown): DecisionUsage;
}

/** These codecs translate contracts; admission, spending and execution remain in DecisionRuntime. */
const jev: DecisionProviderAdapter = {
  id: "jev", version: "jev-text-1", endpoint: "https://api.typesafe.ai/v1/systemone", credentialName: "JEV_TOKEN",
  layouts: ["question-local-v1", "compact-v1", "shared-v1", "per-question-v1"], modalities: ["text"], responseBytes: 262_144, modelIdentity: "exact-version",
  policy: { concurrency: 4, requestsPerMinute: 960, estimatedInputTokensPerSecond: 200_000, maxRequestBytes: 65_536 },
  validModel: model => /^jev-\d+\.\d+\.\d+$/.test(model), payload: decisionPayload, usage: decisionNativeUsage,
  decode(raw, request, definitions, model, payloadDigest) {
    const parsed = parseDecisionEnvelope(raw, request, definitions, model, payloadDigest);
    const native = object(object(raw).answers);
    for (const [name, answer] of Object.entries(parsed.answers)) {
      if (answer.status !== "answered") continue;
      const original = object(native[name]);
      answer.native = answer.shape === "noul" ? { type: "noul", noul: original.noul }
        : answer.shape === "choice" ? { type: "choice", choice: original.choice, confidence: original.confidence, probabilities: original.probabilities }
          : { type: "score", score: original.score, confidence: original.confidence, probabilities: original.probabilities, legend: original.legend };
      if (answer.shape === "score") { answer.score = answer.expectation!; delete answer.expectation; }
    }
    return parsed;
  },
};
const count = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null;
function openaiUsage(raw: unknown): DecisionUsage {
  const body = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const usage = body.usage && typeof body.usage === "object" && !Array.isArray(body.usage) ? body.usage as Record<string, unknown> : {};
  const input = usage.input_tokens_details && typeof usage.input_tokens_details === "object" ? usage.input_tokens_details as Record<string, unknown> : {};
  const output = usage.output_tokens_details && typeof usage.output_tokens_details === "object" ? usage.output_tokens_details as Record<string, unknown> : {};
  return { inputTokens: count(usage.input_tokens), outputTokens: count(usage.output_tokens), cachedInputTokens: count(input.cached_tokens),
    cacheWriteInputTokens: count(input.cache_write_tokens), reasoningTokens: count(output.reasoning_tokens), totalTokens: count(usage.total_tokens) };
}
function probability(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) throw new Error("invalid probability");
  return value;
}
function distribution(raw: unknown, expected: string[], levels?: readonly string[]): Record<string, number> {
  if (!Array.isArray(raw) || raw.length !== expected.length) throw new Error("invalid distribution coverage");
  const values: Record<string, number> = Object.create(null);
  for (const item of raw) {
    const entry = object(item), key = levels ? Number.isSafeInteger(entry.value) ? String(entry.value) : "" : typeof entry.value === "string" ? entry.value : "";
    if (!expected.includes(key) || Object.hasOwn(values, key) || levels && entry.label !== levels[Number(key)]) throw new Error("invalid supplied option identity");
    values[key] = probability(entry.probability);
  }
  if (Math.abs(Object.values(values).reduce((sum, value) => sum + value, 0) - 1) > 0.002) throw new Error("invalid probability distribution");
  return { ...values };
}
const openai: DecisionProviderAdapter = {
  id: "openai", version: "openai-decisions-1", endpoint: "https://api.openai.com/v1/decisions", credentialName: "OPENAI_API_KEY",
  layouts: ["compact-v1", "shared-v1"], modalities: ["text", "image"], responseBytes: 4 * 1024 * 1024, modelIdentity: "mutable-alias",
  // Serialized bytes bound admission. They are not an image-token or dollar estimator.
  policy: { concurrency: 4, requestsPerMinute: 960, estimatedInputTokensPerSecond: null, maxRequestBytes: 16 * 1024 * 1024 },
  validModel: model => model === "gpt-6-luna", usage: openaiUsage,
  payload(request, definitions, model) {
    const legacy = decisionPayload(request, definitions, model);
    const questions = request.questions.map(question => {
      const definition = definitions[question.definitionId]!;
      const instructions = canonical(object(legacy.questions)[question.name] && object(object(legacy.questions)[question.name]).instructions);
      return { type: definition.shape === "noul" ? "predicate" : definition.shape, name: question.name, instructions,
        ...(definition.shape === "choice" ? { choices: [...question.candidates!.map(item => ({ value: item.id, description: item.description })),
          { value: "unknown", description: "No supplied candidate is supported by this evidence, or the evidence is insufficient." }] } : {}),
        ...(definition.shape === "score" ? { levels: definition.levels!.map(label => ({ label, description: label })) } : {}) };
    });
    return { model, input: canonical({ state: legacy.state }), questions };
  },
  decode(raw, request, definitions, model, payloadDigest) {
    const body = object(raw);
    if (body.model !== model || !this.validModel(model)) throw new Error("provider model mismatch");
    if (!Array.isArray(body.answers)) throw new Error("invalid provider answers");
    const names = new Set(request.questions.map(question => question.name)), entries = new Map<string, Record<string, unknown>>();
    for (const rawAnswer of body.answers) {
      const answer = object(rawAnswer);
      if (typeof answer.name !== "string" || !names.has(answer.name) || entries.has(answer.name)) throw new Error("provider invented or repeated answer identity");
      entries.set(answer.name, answer);
    }
    const answers: Record<string, QuestionOutcome> = {};
    for (const question of request.questions) {
      const definition = definitions[question.definitionId]!;
      try {
        const answer = entries.get(question.name);
        if (!answer) throw new Error("missing question answer");
        if (answer.type === "refusal") { answers[question.name] = { status: "refused", reason: "provider-refused", native: { type: "refusal", name: question.name } }; continue; }
        const shape = definition.shape === "noul" ? "predicate" : definition.shape;
        if (answer.type !== shape) throw new Error("answer shape does not match question");
        if (definition.shape === "noul") answers[question.name] = { status: "answered", shape: "noul", probability: probability(answer.probability), native: { type: "predicate", name: question.name, probability: answer.probability } };
        else if (definition.shape === "choice") {
          const options = [...question.candidates!.map(item => item.id), "unknown"], values = distribution(answer.probabilities, options), confidence = probability(answer.confidence);
          if (typeof answer.choice !== "string" || !options.includes(answer.choice) || values[answer.choice]! < Math.max(...Object.values(values))) throw new Error("invalid provider choice");
          const native = { type: "choice", name: question.name, choice: answer.choice,
            probabilities: options.map(value => ({ value, probability: values[value]! })), confidence };
          answers[question.name] = answer.choice === "unknown" ? { status: "unknown", reason: "provider-unknown-option", native }
            : { status: "answered", shape: "choice", choice: answer.choice, confidence, probabilities: values, native };
        } else {
          const levels = definition.levels!, keys = levels.map((_, index) => String(index)), values = distribution(answer.probabilities, keys, levels);
          const score = keys.reduce((sum, key, index) => sum + index * values[key]!, 0);
          if (typeof answer.score !== "number" || !Number.isFinite(answer.score) || answer.score < 0 || answer.score > levels.length - 1 || Math.abs(answer.score - score) > 0.002 * (levels.length - 1)) throw new Error("invalid weighted score");
          const confidence = probability(answer.confidence);
          answers[question.name] = { status: "answered", shape: "score", score, confidence, distribution: values,
            legend: Object.fromEntries(levels.map((label, index) => [String(index), label])), native: { type: "score", name: question.name, score: answer.score,
              probabilities: keys.map(value => ({ value: Number(value), label: levels[Number(value)]!, probability: values[value]! })), confidence } };
        }
      } catch { answers[question.name] = { status: "invalid", reason: "invalid-question-answer" }; }
    }
    return { model, payloadDigest, usage: this.usage(raw), answers };
  },
};
export function decisionProviderAdapter(id: DecisionProviderId): DecisionProviderAdapter {
  if (id === "jev") return jev;
  if (id === "openai") return openai;
  throw new Error("Unsupported decision provider");
}

/** Configured intent is observable before dispatch; returned identity requires an actual response. */
export function configuredDecisionProvider(id: DecisionProviderId, model: string, configurationDigest: string): DecisionProviderIdentity {
  const adapter = decisionProviderAdapter(id);
  return { id, adapterVersion: adapter.version, requestedModel: model, returnedModel: null,
    modelIdentity: adapter.modelIdentity, configurationDigest };
}

/** Unknown historical fields cannot qualify a paid answer for reuse in a current request. */
export function sameConfiguredDecisionProvider(actual: DecisionProviderIdentity | undefined, expected: DecisionProviderIdentity): boolean {
  return !!actual && actual.adapterVersion !== null && actual.requestedModel !== null && actual.configurationDigest !== null &&
    actual.id === expected.id && actual.adapterVersion === expected.adapterVersion && actual.requestedModel === expected.requestedModel &&
    actual.modelIdentity === expected.modelIdentity && actual.configurationDigest === expected.configurationDigest;
}
