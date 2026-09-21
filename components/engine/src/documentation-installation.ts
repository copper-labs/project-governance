import { closeSync, fsyncSync, lstatSync, mkdirSync, openSync, realpathSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { parse } from "yaml";
import { safeSubjectPath } from "./change-subject.ts";
import { narrativeFile } from "./narrative-inputs.ts";
import { object } from "./core.ts";
const PROFILE = "config/governance/profile.yaml", DEFAULT_ROOT = "docs/developer";
const SECTION = "documentation:\n  enabled: true\n  root: docs/developer\n  research: allowed\n";

/** Inspect every existing ancestor so create-only installation never traverses target symlinks. */
function state(root: string, path: string, directory = false): "created" | "unchanged" | "conflict" {
  safeSubjectPath(path);
  const parts = path.split("/"); let current = root;
  for (const [index, part] of parts.entries()) {
    current = join(current, part);
    try {
      const stat = lstatSync(current);
      if (stat.isSymbolicLink() || (index < parts.length - 1 && !stat.isDirectory())) return "conflict";
      if (index === parts.length - 1) return (directory ? stat.isDirectory() : stat.isFile()) ? "unchanged" : "conflict";
    } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return "created"; throw error; }
  }
  throw new Error("Invalid documentation target");
}
function indexText(today: string): string {
  return `---
id: developer-documentation.index
title: Developer Documentation
type: guide
status: current
owner: repository
created: ${today}
updated: ${today}
summary: Routes developers and agents to the repository's canonical technical documentation.
---

# Developer Documentation

Start with the reader job you need to complete. Add a guide only when it provides a tested journey;
keep exact behavior in one canonical reference.

## For Humans

The capability catalog begins empty. As capabilities are documented, link their shortest useful
guides here by reader job.

## For Agents

Read \`catalog.yaml\`, then use the matched capability's reference, guides, and local sources. When the
installed runtime is available, \`project-governance docs route\` returns the same bounded context.
`;
}

/** Install neutral entry files without replacing authored documentation or reformatting the profile. */
export function initializeDocumentation(workspace: string, dryRun = false) {
  const root = realpathSync(workspace), profileState = state(root, PROFILE);
  if (profileState === "conflict") throw new Error("Documentation profile must be an ordinary local file");
  const before = profileState === "unchanged" ? narrativeFile(root, PROFILE) : null;
  const profile = before === null ? {} : object(parse(before) ?? {}, "profile");
  let profileText: string | null = null;
  let enabled = true, docRoot = DEFAULT_ROOT, research: "allowed" | "disabled" = "allowed";
  if (!Object.hasOwn(profile, "documentation")) {
    profileText = before === null ? "schema_version: 1\nproject_extensions: []\n" + SECTION : before + (before.endsWith("\n") || !before ? "" : "\n") + SECTION;
    // Flow-style or explicitly terminated YAML cannot safely accept a raw appended section.
    object(parse(profileText), "updated profile");
  } else {
    const config = object(profile.documentation, "documentation configuration");
    const configuredEnabled = Object.hasOwn(config, "enabled") ? config.enabled : true;
    const configuredRoot = Object.hasOwn(config, "root") ? config.root : DEFAULT_ROOT;
    const configuredResearch = Object.hasOwn(config, "research") ? config.research : "allowed";
    if (typeof configuredEnabled !== "boolean" || typeof configuredRoot !== "string" || !["allowed", "disabled"].includes(String(configuredResearch))) throw new Error("Invalid documentation configuration");
    enabled = configuredEnabled; docRoot = safeSubjectPath(configuredRoot); research = configuredResearch as typeof research;
  }
  const envelope = { kind: "project-governance-documentation-init", version: 1, dry_run: dryRun, research };
  if (!enabled) return { ...envelope, status: "disabled", created: [], updated: [], unchanged: [PROFILE], conflicts: [], agent_pointer: null };
  const targets = [{ path: `${docRoot}/index.md`, directory: false }, { path: `${docRoot}/catalog.yaml`, directory: false },
    { path: `${docRoot}/guides`, directory: true }, { path: `${docRoot}/reference`, directory: true }];
  const created: string[] = [], unchanged: string[] = [], conflicts: string[] = [];
  for (const target of targets) {
    const result = state(root, target.path, target.directory);
    (result === "created" ? created : result === "conflict" ? conflicts : unchanged).push(target.path);
  }
  if (before === null) created.unshift(PROFILE); else if (profileText === null) unchanged.unshift(PROFILE);
  const updated = before !== null && profileText !== null ? [PROFILE] : [];
  const result = { ...envelope, status: conflicts.length ? "failed" : dryRun ? "dry-run" : created.length || updated.length ? "initialized" : "unchanged",
    created: conflicts.length ? [] : created, updated: conflicts.length ? [] : updated, unchanged, conflicts,
    agent_pointer: `Developer documentation: \`${docRoot}/index.md\`; agent catalog: \`${docRoot}/catalog.yaml\`; external research: \`${research}\`.` };
  if (conflicts.length || dryRun) return result;
  const unchangedProfile = () => {
    if (state(root, PROFILE) !== profileState || (before !== null && narrativeFile(root, PROFILE) !== before)) throw new Error("Profile changed during documentation installation");
  };
  unchangedProfile();
  for (const target of targets) {
    if (!created.includes(target.path)) continue;
    if (state(root, target.path, target.directory) !== "created") throw new Error("Documentation target changed during installation");
    const path = join(root, target.path);
    if (target.directory) mkdirSync(path, { recursive: true });
    else {
      mkdirSync(dirname(path), { recursive: true });
      const fd = openSync(path, "wx", 0o644);
      try { writeFileSync(fd, target.path.endsWith("/index.md") ? indexText(new Date().toISOString().slice(0, 10)) : "version: 1\ncapabilities: []\n"); fsyncSync(fd); }
      finally { closeSync(fd); }
    }
  }
  if (profileText !== null) {
    unchangedProfile();
    const path = join(root, PROFILE); mkdirSync(dirname(path), { recursive: true });
    if (before === null) {
      const fd = openSync(path, "wx", 0o644);
      try { writeFileSync(fd, profileText); fsyncSync(fd); } finally { closeSync(fd); }
    } else {
      const temporary = `${path}.${randomUUID()}.tmp`, fd = openSync(temporary, "wx", lstatSync(path).mode & 0o777);
      try {
        try { writeFileSync(fd, profileText); fsyncSync(fd); } finally { closeSync(fd); }
        unchangedProfile(); renameSync(temporary, path);
      } finally { try { unlinkSync(temporary); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; } }
    }
  }
  return result;
}
