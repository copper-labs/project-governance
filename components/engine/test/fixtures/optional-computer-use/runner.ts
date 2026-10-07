import { createHash, randomUUID } from "node:crypto";
import { closeSync, fsyncSync, mkdirSync, openSync, writeSync } from "node:fs";
import { join } from "node:path";
import { aborted, PilotFailure, strictPoint, type Point } from "./holo.ts";

export interface FrameState { session: string; generation: number; width: number; height: number; scale: number; origin: string }
export interface Capture extends FrameState { token: string; digest: string; path: string; bytes: Buffer; pixelWidth: number; pixelHeight: number }
export type ScriptAction = { kind: "click" } | { kind: "type"; text: string } | { kind: "scroll"; deltaY: number };
export interface Driver {
  frame(): Promise<FrameState>; screenshot(): Promise<Buffer>; dispatch(action: ScriptAction, point: Point): Promise<void>;
  readback(): Promise<unknown>; close(): Promise<void>;
}
export interface ScriptStep { id: string; target: string; action: ScriptAction; effectObserved(state: unknown): boolean }
export interface PilotLimits { steps: number; calls: number; elapsedMs: number }
export interface ActionReceipt { id: string; captureToken: string; status: "observed" | "unresolved"; acknowledgment: "received" | "lost"; nativeState: unknown; observationReason: string | null }
export type Grounder = (bytes: Buffer, target: string, signal?: AbortSignal) => Promise<Point>;
export const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
export function immutableWrite(path: string, bytes: Buffer | string): void {
  const fd = openSync(path, "wx", 0o600);
  try { const value = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes); let offset = 0;
    while (offset < value.length) offset += writeSync(fd, value, offset, value.length - offset);
    fsyncSync(fd);
  } finally { closeSync(fd); }
  const directory = openSync(join(path, ".."), "r"); try { fsyncSync(directory); } finally { closeSync(directory); }
}
function sameFrame(a: FrameState, b: FrameState) {
  return ["session", "generation", "width", "height", "scale", "origin"].every(key => a[key as keyof FrameState] === b[key as keyof FrameState]);
}
export function mappedPoint(capture: Capture, candidate: Point): Point {
  const point = strictPoint(candidate);
  const x = point.x / 1000 * capture.pixelWidth / capture.scale, y = point.y / 1000 * capture.pixelHeight / capture.scale;
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x >= capture.width || y >= capture.height)
    throw new PilotFailure("point-outside-viewport");
  return { x, y };
}

/** A per-run artifact owner, not a second resumable task service. New run IDs never replay old intent. */
export class FixtureRunner {
  readonly directory: string;
  readonly started = performance.now();
  readonly runId: string; readonly driver: Driver; readonly allowedOrigin: string; readonly limits: PilotLimits;
  readonly ground: Grounder; readonly previousRunId: string | null; private readonly retain: typeof immutableWrite;
  private calls = 0; private steps = 0; private captures = 0; private terminal = false;
  constructor(runId: string, root: string, driver: Driver, allowedOrigin: string,
    limits: PilotLimits, ground: Grounder, retain: typeof immutableWrite = immutableWrite, previousRunId: string | null = null) {
    this.runId = runId; this.driver = driver; this.allowedOrigin = allowedOrigin; this.limits = limits; this.ground = ground;
    this.retain = retain; this.previousRunId = previousRunId;
    if (!/^[A-Za-z0-9_-]{1,80}$/u.test(runId) || !Object.values(limits).every(value => Number.isSafeInteger(value) && value > 0))
      throw new PilotFailure("configuration-invalid");
    this.directory = join(root, runId); mkdirSync(this.directory, { recursive: false, mode: 0o700 });
    this.retain(join(this.directory, "run.json"), JSON.stringify({ version: 1, runId, previousRunId, limits, allowedOrigin }));
  }
  private budget(signal?: AbortSignal) {
    if (this.terminal) throw new PilotFailure("run-unresolved");
    if (signal?.aborted) throw new PilotFailure("cancelled");
    if (performance.now() - this.started >= this.limits.elapsedMs) throw new PilotFailure("budget-exhausted");
  }
  private async observe<T>(operation: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
    const remaining = this.limits.elapsedMs - (performance.now() - this.started);
    if (remaining <= 0) throw new PilotFailure("budget-exhausted");
    const deadline = new AbortController(), timer = setTimeout(() => deadline.abort(), Math.ceil(remaining));
    const combined = signal ? AbortSignal.any([signal, deadline.signal]) : deadline.signal;
    try { return await aborted(operation(combined), combined); }
    finally { clearTimeout(timer); }
  }
  /** Final task observations use the same remaining run budget; they add no retry or execution authority. */
  async observeFinal<T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    this.budget(signal);
    return this.observe(operation, signal);
  }
  async capture(signal?: AbortSignal): Promise<Capture> {
    this.budget(signal);
    const before = await this.observe(() => this.driver.frame(), signal);
    if (before.origin !== this.allowedOrigin || !before.session || !Number.isInteger(before.generation) || before.generation < 0 ||
      ![before.width, before.height, before.scale].every(value => Number.isFinite(value) && value > 0)) throw new PilotFailure("frame-invalid");
    const bytes = await this.observe(() => this.driver.screenshot(), signal), after = await this.observe(() => this.driver.frame(), signal);
    if (!sameFrame(before, after)) throw new PilotFailure("capture-stale");
    if (bytes.length < 24 || bytes.length > 32 * 1024 * 1024 || bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" || bytes.toString("ascii", 12, 16) !== "IHDR")
      throw new PilotFailure("capture-invalid");
    const pixelWidth = bytes.readUInt32BE(16), pixelHeight = bytes.readUInt32BE(20);
    if (pixelWidth !== Math.round(before.width * before.scale) || pixelHeight !== Math.round(before.height * before.scale)) throw new PilotFailure("geometry-invalid");
    const capture: Capture = { ...before, pixelWidth, pixelHeight, token: randomUUID(), digest: digest(bytes), bytes,
      path: join(this.directory, `capture-${++this.captures}.png`) };
    this.retain(capture.path, bytes);
    this.retain(capture.path + ".json", JSON.stringify({ ...capture, bytes: undefined }));
    return capture;
  }
  async step(script: ScriptStep, signal?: AbortSignal): Promise<ActionReceipt> {
    this.budget(signal);
    if (!/^[A-Za-z0-9_-]{1,80}$/u.test(script.id) || this.steps >= this.limits.steps) throw new PilotFailure("budget-exhausted");
    if (!["click", "type", "scroll"].includes(script.action.kind) || script.action.kind === "type" && (typeof script.action.text !== "string" || script.action.text.length > 4096) ||
      script.action.kind === "scroll" && (!Number.isInteger(script.action.deltaY) || Math.abs(script.action.deltaY) > 2000)) throw new PilotFailure("action-invalid");
    const capture = await this.capture(signal);
    if (this.calls >= this.limits.calls) throw new PilotFailure("budget-exhausted");
    this.calls++;
    const candidate = await this.observe(bounded => this.ground(Buffer.from(capture.bytes), script.target, bounded), signal);
    this.budget(signal);
    if (!sameFrame(capture, await this.observe(() => this.driver.frame(), signal))) throw new PilotFailure("capture-stale");
    this.budget(signal);
    const point = mappedPoint(capture, candidate);
    // Durable intent precedes the single mutation. Failed retention must leave the browser untouched.
    this.retain(join(this.directory, `intent-${script.id}.json`), JSON.stringify({ version: 1, id: script.id, captureToken: capture.token,
      captureSha256: capture.digest, action: script.action.kind, point }));
    this.budget(signal);
    this.steps++;
    let acknowledgment: ActionReceipt["acknowledgment"] = "received";
    let observationReason: string | null = null;
    try { await this.observe(() => this.driver.dispatch(script.action, point), signal); }
    catch (error) { acknowledgment = "lost"; observationReason = error instanceof PilotFailure ? error.reason : "acknowledgment-lost"; }
    // Cancellation after dispatch does not establish non-execution. Settle with a readback, never another mutation.
    let nativeState: unknown = null;
    try { nativeState = await this.observe(() => this.driver.readback()); }
    catch (error) { observationReason = error instanceof PilotFailure ? error.reason : "readback-unavailable"; }
    let observed = false; try { observed = script.effectObserved(nativeState); } catch { /* Invalid readback is not proof. */ }
    const receipt: ActionReceipt = { id: script.id, captureToken: capture.token, status: observed ? "observed" : "unresolved", acknowledgment, nativeState, observationReason };
    try { this.retain(join(this.directory, `result-${script.id}.json`), JSON.stringify(receipt)); }
    catch { this.terminal = true; throw new PilotFailure("retention-failed-after-dispatch"); }
    if (!observed) this.terminal = true;
    return receipt;
  }
  counts() { return { calls: this.calls, steps: this.steps, captures: this.captures, elapsedMs: performance.now() - this.started }; }
  async close() { await this.driver.close(); }
}
