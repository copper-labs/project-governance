import { closeSync, constants, fstatSync, openSync, readSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import type { BuiltinCheckRequest } from "./builtin-checks.ts";

/** Hook messages may live outside the worktree; read a bounded ordinary file without following its final symlink. */
export function narrativeFile(root: string, path: string, maximumBytes = 1024 * 1024): string {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1 || maximumBytes > 32 * 1024 * 1024) throw new Error("Invalid bounded narrative allowance");
  const fd = openSync(resolve(root, path), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = fstatSync(fd), limit = maximumBytes;
    if (!before.isFile() || before.size > limit) throw new Error("Narrative input must be a bounded ordinary file");
    const buffer = Buffer.alloc(before.size + 1); let length = 0;
    while (length < buffer.length) { const read = readSync(fd, buffer, length, buffer.length - length, null); if (!read) break; length += read; }
    const after = fstatSync(fd);
    if (length !== before.size || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw new Error("Narrative input changed during read");
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, length));
  } finally { closeSync(fd); }
}
export function narrativeInputs(root: string, options: { commitFile?: string; prFile?: string; prTitle?: string }): Pick<BuiltinCheckRequest, "commit" | "pullRequest"> {
  if (Boolean(options.prFile) !== Boolean(options.prTitle)) throw new Error("PR body and title must be supplied together");
  const inputs: Pick<BuiltinCheckRequest, "commit" | "pullRequest"> = {};
  if (options.commitFile) {
    let commentMarker = "#";
    try {
      commentMarker = execFileSync("git", ["config", "--get", "core.commentChar"], { cwd: root, encoding: "utf8", timeout: 5000, maxBuffer: 4096, stdio: ["ignore", "pipe", "pipe"] }).trim() || "#";
    } catch (error) { if ((error as { status?: number }).status !== 1) throw new Error("Cannot determine Git comment configuration"); }
    inputs.commit = { text: narrativeFile(root, options.commitFile), path: options.commitFile, commentMarker };
  }
  if (options.prFile && options.prTitle) inputs.pullRequest = { title: options.prTitle, body: narrativeFile(root, options.prFile), path: options.prFile };
  return inputs;
}
