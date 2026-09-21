import { closeSync, fsyncSync, linkSync, openSync, realpathSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { digest, durableJson, fileDigest, object, text } from "./core.ts";
import { boundedOutcomeReader } from "./decision-outcomes.ts";
import type { BudgetScope } from "./decision-budget.ts";

export interface PilotAssignment {
  version: 1; id: string; episodeId: string; experiment: string; definitionVersion: string;
  arm: string; assignedAt: string; groupingUnit: string; sourceRevision: string;
  scope: BudgetScope;
}

/** Assignments are written by the host before observation, not inferred from model delivery. */
export function readPilotAssignment(path: string, scope: BudgetScope, startedAt: number) {
  const raw = boundedOutcomeReader().read(path);
  const binding = object(raw.scope, "assignment scope");
  if (raw.version !== 1 || realpathSync(text(binding.workspace, "assignment workspace")) !== scope.workspace ||
      binding.taskId !== scope.taskId || binding.taskRevision !== scope.taskRevision) throw new Error("Assignment scope conflicts with native workflow");
  const episodeId = text(raw.episodeId, "episode id", 128);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/u.test(episodeId)) throw new Error("Invalid episode identifier");
  const assignedAt = text(raw.assignedAt, "assignment time", 64);
  if (!Number.isFinite(Date.parse(assignedAt)) || Date.parse(assignedAt) > startedAt) throw new Error("Assignment must precede observation");
  const assignment: PilotAssignment = { version: 1, id: text(raw.id, "assignment id", 128), episodeId,
    experiment: text(raw.experiment, "experiment", 128), definitionVersion: text(raw.definitionVersion, "definition version", 64),
    arm: text(raw.arm, "assigned arm", 64), assignedAt, groupingUnit: text(raw.groupingUnit, "grouping unit", 256),
    sourceRevision: text(raw.sourceRevision, "source revision", 128), scope };
  return { assignment, assignmentDigest: digest(raw) };
}

export interface EpisodeCapture {
  assignment: PilotAssignment; assignmentDigest: string;
  caller: "workflow-status" | "workflow-wait" | "workflow-diagnose";
  entryKind: "workflow-observe" | "workflow-diagnose";
  native: { runId: string; runDigest: string; stagesDigest: string; eventIds: number[]; eventsDigest: string };
  exposure: Record<string, unknown>;
  decisions: string[];
}

/** Immutable evidence uses atomic no-replace publication; it is not an operational budget store. */
export function recordDecisionEpisode(stateRoot: string, capture: EpisodeCapture) {
  const id = capture.assignment.episodeId, directory = join(stateRoot, "episodes"), path = join(directory, `${id}.json`);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/u.test(id)) throw new Error("Invalid episode identifier");
  const identity = { ...capture, scope: capture.assignment.scope };
  const identityDigest = digest(identity);
  const temporary = join(directory, `.${id}.${randomUUID()}.json`);
  try {
    durableJson(temporary, { version: 1, id, ...identity, identityDigest, capturedAt: new Date().toISOString(),
      decisionLinks: capture.decisions.map(receiptId => ({ receiptId })) });
    try { linkSync(temporary, path); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const retained = boundedOutcomeReader().read(path);
      if (retained.identityDigest !== identityDigest) throw new Error("episode-id-already-used");
    }
    const fd = openSync(directory, "r");
    try { fsyncSync(fd); } finally { closeSync(fd); }
    return { status: "recorded" as const, episode: { path, digest: fileDigest(path) } };
  } finally { rmSync(temporary, { force: true }); }
}
