import { createHash } from "node:crypto";
import { posix } from "node:path";
import { safeSubjectPath, ValidationSubject } from "../change-subject.ts";
import { object } from "../core.ts";
import type { Finding } from "../checker-results.ts";

const REGISTRY = "config/policies/format-preserved-notices.json";
const LIMIT = 1024 * 1024;
const SUFFIXES = new Set([".cfg", ".json", ".md", ".py", ".sh", ".toml", ".txt", ".yaml", ".yml"]);
const NAMES = new Set([".gitignore", ".env.example", "LICENSE", "MANIFEST.in", "commit-msg", "pre-commit", "pre-pr", "pre-push"]);
const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const decode = (bytes: Buffer) => new TextDecoder("utf-8", { fatal: true }).decode(bytes);

/** An exemption binds exact upstream notice bytes in the same immutable subject as the check. */
export function verifiedNotices(subject: ValidationSubject): Map<string, string> {
  if (!subject.source(REGISTRY)) return new Map();
  const raw = object(JSON.parse(decode(subject.read(REGISTRY, LIMIT))));
  if (Object.keys(raw).sort().join(",") !== "notices,version") throw new Error("preserved notices registry requires version and notices");
  if (raw["version"] !== 1) throw new Error("preserved notices registry version must be 1");
  if (!Array.isArray(raw["notices"])) throw new Error("preserved notices must be a list");
  const notices = new Map<string, string>();
  for (const value of raw["notices"]) {
    const record = object(value);
    if (Object.keys(record).sort().join(",") !== "path,sha256,source") throw new Error("each preserved notice requires path, sha256, and source");
    if (typeof record["path"] !== "string") throw new Error("preserved notice path must be a string");
    const path = safeSubjectPath(record["path"]);
    if (!/^(?:LICENSE|LICENCE|COPYING|NOTICE)(?:[._-][A-Za-z0-9._-]+)?$/.test(posix.basename(path)) || /[*?\[\]]/.test(path)) throw new Error(`preserved notice requires an exact license/notice filename: ${path}`);
    const hash = record["sha256"];
    if (typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash)) throw new Error(`preserved notice requires a lowercase SHA256: ${path}`);
    const source = record["source"];
    let valid = false;
    if (typeof source === "string" && !/\s/u.test(source)) {
      try { const url = new URL(source); valid = url.protocol === "https:" && !!url.host; } catch { /* Invalid provenance does not grant an exemption. */ }
    }
    if (!valid) throw new Error(`preserved notice requires an HTTPS upstream source URL: ${path}`);
    if (notices.has(path)) throw new Error(`duplicate preserved notice path: ${path}`);
    notices.set(path, hash);
  }
  for (const [path, hash] of notices) if (sha256(subject.read(path, LIMIT)) !== hash) throw new Error(`preserved notice SHA256 mismatch: ${path}`);
  return notices;
}

/** Report deterministic whitespace drift; valid preserved notices retain their upstream text verbatim. */
export function checkFormat(subject: ValidationSubject, paths: readonly string[]) {
  const findings: Finding[] = [], preserved: string[] = [];
  let notices = new Map<string, string>();
  try { notices = verifiedNotices(subject); }
  catch (error) { findings.push({ rule_id: "format.preservation-invalid", severity: "blocking", path: REGISTRY, message: error instanceof Error ? error.message : String(error) }); }
  for (const path of [...new Set(paths)].sort()) {
    const knownText = SUFFIXES.has(posix.extname(path)) || NAMES.has(posix.basename(path));
    const binEntry = posix.basename(posix.dirname(path)) === "bin";
    if (!knownText && !binEntry) continue;
    const source = subject.source(path);
    if (!source || source.file_type !== "regular") continue;
    const content = subject.read(path), expected = notices.get(path);
    if (expected && sha256(content) === expected) { preserved.push(path); continue; }
    if (expected) findings.push({ rule_id: "format.preservation-invalid", severity: "blocking", path, message: "selected notice bytes do not match the preserved SHA256" });
    // Python splitlines also recognizes these Unicode line separators; preserve the existing rule.
    let text: string;
    try { text = decode(content); }
    catch (error) { if (binEntry && !knownText) continue; throw error; }
    // Pack globs include bin entries, but executable binaries are not authored text.
    if (binEntry && !knownText && text.includes("\0")) continue;
    const lines = text.split(/\r\n|[\n\r\v\f\u001c-\u001e\u0085\u2028\u2029]/u);
    lines.forEach((line, index) => {
      // Python rstrip treats U+0085 as whitespace and does not treat the BOM as whitespace.
      if (/[\u0009-\u000d\u001c-\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]$/u.test(line)) findings.push({ rule_id: "format.drift", severity: "blocking", path, line: index + 1, message: "trailing whitespace" });
    });
  }
  return { version: 1, check: "format", status: findings.length ? "failed" : "passed", finding_count: findings.length, findings, preserved_notices: preserved };
}
