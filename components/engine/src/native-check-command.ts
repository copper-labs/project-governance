import { accessSync, constants, readFileSync, realpathSync, statSync } from "node:fs";
import { delimiter, isAbsolute, join, resolve } from "node:path";
import { submitCommand, waitCommand, cancelCommand, type CommandReceipt } from "./process-owner.ts";
import { normalizeCheck } from "./checker-results.ts";
import { safeSubjectPath } from "./change-subject.ts";

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
  const result = normalizeCheck({ exit_code: receipt.exitCode ?? -1, termination_reason: reason, stdout, stderr }, argv);
  // Preserve an explicitly declared custom-input closure in its original native result, without inferring it.
  let input_manifest: { version: 1; status: "complete"; files: Array<{ path: string; sha256: string }> } | undefined;
  try {
    const manifest = JSON.parse(stdout).input_manifest;
    if (manifest?.version === 1 && manifest.status === "complete" && Array.isArray(manifest.files) && manifest.files.length > 0 && manifest.files.length <= 65536) {
      const files = manifest.files.map((entry: { path: unknown; sha256: unknown }) => {
        if (typeof entry.path !== "string" || typeof entry.sha256 !== "string" || !/^(?:sha256:)?[a-f0-9]{64}$/u.test(entry.sha256)) throw new Error("Invalid input manifest");
        return { path: safeSubjectPath(entry.path), sha256: entry.sha256.replace(/^sha256:/u, "") };
      });
      if (new Set(files.map((file: { path: string }) => file.path)).size !== files.length) throw new Error("Duplicate input manifest path");
      input_manifest = { version: 1, status: "complete", files };
    }
  } catch { /* Missing or invalid input closure cannot qualify candidate proof; native findings remain intact. */ }
  return { ...result, ...(input_manifest ? { input_manifest } : {}) };
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
