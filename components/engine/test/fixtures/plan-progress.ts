import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseImplementationPlan, type PlanDeclaration } from "../../src/implementation-plan.ts";
import { updateImplementationProgress, type PlanProgressRequest } from "../../src/plan-progress.ts";
import { ValidationSubject, resolveChangeScope } from "../../src/change-subject.ts";
import { loadSubjectPacks } from "../../src/pack-configuration.ts";
import { buildPlan } from "../../src/planning.ts";
import { runChecks } from "../../src/check-run.ts";
import { PackagedCheckerAssets } from "../../src/checker-assets.ts";

export const path = "docs/exec-plans/active/plan.md", resources = fileURLToPath(new URL("../../../../src/project_governance_runtime/", import.meta.url));
export function template(crlf = false) {
  const declaration = { version: 1, specifications: [], batches: [{ id: "B1", depends_on: [], items: [
    { id: "B1.I", kind: "implementation" }, { id: "B1.V", kind: "verification", requires: ["B1.I"], check: { stage: "batch", packs: ["fixture-format"] } },
    { id: "B1.C", kind: "closeout", requires: ["B1.I", "B1.V"] },
  ] }] };
  const slots = ["I", "V", "C"].map(id => `<!-- governance:item B1.${id} -->\n- [ ] ${id === "I" ? "Implement" : id === "V" ? "Verify" : "Close out"} the batch.\n<!-- governance:evidence B1.${id} -->[]<!-- /governance:evidence -->`).join("\n");
  const text = `# Original narrative\n\nKeep this exact prose.\n\n\`\`\`governance-plan\n${JSON.stringify(declaration, null, 2)}\n\`\`\`\n\n${slots}\n\nCurrent/next: original.\n`;
  return crlf ? text.replaceAll("\n", "\r\n") : text;
}
export function fixture(crlf = false) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "plan-progress-"))), root = join(directory, "repo"), builtin = join(directory, "packs");
  mkdirSync(join(root, "docs/exec-plans/active"), { recursive: true }); mkdirSync(builtin);
  writeFileSync(join(root, path), template(crlf)); chmodSync(join(root, path), 0o640);
  writeFileSync(join(root, "code.txt"), "original\n");
  writeFileSync(join(root, "clean.txt"), "unchanged prerequisite\n");
  writeFileSync(join(builtin, "format.yaml"), JSON.stringify({ id: "fixture-format", enforcement: "blocking", stages: ["batch"], path_globs: ["**"], commands: [{ builtin: "format" }] }));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  git("init", "-q"); git("add", "."); git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "Plan fixture baseline");
  writeFileSync(join(root, "code.txt"), "implemented\n");
  const capture = () => {
    const scope = resolveChangeScope(root, { baseRef: "HEAD" }), subject = new ValidationSubject(root, scope);
    return { subject, scope, packs: loadSubjectPacks(subject, builtin), path };
  };
  const current = () => parseImplementationPlan(path, readFileSync(join(root, path), "utf8"));
  const update = (request: PlanProgressRequest) => updateImplementationProgress({ ...capture(), request, runsRoot: join(directory, "runs") });
  return { directory, root, builtin, git, capture, current, update };
}
export async function runFixtureCheck(f: ReturnType<typeof fixture>, stage = "batch", runsRoot = join(f.directory, "runs"), captured = f.capture()) {
  const validation = buildPlan(captured.packs, { stage, mode: "impacted", changedPaths: captured.scope.records.map(record => record.path) });
  return runChecks(captured.packs, validation, { subject: captured.subject, scope: captured.scope,
    assets: new PackagedCheckerAssets(join(resources, "defaults")), packIds: new Set(Object.keys(captured.packs)), stage, asOf: new Date().toISOString() },
  { root: runsRoot, trigger: "test" });
}
export function replaceDeclaration(content: string, change: (declaration: PlanDeclaration) => void) {
  const match = /^```governance-plan\n([\s\S]*?)^```/mu.exec(content)!;
  const declaration = JSON.parse(match[1]!); change(declaration);
  return content.replace(match[1]!, JSON.stringify(declaration, null, 2) + "\n");
}
