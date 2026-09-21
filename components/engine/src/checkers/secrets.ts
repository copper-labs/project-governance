import { createHash } from "node:crypto";
import type { AnySchema } from "ajv";
import { schemaErrors } from "../schema-validation.ts";
import { safeSubjectPath } from "../change-subject.ts";
import { findingSummary, type Finding } from "../checker-results.ts";

const DETECTORS = {
  "private-key": /-----BEGIN (?:[A-Z0-9]+ )?PRIVATE KEY-----/,
  "aws-secret-access-key": /AWS_SECRET_ACCESS_KEY["'\]]{0,2}[ \t]{0,16}(?:[:=][ \t\r\n]{0,16}|[ \t]{1,16})["']?[A-Za-z0-9/+=]{40}/,
  "github-token": /ghp_[A-Za-z0-9]{36}/,
};
export interface SecretScan { detectorIds: string[]; sha256: string }
export interface SecretWaiver { path: string; detector_id: string; after_image_sha256: string; owner: string; rationale: string; expires: string }

/** Hash every byte while retaining only enough overlap to recognize signatures across stream chunks. */
export async function scanSecretChunks(chunks: AsyncIterable<Uint8Array> | Iterable<Uint8Array>): Promise<SecretScan> {
  const hash = createHash("sha256"), found = new Set<string>(); let tail = Buffer.alloc(0);
  for await (const raw of chunks) {
    const chunk = Buffer.from(raw); hash.update(chunk);
    // Latin-1 preserves byte values and ASCII pattern semantics even for non-UTF8 input.
    const window = Buffer.concat([tail, chunk]);
    const text = window.toString("latin1");
    for (const [id, pattern] of Object.entries(DETECTORS)) if (pattern.test(text)) found.add(id);
    tail = Buffer.from(window.subarray(Math.max(0, window.length - 128)));
  }
  return { detectorIds: [...found].sort(), sha256: hash.digest("hex") };
}

/** Invalid registry entries block, while valid waivers bind one detector to one exact after-image. */
export function secretWaivers(value: unknown, schema: AnySchema, today: string, label = "config/policies/secret-waivers.yaml") {
  const findings: Finding[] = [], waivers: SecretWaiver[] = [];
  const errors = schemaErrors(schema, value);
  if (errors.length) return { waivers, findings: [{ rule_id: "security.waiver-registry-invalid", severity: "blocking" as const,
    message: `${label}${errors[0]}${errors.length > 1 ? ` (${errors.length} registry errors total)` : ""}` }] };
  for (const [index, waiver] of (value as { waivers: SecretWaiver[] }).waivers.entries()) {
    const path = waiver.path.trim(); let exact = false;
    try { exact = safeSubjectPath(path) === path && !/[\\*?\[\x00-\x1f\x7f]/.test(path); } catch { /* Invalid path cannot grant suppression. */ }
    if (!exact) { findings.push({ rule_id: "security.waiver-registry-invalid", severity: "blocking", message: `${label}.waivers[${index}].path: must be an exact normalized repository path` }); continue; }
    if (waiver.expires < today) { findings.push({ rule_id: "security.waiver-expired", severity: "blocking", path, message: `secret waiver ${index + 1} expired on ${waiver.expires}` }); continue; }
    waivers.push({ ...waiver, path });
  }
  return { waivers, findings };
}

/** Union worktree/index image identities: a waiver for one image cannot hide another secret-bearing image. */
export function secretFindings(images: Array<{ path: string; scan: SecretScan }>, waivers: SecretWaiver[]): Finding[] {
  const detections = new Map<string, { path: string; detector: string; hashes: Set<string> }>();
  for (const image of images) for (const detector of image.scan.detectorIds) {
    const key = JSON.stringify([image.path, detector]), item = detections.get(key) ?? { path: image.path, detector, hashes: new Set<string>() };
    item.hashes.add(image.scan.sha256); detections.set(key, item);
  }
  return [...detections.values()].map(item => {
    const hashes = new Set(waivers.filter(w => w.path === item.path && w.detector_id === item.detector).map(w => w.after_image_sha256));
    const suppressed = [...item.hashes].every(hash => hashes.has(hash));
    return { rule_id: "security.embedded-secret", severity: suppressed ? "suppressed" : "blocking", path: item.path, detector_id: item.detector,
      message: suppressed ? `${item.detector} finding is suppressed by an exact current waiver` : `contains a value detected by ${item.detector}` };
  });
}

export function secretResult(images: Array<{ path: string; scan: SecretScan }>, waivers: SecretWaiver[], infrastructure: Finding[] = []) {
  const findings = [...infrastructure, ...secretFindings(images, waivers)];
  findings.sort((a, b) => {
    for (const key of ["path", "rule_id", "detector_id"]) { const left = String(a[key] ?? ""), right = String(b[key] ?? ""); if (left !== right) return left < right ? -1 : 1; }
    return 0;
  });
  return { version: 1, kind: "governance-check-result", ...findingSummary(findings), findings };
}
