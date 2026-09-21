/** Completion describes claimed work; native tool evidence is reconciled separately. */
export const PROVIDER_FINAL_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    outcome: { type: "string", enum: ["completed", "blocked", "incomplete"] }, answer: { type: "string" },
    artifacts: { type: "array", items: { type: "string", description: "A plain absolute filesystem path. No Markdown, backticks, or line-number suffix." } },
    checks: { type: "array", items: { type: "object", additionalProperties: false,
      properties: { description: { type: "string" }, result: { type: "string" }, evidence: { type: "string" } },
      required: ["description", "result", "evidence"] } },
    sources: { type: "array", items: { type: "string", description: "A plain source URL, without Markdown." } },
    remaining: { type: "array", items: { type: "string" } },
  }, required: ["outcome", "answer", "artifacts", "checks", "sources", "remaining"],
};
