import { closeSync, constants, existsSync, fstatSync, openSync, readSync, statSync } from "node:fs";
import { join } from "node:path";
import { observeCommand } from "./process-owner.ts";

export function observeCoworkCommit(directory: string, requestDigest: string) {
  let observed = observeCommand(directory, requestDigest);
  if (observed.state === "unknown") observed = observeCommand(directory, requestDigest);
  if (observed.state === "unknown" && !existsSync(join(directory, "owner.json")) &&
      Date.now() - statSync(join(directory, "request.json")).mtimeMs < 60_000)
    return { ...observed, state: "pending" as const };
  return observed;
}

/** Optional live output must never hide a durable command result. */
export function coworkLogTail(path: string): string | null {
  let fd: number | undefined;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const info = fstatSync(fd);
    if (!info.isFile()) return null;
    const size = Math.min(info.size, 16 * 1024), bytes = Buffer.alloc(size);
    const count = readSync(fd, bytes, 0, size, Math.max(0, info.size - size));
    return new TextDecoder().decode(bytes.subarray(0, count));
  } catch { return null; }
  finally { if (fd !== undefined) closeSync(fd); }
}
