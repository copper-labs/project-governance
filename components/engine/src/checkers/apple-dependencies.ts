import { appleSource } from "./apple-source-scan.ts";
import type { AnySchema } from "ajv";
import { ValidationSubject, type ChangeScope } from "../change-subject.ts";
import { findingSummary, type Finding } from "../checker-results.ts";
import { glob } from "../planning.ts";
import { isoDate, schemaErrors } from "../schema-validation.ts";
const matches = (path: string, patterns: string[]) => patterns.some(pattern => glob(path, pattern) || glob(`x/${path}`, pattern));
const reasons = new Set(["backward-compatibility", "upstream-has-no-usable-spm", "contract-or-regulatory", "migration-bridge", "emergency"]);
const cocoTerms = ["cocoapods", "podfile", ".podspec"];
const appleTerms = [...cocoTerms, "swiftpm", "swift package manager"];
const contains = (text: string, values: string[]) => values.some(value => text.includes(value));
export function cocoapodsSurface(path: string, read: () => string): boolean {
  if (["scripts/check-apple-dependencies.py", "config/policies/apple-dependencies.yaml", "config/policies/apple-dependency-exceptions.yaml"].includes(path)) return false;
  if (matches(path, ["**/Podfile", "**/Podfile.lock", "**/*.podspec"])) return true;
  if (path.endsWith(".xcodeproj/project.pbxproj")) return contains(read(), ["[CP]", "Pods_", "Pods/"]);
  if (path.endsWith(".xcworkspace/contents.xcworkspacedata")) return read().includes("Pods.xcodeproj");
  return matches(path, ["scripts/**", ".github/**", "config/**", "**/*.sh", "**/*.rb", "**/*.yml", "**/*.yaml"]) && contains(read(), ["pod install", "pod update", "pod repo", "pod trunk", "bundle exec pod", "gem install cocoapods"]);
}
export function swiftpmSurface(path: string, read: () => string): boolean {
  return matches(path, ["**/Package.swift", "**/Package.resolved"]) || (path.endsWith(".xcodeproj/project.pbxproj") && contains(read(), ["XCRemoteSwiftPackageReference", "XCLocalSwiftPackageReference"]));
}
function approvalError(item: Record<string, unknown>, workId: string, today: string): string {
  if (item["status"] !== "approved" || !item["operator"] || !item["approved_on"] || !item["rationale"]) return "matching CocoaPods exception is not operator-approved with rationale";
  if (!reasons.has(String(item["reason"]))) return "matching CocoaPods exception does not use an allowed reason";
  if (item["work_id"] !== workId) return "matching CocoaPods exception belongs to a different work item";
  if (!isoDate(String(item["expires"]))) return "matching CocoaPods exception has no valid expiry";
  return String(item["expires"]) < today ? "matching CocoaPods exception expired" : "";
}
export async function checkAppleDependencies(subject: ValidationSubject, scope: ChangeScope, options: {
  policy: Record<string, unknown>; exceptions: Record<string, unknown>; schema: AnySchema; workId: string; today: string; stage: string;
}) {
  const findings: Finding[] = [], coco: string[] = [], spm: string[] = [];
  const add = (rule_id: string, path: string, message: string, severity: Finding["severity"] = "blocking") => findings.push({ rule_id, path, severity, message });
  if (!isoDate(options.today)) throw new Error("Invalid Apple policy evaluation date");
  if (!["auto", "always"].includes(String(options.policy["applies"]))) add("apple.policy-invalid", "config/policies/apple-dependencies.yaml", "Apple policy applies must be auto or always.");
  const paths = subject.paths();
  const content = new Map<string, string>();
  const read = (path: string) => content.get(path) ?? "";
  const load = async (path: string) => {
    if (content.has(path)) return;
    try {
      const source = subject.source(path);
      if (!source || source.file_type !== "regular") return;
      content.set(path, await appleSource(subject.root, source, () => subject.read(path), subject.readsWorkingTree));
    }
    catch { add("apple.input-unavailable", path, "Apple policy could not read this captured input."); }
  };
  for (const path of paths) {
    let needed = false;
    const probe = () => { needed = true; return ""; };
    cocoapodsSurface(path, probe); swiftpmSurface(path, probe);
    if (needed) await load(path);
    if (cocoapodsSurface(path, () => read(path))) coco.push(path); if (swiftpmSurface(path, () => read(path))) spm.push(path); }
  const changedCoco: string[] = [], plans: string[] = [];
  for (const record of scope.records) {
    const source = record.after ?? record.before; if (!source || source.file_type !== "regular") continue;
    let needed = false;
    const byName = cocoapodsSurface(record.path, () => { needed = true; return ""; });
    if (byName) changedCoco.push(record.path);
    else if (needed) {
      try { const text = await appleSource(subject.root, source); if (cocoapodsSurface(record.path, () => text)) changedCoco.push(record.path); }
      catch { add("apple.input-unavailable", record.path, "Apple policy could not read this captured input."); }
    }
    if (record.after && matches(record.path, ["docs/exec-plans/**/*.md", "docs/exec-plans/*.md"])) plans.push(record.path);
  }
  for (const path of plans) await load(path);
  const detected = coco.length || spm.length || changedCoco.length || paths.some(path => path.endsWith(".swift") || path.endsWith(".xcodeproj/project.pbxproj")) || plans.some(path => contains(read(path).toLowerCase(), appleTerms));
  if (!detected && options.policy["applies"] === "auto" && !findings.length) return { version: 1, check: "apple-dependency-policy", status: "not-applicable", finding_count: 0, discovery: { swiftpm: [], cocoapods: [] }, findings };
  const errors = schemaErrors(options.schema, options.exceptions);
  for (const error of errors) add("apple.exception-schema", "config/policies/apple-dependency-exceptions.yaml", error);
  const entries = !errors.length && Array.isArray(options.exceptions["exceptions"]) ? options.exceptions["exceptions"] as Record<string, unknown>[] : [];
  for (const path of changedCoco) {
    const item = entries.find(item => matches(path, Array.isArray(item["path_globs"]) ? item["path_globs"] as string[] : []));
    const error = !options.workId ? "GOVERNANCE_WORK_ID is required to bind approval to planned work" : !item ? "no operator-approved CocoaPods exception matches this path" : approvalError(item, options.workId, options.today);
    if (error) add("apple.cocoapods-exception-required", path, `CocoaPods is an exception to SPM-first policy: ${error}.`);
  }
  for (const path of plans) if (contains(read(path).toLowerCase(), cocoTerms) && (!options.workId || !entries.some(item => !approvalError(item, options.workId, options.today))))
    add("apple.cocoapods-planning-approval", path, "This plan discusses CocoaPods without a recorded operator approval.");
  if (scope.mode === "all" && coco.length) add("apple.existing-cocoapods", coco[0]!, "Existing CocoaPods use requires a compatibility decision before expansion or removal.", "advisory");
  return { version: 1, check: "apple-dependency-policy", ...findingSummary(findings), stage: options.stage, policy: "swiftpm-first", discovery: { swiftpm: spm, cocoapods: coco }, findings };
}
