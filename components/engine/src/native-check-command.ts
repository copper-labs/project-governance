import { accessSync, constants, readFileSync, realpathSync, statSync } from "node:fs";
import { delimiter, isAbsolute, join, resolve } from "node:path";
import { submitCommand, waitCommand, cancelCommand, type CommandReceipt } from "./process-owner.ts";
import { normalizeCheck } from "./checker-results.ts";

/** Resolve the executable once; an empty PATH segment never grants implicit current-directory lookup. */
export function commandExecutable(value: string, root: string, searchPath = process.env["PATH"] ?? ""): string {
  const candidates = value.includes("/") ? [resolve(root, value)] : searchPath.split(delimiter).filter(part => part && isAbsolute(part)).map(part => join(part, value));
  for (const path of candidates) {
    try { const full = realpathSync(path); if (!statSync(full).isFile()) continue; accessSync(full, constants.X_OK); return full; } catch { /* Try the next explicit search directory. */ }
  }
  throw new Error("Validation executable is unavailable");
}
export function commandCheckResult(receipt: CommandReceipt, directory: string, argv: string[]) {
  // Result files are fixed owner paths; untrusted receipt path strings cannot redirect reads.
  const stdout = readFileSync(join(directory, "stdout.log"), "utf8"), stderr = readFileSync(join(directory, "stderr.log"), "utf8");
  const reason = receipt.cleanup !== "confirmed" ? "cleanup-unknown" : receipt.reason === "exit" ? "completed" : receipt.reason === "deadline" ? "timeout" : receipt.reason;
  return normalizeCheck({ exit_code: receipt.exitCode ?? -1, termination_reason: reason, stdout, stderr }, argv);
}
/** Run one native checker through the durable owner; an uncertain result is never retried. */
export async function runNativeCheckCommand(options: { directory: string; id: string; root: string; argv: string[]; deadlineMs: number; env: Record<string, string>; cancelled?: () => boolean }) {
  if (!options.argv.length) throw new Error("Validation command is empty");
  const argv = [commandExecutable(options.argv[0]!, options.root), ...options.argv.slice(1)];
  const submitted = submitCommand(options.directory, { id: options.id,
    operation: { argv, cwd: options.root, env: options.env, expectedExitCodes: [0], effect: "local" }, deadlineMs: options.deadlineMs, outputLimit: 8 * 1024 * 1024 });
  const expires = Date.now() + options.deadlineMs + 5000;
  let cancellationSent = false;
  while (Date.now() < expires) {
    if (!cancellationSent && options.cancelled?.()) {
      cancelCommand(submitted.directory, submitted.requestDigest, `check-run:${options.id}`); cancellationSent = true;
    }
    const observed = await waitCommand(submitted.directory, submitted.requestDigest, Math.min(1000, expires - Date.now()));
    if (observed.receipt) return { ...commandCheckResult(observed.receipt, submitted.directory, argv), command_receipt: observed.receipt, request_digest: submitted.requestDigest };
  }
  return { ...normalizeCheck({ exit_code: -1, termination_reason: "outcome-unknown", stdout: "", stderr: "Native owner did not produce terminal evidence; reconnect to the original command." }, argv), request_digest: submitted.requestDigest };
}
