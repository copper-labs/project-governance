import { closeSync, constants, fstatSync, openSync, readSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { parseDocument } from "yaml";
import type { AnySchema } from "ajv";
import { schemaErrors } from "./schema-validation.ts";
import type { Finding } from "./checker-results.ts";

/** Claims are inert summaries: this boundary never follows artifact paths or treats claims as execution authority. */
export function inspectEvidenceManifest(directory: string, subjectDigest: string | null, schema: AnySchema) {
  const result = (status: string, findings: Finding[] = [], manifest_digest: string | null = null, claim_count = 0, artifact_digest_count = 0) => ({ status, findings, manifest_digest, claim_count, artifact_digest_count });
  const invalid = () => result("invalid", [{ rule_id: "evidence.manifest-invalid", severity: "blocking", message: "Evidence manifest must be bounded, unambiguous JSON matching its schema and this run's source identity." }]);
  let fd: number;
  try { fd = openSync(join(directory, "evidence-manifest.json"), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK); }
  catch (error) { return (error as NodeJS.ErrnoException).code === "ENOENT" ? result("absent") : invalid(); }
  try {
    const before = fstatSync(fd), limit = 65536;
    if (!before.isFile() || before.size > limit) return invalid();
    const buffer = Buffer.alloc(limit + 1); let length = 0;
    while (length < buffer.length) { const count = readSync(fd, buffer, length, buffer.length - length, null); if (!count) break; length += count; }
    const after = fstatSync(fd);
    if (length > limit || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) return invalid();
    const bytes = buffer.subarray(0, length), text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const value = JSON.parse(text);
    // JSON.parse enforces JSON syntax; the second parse rejects duplicate decoded keys at any depth.
    if (parseDocument(text, { schema: "json", uniqueKeys: true }).errors.length || schemaErrors(schema, value).length) return invalid();
    if (!subjectDigest || value.subject_digest !== subjectDigest) return invalid();
    const claims = value.claims as Array<{ id: string; artifact_digests: string[] }>;
    if (new Set(claims.map(claim => claim.id)).size !== claims.length) return invalid();
    return result("valid", [], `sha256:${createHash("sha256").update(bytes).digest("hex")}`, claims.length, claims.reduce((sum, claim) => sum + claim.artifact_digests.length, 0));
  } catch { return invalid(); }
  finally { closeSync(fd); }
}
