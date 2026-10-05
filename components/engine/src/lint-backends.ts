import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { commandExecutable } from "./native-check-command.ts";
import { commandEnvironment } from "./process-owner.ts";
import { findingSummary, type Finding } from "./checker-results.ts";
import type { PreparedLintInputs } from "./lint-inputs.ts";

export interface LintToolResult { argv: string[]; exit_code: number; stdout: string; stderr: string }
export type LintToolRunner = (argv: string[], cwd: string) => Promise<LintToolResult>;
/** Nested tools inherit the existing managed process group; only the outer owner imposes a deadline. */
export const runLintTool: LintToolRunner = (argv, cwd) => new Promise((resolveResult, reject) => {
  let executable: string;
  try { executable = commandExecutable(argv[0]!, cwd); } catch (error) { reject(error); return; }
  const child = spawn(executable, argv.slice(1), { cwd, env: commandEnvironment({}), detached: false, stdio: ["ignore", "pipe", "pipe"] });
  const stdout: Buffer[] = [], stderr: Buffer[] = []; let bytes = 0, overflow = false;
  const append = (chunks: Buffer[], chunk: Buffer) => { bytes += chunk.length; if (bytes > 8 * 1024 * 1024) { overflow = true; child.kill("SIGTERM"); } else chunks.push(chunk); };
  child.stdout.on("data", chunk => append(stdout, Buffer.from(chunk)));
  child.stderr.on("data", chunk => append(stderr, Buffer.from(chunk)));
  child.on("error", reject);
  child.on("close", (code, signal) => {
    if (overflow || signal || code === null) { reject(new Error("Lint tool did not produce complete output")); return; }
    resolveResult({ argv: [executable, ...argv.slice(1)], exit_code: code, stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8") });
  });
});
function logicalPath(value: unknown, input: PreparedLintInputs): string {
  if (typeof value !== "string") throw new Error("Lint diagnostic lacks a path");
  const path = relative(input.candidate, resolve(input.candidate, value)).split(sep).join("/");
  if (!input.selected.includes(path)) throw new Error("Lint diagnostic is outside the selected candidate");
  return path;
}
function location(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) throw new Error("Lint diagnostic has an invalid location");
  return value;
}
export function ruffFindings(value: unknown, input: PreparedLintInputs): Finding[] {
  if (!Array.isArray(value)) throw new Error("Ruff output is not a diagnostic list");
  return value.map(raw => {
    if (!raw || typeof raw !== "object" || typeof raw.message !== "string" || !raw.location || typeof raw.location !== "object") throw new Error("Invalid Ruff diagnostic");
    return { rule_id: `lint.ruff.${raw.code ?? "syntax"}`, severity: "blocking", path: logicalPath(raw.filename, input), line: location(raw.location.row), column: location(raw.location.column), message: raw.message,
      ...(raw.fix && typeof raw.fix === "object" ? { safe_fix_available: raw.fix.applicability === "safe" } : {}) };
  });
}
export function eslintFindings(value: unknown, input: PreparedLintInputs): Finding[] {
  if (!Array.isArray(value)) throw new Error("ESLint output is not a result list");
  const seen = new Set<string>(), findings: Finding[] = [];
  for (const result of value) {
    if (!result || typeof result !== "object" || !Array.isArray(result.messages)) throw new Error("Invalid ESLint file result");
    const path = logicalPath(result.filePath, input);
    if (seen.has(path)) throw new Error("Duplicate ESLint file result"); seen.add(path);
    if (Array.isArray(result.suppressedMessages) && result.suppressedMessages.length) throw new Error("Suppressed ESLint findings require a separately qualified debt policy");
    for (const item of result.messages) {
      if (!item || typeof item !== "object" || typeof item.message !== "string" || ![1, 2].includes(item.severity)) throw new Error("Invalid ESLint diagnostic");
      if (item.ruleId === null && item.fatal !== true) throw new Error("ESLint ignored an expected source; declare its exclusion explicitly");
      findings.push({ rule_id: `lint.eslint.${item.ruleId ?? "syntax"}`, severity: item.severity === 2 ? "blocking" : "advisory", path,
        line: location(item.line), column: location(item.column), message: item.message, ...(item.fix ? { safe_fix_available: false } : {}) });
    }
  }
  if (seen.size !== input.selected.length) throw new Error("ESLint omitted expected source results");
  return findings;
}

/** Native exit 1 is an ordinary lint rejection only when a complete, validated result explains it. */
export async function executeLintBackend(input: PreparedLintInputs, evidence: string, runner: LintToolRunner = runLintTool) {
  const records: LintToolResult[] = [];
  const run = async (arguments_: string[]) => {
    const result = await runner([...input.declaration.tool.argv, ...arguments_], input.candidate); records.push(result);
    writeFileSync(join(evidence, `lint-native-${records.length}.json`), JSON.stringify(result) + "\n", { flag: "wx", mode: 0o600 });
    return result;
  };
  const version = await run(["--version"]);
  const actual = version.stdout.trim().replace(/^(?:ruff\s+|v)/u, "");
  if (version.exit_code !== 0 || actual !== input.declaration.tool.version || input.declaration.backend === "eslint" && actual !== "9.39.1" || input.declaration.backend === "ruff" && actual !== "0.15.14") throw new Error("Lint tool version is unavailable or outside its qualified contract");
  if (!input.selected.length) return { status: "not-applicable", findings: [] as Finding[], native_results: records, backend_version: actual, checked: 0 };
  const config = join(input.candidate, input.declaration.config);
  let findings: Finding[];
  if (input.declaration.backend === "ruff") {
    const common = ["check", "--config", config, "--no-cache", "--force-exclude"];
    const listed = await run([...common, "--show-files", ...input.selected]);
    const files = listed.stdout.split(/\r?\n/u).filter(Boolean).map(path => logicalPath(path, input));
    if (listed.exit_code !== 0 || new Set(files).size !== input.selected.length || files.length !== input.selected.length) throw new Error("Ruff ignored or omitted expected source; declare its exclusion explicitly");
    const result = await run([...common, "--output-format", "json", ...input.selected]);
    if (![0, 1].includes(result.exit_code)) throw new Error("Ruff invocation or configuration failed");
    findings = ruffFindings(JSON.parse(result.stdout), input);
    if (result.exit_code === 1 && !findings.length || result.exit_code === 0 && findings.length) throw new Error("Ruff outcome contradicts its diagnostics");
  } else {
    const result = await run(["--no-config-lookup", "--config", config, "--no-cache", "--format", "json", ...input.selected]);
    if (![0, 1].includes(result.exit_code)) throw new Error("ESLint invocation or configuration failed");
    findings = eslintFindings(JSON.parse(result.stdout), input);
    const blocking = findings.some(finding => finding.severity === "blocking");
    if (result.exit_code === 1 && !blocking || result.exit_code === 0 && blocking) throw new Error("ESLint outcome contradicts its diagnostics");
  }
  return { ...findingSummary(findings), findings, native_results: records, backend_version: actual, checked: input.selected.length };
}
