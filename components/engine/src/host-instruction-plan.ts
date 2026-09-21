import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import { mergeHostInstructions } from "./host-instruction-merge.ts";
import { digest } from "./core.ts";

/** Preflight host entries as a group. Aliased entries share one planned write and retain their links. */
export function planHostInstructions(workspace: string, block: string) {
  const root = realpathSync(workspace);
  const names = ["AGENTS.md", "CLAUDE.md", "GEMINI.md"];
  const override = join(root, "AGENTS.override.md");
  try { lstatSync(override); names.push("AGENTS.override.md"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const entries = names.map(name => {
    const path = join(root, name);
    let present = true;
    try { lstatSync(path); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; present = false; }
    // A dangling link is ambiguous ownership, rather than a missing entry to overwrite.
    const target = present ? realpathSync(path) : path;
    const targetRelative = relative(root, target);
    if (!targetRelative || isAbsolute(targetRelative) || targetRelative.split(/[\\/]/u).includes("..") ||
        [".git", ".governance"].includes(targetRelative.split(/[\\/]/u)[0]!.toLowerCase())) throw new Error("Host entry points outside authored repository files");
    const stat = existsSync(target) ? lstatSync(target) : null;
    if (stat && (!stat.isFile() || stat.size > 1024 * 1024)) throw new Error("Host entry must be a regular file below 1 MiB");
    const content = stat ? new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(target)) : "";
    return { name, target: targetRelative, content, mode: stat ? stat.mode & 0o777 : 0o644,
      device: stat?.dev ?? null, inode: stat?.ino ?? null, active: name !== "AGENTS.override.md" || Boolean(content.trim()) };
  });
  const inactive = entries.filter(entry => !entry.active);
  const writes = new Map<string, { path: string; beforeDigest: string | null; content: string; mode: number }>();
  for (const entry of entries) {
    if (!entry.active) continue;
    if (inactive.some(other => entry.target === other.target || (entry.inode !== null && entry.inode === other.inode && entry.device === other.device))) throw new Error("Host setup would activate an empty override");
    const content = mergeHostInstructions(entry.content, block);
    if (entry.content !== content) writes.set(entry.target, { path: entry.target,
      beforeDigest: entry.inode === null ? null : digest(entry.content), content, mode: entry.mode });
  }
  return { version: 1, kind: "host-instruction-plan", workspace: root,
    entries: entries.map(({ name, target, active }) => ({ name, target, active })), writes: [...writes.values()] };
}
