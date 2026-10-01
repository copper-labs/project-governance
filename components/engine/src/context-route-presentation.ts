import { join } from "node:path";
import { contextStateRoot } from "./context-command.ts";
import type { RoutedContextPacket } from "./context-route-command.ts";

/** Keep paid selection and native replay identical; only the command's presentation changes. */
export function presentContextRoute(packet: RoutedContextPacket & { reuse?: unknown }) {
  const selection = packet.selection, metadata = packet.metadata;
  return { version: 1, presentation: "selected-context", ready: packet.ready, receiptId: packet.receiptId,
    receipt: packet.receiptPersisted ? join(contextStateRoot(packet.execution.workspace), "routes", `${packet.receiptId}.json`) : null,
    execution: packet.execution, inputDigest: packet.inputDigest, revision: packet.revision, source: packet.source,
    route: packet.route, entries: packet.entries, skills: packet.skills, blockers: packet.blockers,
    routingPaths: { mode: packet.routingPaths.mode },
    omissions: packet.omissions, optional: packet.optional ? { entries: packet.optional.entries,
      reason: packet.optional.reason, omitted: packet.optional.omitted, omissionReasons: packet.optional.omissionReasons,
      judgmentLimitations: packet.optional.judgmentLimitations, unitOrdering: packet.optional.unitOrdering,
      omittedJudgedUnits: packet.optional.omittedJudgedUnits,
      decision: packet.optional.decision ? { method: packet.optional.decision.method,
        reason: packet.optional.decision.reason, receiptId: packet.optional.decision.receiptId } : null } : null,
    relevanceAdvice: packet.relevanceAdvice ? { authority: packet.relevanceAdvice.authority,
      mode: packet.relevanceAdvice.mode, effect: packet.relevanceAdvice.effect,
      reason: packet.relevanceAdvice.reason, delivered: packet.relevanceAdvice.delivered,
      method: packet.relevanceAdvice.method, coverage: packet.relevanceAdvice.coverage } : null,
    workflowAdvice: packet.workflowAdvice,
    metadata: metadata ? { reason: metadata.reason, coverage: metadata.coverage } : null,
    selection: { binding: selection.binding, reason: selection.reason, candidateCount: selection.candidateCount,
      inventoryUnavailable: selection.inventoryUnavailable, optionalDelivery: selection.optionalDelivery,
      optionalClippedPaths: selection.optionalClippedPaths, optionalOmissionReasons: selection.optionalOmissionReasons },
    procedureReferences: packet.procedureReferences, procedureReferenceCount: packet.procedureReferenceCount,
    expansion: packet.expansion, timing: packet.timing, ...(packet.reuse ? { reuse: packet.reuse } : {}),
    diagnostics: "Use context-route with --json for full diagnostics; selected content and original references are shown here." };
}
