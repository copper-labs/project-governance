import type { RunBinding } from "./workflow-types.ts";

/** One owner and one cumulative submission allowance survive coordinator restarts. */
export interface DiagnosticOwner { token: string; pid: number; fingerprint: string; host: string }
export interface DiagnosticAttempt {
  probeId: string; recipeDigest: string; childRunId: string;
  method: "baseline" | "jev"; decisionReceiptId: string | null;
}
export interface DiagnosticEpisode {
  version: 1; id: string; requestDigest: string; parentRunId: string; stageId: string;
  catalogDigest: string; deadline: number; owner: DiagnosticOwner | null;
  revision: number; attempts: DiagnosticAttempt[]; decisions: string[]; closedReason: string | null;
  createdAt: string;
}
export interface DiagnosticProbe { id: string; description: string; binding: RunBinding }
