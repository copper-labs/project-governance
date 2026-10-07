import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { parseJunitEvidence, checkJunitEvidence } from "../src/checkers/junit-evidence.ts";
import { ValidationSubject, resolveChangeScope } from "../src/change-subject.ts";
import { loadSubjectPacks } from "../src/pack-configuration.ts";
import { buildPlan } from "../src/planning.ts";
import { runChecks } from "../src/check-run.ts";
import { PackagedCheckerAssets } from "../src/checker-assets.ts";
import { runBuiltinCheck } from "../src/builtin-checks.ts";

const builtinPacks = fileURLToPath(new URL("../../../src/project_governance_runtime/packs/", import.meta.url));
const defaults = fileURLToPath(new URL("../../../src/project_governance_runtime/defaults/", import.meta.url));
const reportPath = "evidence/jvm/TEST-example.StorageTest.xml";
const pass = '<testsuite name="Storage" tests="2" failures="0" errors="0" skipped="0"><testcase classname="StorageTest" name="persist" time="0.2"/><testcase classname="StorageTest" name="retry"/></testsuite>';
const parse = (value: string) => parseJunitEvidence(Buffer.from(value));

test("retained XML reconciles real testcase identities/counters and ignores output text", () => {
  const output = pass.replace("</testsuite>", '<system-out><![CDATA[<testcase name="fake"/><failure/><!DOCTYPE example>]]></system-out></testsuite>');
  const result = parse(output);
  assert.deepEqual(result.counts, { tests: 2, failures: 0, errors: 0, skipped: 0 });
  assert.equal(result.reported_execution, "passed");
  assert.equal(result.case_identities_sha256, parse(pass).case_identities_sha256);
  const nested = '<testsuites tests="3" failures="1" errors="1" skipped="1"><testsuite name="outer" tests="3"><testsuite name="inner"><testcase name="failed"><failure>diagnostic</failure></testcase><testcase name="errored"><error/></testcase><testcase name="skipped"><skipped/></testcase></testsuite></testsuite></testsuites>';
  assert.deepEqual(parse(nested).counts, { tests: 3, failures: 1, errors: 1, skipped: 1 });
  assert.equal(parse(nested).reported_execution, "failed");
});

test("invalid XML, identities, counters and conflicting dispositions cannot claim valid artifacts", () => {
  for (const [value, reason] of [
    [pass.slice(0, -5), "xml-malformed"],
    ['<report/>', "xml-root-unsupported"],
    ['<testsuite name="empty" tests="0"/>', "report-cases-missing"],
    [pass.replace('tests="2"', 'tests="3"'), "report-counter-mismatch"],
    [pass.replace('tests="2"', 'tests="-2"'), "report-counter-invalid"],
    [pass.replace('tests="2"', 'tests="1.5"'), "report-counter-invalid"],
    [pass.replace('tests="2"', 'tests="Infinity"'), "report-counter-invalid"],
    [pass.replace('tests="2"', 'tests="NaN"'), "report-counter-invalid"],
    [pass.replace('errors="0"', 'errors="-1"'), "report-counter-invalid"],
    [pass.replace('name="Storage"', 'name=""'), "suite-identity-missing"],
    [pass.replace('name="persist"', 'name=""'), "case-identity-missing"],
    [pass.replace('name="retry"', 'name="persist"'), "case-identity-duplicate"],
    ['<testsuite name="a"><testcase name="x"><failure/><skipped/></testcase></testsuite>', "case-disposition-conflict"],
    ['<testsuite name="a"><testcase name="x"><error/><failure/></testcase></testsuite>', "case-disposition-conflict"],
    ['<testsuites><testsuite name="same"><testcase name="a"/></testsuite><testsuite name="same"><testcase name="b"/></testsuite></testsuites>', "suite-identity-duplicate"],
    ['<testsuite name="a"><system-out><testcase name="x"/></system-out></testsuite>', "case-location-invalid"],
    ['<testsuites><testcase name="x"/></testsuites>', "case-location-invalid"],
    ['<testsuite name="a"><testcase name="unrun" status="notrun" result="suppressed"/></testsuite>', "case-status-unsupported"],
  ]) assert.throws(() => parse(value!), error => error instanceof Error && error.message === reason, reason);
  for (const value of [
    '<!DOCTYPE testsuite [<!ENTITY ext SYSTEM "https://example.invalid/secret">]><testsuite name="x"><testcase name="a"/></testsuite>',
    '<!DOCTYPE testsuite SYSTEM "file:///private/example"><testsuite name="x"><testcase name="a"/></testsuite>',
  ]) assert.throws(() => parse(value), /xml-entities-unsupported/);
  assert.throws(() => parseJunitEvidence(Buffer.from([0xc3, 0x28])), /report-encoding-invalid/);
});

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "junit-evidence-")), root = join(directory, "repo"), runs = join(directory, "runs");
  mkdirSync(root);
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  const write = (path: string, value: string | Buffer) => { mkdirSync(join(root, path, ".."), { recursive: true }); writeFileSync(join(root, path), value); };
  git("init", "-q"); git("config", "user.email", "fixture@example.invalid"); git("config", "user.name", "Fixture");
  const pack = { id: "retained-junit", enforcement: "blocking", implementation_status: "active", stages: ["pre-commit", "pre-push", "pre-pr", "ci-pr"],
    run_when: "matched", change_packet_contract: 1, path_globs: ["evidence/jvm/*.xml", "evidence/jvm/*.xml.txt"], commands: [{ builtin: "junit-evidence" }] };
  write("config/validation/packs/retained-junit.yaml", JSON.stringify(pack)); write(reportPath, pass);
  git("add", "."); git("commit", "-qm", "Fixture baseline");
  const capture = () => {
    const scope = resolveChangeScope(root, { staged: true }), subject = new ValidationSubject(root, scope), packs = loadSubjectPacks(subject, builtinPacks);
    const plan = buildPlan(packs, { stage: "pre-commit", mode: "impacted", changedPaths: scope.records.map(record => record.path) });
    return { scope, subject, packs, plan };
  };
  const run = (input: ReturnType<typeof capture>) => runChecks(input.packs, input.plan, { scope: input.scope, subject: input.subject,
    assets: new PackagedCheckerAssets(defaults), packIds: new Set(Object.keys(input.packs)), stage: "pre-commit", asOf: "2026-10-06T12:00:00Z" },
    { root: runs, deadlineMs: 15000, trigger: "test" });
  return { directory, root, git, write, capture, run, close: () => rmSync(directory, { recursive: true, force: true }) };
}

test("native impacted selection needs a real declared XML owner and leaves unrelated XML unknown", async () => {
  const f = fixture();
  try {
    f.write(reportPath, pass + "\n"); f.git("add", reportPath);
    const input = f.capture();
    assert.equal(input.plan.status, "ready");
    assert.deepEqual(input.plan.path_matches[reportPath], ["retained-junit", "secrets"]);
    const result = await f.run(input);
    assert.equal(result.status, "passed");
    const command = result.results.find(pack => pack.pack_id === "retained-junit")!.commands[0]!;
    assert.equal(command.artifact_integrity, "valid");
    assert.equal(command.current_execution, "unknown"); assert.equal(command.task_acceptance, "unknown");
    assert.equal(command.subject_digest, input.scope.subject_digest);
    const original = JSON.parse(readFileSync(join(result.run_directory, "result.json"), "utf8"));
    assert.equal(original.results.find((pack: { pack_id: string }) => pack.pack_id === "retained-junit").commands[0].reports[0].counts.tests, 2);
    f.write("other/TEST-unowned.xml", pass); f.git("add", "other/TEST-unowned.xml");
    const unknown = f.capture();
    assert.equal(unknown.plan.status, "blocked");
    assert.deepEqual(unknown.plan.blockers.find(row => row.code === "unknown-impact")?.paths, ["other/TEST-unowned.xml"]);
  } finally { f.close(); }
});

test("native staged owner rejects bad captured XML despite an unstaged repair", async () => {
  const f = fixture();
  try {
    const bad = pass.replace('tests="2"', 'tests="12"');
    f.write(reportPath, bad); f.git("add", reportPath); f.write(reportPath, pass);
    const input = f.capture(), result = await f.run(input);
    assert.equal(result.status, "failed");
    assert.equal(result.results.find(pack => pack.pack_id === "retained-junit")!.commands[0]!.findings[0]?.rule_id, "junit-evidence.report-counter-mismatch");
    f.write(reportPath, pass + "\n"); f.git("add", reportPath); f.write(reportPath, bad);
    assert.equal((await f.run(f.capture())).status, "passed");
  } finally { f.close(); }
});

test("valid failed historical reports stay valid artifact evidence and owner globs bound the reads", () => {
  const f = fixture();
  try {
    const failed = '<testsuite name="history" tests="1" failures="1"><testcase name="expected-fault"><failure/></testcase></testsuite>';
    f.write("evidence/jvm/TEST-history.xml.txt", failed); f.write("outside/TEST-bad.xml", "malformed"); f.git("add", ".");
    const { subject, scope, packs } = f.capture();
    const result = checkJunitEvidence(subject, scope, packs["retained-junit"]!);
    assert.equal(result.status, "passed"); assert.equal(result.artifact_integrity, "valid");
    assert.equal(result.reports.length, 1); assert.equal(result.reports[0]?.reported_execution, "failed");
    assert.equal(result.current_execution, "unknown"); assert.equal(result.task_acceptance, "unknown");
  } finally { f.close(); }
});

test("an actual built-in execution cannot substitute an absent or different owner", async () => {
  const f = fixture();
  try {
    f.write(reportPath, pass + "\n"); f.git("add", reportPath);
    const { subject, scope, packs } = f.capture();
    const request = { id: "junit-evidence", subject, scope, registry: packs, assets: new PackagedCheckerAssets(defaults),
      packIds: new Set(Object.keys(packs)), stage: "pre-commit", asOf: "2026-10-06T12:00:00Z" };
    for (const packId of [undefined, "missing", "secrets"]) {
      const result = await runBuiltinCheck({ ...request, ...(packId ? { packId } : {}) });
      assert.equal(result.status, "failed"); assert.equal(result.findings[0]?.rule_id, "checker.invocation-invalid");
    }
  } finally { f.close(); }
});

test("a second declared JUnit pack cannot widen the executing owner", async () => {
  const f = fixture();
  try {
    const other = { id: "other-junit", enforcement: "blocking", stages: ["pre-commit"],
      path_globs: ["other/*.xml"], commands: [{ builtin: "junit-evidence" }] };
    f.write("config/validation/packs/other-junit.yaml", JSON.stringify(other)); f.git("add", "."); f.git("commit", "-qm", "Second owner");
    f.write(reportPath, pass + "\n"); f.write("other/TEST-bad.xml", "malformed"); f.git("add", ".");
    const input = f.capture();
    input.plan = buildPlan(input.packs, { stage: "pre-commit", mode: "impacted", changedPaths: input.scope.records.map(record => record.path), explicitPackIds: ["retained-junit"] });
    const result = await f.run(input);
    assert.equal(result.status, "passed"); assert.equal(result.results.length, 1);
    const command = result.results[0]!.commands[0]!;
    assert.equal(command.checked_count, 1);
    assert.deepEqual((command.reports as Array<{ path: string }>).map(report => report.path), [reportPath]);
  } finally { f.close(); }
});

test("owner-matched unsupported extensions cannot claim unchecked coverage", async () => {
  const f = fixture();
  try {
    const packPath = "config/validation/packs/retained-junit.yaml";
    const pack = JSON.parse(readFileSync(join(f.root, packPath), "utf8"));
    pack.path_globs = ["evidence/jvm/**"];
    f.write(packPath, JSON.stringify(pack)); f.git("add", packPath); f.git("commit", "-qm", "Broad owner fixture");
    f.write("evidence/jvm/TEST-uppercase.XML", pass); f.write("evidence/jvm/result.log", "retained output"); f.git("add", ".");
    const input = f.capture();
    assert.equal(input.plan.status, "ready");
    const result = await f.run(input), command = result.results.find(pack => pack.pack_id === "retained-junit")!.commands[0]!;
    assert.equal(result.status, "failed"); assert.equal(command.artifact_integrity, "invalid");
    assert.deepEqual(command.findings.map(finding => [finding.rule_id, finding.path]), [
      ["junit-evidence.path-unsupported", "evidence/jvm/TEST-uppercase.XML"],
      ["junit-evidence.path-unsupported", "evidence/jvm/result.log"],
    ]);
  } finally { f.close(); }
});

test("native invalid UTF-8 reports an encoding failure rather than unavailable input", async () => {
  const f = fixture();
  try {
    f.write(reportPath, Buffer.from([0xc3, 0x28])); f.git("add", reportPath);
    // The changed-scope diff owner rejects invalid UTF-8 before dispatch; all mode reaches this owner.
    const scope = resolveChangeScope(f.root, { all: true }), subject = new ValidationSubject(f.root, scope), packs = loadSubjectPacks(subject, builtinPacks);
    const plan = buildPlan(packs, { stage: "pre-commit", mode: "all", changedPaths: [], explicitPackIds: ["retained-junit"] });
    const result = await f.run({ scope, subject, packs, plan });
    assert.equal(result.status, "failed");
    assert.equal(result.results.find(pack => pack.pack_id === "retained-junit")!.commands[0]!.findings[0]?.rule_id, "junit-evidence.report-encoding-invalid");
  } finally { f.close(); }
});

test("a staged deletion has no report after-image and cannot prove a replacement", async () => {
  const f = fixture();
  try {
    f.git("rm", "-q", reportPath); f.write(reportPath, pass);
    const input = f.capture();
    assert.equal(input.scope.records[0]?.status, "deleted"); assert.equal(input.plan.status, "ready");
    const result = await f.run(input), command = result.results.find(pack => pack.pack_id === "retained-junit")!.commands[0]!;
    assert.equal(command.artifact_integrity, "not-applicable");
    assert.equal(command.checked_count, 0); assert.deepEqual(command.reports, []);
    assert.equal(command.current_execution, "unknown"); assert.equal(command.task_acceptance, "unknown");
  } finally { f.close(); }
});
