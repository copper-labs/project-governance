import { closeSync, fsyncSync, linkSync, lstatSync, mkdirSync, openSync, realpathSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { parseDocument } from "yaml";
import { digest } from "./core.ts";
import { worktreeBytes } from "./change-subject.ts";
import { inspectLintSetup, type LintSetupOptions } from "./lint-setup.ts";
import { planBytesDigest } from "./implementation-plan.ts";

function current(root: string, path: string): Buffer | null {
  try { const source = worktreeBytes(root, path); if (source.type !== "regular") throw new Error("Lint setup target must be ordinary"); return source.bytes; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}
function parent(root: string, path: string) {
  let directory = root;
  for (const part of path.split("/").slice(0, -1)) {
    directory = join(directory, part);
    const entry = lstatSync(directory, { throwIfNoEntry: false });
    if (entry && (!entry.isDirectory() || entry.isSymbolicLink())) throw new Error("Unsafe lint setup target");
    if (!entry) mkdirSync(directory, { mode: 0o755 });
  }
}

/** One deliberate setup proposal, no tool acquisition, automatic fixes or startup mutation. */
export function installLintSetup(workspace: string, options: LintSetupOptions & { apply?: boolean; expectedDigest?: string; includeDependencies?: boolean } = {}) {
  const root = realpathSync(workspace), proposal = inspectLintSetup(root, { ...options, includeProjectManifest: options.includeDependencies === true, planNpmLock: options.includeDependencies === true }), profilePath = "config/governance/profile.yaml";
  const before = current(root, profilePath), profile = parseDocument(before?.toString("utf8") ?? "schema_version: 1\nproject_extensions: []\n", { uniqueKeys: true });
  if (profile.errors.length || !profile.toJSON() || typeof profile.toJSON() !== "object" || Array.isArray(profile.toJSON())) throw new Error("Invalid lint setup profile");
  const lintChanged = digest(profile.toJSON().lint ?? null) !== digest(proposal.profile);
  if (lintChanged) profile.set("lint", proposal.profile);
  const files = [...proposal.files, ...(lintChanged ? [{ path: profilePath, before_sha256: before ? planBytesDigest(before).slice(7) : null, content: profile.toString() }] : [])];
  if (options.includeDependencies) {
    const owners = proposal.owners.filter(owner => owner.backend === "eslint");
    if (owners.length) {
      const packagePath = "package.json", original = current(root, packagePath), manifest = JSON.parse(original?.toString("utf8") ?? "{}");
      if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) throw new Error("Invalid project manifest");
      const dependencies = Object.assign({}, ...owners.map(owner => owner.dependencies));
      const existing = manifest.devDependencies ?? {};
      if (!existing || typeof existing !== "object" || Array.isArray(existing) || Object.keys(dependencies).some(key => existing[key] !== undefined && existing[key] !== dependencies[key])) throw new Error("Existing tool versions require explicit reconciliation");
      manifest.devDependencies = { ...existing, ...dependencies };
      const content = JSON.stringify(manifest, null, 2) + "\n";
      if (content !== original?.toString("utf8")) files.push({ path: packagePath, before_sha256: original ? planBytesDigest(original).slice(7) : null, content });
    }
  }
  const plan = { ...proposal, files, include_dependencies: options.includeDependencies ?? false }, planDigest = digest(plan);
  if (!options.apply) return { ...plan, plan_digest: planDigest, apply: "explicit-plan-digest-required" };
  if (options.expectedDigest !== planDigest || proposal.findings.length) throw new Error("Lint setup changed or contains unresolved owner conflicts");
  parent(root, profilePath);
  const claim = join(root, "config/governance/.lint-setup.lock"); mkdirSync(claim, { mode: 0o700 });
  const unchanged = () => files.forEach(file => { const bytes = current(root, file.path); if ((bytes ? planBytesDigest(bytes).slice(7) : null) !== file.before_sha256) throw new Error("Concurrent lint setup change refused"); });
  try {
    unchanged();
    for (const file of files) {
      parent(root, file.path); unchanged();
      const path = join(root, file.path), temporary = `${path}.${randomUUID()}.tmp`, mode = lstatSync(path, { throwIfNoEntry: false })?.mode ?? 0o644;
      const fd = openSync(temporary, "wx", mode & 0o777);
      try {
        try { writeFileSync(fd, file.content); fsyncSync(fd); } finally { closeSync(fd); }
        if (file.before_sha256 === null) linkSync(temporary, path); else renameSync(temporary, path);
        file.before_sha256 = planBytesDigest(file.content).slice(7);
        const directory = openSync(dirname(path), "r"); try { fsyncSync(directory); } finally { closeSync(directory); }
      } finally { try { unlinkSync(temporary); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; } }
    }
  } finally { rmdirSync(claim); }
  return { version: 1, status: files.length ? "installed" : "unchanged", plan_digest: planDigest, files: files.map(file => file.path), acquisition: "not-performed", checks: "not-performed", commits: "not-performed" };
}
