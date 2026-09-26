/** Check only normalization-sensitive eligible text; uncertain observations require literal bytes. */
import { spawnSync } from "node:child_process";

export function workingSourceUncertainty(root: string, paths: string[], deadlineAt: number) {
  const uncertain = new Set<string>(), wanted = new Set(paths);
  if (!paths.length) return uncertain;
  const git = (args: string[], input?: string, absentAllowed = false) => {
    const remaining = deadlineAt - performance.now();
    if (remaining <= 0) throw new Error("Freshness observation deadline");
    const result = spawnSync("git", args, { cwd: root, input, timeout: Math.max(1, Math.ceil(remaining)),
      maxBuffer: 32 * 1024 * 1024, env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_NO_REPLACE_OBJECTS: "1" },
      stdio: ["pipe", "pipe", "pipe"] });
    if (result.error || result.status !== 0 && !(absentAllowed && result.status === 1)) throw new Error("Freshness observation unavailable");
    return new TextDecoder("utf-8", { fatal: true }).decode(result.stdout);
  };
  try {
    for (const line of git(["ls-files", "-v", "-z"]).split("\0").filter(Boolean))
      if (line[0] !== "H" && wanted.has(line.slice(2))) uncertain.add(line.slice(2));
    const autocrlf = git(["config", "--get", "core.autocrlf"], undefined, true).trim().toLowerCase();
    if (!["", "false", "no", "off", "0", "true", "yes", "on", "1", "input"].includes(autocrlf)) throw new Error("Unknown normalization policy");
    const implicit = ["true", "yes", "on", "1", "input"].includes(autocrlf);
    const raw = git(["check-attr", "-z", "--stdin", "filter", "text", "eol", "working-tree-encoding", "ident"], paths.join("\0") + "\0").split("\0");
    const attributes = new Map<string, Map<string, string>>();
    for (let i = 0; i + 2 < raw.length; i += 3) {
      if (!wanted.has(raw[i]!)) throw new Error("Unexpected attribute path");
      const values = attributes.get(raw[i]!) ?? new Map<string, string>();
      values.set(raw[i + 1]!, raw[i + 2]!); attributes.set(raw[i]!, values);
    }
    const normalized: string[] = [], plain = (value: string) => ["unspecified", "unset"].includes(value);
    for (const path of paths) {
      const attrs = attributes.get(path);
      if (!attrs || attrs.size !== 5) throw new Error("Incomplete attribute observation");
      if (!plain(attrs.get("filter")!) || !plain(attrs.get("working-tree-encoding")!) || !plain(attrs.get("ident")!)) uncertain.add(path);
      if (!uncertain.has(path) && attrs.get("text") !== "unset" &&
          (attrs.get("text") !== "unspecified" || !plain(attrs.get("eol")!) || implicit)) normalized.push(path);
    }
    // Bound argv size on large trees. No binary or unrelated path participates in an EOL scan.
    for (let offset = 0; offset < normalized.length;) {
      const batch: string[] = []; let bytes = 0;
      while (offset < normalized.length && bytes < 16_000) { const path = normalized[offset++]!; batch.push(path); bytes += Buffer.byteLength(path) + 32; }
      const pending = new Set(batch);
      try {
        for (const line of git(["ls-files", "--eol", "-z", "--", ...batch.map(path => `:(literal)${path}`)]).split("\0").filter(Boolean)) {
          const tab = line.indexOf("\t"), match = /^i\/(\S*)\s+w\/(\S*)/u.exec(line.slice(0, tab)), path = line.slice(tab + 1);
          if (tab < 0 || !match || !pending.delete(path)) throw new Error("Unverified EOL observation");
          if (match[1] !== match[2]) uncertain.add(path);
        }
        for (const path of pending) uncertain.add(path);
      } catch {
        // Completed observations stay useful; the remaining files can make bounded byte progress.
        for (const path of [...batch, ...normalized.slice(offset)]) uncertain.add(path);
        break;
      }
    }
    return uncertain;
  } catch { return new Set(paths); }
}
