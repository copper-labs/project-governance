import { closeSync, constants, fstatSync, openSync, readSync } from "node:fs";
import { createHash, timingSafeEqual } from "node:crypto";
import { compiledRuntimeLock, type CompiledRuntimeLock } from "./runtime-lock.ts";

/** Verify a downloaded/local archive before handing it to an installer; no archive code is executed here. */
export function verifyRuntimeArchive(path: string, input: CompiledRuntimeLock, maximumBytes = 512 * 1024 * 1024) {
  const lock = compiledRuntimeLock(input);
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) throw new Error("Invalid archive limit");
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = fstatSync(fd, { bigint: true });
    if (!before.isFile() || before.size < 1n || before.size > BigInt(maximumBytes)) throw new Error("Runtime archive must be a bounded ordinary file");
    const hash = createHash("sha512"), buffer = Buffer.alloc(64 * 1024);
    let bytes = 0;
    for (;;) {
      const length = readSync(fd, buffer, 0, buffer.length, null);
      if (!length) break;
      bytes += length;
      if (bytes > maximumBytes) throw new Error("Runtime archive exceeded its byte limit");
      hash.update(buffer.subarray(0, length));
    }
    const after = fstatSync(fd, { bigint: true });
    if (before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs || BigInt(bytes) !== before.size) throw new Error("Runtime archive changed during verification");
    const actual = hash.digest(), expected = Buffer.from(lock.artifact.integrity.slice(7), "base64");
    if (!timingSafeEqual(actual, expected)) throw new Error("Runtime archive integrity mismatch");
    return { version: 1, package: lock.package, packageVersion: lock.version, integrity: lock.artifact.integrity, bytes,
      scope: "archive-bytes-only" as const };
  } finally { closeSync(fd); }
}
