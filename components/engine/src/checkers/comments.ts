import { extname } from "node:path";
import { ValidationSubject, readSubjectSource, type ChangeScope } from "../change-subject.ts";
import { findingSummary, type Finding } from "../checker-results.ts";
import { sourceFamilies, validateCommentRegistry, applyCommentWaivers, type CommentRegistryDocument } from "./comment-registry.ts";
import { selectCommentSources, type SelectedCommentSource } from "./comment-selection.ts";
import { pythonCommentFindings, type CommentSelection } from "./python-comments.ts";
import { kotlinCommentFindings } from "./kotlin-comments.ts";
import { kotlinParserVersion } from "./kotlin-parser.ts";
import { commentBefore, overviewFindings } from "./comment-rules.ts";
const blocker = (path: string, message: string): Finding => ({ rule_id: "SC010", path, line: 1, severity: "blocking", message });
export function commentAnalyzerSupported(family: string, analyzer: string, version: unknown): boolean {
  return (family === "python" && analyzer === "python-ast" && version === "stdlib-3.9+") ||
    (family === "kotlin" && analyzer === "kotlin-token-parser" && ["governance-v3", "governance-v5", kotlinParserVersion].includes(String(version)));
}
async function dispatch(family: string, adapter: Record<string, unknown>, path: string, source: string, before: string | null,
  policy: Record<string, unknown>, selection: CommentSelection): Promise<Finding[]> {
  if (!commentAnalyzerSupported(family, String(adapter["analyzer"]), adapter["analyzer_version"])) return [blocker(path, `Active adapter claim for ${family} has no matching checker implementation.`)];
  if (family === "python") return pythonCommentFindings(path, source, before, policy, selection);
  const kotlinPolicy = ["governance-v3", "governance-v5"].includes(String(adapter["analyzer_version"])) ? { ...policy, require_type_context_paragraph: true } : policy;
  return kotlinCommentFindings(path, source, before, kotlinPolicy, selection);
}
export interface CommentCheckOptions {
  policy: CommentRegistryDocument; registry: CommentRegistryDocument; waivers: CommentRegistryDocument; today: string;
  /** Package owner resolves fixture paths; target source paths cannot substitute fixture bytes. */
  fixture: (path: string) => string | null;
  runFixtureProof?: boolean; managedPaths?: Set<string>;
}
export async function checkComments(subject: ValidationSubject, scope: ChangeScope, options: CommentCheckOptions) {
  const validated = validateCommentRegistry(options.policy, options.registry, options.waivers,
    { versionSupported: commentAnalyzerSupported, fixtureExists: path => options.fixture(path) !== null }, options.today);
  let findings = validated.findings;
  const coverage: Record<string, number> = {}, proofCoverage: Record<string, number> | null = options.runFixtureProof ? {} : null;
  const policy = options.policy.value;
  if (proofCoverage) for (const [family, adapter] of validated.adapters) {
    if (adapter["status"] !== "active") continue;
    const cases = Array.isArray(adapter["fixture_cases"]) ? adapter["fixture_cases"] : [];
    for (const fixture of cases) {
      if (!fixture || typeof fixture !== "object" || typeof fixture.path !== "string") continue;
      const source = options.fixture(fixture.path);
      if (source === null) { findings.push(blocker(fixture.path, "Adapter fixture is missing.")); continue; }
      const result = await dispatch(family, adapter, fixture.path, source, null, fixture.boundary_required === true ? { ...policy, boundary_globs: [fixture.path] } : policy,
        { enforceAll: true, overviewBlocking: true, ranges: [] });
      proofCoverage[family] = (proofCoverage[family] ?? 0) + 1;
      const actual = result.filter(f => f.severity === "blocking").map(f => f.rule_id).sort();
      const expected = Array.isArray(fixture.expected_blocking_rule_ids) ? fixture.expected_blocking_rule_ids.slice().sort() : null;
      if (JSON.stringify(actual) !== JSON.stringify(expected)) findings.push(blocker(fixture.path, "Adapter fixture blocking findings differ from its declared expectations."));
    }
  }
  let selections: SelectedCommentSource[] = [], selectedMode: string = scope.mode;
  try { selections = selectCommentSources(subject, scope, policy, options.managedPaths); }
  catch { findings.push(blocker(".", "Comment source selection failed.")); selectedMode = "failed"; }
  for (const selection of selections) {
    const family = sourceFamilies[extname(selection.path).toLowerCase()]!;
    coverage[family] = (coverage[family] ?? 0) + 1;
    try {
      const source = subject.read(selection.path).toString("utf8"), adapter = validated.adapters.get(family) ?? {};
      let result: Finding[];
      if (adapter["status"] !== "active") {
        result = [{ rule_id: "SC001", path: selection.path, line: 1, severity: "advisory", message: `The ${family} comment adapter is ${String(adapter["status"] ?? "unknown")}; native or parser-backed coverage is not active.` }];
        if (policy["unsupported_languages"] === "advisory") {
          const lines = source.split(/\r\n|[\n\r\v\f\x1c-\x1e\x85\u2028\u2029]/u);
          const first = lines.findIndex(line => line.trim() && !/^\s*(?:\/\/|\/\*|\*|#)/u.test(line));
          result.push(...overviewFindings(commentBefore(lines, first < 0 ? lines.length + 1 : first + 1), selection.path, policy, family, false));
        }
      } else {
        const before = selection.before ? readSubjectSource(subject.root, selection.before).toString("utf8") : null;
        result = await dispatch(family, adapter, selection.path, source, before, policy, selection);
      }
      findings.push(...result.map(f => selection.advisoryOnly && f.severity === "blocking" && !["SC001", "SC010"].includes(f.rule_id) ? { ...f, severity: "advisory" as const } : f));
    } catch { findings.push(blocker(selection.path, "Comment adapter could not read or analyze the captured source.")); }
  }
  // An invalid waiver document may not grant exceptions even when its integrity finding already blocks the run.
  const waiverValid = !validated.findings.some(f => f["path"] === options.waivers.path);
  if (waiverValid) findings = applyCommentWaivers(findings, options.waivers.value, options.today);
  return { version: 1, check: "comment-quality", ...findingSummary(findings), coverage, self_test_coverage: proofCoverage,
    selection: { mode: selectedMode, source_roots: policy["source_roots"] ?? [], test_scope: policy["test_scope"], selected_path_count: selections.length },
    waived_finding_count: findings.filter(f => f.severity === "waived").length, findings };
}
