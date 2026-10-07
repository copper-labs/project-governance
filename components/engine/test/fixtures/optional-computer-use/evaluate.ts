import { readFileSync, realpathSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { digest, immutableWrite, type Capture } from "./runner.ts";
import { minimalDriverEnvironment, PilotFailure } from "./holo.ts";
import type { Trial, VisualAdvice } from "./scenarios.ts";

interface CallerRequest {
  version: 1; evaluationId: string; evidence: Array<{ id: string; type: "image"; path: string; role: string }>;
  questions: Array<{ name: string; type: "choice"; instructions: string; choices: Array<{ value: string; description: string }> }>;
  localOnly: boolean;
}
const criteria: Record<string, string> = { before: "The task's initial controls are visible and their labels are legible",
  "empty-submit": "The form visibly displays Address is required",
  "open-dialog": "Enable reminders and Save preferences are both fully visible and legible",
  after: "The task visibly displays its final confirmation or selected state" };
export function requestForTrial(value: Trial, workspace: string, evaluationId: string, localOnly = false): CallerRequest {
  const canonicalWorkspace = realpathSync(workspace);
  const evidence = value.checkpoints.map(checkpoint => {
    const original = realpathSync(checkpoint.image.path), path = relative(canonicalWorkspace, original);
    if (path === ".." || path.startsWith(".." + sep) || resolve(canonicalWorkspace, path) !== original || digest(readFileSync(original)) !== checkpoint.image.digest)
      throw new PilotFailure("capture-provenance-invalid");
    return { id: checkpoint.id, type: "image" as const, path, role: `Current synthetic ${value.scenario} capture for ${checkpoint.id}` };
  });
  return { version: 1, evaluationId, evidence, localOnly, questions: value.checkpoints.map(checkpoint => ({ name: "checkpoint-" + checkpoint.id,
    type: "choice", instructions: `Use only image ${checkpoint.id}. Assess this visible criterion: ${criteria[checkpoint.id] ?? "The requested visible criterion is present"}. Do not infer saved state from a confirmation.`,
    choices: [{ value: "criterion-met", description: "The visible criterion is met" }, { value: "criterion-not-met", description: "The visible criterion is not met" },
      { value: "uncertain", description: "The capture cannot establish the visible criterion" }],
  })) };
}
export function parseAdvice(request: CallerRequest, stdout: string, retained: Trial["checkpoints"]): VisualAdvice[] {
  let envelope: Record<string, unknown> | null = null;
  try {
    const value = JSON.parse(stdout);
    if (value?.version === 3 && value.kind === "supplied-evaluation" && value.evaluationId === request.evaluationId &&
      ["complete", "partial", "invalid", "unsupported", "unavailable"].includes(value.status) && value.answers && typeof value.answers === "object" && !Array.isArray(value.answers)) envelope = value;
  } catch { /* A missing envelope leaves each declared question unavailable. */ }
  const answers = envelope?.["answers"] as Record<string, Record<string, unknown>> | undefined;
  const evidence = Array.isArray(envelope?.["evidence"]) ? envelope["evidence"] as Array<Record<string, unknown>> : [];
  return request.questions.map(question => {
    const answer = answers?.[question.name], receipt = typeof envelope?.["receiptId"] === "string" ? envelope["receiptId"] : null;
    const checkpoint = question.name.replace(/^checkpoint-/u, "");
    const original = retained.filter(item => item.id === checkpoint), declared = request.evidence.filter(item => item.id === checkpoint),
      observed = evidence.filter(item => item && item["id"] === checkpoint);
    // A successful evaluator capture can observe different bytes after request construction. Its original descriptor owns that link.
    if (original.length !== 1 || declared.length !== 1 || observed.length !== 1 || observed[0]?.["type"] !== "image" ||
      observed[0]?.["digest"] !== "sha256:" + original[0]!.image.digest)
      return { checkpoint, status: "unavailable", answer: null, receipt };
    if (answer?.["status"] === "answered" && answer["shape"] === "choice" && ["criterion-met", "criterion-not-met", "uncertain"].includes(String(answer["choice"])))
      return { checkpoint, status: answer["choice"] === "uncertain" ? "unknown" : "answered", answer: answer["choice"] === "uncertain" ? null : answer["choice"] === "criterion-met", receipt };
    const status = answer?.["status"] === "unknown" || answer?.["status"] === "refused" ? answer["status"] : "unavailable";
    return { checkpoint, status, answer: null, receipt };
  });
}

/** No OpenAI client here. Only this separate existing evaluator command receives an explicitly named credential. */
export function evaluateFrozenTrial(value: Trial, options: { workspace: string; evaluationId: string; requestFile: string;
  node: string; cli: string; declaredCredentialEnv: string[]; env: NodeJS.ProcessEnv; deadlineMs: number; localOnly?: boolean;
  invoke?: (argv: string[], env: Record<string, string>) => { stdout: string; exitCode: number | null } }) {
  if (!Number.isSafeInteger(options.deadlineMs) || options.deadlineMs <= 0) throw new PilotFailure("configuration-invalid");
  const request = requestForTrial(value, options.workspace, options.evaluationId, options.localOnly);
  immutableWrite(options.requestFile, JSON.stringify(request));
  const childEnv = minimalDriverEnvironment(options.env);
  if (!options.localOnly && options.declaredCredentialEnv.includes("OPENAI_API_KEY") && options.env["OPENAI_API_KEY"])
    childEnv["OPENAI_API_KEY"] = options.env["OPENAI_API_KEY"];
  const argv = [options.node, options.cli, "evaluate", "--request-file", options.requestFile];
  const invoke = options.invoke ?? ((args, env) => { const result = spawnSync(args[0]!, args.slice(1), { cwd: options.workspace, env,
    timeout: options.deadlineMs, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 }); return { stdout: result.stdout ?? "", exitCode: result.status }; });
  let result: { stdout: string; exitCode: number | null };
  try { result = invoke(argv, childEnv); } catch { result = { stdout: "", exitCode: null }; }
  return { evaluationId: request.evaluationId, exitCode: result.exitCode, advice: parseAdvice(request, result.stdout, value.checkpoints) };
}

export type ImageTransform = { kind: "resize"; width: number; height: number } | { kind: "crop"; x: number; y: number; width: number; height: number };
export function derivativeProvenance(original: { digest: string; width: number; height: number }, derived: Buffer,
  transform: ImageTransform,
  criterionRegion: { x: number; y: number; width: number; height: number }) {
  if (![original.width, original.height, transform.width, transform.height, criterionRegion.width, criterionRegion.height].every(value => Number.isInteger(value) && value > 0) ||
    ![criterionRegion.x, criterionRegion.y].every(value => Number.isInteger(value) && value >= 0) ||
    transform.width > original.width || transform.height > original.height || criterionRegion.x + criterionRegion.width > original.width ||
    criterionRegion.y + criterionRegion.height > original.height) throw new PilotFailure("preparation-invalid");
  if (transform.kind === "crop" && (transform.x < 0 || transform.y < 0 || !Number.isInteger(transform.x) || !Number.isInteger(transform.y) ||
    transform.x + transform.width > original.width || transform.y + transform.height > original.height || criterionRegion.x < transform.x ||
    criterionRegion.y < transform.y || criterionRegion.x + criterionRegion.width > transform.x + transform.width ||
    criterionRegion.y + criterionRegion.height > transform.y + transform.height)) throw new PilotFailure("criterion-outside-crop");
  if (transform.kind === "resize" && Math.abs(transform.width / transform.height - original.width / original.height) > 0.01) throw new PilotFailure("preparation-aspect-invalid");
  return { originalSha256: original.digest, derivedSha256: digest(derived), originalDimensions: { width: original.width, height: original.height }, transform,
    controlCaptureChanged: false, tokenSavings: null };
}
interface Processor {
  metadata(): Promise<{ width?: number; height?: number }>; resize(width: number, height: number): Processor;
  extract(region: { left: number; top: number; width: number; height: number }): Processor; png(): Processor; toBuffer(): Promise<Buffer>;
}
/** Caller-selected image dependency operates on frozen bytes. It cannot recapture or replace the control image. */
export async function prepareDerivative(capture: Omit<Capture, "bytes">, options: { modulePath: string; outputPath: string; transform: ImageTransform;
  criterionRegion: { x: number; y: number; width: number; height: number } }) {
  const bytes = readFileSync(capture.path);
  if (digest(bytes) !== capture.digest) throw new PilotFailure("capture-provenance-invalid");
  const module = await import(options.modulePath) as { default: (bytes: Buffer) => Processor };
  const metadata = await module.default(bytes).metadata();
  if (metadata.width !== capture.pixelWidth || metadata.height !== capture.pixelHeight) throw new PilotFailure("geometry-invalid");
  const original = { digest: capture.digest, width: capture.pixelWidth, height: capture.pixelHeight };
  derivativeProvenance(original, Buffer.alloc(0), options.transform, options.criterionRegion);
  let image = module.default(bytes);
  if (options.transform.kind === "resize") image = image.resize(options.transform.width, options.transform.height);
  else image = image.extract({ left: options.transform.x, top: options.transform.y, width: options.transform.width, height: options.transform.height });
  const derived = await image.png().toBuffer(), observed = await module.default(derived).metadata();
  if (observed.width !== options.transform.width || observed.height !== options.transform.height) throw new PilotFailure("preparation-invalid");
  const provenance = derivativeProvenance(original, derived, options.transform, options.criterionRegion);
  immutableWrite(options.outputPath, derived); immutableWrite(options.outputPath + ".json", JSON.stringify(provenance));
  return provenance;
}
