import { constants, closeSync, fstatSync, lstatSync, openSync, readSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { evaluateEvidence } from "./evaluation-api-v1.ts";
import { EVALUATION_LIMITS, evaluationExitCode, unavailableEvaluation } from "./evaluation-schema.ts";

/** One JSON envelope covers argument, file, configuration, admission and provider failures. */
export async function evaluationCommand(args: string[], root: string) {
  let result;
  try {
    const { values } = parseArgs({ args, strict: true, allowPositionals: false, options: { "request-file": { type: "string" } } });
    if (!values["request-file"]) throw new Error("request required");
    const path = resolve(root, values["request-file"]), stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > EVALUATION_LIMITS.serializedBytes) throw new Error("request file invalid");
    let fd: number | undefined, bytes: Buffer;
    try {
      fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      const before = fstatSync(fd);
      if (!before.isFile() || before.dev !== stat.dev || before.ino !== stat.ino || before.size !== stat.size || before.mtimeMs !== stat.mtimeMs || before.ctimeMs !== stat.ctimeMs) throw new Error("request file changed");
      bytes = Buffer.alloc(before.size); let offset = 0;
      while (offset < bytes.length) { const count = readSync(fd, bytes, offset, bytes.length - offset, null); if (!count) throw new Error("request file changed"); offset += count; }
      const after = fstatSync(fd), leaf = lstatSync(path);
      if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || leaf.isSymbolicLink() || leaf.dev !== stat.dev || leaf.ino !== stat.ino) throw new Error("request file changed");
    } finally { if (fd !== undefined) closeSync(fd); }
    const decoder = new TextDecoder("utf-8", { fatal: true });
    result = await evaluateEvidence(JSON.parse(decoder.decode(bytes)), { workspace: root });
  } catch { result = unavailableEvaluation("evaluation-request-file-invalid"); }
  return { result, exitCode: evaluationExitCode(result) };
}
