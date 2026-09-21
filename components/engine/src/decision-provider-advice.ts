import { captureClaimEvidence, claimEvidenceUnchanged, type ClaimEvidenceCapture } from "./decision-claim-evidence.ts";
import { realpathSync } from "node:fs";
import { digest, object, text } from "./core.ts";
import { contextStateRoot } from "./context-command.ts";
import { loadProfileDecisionSettings } from "./decision-settings.ts";
import { DecisionRuntime } from "./decision-runtime.ts";
import { resolveDecisionScope } from "./decision-scope.ts";
import { outputSelection } from "./decision-output-advice.ts";
import { claimAdvice } from "./decision-claim-advice.ts";
import { providerResultSummary } from "./provider-result-summary.ts";
import type { CommandReceipt } from "./process-owner.ts";
import type { DecisionOptions } from "./decisions.ts";

/** Projection after native parsing. The job request, result artifact and exit status remain authoritative. */
export async function providerDecisionAdvice(request: Record<string, unknown>, receipt: CommandReceipt | null,
  summary: ReturnType<typeof providerResultSummary>, overrides: { taskId?: string; revision?: string; claimEvidence?: string } = {}, cancellation: DecisionOptions = {}) {
  if (!receipt || !summary) return { provider: summary, decisionAdvice: null };
  try {
    const workspace = realpathSync(text(object(request.operation).cwd, "provider workspace"));
    const settings = loadProfileDecisionSettings(workspace);
    if (settings.mode === "off") return { provider: summary, decisionAdvice: null };
    // A delegated job supplies its own durable identity; never infer one from assignment prose.
    const scope = resolveDecisionScope(workspace, overrides, { workspace,
      taskId: `provider-job:${text(request.id, "provider job identity", 200)}`, revision: receipt.requestDigest });
    const runtime = new DecisionRuntime(settings, contextStateRoot(workspace), cancellation);
    const common = { eventId: `provider:${receipt.requestDigest}`, policyDigest: settings.configDigest,
      environment: "provider-observation", revision: receipt.requestDigest };
    let capture: ClaimEvidenceCapture | null = null;
    let claimEvidence: { status: "bound" | "invalid"; detail?: string } | null = null;
    if (overrides.claimEvidence && summary.completion) {
      try { capture = captureClaimEvidence(workspace, overrides.claimEvidence, receipt, summary.completion); claimEvidence = { status: "bound" }; }
      catch { claimEvidence = { status: "invalid", detail: "The supplied claim references failed native evidence binding; no claim assessment was made." }; }
    }
    const claims = claimEvidence?.status === "invalid" || (runtime.eligibility("DL09").mode === "off" && !capture) ? null : await claimAdvice(runtime, receipt, summary, scope,
      { ...common, ...(capture ? { boundEvidence: capture.entries } : {}) });
    const completion = summary.completion;
    const output = !completion || runtime.eligibility("DL13").mode === "off" ? null : await outputSelection(runtime, receipt, scope, {
      ...common, task: typeof object(request.assignment).task === "string" ? String(object(request.assignment).task).slice(0, 2000) : "Review the delegated result",
      presentation: { text: completion.answer, originalPath: summary.evidence.path,
        originalDigest: summary.evidence.digest!, truncated: summary.truncated },
    });
    // Recheck the artifact after inference, before replacing its public presentation.
    providerResultSummary(receipt);
    if (capture && !claimEvidenceUnchanged(capture)) throw new Error("Claim evidence changed during advice");
    const provider = output?.delivered && output.selection && completion ? {
      ...summary, completion: { ...completion, answer: output.selection.text },
      presentation: { kind: "selected-output", original: output.retrieval, omitted: output.omitted },
    } : summary;
    return { provider, decisionAdvice: { claims, output, claimEvidence } };
  } catch {
    return { provider: summary, decisionAdvice: { claims: null, output: null, reason: "advice-unavailable-or-stale" } };
  }
}
