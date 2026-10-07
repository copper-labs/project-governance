import { join } from "node:path";
import { immutableWrite, type Capture, type ActionReceipt, type FixtureRunner, type ScriptStep } from "./runner.ts";
import type { Scenario, Fault } from "./browser.ts";

export const scriptedPoints = {
  form: [{ x: 250, y: 350 }, { x: 250, y: 233 }, { x: 250, y: 350 }],
  settings: [{ x: 250, y: 183 }, { x: 250, y: 325 }, { x: 350, y: 453 }],
  canvas: [{ x: 625, y: 275 }],
};
const state = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};
export function scripts(scenario: Scenario): ScriptStep[] {
  if (scenario === "form") return [
    { id: "empty-submit", target: "Submit contact button below the address field", action: { kind: "click" }, effectObserved: v => state(v)["validations"] === 1 },
    { id: "enter-address", target: "Contact address field above Submit contact", action: { kind: "type", text: "sample@example.test" }, effectObserved: v => state(v)["field"] === "sample@example.test" },
    { id: "submit", target: "Submit contact button below the address field", action: { kind: "click" }, effectObserved: v => state(v)["submits"] === 1 },
  ];
  if (scenario === "settings") return [
    { id: "open-dialog", target: "Open preferences button", action: { kind: "click" }, effectObserved: v => state(v)["focused"] === "menu" },
    { id: "enable-setting", target: "Checkbox beside Enable reminders in preferences dialog", action: { kind: "click" }, effectObserved: v => state(v)["selected"] === true },
    { id: "save-setting", target: "Save preferences button below the checkbox", action: { kind: "click" }, effectObserved: v => state(v)["toast"] === "Preferences saved" },
  ];
  return [{ id: "right-control", target: "The right-hand blue Activate control", action: { kind: "click" }, effectObserved: v => ["left", "right"].includes(String(state(v)["target"])) }];
}
export interface Trial {
  version: 1; runId: string; scenario: Scenario; fault: string; nativeStatus: "passed" | "failed" | "unresolved";
  nativeState: unknown; wrongTarget: boolean; duplicateActions: boolean; receipts: ActionReceipt[];
  finalObservationReason?: string | null;
  checkpoints: Array<{ id: string; image: Omit<Capture, "bytes">; independentLabel: "unlabeled" }>;
  counters: ReturnType<FixtureRunner["counts"]>; modelProof: "injected-fixture-only";
}
export async function trial(runner: FixtureRunner, fixture: { scenario: Scenario; fault: Fault; readback(): Promise<unknown>; reload(): Promise<void> }, signal?: AbortSignal): Promise<Trial> {
  const checkpoints: Trial["checkpoints"] = [];
  const checkpoint = async (id: string) => { const { bytes: _bytes, ...image } = await runner.capture(signal); checkpoints.push({ id, image, independentLabel: "unlabeled" }); };
  const receipts: ActionReceipt[] = [];
  await checkpoint("before");
  for (const script of scripts(fixture.scenario)) {
    const receipt = await runner.step(script, signal); receipts.push(receipt);
    if (receipt.status === "unresolved") break;
    if (script.id === "empty-submit" || script.id === "open-dialog") await checkpoint(script.id);
  }
  let nativeState: unknown = receipts.at(-1)?.nativeState ?? null, finalObservationReason: string | null = null;
  if (receipts.every(row => row.status === "observed")) {
    try {
      nativeState = await runner.observeFinal(() => fixture.readback(), signal);
      if (fixture.scenario === "settings") {
        await runner.observeFinal(() => fixture.reload(), signal);
        nativeState = await runner.observeFinal(() => fixture.readback(), signal);
      }
      await checkpoint("after");
    } catch (error) { finalObservationReason = error instanceof Error ? error.message : "final-observation-unavailable"; }
  }
  const observed = state(nativeState), wrongTarget = fixture.scenario === "canvas" && observed["target"] === "left";
  const duplicateActions = fixture.scenario === "form" && Number(observed["submits"]) > 1;
  const correct = fixture.scenario === "form" ? observed["record"] === "sample@example.test" && observed["submits"] === 1 :
    fixture.scenario === "settings" ? observed["selected"] === true : !wrongTarget;
  const result: Trial = { version: 1, runId: runner.runId, scenario: fixture.scenario, fault: fixture.fault,
    nativeStatus: finalObservationReason || receipts.some(row => row.status === "unresolved") ? "unresolved" : correct ? "passed" : "failed",
    nativeState, wrongTarget, duplicateActions, finalObservationReason, receipts, checkpoints, counters: runner.counts(), modelProof: "injected-fixture-only" };
  immutableWrite(join(runner.directory, "trial.json"), JSON.stringify(result));
  return result;
}

export interface VisualAdvice { checkpoint: string; status: "answered" | "unknown" | "refused" | "unavailable"; answer: boolean | null; receipt: string | null }
/** Reporting is post-run only. Evaluator advice never rewrites the native verdict or creates another action. */
export function pairedReport(trials: Trial[], advice: Map<string, VisualAdvice[]>, labels: Map<string, boolean>) {
  const elapsed = trials.map(value => value.counters.elapsedMs).sort((a, b) => a - b);
  const percentile = (p: number) => elapsed.length ? elapsed[Math.ceil(p * elapsed.length) - 1] ?? null : null;
  let falsePasses = 0, falseAlarms = 0, requested = 0, answered = 0, unknown = 0, refused = 0, unavailable = 0, missingAdvice = 0,
    labelled = 0, labelledAnswered = 0, unlabeled = 0;
  for (const value of trials) for (const checkpoint of value.checkpoints) {
    requested++;
    const item = advice.get(value.runId)?.find(entry => entry.checkpoint === checkpoint.id);
    const label = labels.get(value.runId + ":" + checkpoint.id);
    if (label === undefined) unlabeled++; else labelled++;
    if (!item) { missingAdvice++; unavailable++; continue; }
    if (item.status === "refused") { refused++; continue; }
    if (item.status === "unknown") { unknown++; continue; }
    if (item.status !== "answered" || item.answer === null) { unavailable++; continue; }
    answered++;
    if (label === undefined) continue;
    labelledAnswered++; if (item.answer && !label) falsePasses++; if (!item.answer && label) falseAlarms++;
  }
  return { version: 1, sampleCount: trials.length, native: {
    passed: trials.filter(v => v.nativeStatus === "passed").length, failed: trials.filter(v => v.nativeStatus === "failed").length,
    unresolved: trials.filter(v => v.nativeStatus === "unresolved").length, wrongTargets: trials.filter(v => v.wrongTarget).length,
    duplicateActions: trials.filter(v => v.duplicateActions).length,
  }, visual: { requested, answered, unknown, refused, unavailable, missingAdvice, labelled, labelledAnswered, unlabeled, falsePasses, falseAlarms, accuracyQualified: false },
    latency: { p50Ms: percentile(.5), p95Ms: percentile(.95), sampleCount: elapsed.length, coldSetupMs: null },
    cost: { nativeUsage: null, totalCost: null }, trials: trials.map(v => ({ runId: v.runId, nativeStatus: v.nativeStatus,
      captures: v.checkpoints.map(c => ({ id: c.id, sha256: c.image.digest, path: c.image.path })), advice: advice.get(v.runId) ?? [] })),
    limitations: ["Fixture transport establishes wiring, not grounding or visual accuracy", "Unlabeled captures do not qualify evaluator quality", "No paid-model or savings claim"],
  };
}
