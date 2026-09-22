import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, readlinkSync, realpathSync } from "node:fs";
import { isAbsolute, join, posix, relative } from "node:path";
import { canonical } from "./core.ts";

export interface SubjectSource { kind: "git" | "index" | "worktree"; path: string; ref?: string; identity: string; file_type: "regular" | "symlink" }
export interface ChangeRecord {
  status: "added" | "deleted" | "modified" | "renamed"; path: string; previous_path: string | null;
  before: SubjectSource | null; after: SubjectSource | null; changed_ranges: Array<{ start: number; end: number }>;
}
export interface ChangeScope {
  kind: "project-governance-change-packet"; version: 1; scope: "all" | "changed"; mode: "all" | "staged" | "changed" | "explicit";
  base_ref: string | null; records: ChangeRecord[]; subject_digest: string | null;
}
const hash = (bytes: Buffer | string) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

/** No shell, external diff driver or implicit alternate comparison base participates in identity. */
function git(root: string, args: string[], maxBuffer = 32 * 1024 * 1024): Buffer {
  try { return execFileSync("git", args, { cwd: root, timeout: 30_000, maxBuffer, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_NO_REPLACE_OBJECTS: "1" } }); }
  catch { throw new Error(`Git comparison failed: ${args[0]}; the requested subject is unavailable or exceeds its budget`); }
}
function decode(bytes: Buffer): string { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
function gitText(root: string, args: string[]): string { return decode(git(root, args)).trim(); }

export function safeSubjectPath(value: string): string {
  if (!value || value.includes("\0") || Buffer.byteLength(value) > 4096 || isAbsolute(value) || value.split("/").includes("..") || posix.normalize(value) !== value || value === ".") throw new Error("unsafe repository-relative subject path");
  return value;
}
function fileType(mode: string): "regular" | "symlink" {
  if (["100644", "100755"].includes(mode)) return "regular";
  if (mode === "120000") return "symlink";
  throw new Error("comparison source is not a regular file or symlink");
}

/** A final symlink is checked as link payload; intermediate symlinks never authorize outside reads. */
export function worktreeBytes(root: string, path: string, limit = 16 * 1024 * 1024): { bytes: Buffer; type: "regular" | "symlink" } {
  safeSubjectPath(path); root = realpathSync(root);
  const parts = path.split("/"); let parent = root;
  for (const part of parts.slice(0, -1)) {
    parent = join(parent, part);
    if (lstatSync(parent).isSymbolicLink()) throw new Error("worktree subject cannot traverse a symlink");
  }
  const absolute = join(root, path), stat = lstatSync(absolute);
  if (stat.isSymbolicLink()) return { bytes: readlinkSync(absolute, { encoding: "buffer" }), type: "symlink" };
  if (!stat.isFile() || stat.size > limit) throw new Error("worktree subject is not a bounded regular file");
  const rel = relative(root, realpathSync(absolute));
  if (rel === ".." || rel.startsWith("../") || isAbsolute(rel)) throw new Error("worktree subject escaped repository");
  const fd = openSync(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = fstatSync(fd);
    if (!opened.isFile() || opened.size > limit) throw new Error("subject changed file type or exceeds budget");
    const chunks: Buffer[] = []; let total = 0;
    while (total <= limit) {
      const chunk = Buffer.allocUnsafe(Math.min(65536, limit + 1 - total));
      const count = readSync(fd, chunk, 0, chunk.length, null);
      if (!count) break;
      chunks.push(chunk.subarray(0, count)); total += count;
    }
    if (total > limit) throw new Error("subject exceeds read budget");
    return { bytes: Buffer.concat(chunks, total), type: "regular" };
  } finally { closeSync(fd); }
}

function entry(root: string, kind: "git" | "index", path: string, ref?: string): SubjectSource | null {
  const raw = git(root, kind === "git" ? ["ls-tree", "-z", ref!, "--", `:(literal)${path}`] : ["ls-files", "--stage", "-z", "--", `:(literal)${path}`]);
  const entries = decode(raw).split("\0").filter(Boolean);
  if (!entries.length) return null;
  if (entries.length !== 1) throw new Error("ambiguous or unresolved subject entry");
  const line = entries[0]!, tab = line.indexOf("\t"), metadata = line.slice(0, tab).split(" ");
  if (tab < 0 || line.slice(tab + 1) !== path || metadata.length !== 3) throw new Error("malformed subject entry");
  if (kind === "index" && metadata[2] !== "0") throw new Error("unresolved index stage");
  if (kind === "git" && metadata[1] !== "blob") throw new Error("subject entry is not a blob");
  return { kind, path, ...(ref ? { ref } : {}), identity: metadata[kind === "git" ? 2 : 1]!, file_type: fileType(metadata[0]!) };
}

/** Captured object IDs survive later index changes; live inputs must still match their captured digest. */
export function readSubjectSource(root: string, source: SubjectSource, limit = 16 * 1024 * 1024): Buffer {
  safeSubjectPath(source.path);
  if (source.kind === "worktree") {
    const current = worktreeBytes(root, source.path, limit);
    if (hash(current.bytes) !== source.identity || current.type !== source.file_type) throw new Error("worktree subject changed after capture");
    return current.bytes;
  }
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(source.identity)) throw new Error("invalid subject blob identity");
  const bytes = git(root, ["cat-file", "blob", source.identity], limit);
  if (bytes.length > limit) throw new Error("subject exceeds read budget");
  return bytes;
}

export function subjectDigest(records: ChangeRecord[]): string {
  const logical = records.map(r => ({ status: r.status, path: r.path, previous_path: r.previous_path,
    before_identity: r.before?.identity ?? null, after_identity: r.after?.identity ?? null,
    before_file_type: r.before?.file_type ?? null, after_file_type: r.after?.file_type ?? null, changed_ranges: r.changed_ranges }))
    .sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : a.status < b.status ? -1 : a.status > b.status ? 1 : (a.previous_path ?? "").localeCompare(b.previous_path ?? ""));
  // Version-one packets use Python's ASCII JSON escaping; keep their existing digest convention.
  return hash(canonical(logical).replace(/[\u007f-\uffff]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`));
}

/** Resolve status, ranges and source identities twice so concurrent edits cannot form a mixed packet. */
export function resolveChangeScope(root: string, options: { staged?: boolean; all?: boolean; paths?: string[]; baseRef?: string } = {}): ChangeScope {
  if (options.all) return { kind: "project-governance-change-packet", version: 1, scope: "all", mode: "all", base_ref: null, records: [], subject_digest: null };
  const paths = [...new Set((options.paths ?? []).map(safeSubjectPath))].sort();
  const configured = options.baseRef || process.env["GOVERNANCE_BASE_REF"]?.trim();
  if (!options.staged && paths.length && !configured) throw new Error("explicit changed paths require a comparison base");
  const head = gitText(root, ["rev-parse", "--verify", "HEAD^{commit}"]);
  const base = options.staged ? head : gitText(root, ["merge-base", head, gitText(root, ["rev-parse", "--verify", "--end-of-options", `${configured || "@{upstream}"}^{commit}`])]);
  const diff = options.staged ? ["--cached", base] : [base, ...(paths.length ? ["--", ...paths.map(p => `:(literal)${p}`)] : [])];
  const snapshot = (): ChangeRecord[] => {
    const tokens = decode(git(root, ["diff", "--name-status", "-z", "-M", "--no-ext-diff", "--diff-filter=ACDMRTUXB", ...diff])).split("\0").filter(Boolean);
    const records = new Map<string, ChangeRecord>();
    for (let i = 0; i < tokens.length;) {
      const status = tokens[i++]!, code = status[0], previous = ["R", "C"].includes(code!) ? safeSubjectPath(tokens[i++] ?? "") : null;
      const path = safeSubjectPath(tokens[i++] ?? "");
      if (["U", "X", "B"].includes(code!)) throw new Error("unresolved Git change status");
      records.set(path, { status: previous ? "renamed" : code === "A" ? "added" : code === "D" ? "deleted" : "modified", path, previous_path: previous, before: null, after: null, changed_ranges: [] });
    }
    if (!options.staged) {
      const extras = paths.length ? paths : decode(git(root, ["ls-files", "--others", "--exclude-standard", "-z"])).split("\0").filter(Boolean).map(safeSubjectPath);
      for (const path of extras) if (!records.has(path)) {
        let present = false;
        try { const stat = lstatSync(join(root, path)); present = stat.isFile() || stat.isSymbolicLink(); } catch { /* Deleted input. */ }
        const before = entry(root, "git", path, base);
        if (!present && !before) continue;
        records.set(path, { status: present ? before ? "modified" : "added" : "deleted", path, previous_path: null, before: null, after: null, changed_ranges: [] });
      }
    }
    let current: string | null = null;
    const lines = decode(git(root, ["-c", "core.quotePath=false", "diff", "--unified=0", "--no-color", "--no-ext-diff", "--no-textconv", "-M", "--diff-filter=ACMR", ...diff])).split("\n");
    for (const line of lines) {
      if (line.startsWith("+++ b/")) { current = safeSubjectPath(line.slice(6)); continue; }
      if (line.startsWith("+++ ")) { current = null; if (line !== "+++ /dev/null") throw new Error("unsupported quoted Git hunk path"); continue; }
      if (!current || !line.startsWith("@@")) continue;
      const match = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
      if (!match) throw new Error("invalid Git hunk header");
      const count = Number(match[2] ?? 1), start = Math.max(Number(match[1]), 1);
      if (count) records.get(current)?.changed_ranges.push({ start, end: start + count - 1 });
    }
    for (const record of records.values()) {
      if (record.status !== "added") {
        record.before = entry(root, "git", record.previous_path ?? record.path, base);
        if (!record.before) throw new Error("comparison before-image unavailable");
      }
      if (record.status !== "deleted") {
        if (options.staged) {
          record.after = entry(root, "index", record.path);
          if (!record.after) throw new Error("comparison index image unavailable");
        } else {
          const current = worktreeBytes(root, record.path);
          record.after = { kind: "worktree", path: record.path, identity: hash(current.bytes), file_type: current.type };
        }
      }
    }
    return [...records.values()].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  };
  const records = snapshot();
  if (canonical(records) !== canonical(snapshot())) throw new Error("comparison subject changed while resolving");
  return { kind: "project-governance-change-packet", version: 1, scope: "changed", mode: options.staged ? "staged" : paths.length ? "explicit" : "changed",
    base_ref: base, records, subject_digest: subjectDigest(records) };
}


/** A validator sees the captured overlay and immutable base, never unrelated dirty checkout bytes. */
export class ValidationSubject {
  readonly root: string;
  readonly #scope: ChangeScope;
  readonly #overlay = new Map<string, SubjectSource | null>();
  constructor(root: string, scope: ChangeScope) {
    this.root = realpathSync(root); this.#scope = structuredClone(scope);
    if (scope.kind !== "project-governance-change-packet" || scope.version !== 1) throw new Error("unsupported validation subject");
    if (scope.scope === "all") {
      if (scope.mode !== "all" || scope.base_ref !== null || scope.subject_digest !== null || scope.records.length) throw new Error("inconsistent all-mode subject");
      return;
    }
    if (!scope.base_ref || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(scope.base_ref) || scope.subject_digest !== subjectDigest(scope.records)) throw new Error("invalid content-bound subject identity");
    for (const record of this.#scope.records) {
      safeSubjectPath(record.path);
      if (record.previous_path) this.#overlay.set(safeSubjectPath(record.previous_path), null);
      this.#overlay.set(record.path, record.after);
    }
  }

  source(path: string): SubjectSource | null {
    safeSubjectPath(path);
    if (this.#scope.scope === "all") {
      try {
        const current = worktreeBytes(this.root, path);
        return { kind: "worktree", path, identity: hash(current.bytes), file_type: current.type };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    }
    if (this.#overlay.has(path)) return structuredClone(this.#overlay.get(path)!);
    return entry(this.root, "git", path, this.#scope.base_ref!);
  }

  read(path: string, limit = 16 * 1024 * 1024): Buffer {
    const source = this.source(path);
    if (!source) throw new Error(`subject path is absent: ${path}`);
    if (source.file_type !== "regular") throw new Error(`subject path is not a regular file: ${path}`);
    return readSubjectSource(this.root, source, limit);
  }

  /**
   * The exact unified diff for one captured path, produced by the same comparison that established
   * `changed_ranges`. Optional semantic review reads this; it never becomes a new comparison base.
   */
  hunks(path: string, context = 3, limit = 256 * 1024): string {
    safeSubjectPath(path);
    if (this.#scope.scope === "all" || !this.#scope.base_ref) throw new Error("diff capture requires a compared subject");
    if (!Number.isSafeInteger(context) || context < 0 || context > 16) throw new Error("invalid diff context");
    const captured = this.source(path) ? this.read(path, limit) : null;
    const diff = this.#scope.mode === "staged" ? ["--cached", this.#scope.base_ref] : [this.#scope.base_ref];
    const bytes = git(this.root, ["-c", "core.quotePath=false", "diff", `--unified=${context}`, "--no-color", "--no-ext-diff",
      "--no-textconv", "-M", ...diff, "--", `:(literal)${path}`], limit);
    if (bytes.length > limit) throw new Error("captured diff exceeds read budget");
    if (captured) this.read(path, limit);
    if (!bytes.length && captured && this.#scope.records.some(record => record.path === path && !record.before)) {
      const lines = decode(captured).split("\n");
      if (lines.at(-1) === "") lines.pop();
      return `--- /dev/null\n+++ b/${path}\n@@ -0,0 +1,${lines.length} @@\n${lines.map(line => `+${line}`).join("\n")}\n`;
    }
    return decode(bytes);
  }

  paths(prefixes?: string[]): string[] {
    const scopes = prefixes?.map(safeSubjectPath);
    if (scopes && !scopes.length) return [];
    const included = (path: string) => !scopes || scopes.some(scope => path === scope || path.startsWith(scope + "/"));
    const args = this.#scope.scope === "all" ? ["ls-files", "--cached", "--others", "--exclude-standard", "-z"] : ["ls-tree", "-r", "--name-only", "-z", this.#scope.base_ref!];
    if (scopes) args.push("--", ...scopes.map(path => `:(literal)${path}`));
    const paths = new Set(decode(git(this.root, args)).split("\0").filter(Boolean).map(safeSubjectPath));
    for (const [path, source] of this.#overlay) if (included(path)) { if (source) paths.add(path); else paths.delete(path); }
    return [...paths].sort();
  }
}
