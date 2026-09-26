/** Resolve Codex's shared definition owner for installer preflight and passive readiness.
 * Execution still belongs to the invoking worktree's launcher and registry. */
import { execFileSync } from "node:child_process";
import { lstatSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { digest } from "./core.ts";
import { narrativeFile } from "./narrative-inputs.ts";
import { startupHooks } from "./startup-hooks.ts";

/** Codex uses the main checkout's hook definitions, but the command executes in the active tree. */
export function startupHookSource(workspace: string) {
  const root = realpathSync(workspace);
  let definitionRoot = root;
  if (lstatSync(join(root, ".git"), { throwIfNoEntry: false })) {
    const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", timeout: 5000,
      maxBuffer: 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
    if (realpathSync(git("rev-parse", "--show-toplevel").trim()) !== root)
      throw new Error("Codex hook discovery requires the worktree root");
    const first = git("worktree", "list", "--porcelain", "-z").split("\0\0")[0]!.split("\0");
    const path = first[0];
    if (!path?.startsWith("worktree ") || first.includes("bare"))
      throw new Error("Codex hook definition source requires a non-bare main checkout");
    definitionRoot = realpathSync(path.slice("worktree ".length));
  }
  return { workspace: root, definitionRoot, path: join(definitionRoot, ".codex/hooks.json"), shared: definitionRoot !== root,
    resolution: lstatSync(join(root, ".git"), { throwIfNoEntry: false }) ? "git-main-checkout" : "local-directory",
    hostDiscovery: "not-performed" as const };
}

/** Capture configuration only; inspecting a shared source must never install into the other tree. */
export function inspectStartupHookSource(workspace: string) {
  const source = startupHookSource(workspace);
  let contentDigest: string | null = null;
  let status: "current" | "missing" | "conflicting" | "unavailable" = "unavailable";
  try {
    if (!lstatSync(source.path, { throwIfNoEntry: false })) status = "missing";
    else {
      if (realpathSync(source.path) !== source.path) throw new Error("Aliased Codex hook source");
      const content = narrativeFile(source.definitionRoot, source.path);
      contentDigest = digest(content);
      status = "conflicting";
      const configuration = JSON.parse(content);
      const proposal = startupHooks(configuration, source.definitionRoot, join(source.definitionRoot, ".governance/startup.sqlite"));
      if (JSON.stringify(configuration) === JSON.stringify(proposal.configuration)) status = "current";
    }
  } catch { /* Unreadable or conflicting definitions are not evidence of a configured host. */ }
  return { ...source, contentDigest, status };
}

/** A linked installation cannot repair the shared source without owning that checkout's cutover. */
export function assertSharedStartupHookSource(workspace: string) {
  const source = inspectStartupHookSource(workspace);
  if (source.shared && source.status !== "current")
    throw new Error(`Shared Codex hook source is ${source.status}: ${source.path}. Reconcile the main checkout through its backed runtime installation at a coordinated worktree seam, then retry; no shared hook was changed.`);
  return source;
}
