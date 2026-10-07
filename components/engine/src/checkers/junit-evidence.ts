import { createHash } from "node:crypto";
import { posix } from "node:path";
import { SaxesParser } from "saxes";
import { ValidationSubject, type ChangeScope } from "../change-subject.ts";
import { findingSummary, type Finding } from "../checker-results.ts";
import type { Pack } from "../pack-configuration.ts";
import { matchesPackPath } from "../planning.ts";

export interface JunitCounts { tests: number; failures: number; errors: number; skipped: number }
export interface JunitEvidence {
  counts: JunitCounts;
  case_identities_sha256: string;
  reported_execution: "passed" | "failed" | "skipped";
  declared_counter_count: number;
}
interface Frame {
  tag: string; attributes: Record<string, string>; counts: JunitCounts;
  suiteNames: string[]; caseIdentity?: string; dispositions: Set<string>;
}
const emptyCounts = (): JunitCounts => ({ tests: 0, failures: 0, errors: 0, skipped: 0 });
const counters = ["tests", "failures", "errors", "skipped"] as const;
const sha256 = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const addCounts = (target: JunitCounts, value: JunitCounts) => {
  for (const key of counters) {
    target[key] += value[key];
    if (!Number.isSafeInteger(target[key])) throw new Error("report-count-overflow");
  }
};

/** Retained report validity is independent of whether the recorded test execution passed. */
export function parseJunitEvidence(bytes: Buffer): JunitEvidence {
  let source: string;
  try { source = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new Error("report-encoding-invalid"); }
  const frames: Frame[] = [], identities = new Set<string>(), suites = new Set<string>();
  let root: Frame | undefined, declaredCounterCount = 0;
  const parser = new SaxesParser({ xmlns: true });
  parser.on("error", () => { throw new Error("xml-malformed"); });
  parser.on("doctype", () => { throw new Error("xml-entities-unsupported"); });
  parser.on("opentag", tag => {
    const parent = frames.at(-1), attributes: Record<string, string> = Object.create(null);
    for (const value of Object.values(tag.attributes)) {
      if (value.uri === "") attributes[value.local] = value.value;
    }
    const frame: Frame = { tag: tag.local, attributes, counts: emptyCounts(), suiteNames: parent?.suiteNames ?? [], dispositions: new Set() };
    if (!parent) {
      if (!["testsuite", "testsuites"].includes(frame.tag)) throw new Error("xml-root-unsupported");
      root = frame;
    }
    if (["testsuite", "testsuites"].includes(frame.tag)) {
      if (parent && !["testsuite", "testsuites"].includes(parent.tag)) throw new Error("suite-location-invalid");
      if (frame.tag === "testsuite") {
        const name = attributes.name?.trim();
        if (!name) throw new Error("suite-identity-missing");
        frame.suiteNames = [...frame.suiteNames, name];
        const identity = JSON.stringify(frame.suiteNames);
        if (suites.has(identity)) throw new Error("suite-identity-duplicate");
        suites.add(identity);
      }
      for (const key of counters) {
        const value = attributes[key];
        if (value !== undefined && (!/^(?:0|[1-9][0-9]*)$/u.test(value) || !Number.isSafeInteger(Number(value)))) throw new Error("report-counter-invalid");
      }
    } else if (frame.tag === "testcase") {
      if (parent?.tag !== "testsuite") throw new Error("case-location-invalid");
      const name = attributes.name?.trim();
      if (!name) throw new Error("case-identity-missing");
      frame.caseIdentity = JSON.stringify([frame.suiteNames, attributes.classname ?? "", name]);
      if (identities.has(frame.caseIdentity)) throw new Error("case-identity-duplicate");
      identities.add(frame.caseIdentity);
      if (attributes.time !== undefined && (!attributes.time.trim() || !Number.isFinite(Number(attributes.time)) || Number(attributes.time) < 0)) throw new Error("case-duration-invalid");
    } else if (["failure", "error", "skipped"].includes(frame.tag)) {
      if (parent?.tag !== "testcase") throw new Error("case-disposition-location-invalid");
      parent.dispositions.add(frame.tag);
    }
    frames.push(frame);
  });
  parser.on("closetag", () => {
    const frame = frames.pop()!, parent = frames.at(-1);
    if (frame.tag === "testcase") {
      if (frame.dispositions.size > 1) throw new Error("case-disposition-conflict");
      // Some producers mark unexecuted cases in attributes; never turn those into implicit passes.
      const status = frame.attributes.status, result = frame.attributes.result;
      if (status !== undefined && status !== "run" || result !== undefined && result !== "completed") throw new Error("case-status-unsupported");
      frame.counts.tests = 1;
      if (frame.dispositions.has("failure")) frame.counts.failures = 1;
      if (frame.dispositions.has("error")) frame.counts.errors = 1;
      if (frame.dispositions.has("skipped")) frame.counts.skipped = 1;
      addCounts(parent!.counts, frame.counts);
    } else if (["testsuite", "testsuites"].includes(frame.tag)) {
      for (const key of counters) if (frame.attributes[key] !== undefined) {
        declaredCounterCount++;
        if (Number(frame.attributes[key]) !== frame.counts[key]) throw new Error("report-counter-mismatch");
      }
      if (parent) addCounts(parent.counts, frame.counts);
    }
  });
  parser.write(source).close();
  if (!root || !root.counts.tests) throw new Error("report-cases-missing");
  return { counts: root.counts, case_identities_sha256: sha256(JSON.stringify([...identities].sort())), declared_counter_count: declaredCounterCount,
    reported_execution: root.counts.failures || root.counts.errors ? "failed" : root.counts.skipped === root.counts.tests ? "skipped" : "passed" };
}

/** The existing target pack is the only path authority; no global XML owner is installed. */
export function checkJunitEvidence(subject: ValidationSubject, scope: ChangeScope, owner: Pack) {
  const paths = (scope.mode === "all" ? subject.paths() : scope.records.filter(record => record.after).map(record => record.path))
    .filter(path => matchesPackPath(path, owner.path_globs));
  const reports: Array<{ path: string; sha256: string } & JunitEvidence> = [], findings: Finding[] = [];
  for (const path of [...new Set(paths)].sort()) {
    if (posix.extname(path) !== ".xml" && !path.endsWith(".xml.txt")) {
      findings.push({ rule_id: "junit-evidence.path-unsupported", severity: "blocking", path,
        message: "The declaring JUnit pack matched an unsupported retained-report path." });
      continue;
    }
    try {
      const bytes = subject.read(path);
      reports.push({ path, sha256: sha256(bytes), ...parseJunitEvidence(bytes) });
    } catch (error) {
      const reason = error instanceof Error && /^[a-z-]+$/u.test(error.message) ? error.message : "report-input-unavailable";
      findings.push({ rule_id: `junit-evidence.${reason}`, severity: "blocking", path,
        message: "Selected retained JUnit report could not establish artifact integrity." });
    }
  }
  return { version: 1, check: "junit-evidence", ...findingSummary(findings), findings, reports,
    subject_digest: scope.subject_digest, artifact_integrity: findings.length ? "invalid" : reports.length ? "valid" : "not-applicable",
    checked_count: reports.length, declared_counter_count: reports.reduce((count, report) => count + report.declared_counter_count, 0),
    current_execution: "unknown", task_acceptance: "unknown", provenance_binding: "project-owned",
    limits: ["Report validation does not execute tests or prove current candidate acceptance.", "The target owns run/source provenance and any claimed outcome manifest."] };
}
