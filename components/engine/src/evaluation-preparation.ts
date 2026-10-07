import { existsSync, realpathSync } from "node:fs";
import { Store } from "../../harness/src/store/store.ts";
import { defaultDbPath, workContext } from "../../harness/src/store/location.ts";
import { canonical, digest, object } from "./core.ts";
import { captureEvaluationEvidence } from "./evaluation-images.ts";
import { EVALUATION_LIMITS, type EvaluationRequest } from "./evaluation-schema.ts";
import { configuredDecisionProvider, decisionProviderAdapter } from "./decision-providers.ts";
import { estimateTokens } from "./decision-schema.ts";
import type { DecisionSettings } from "./decision-settings.ts";

/** Verify original association without selecting, binding, resuming or accepting any task. */
export function verifyEvaluationAssociation(workspace: string, request: EvaluationRequest): boolean {
  if (!request.association) return true;
  let store: Store | undefined;
  try {
    const root = realpathSync(workspace), path = defaultDbPath(root);
    if (!existsSync(path)) return false;
    store = new Store(path, { readOnly: true, busyTimeoutMs: 100 });
    const workspaceId = store.workspaceId(workContext(root).locator);
    if (!workspaceId) return false;
    const association = request.association, attempt = store.boundAttempt(association.session, workspaceId), task = store.readTask(association.taskId);
    return !!attempt && !!task && attempt.attemptId === association.attemptId && attempt.taskId === association.taskId &&
      String(attempt.taskVersion) === association.taskRevision && String(task.version) === association.taskRevision &&
      attempt.worktree === root && task.worktree === root;
  } catch { return false; } finally { store?.close(); }
}

/** Current grants are rechecked before replay; only provider semantics qualify the paid answer. */
export function evaluationConfigurationDigest(settings: DecisionSettings): string {
  const { provider, model } = settings.evaluation;
  return digest({ provider, model, adapterVersion: decisionProviderAdapter(provider).version });
}

export function prepareEvaluationRequest(workspace: string, request: EvaluationRequest, settings: DecisionSettings) {
  const config = settings.evaluation, adapter = decisionProviderAdapter(config.provider);
  const captured = captureEvaluationEvidence(workspace, request.evidence, config.allowedArtifactRoots);
  const provider = configuredDecisionProvider(config.provider, config.model, evaluationConfigurationDigest(settings));
  const evidence = captured.map(item => item.descriptor);
  // A renamed byte-identical image changes local provenance, not the semantic evidence sent to the provider.
  const semanticEvidence = evidence.map(({ reference: _reference, ...descriptor }) => descriptor);
  const requestIdentity = digest({ preparation: "supplied-evaluation/1", provider, evidence: semanticEvidence,
    questions: request.questions, association: request.association ?? null, localOnly: request.localOnly ?? false });
  const payload = adapter.suppliedPayload(captured, request.questions, config.model), body = canonical(payload), requestBytes = Buffer.byteLength(body);
  if (requestBytes > Math.min(adapter.policy.maxRequestBytes, EVALUATION_LIMITS.serializedBytes)) throw new Error("evaluation-serialized-byte-limit");
  if (config.provider === "jev" && (estimateTokens(payload) > 64000 || estimateTokens(object(payload).state) +
      Math.max(...Object.values(object(object(payload).questions)).map(estimateTokens)) > 32000)) throw new Error("evaluation-provider-text-limit");
  return { provider, evidence, requestIdentity, body, requestBytes, payloadDigest: digest(payload), tokenEstimate: config.provider === "jev" ? estimateTokens(payload) : null };
}
