import { checkKmpSurface } from "./checkers/kmp-surface.ts";
import { parse } from "yaml";
import type { AnySchema } from "ajv";
import { ValidationSubject, resolveChangeScope, type ChangeScope } from "./change-subject.ts";
import { findingSummary, type Finding } from "./checker-results.ts";
import { checkFormat } from "./checkers/format.ts";
import { checkProse, checkTestQuality } from "./checkers/advisory.ts";
import { checkNaming } from "./checkers/naming.ts";
import { checkSecrets } from "./checkers/secret-scan.ts";
import { checkDocumentation } from "./documentation.ts";
import { checkContextRouter } from "./checkers/context-router.ts";
import { checkCommitMessage, checkPrDescription } from "./checkers/narrative.ts";
import { checkDependencies } from "./checkers/dependencies.ts";
import { checkAppleDependencies } from "./checkers/apple-dependencies.ts";
import { checkComments } from "./checkers/comments.ts";
import { checkMaintainability } from "./checkers/maintainability.ts";
import { maintainabilityInputs } from "./checkers/maintainability-inputs.ts";
import { objectValue } from "./checkers/dependency-manifests.ts";

export const BUILTIN_CHECKS = ["format", "prose", "test-quality", "naming", "secrets", "documentation", "context-router", "commit-message", "pr-description", "dependencies", "apple-dependencies", "comments", "maintainability", "kmp-surface-validation"] as const;
export interface CheckerAssets {
  schema(name: string): AnySchema;
  policy(name: string): Record<string, unknown>;
  fixture(path: string): string | null;
}
export interface BuiltinCheckRequest {
  id: string; subject: ValidationSubject; scope: ChangeScope; assets: CheckerAssets;
  packIds: ReadonlySet<string>; stage: string; asOf: string;
  managedPaths?: Set<string>; workId?: string; runFixtureProof?: boolean;
  commit?: { text: string; path: string; commentMarker?: string };
  pullRequest?: { title: string; body: string; path: string };
}
/** Candidate policy overrides packaged defaults; deleted or malformed overrides cannot silently fall back. */
export async function runBuiltinCheck(request: BuiltinCheckRequest) {
  const { id, subject, scope, assets } = request;
  const failures = (message: string) => {
    const findings: Finding[] = [{ rule_id: "checker.invocation-invalid", severity: "blocking", message }];
    return { version: 1, kind: "governance-check-result", ...findingSummary(findings), findings };
  };
  try {
    if (!/^\d{4}-\d{2}-\d{2}T/u.test(request.asOf) || !Number.isFinite(Date.parse(request.asOf))) throw new Error("A valid evaluation timestamp is required");
    const today = new Date(request.asOf).toISOString().slice(0, 10);
    const mapping = (name: string) => {
      const path = `config/policies/${name}.yaml`;
      if (!subject.source(path)) {
        if (scope.records.some(record => record.path === path || record.previous_path === path)) throw new Error("Selected policy was removed");
        return assets.policy(name);
      }
      const value: unknown = parse(new TextDecoder("utf-8", { fatal: true }).decode(subject.read(path, 4 * 1024 * 1024)));
      if (!objectValue(value)) throw new Error("Invalid policy mapping");
      return value;
    };
    const document = (name: string, schema = name) => ({ value: mapping(name), path: `config/policies/${name}.yaml`, schema: assets.schema(schema) });
    const paths = scope.mode === "all" ? subject.paths() : scope.records.filter(record => record.after).map(record => record.path);
    switch (id) {
      case "kmp-surface-validation": return checkKmpSurface(subject);
      case "format": return checkFormat(subject, paths);
      case "prose": return checkProse(subject, paths);
      case "test-quality": return checkTestQuality(subject, paths);
      case "documentation": return checkDocumentation(subject, scope);
      case "context-router": return checkContextRouter(subject, request.packIds);
      case "naming": {
        const candidates = paths.filter(path => scope.mode === "explicit" || !request.managedPaths?.has(path)).map(path => ({ path,
          isNewOrRenamed: scope.records.some(record => record.path === path && ["added", "renamed"].includes(record.status)) }));
        return checkNaming(candidates, mapping("code-quality"), mapping("code-quality-waivers"), today);
      }
      case "secrets": return await checkSecrets(subject.root, { scope: ["pre-push", "pre-pr", "ci-pr", "release"].includes(request.stage) ? resolveChangeScope(subject.root, { all: true }) : scope, waiverRegistry: mapping("secret-waivers"), waiverSchema: assets.schema("secret-waivers"), today });
      case "commit-message":
        if (!request.commit) return failures("Commit-message checking requires the exact message input.");
        return checkCommitMessage(request.commit.text, request.commit.path, request.commit.commentMarker);
      case "pr-description":
        if (!request.pullRequest) return failures("Pull-request checking requires the exact title and body inputs.");
        return checkPrDescription(request.pullRequest.title, request.pullRequest.body, request.pullRequest.path);
      case "dependencies": return checkDependencies(subject, scope, { policyPath: "config/policies/dependency-freshness.yaml",
        evidencePath: "config/policies/dependency-freshness-evidence.yaml", overridesPath: "config/policies/dependency-freshness-overrides.yaml", asOf: request.asOf, defaultPolicy: assets.policy("dependency-freshness") });
      case "apple-dependencies": return checkAppleDependencies(subject, scope, { policy: mapping("apple-dependencies"), exceptions: mapping("apple-dependency-exceptions"),
        schema: assets.schema("apple-dependency-exception"), workId: request.workId ?? "", today, stage: request.stage });
      case "comments": return await checkComments(subject, scope, { policy: document("source-comments"), registry: document("source-comment-adapters"),
        waivers: document("source-comment-waivers"), today, fixture: path => assets.fixture(path), runFixtureProof: request.runFixtureProof ?? false,
        managedPaths: request.managedPaths ?? new Set() });
      case "maintainability": return await checkMaintainability(subject, scope, { ...maintainabilityInputs(subject, scope, assets.schema("quality-disposition"), today, undefined, undefined,
        { policy: assets.policy("code-quality"), dispositions: assets.policy("code-quality-dispositions") }),
        managedPaths: request.managedPaths ?? new Set() });
      default: return failures("Unknown built-in checker.");
    }
  } catch {
    // Parser diagnostics may contain source or credentials. Keep raw material out of the result boundary.
    return failures(`Built-in ${BUILTIN_CHECKS.includes(id as typeof BUILTIN_CHECKS[number]) ? id : "unknown"} could not load or evaluate its required inputs.`);
  }
}
