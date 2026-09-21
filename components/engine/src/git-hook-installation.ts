import { execFileSync } from "node:child_process";
import { closeSync, chmodSync, fsyncSync, lstatSync, mkdirSync, openSync, realpathSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { GIT_HOOKS, gitHookLauncher, type GitHook } from "./git-hooks.ts";
import { worktreeBytes } from "./change-subject.ts";
import { digest } from "./core.ts";

type PreviousHooks = Partial<Record<GitHook, string>>;
interface HookState { hook: GitHook; action: "create" | "replace" | "repair-mode" | "current" | "conflict"; identity: string | null }
function hookDirectory(root: string): boolean {
  try {
    const path = join(root, ".githooks"), stat = lstatSync(path);
    if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(path) !== path) throw new Error("Hook directory is not an ordinary project directory");
    return true;
  } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
}
function configuredHooks(root: string): string | null {
  try {
    return execFileSync("git", ["config", "--get", "core.hooksPath"], { cwd: root, encoding: "utf8", timeout: 5000, maxBuffer: 16384, stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (error) { if ((error as { status?: number }).status === 1) return null; throw error; }
}
function inspectHook(root: string, hook: GitHook, previous: PreviousHooks): HookState {
  try {
    const path = `.githooks/${hook}`, stat = lstatSync(join(root, path));
    if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o7000)) return { hook, action: "conflict", identity: null };
    const value = worktreeBytes(root, path, 64 * 1024);
    if (value.type !== "regular") return { hook, action: "conflict", identity: null };
    const content = value.bytes.toString("utf8"), identity = digest({ bytes: value.bytes.toString("base64"), mode: stat.mode & 0o777 });
    if (content === gitHookLauncher(hook)) return { hook, action: stat.mode & 0o100 ? "current" : "repair-mode", identity };
    return { hook, action: previous[hook] !== undefined && content === previous[hook] ? "replace" : "conflict", identity };
  } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return { hook, action: "create", identity: null }; throw error; }
}

/** Prior templates come from the verified previous installation, never a guessed user-hook signature. */
export function planGitHookInstallation(workspace: string, previous: PreviousHooks = {}) {
  const root = realpathSync(workspace);
  const top = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: root, encoding: "utf8", timeout: 5000, maxBuffer: 16384 }).trim();
  if (realpathSync(top) !== root) throw new Error("Hook installation requires the worktree root");
  hookDirectory(root);
  for (const [hook, content] of Object.entries(previous)) {
    if (!GIT_HOOKS.includes(hook as GitHook) || typeof content !== "string" || Buffer.byteLength(content) > 64 * 1024) throw new Error("Invalid prior hook templates");
  }
  const hooksPath = configuredHooks(root), hooks = GIT_HOOKS.map(hook => inspectHook(root, hook, previous));
  let worktreeConfig = false;
  try { worktreeConfig = execFileSync("git", ["config", "--bool", "extensions.worktreeConfig"], { cwd: root, encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "pipe"] }).trim() === "true"; }
  catch (error) { if ((error as { status?: number }).status !== 1) throw error; }
  const gitPaths = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-dir", "--git-common-dir"],
    { cwd: root, encoding: "utf8", timeout: 5000, maxBuffer: 16384 }).trim().split("\n");
  const configurationScope = worktreeConfig ? "worktree" : gitPaths[0] === gitPaths[1] ? "local" : "shared";
  const unmanagedHooks: string[] = [];
  if (hooksPath === null) {
    const directory = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-path", "hooks"],
      { cwd: root, encoding: "utf8", timeout: 5000, maxBuffer: 16384 }).trim();
    try {
      const stat = lstatSync(directory);
      if (!stat.isDirectory() || stat.isSymbolicLink()) unmanagedHooks.push(directory);
      else unmanagedHooks.push(...readdirSync(directory).filter(name => !name.endsWith(".sample")).sort());
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  return { root, hooksPath, hooks, unmanagedHooks, configurationScope, ready: !unmanagedHooks.length && (hooksPath === null || hooksPath === ".githooks") && hooks.every(hook => hook.action !== "conflict") };
}

/** Preflight the entire set before mutation; repeat after interruption instead of overwriting custom hooks. */
export function installGitHooks(workspace: string, options: { previous?: PreviousHooks; configure?: boolean } = {}) {
  const previous = options.previous ?? {}, plan = planGitHookInstallation(workspace, previous);
  if (!plan.ready) throw new Error("Custom hooks or hook configuration require reconciliation; no hooks changed");
  if (options.configure && plan.hooksPath === null && plan.configurationScope === "shared") throw new Error("Enable worktree-local configuration before configuring hooks in a linked worktree");
  if (!hookDirectory(plan.root)) mkdirSync(join(plan.root, ".githooks"), { mode: 0o755 });
  const changed: GitHook[] = [];
  for (const item of plan.hooks) {
    if (!hookDirectory(plan.root)) throw new Error("Hook directory changed during installation");
    const current = inspectHook(plan.root, item.hook, previous);
    if (current.identity !== item.identity || current.action !== item.action) throw new Error("Hook changed during installation; earlier changes retained");
    if (item.action === "current") continue;
    const path = join(plan.root, ".githooks", item.hook), temporary = `${path}.${randomUUID()}.tmp`;
    const fd = openSync(temporary, "wx", 0o755);
    try {
      try { writeFileSync(fd, gitHookLauncher(item.hook)); chmodSync(temporary, 0o755); fsyncSync(fd); } finally { closeSync(fd); }
      const rechecked = inspectHook(plan.root, item.hook, previous);
      if (rechecked.identity !== item.identity || rechecked.action !== item.action) throw new Error("Hook changed before replacement");
      renameSync(temporary, path);
      const directory = openSync(join(plan.root, ".githooks"), "r");
      try { fsyncSync(directory); } finally { closeSync(directory); }
      changed.push(item.hook);
    } finally { try { unlinkSync(temporary); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; } }
  }
  if (!planGitHookInstallation(plan.root, previous).ready) throw new Error("Custom hooks appeared during installation");
  if (configuredHooks(plan.root) !== plan.hooksPath) throw new Error("Git hook configuration changed during installation");
  if (options.configure && plan.hooksPath === null) {
    execFileSync("git", ["config", plan.configurationScope === "worktree" ? "--worktree" : "--local", "core.hooksPath", ".githooks"], { cwd: plan.root, timeout: 5000 });
  }
  const readback = planGitHookInstallation(plan.root, previous);
  if (readback.hooks.some(hook => hook.action !== "current") || (options.configure && readback.hooksPath !== ".githooks")) throw new Error("Installed hook readback failed");
  return { ...readback, changed, configured: readback.hooksPath === ".githooks" };
}
