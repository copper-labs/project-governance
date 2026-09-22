import { digest, fileDigest } from "./core.ts";
import { realpathSync, existsSync, readdirSync, lstatSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve, join } from "node:path";
import { execFileSync } from "node:child_process";

export const GUARDED_CLASS = "bounded-summary";
export const GUARDED_TOOLS = ["Read", "Grep", "Glob"];
export const GUARDED_ENVIRONMENT = Object.freeze({ CLAUDE_CODE_DISABLE_TERMINAL_TITLE: "1" });
export const GUARDED_SETTINGS = Object.freeze({ fallbackModel: [], disableAllHooks: true, permissions: {
  defaultMode: "dontAsk", blockReadsOutsideWorkingDirectories: true,
  deny: ["Bash", "PowerShell", "Agent", "Task", "Edit", "Write", "NotebookEdit", "WebFetch", "WebSearch", "mcp__*", "Cd",
    "Read(**/.env)", "Read(**/.env.*)", "Read(**/*.pem)", "Read(**/*.key)", "Read(**/.ssh/**)",
    "Read(**/.aws/**)", "Read(**/.npmrc)", "Read(**/.netrc)", "Read(**/credentials*)", "Read(**/.git/**)", "Read(**/.claude/**)"] } });
export interface ProviderGuard {
  version: 1; kind: "claude-restricted-read"; assignmentClass: typeof GUARDED_CLASS;
  executable: string; executableDigest: string; hostVersion: string; settings: typeof GUARDED_SETTINGS;
  settingsDigest: string; managedDigest: string; tools: string[];
  environment: typeof GUARDED_ENVIRONMENT;
}
export function outsideRoots(path: string, roots: string[]) {
  const real = realpathSync(path);
  if (real !== path || roots.some(root => { const rel = relative(root, real); return rel === "" || (!rel.startsWith("../") && rel !== ".." && !isAbsolute(rel)); }))
    throw new Error("Trusted provider files must be canonical and outside every worker root");
  return real;
}
/** A not-yet-created job/registry still needs a canonical, protected parent. */
export function protectedPath(path: string, roots: string[]) {
  if (lstatSync(path, { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error("Trusted provider path cannot be a symlink");
  const absolute = resolve(path), real = existsSync(absolute) ? realpathSync(absolute) : join(realpathSync(dirname(absolute)), basename(absolute));
  if (real !== absolute || roots.some(root => withinRoot(root, real))) throw new Error("Trusted provider path overlaps a worker root or symlink");
  return real;
}
export function withinRoot(root: string, path: string) {
  const rel = relative(root, path);
  return rel === "" || (!rel.startsWith("../") && rel !== ".." && !isAbsolute(rel));
}
export function providerRoots(workspace: string, additional: string[] = []) {
  return [...new Set([realpathSync(workspace), ...additional.map(path => realpathSync(path))])];
}
function managedDigest() {
  // Remote managed policy is an administrator trust boundary. Local managed settings are frozen.
  const directory = process.platform === "darwin" ? "/Library/Application Support/ClaudeCode" : "/etc/claude-code";
  const paths = [join(directory, "managed-settings.json"), join(directory, "managed-mcp.json")];
  const fragments = join(directory, "managed-settings.d");
  if (existsSync(fragments)) paths.push(...readdirSync(fragments).filter(name => name.endsWith(".json")).sort().map(name => join(fragments, name)));
  return digest(paths.map(path => ({ path, digest: existsSync(path) ? fileDigest(path) : null })));
}
export function captureProviderGuard(executable: string): ProviderGuard {
  const hostVersion = execFileSync(executable, ["--version"], { encoding: "utf8", timeout: 10000, maxBuffer: 8192 }).trim();
  const match = /^(\d+)\.(\d+)\.(\d+) \(Claude Code\)$/u.exec(hostVersion);
  if (!match || Number(match[1]) !== 2 || Number(match[2]) !== 1 || Number(match[3]) < 248) throw new Error("Claude restricted mode is unavailable on this host version");
  return { version: 1, kind: "claude-restricted-read", assignmentClass: GUARDED_CLASS, executable: realpathSync(executable),
    executableDigest: fileDigest(executable), hostVersion, settings: structuredClone(GUARDED_SETTINGS),
    settingsDigest: digest(GUARDED_SETTINGS), managedDigest: managedDigest(), tools: [...GUARDED_TOOLS], environment: { ...GUARDED_ENVIRONMENT } };
}
export function validateProviderGuard(value: ProviderGuard) {
  if (value.version !== 1 || value.kind !== "claude-restricted-read" || value.assignmentClass !== GUARDED_CLASS ||
      digest(value.settings) !== digest(GUARDED_SETTINGS) || value.settingsDigest !== digest(GUARDED_SETTINGS) ||
      digest(value.tools) !== digest(GUARDED_TOOLS) || digest(value.environment) !== digest(GUARDED_ENVIRONMENT) || realpathSync(value.executable) !== value.executable ||
      value.executableDigest !== fileDigest(value.executable) || value.managedDigest !== managedDigest()) throw new Error("Guarded provider identity changed");
}
