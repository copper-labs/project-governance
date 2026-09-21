import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { digest, object, text } from "./core.ts";
import { narrativeFile } from "./narrative-inputs.ts";
import { validateCommandRequest, type CommandRequest, type CommandReceipt } from "./process-owner.ts";
import type { ProviderCompletion } from "./provider-completion.ts";

export interface BoundClaimEvidence {
  claimIndex: number; claimDigest: string; requestDigest: string; resultDigest: string;
  quote: string; state: string; exitCode: number | null; cleanup: string;
  subjectDigest: string | null; endedAt: string; directory: string;
}
export interface ClaimEvidenceCapture { entries: BoundClaimEvidence[]; files: Array<{ path: string; digest: string }> }
const hashText = (value: string) => `sha256:${createHash("sha256").update(value).digest("hex")}`;

/** Explicit references bind exact quoted bytes to existing native results. They never execute checks. */
export function captureClaimEvidence(workspace: string, path: string, parent: CommandReceipt, completion: Pick<ProviderCompletion, "checks">): ClaimEvidenceCapture {
  workspace = realpathSync(workspace);
  const files: ClaimEvidenceCapture["files"] = [];
  const read = (file: string) => {
    file = resolve(workspace, file);
    if (realpathSync(file) !== file) throw new Error("Claim evidence path must be canonical");
    const value = narrativeFile(workspace, file);
    files.push({ path: file, digest: hashText(value) }); return value;
  };
  const manifest = object(JSON.parse(read(path)));
  if (manifest.version !== 1 || manifest.providerRequestDigest !== parent.requestDigest ||
      manifest.providerResultDigest !== parent.providerResultDigest || !Array.isArray(manifest.claims) || manifest.claims.length > 4)
    throw new Error("Claim evidence report binding mismatch");
  const seen = new Set<number>(), entries: BoundClaimEvidence[] = [];
  for (const item of manifest.claims) {
    const ref = object(item), index = Number(ref.claimIndex);
    if (!Number.isSafeInteger(index) || index < 0 || index >= completion.checks.length || seen.has(index)) throw new Error("Invalid claim index");
    seen.add(index);
    const claim = completion.checks[index]!;
    if (ref.claimDigest !== digest(claim)) throw new Error("Claim text changed");
    const quote = text(ref.quote, "native evidence quote", 2000);
    if (!claim.evidence.includes(quote)) throw new Error("Quote is absent from the cited report evidence");
    const directory = realpathSync(resolve(workspace, text(ref.directory, "native command directory", 4096)));
    const request = object(JSON.parse(read(join(directory, "request.json"))));
    if (request.version !== 1 || digest(request) !== ref.requestDigest) throw new Error("Native request binding mismatch");
    validateCommandRequest(request as unknown as CommandRequest);
    if (!/^sha256:[a-f0-9]{64}$/u.test(String(request.ownerDigest))) throw new Error("Native execution owner is missing");
    const owner = object(JSON.parse(read(join(directory, "owner.json"))));
    if (owner.requestDigest !== ref.requestDigest || !Number.isSafeInteger(owner.pid) || Number(owner.pid) < 2 ||
        typeof owner.fingerprint !== "string" || !owner.fingerprint.trim()) throw new Error("Native execution acknowledgment is missing");
    const operation = object(request.operation), cwd = realpathSync(text(operation.cwd, "native workspace", 4096));
    const rel = relative(workspace, cwd);
    if (rel === ".." || rel.startsWith("../") || isAbsolute(rel)) throw new Error("Native evidence belongs to another workspace");
    const raw = read(join(directory, "result.json")), result = object(JSON.parse(raw));
    if (result.version !== 1 || result.requestDigest !== ref.requestDigest || hashText(raw) !== ref.resultDigest ||
        !["succeeded", "failed", "cancelled", "unknown"].includes(String(result.state)) ||
        !["confirmed", "unknown"].includes(String(result.cleanup)) ||
        !(result.exitCode === null || Number.isSafeInteger(result.exitCode))) throw new Error("Native result binding mismatch");
    const endedAt = text(result.endedAt, "native result time", 64);
    if (!Number.isFinite(Date.parse(endedAt)) || !Number.isFinite(Date.parse(parent.startedAt)) ||
        Date.parse(endedAt) < Date.parse(parent.startedAt) || Date.parse(endedAt) > Date.parse(parent.endedAt))
      throw new Error("Native evidence lies outside the reported job interval");
    const logPath = join(directory, "output.log");
    if (result.log !== logPath || !read(logPath).includes(quote)) throw new Error("Quoted native evidence is absent or unowned");
    const environment = object(operation.env ?? {}), subject = environment.PROJECT_GOVERNANCE_SUBJECT_DIGEST;
    const subjectDigest = typeof subject === "string" && /^sha256:[a-f0-9]{64}$/u.test(subject) ? subject : null;
    if (ref.subjectDigest !== undefined && ref.subjectDigest !== subjectDigest) throw new Error("Claim source identity differs from native execution");
    entries.push({ claimIndex: index, claimDigest: String(ref.claimDigest), requestDigest: String(ref.requestDigest), resultDigest: String(ref.resultDigest),
      quote, state: String(result.state), cleanup: String(result.cleanup), exitCode: result.exitCode as number | null, subjectDigest, endedAt, directory });
  }
  return { entries, files };
}

export function claimEvidenceUnchanged(capture: ClaimEvidenceCapture): boolean {
  return capture.files.every(file => {
    try { return realpathSync(file.path) === file.path && hashText(narrativeFile("/", file.path)) === file.digest; }
    catch { return false; }
  });
}
