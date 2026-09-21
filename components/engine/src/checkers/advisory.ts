import { posix } from "node:path";
import { ValidationSubject } from "../change-subject.ts";
import { findingSummary, type Finding } from "../checker-results.ts";

const decode = (bytes: Buffer) => new TextDecoder("utf-8", { fatal: true }).decode(bytes);
const TEST_SUFFIXES = new Set([".py", ".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs", ".kt", ".kts"]);
const SKIP = new Set([".git", ".venv", "node_modules", "build", "dist", "__pycache__"]);
const SUPPORT = new Set(["fixtures", "helpers", "support"]);

export function isTestFile(path: string): boolean {
  const name = posix.basename(path), extension = posix.extname(path), stem = name.slice(0, name.length - extension.length), parts = path.split("/"), parents = parts.slice(0, -1);
  const explicit = name.includes(".test.") || name.includes(".spec.") || name.startsWith("test_") || stem.toLowerCase().endsWith("_test") || /(?:Test|Tests|TestCase)$/.test(stem);
  return TEST_SUFFIXES.has(extension) && !parts.some(p => SKIP.has(p)) &&
    (explicit || (parents.some(p => ["test", "tests", "__tests__"].includes(p)) && !parents.some(p => SUPPORT.has(p))));
}

/** Lexical signals remain advisory; they do not claim that assertions ran or that behavior is correct. */
export function testQualityFindings(path: string, text: string): Finding[] {
  const findings: Finding[] = [];
  if (!/\b(expect|assert(?:[A-Z_][A-Za-z0-9_]*)?|pytest\.raises|raises|toThrow|should|must|XCTAssert[A-Za-z0-9_]*)\b/.test(text)) findings.push({
    rule_id: "test-quality.no-assertion", severity: "advisory", path, message: "changed test file has no recognizable assertion" });
  if (/\b(getters?|setters?|constructors?|pass[-_ ]?through|accessors?)\b/i.test(text) &&
      !/\b(behavior|contract|scenario|failure|reject|block|validate|scope|authority|audit|observability|idempotent|retry|persist|state|transition|error)\b/i.test(text)) findings.push({
    rule_id: "test-quality.hollow-accessor", severity: "advisory", path, message: "getter, setter, or accessor-oriented test lacks behavior or contract language" });
  return findings;
}

export function checkTestQuality(subject: ValidationSubject, paths: readonly string[]) {
  const findings: Finding[] = [];
  for (const path of [...new Set(paths)].sort().filter(isTestFile)) {
    try {
      const source = subject.source(path);
      if (!source || source.file_type !== "regular") continue;
      findings.push(...testQualityFindings(path, decode(subject.read(path))));
    } catch (error) { findings.push({ rule_id: "test-quality.after-image-unreadable", severity: "blocking", path,
      message: `cannot read selected test after-image: ${error instanceof Error ? error.message : String(error)}` }); }
  }
  return { version: 1, check: "test-quality", ...findingSummary(findings), findings };
}

/** Unfinished prose markers are advice; unreadable selected input remains an explicit blocking finding. */
export function checkProse(subject: ValidationSubject, paths: readonly string[]) {
  const findings: Finding[] = [];
  try {
    for (const path of [...new Set(paths)].sort()) {
      if (posix.extname(path).toLowerCase() !== ".md" || (!path.startsWith("docs/") && !["AGENTS.md", "CHARTER.md", "README.md"].includes(path))) continue;
      const source = subject.source(path);
      if (!source || source.file_type !== "regular") continue;
      const lines = decode(subject.read(path)).split(/\r\n|[\n\r\v\f\u001c-\u001e\u0085\u2028\u2029]/u);
      for (const [index, line] of lines.entries()) for (const marker of ["TODO", "TBD"]) if (line.includes(marker)) findings.push({
        rule_id: "prose.unfinished-marker", severity: "advisory", path, line: index + 1, message: `contains unfinished prose marker ${marker}` });
    }
  } catch (error) { findings.push({ rule_id: "prose.selection-failed", severity: "blocking", message: error instanceof Error ? error.message : String(error) }); }
  // Preserve the existing envelope; shared result normalization promotes blocking infrastructure findings.
  return { version: 1, check: "prose", status: findings.length ? "warning" : "passed", finding_count: findings.length, findings };
}
