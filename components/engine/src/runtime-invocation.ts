import { parseDecisionTelemetryArgs } from "./decision-history.ts";
import { COMMAND_RECOVERY_COMMANDS } from "./provider-job-command.ts";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { parse } from "yaml";
import { compiledRuntimeLock } from "./runtime-lock.ts";
import { narrativeFile } from "./narrative-inputs.ts";
import { digest } from "./core.ts";
import { join } from "node:path";
import { RuntimeGenerations } from "./runtime-generations.ts";
import { inspectRuntimeGeneration } from "./runtime-inspection.ts";
import { startupHookAdmission } from "./startup-hook-admission.ts";

const readCommands = new Set(["resource-status", "runtime-inspect-legacy", "runtime-legacy-jobs", "runtime-migration-plan", "docs", "doctor", "--version", "source-map", "telemetry", "check-status", "runtime-inspect", "provider-list", "provider-events", "provider-doctor", "provider-help", "startup-help", "skill-read"]);
// Workflow store opens can migrate schema even when the requested operation only observes a run.
const writeCommands = new Set([...COMMAND_RECOVERY_COMMANDS, "harness", "workflow-diagnose", "workflow-resume-cleanup", "workflow-recover-observation", "workflow-reconcile-cleanup", "provider-status", "provider-wait", "hooks", "hook", "plan", "context-route", "context-packet", "context-evaluate", "check-cancel", "workflow-cancel", "check", "workflow-submit", "workflow-status", "workflow-wait", "provider-resume-cleanup", "provider-recover", "provider-deliver", "provider-submit", "provider-follow-up", "provider-cancel", "provider-reconcile", "resource-maintenance", "host-instructions"]);

export function managedCommandEffect(command: string): "read" | "write" | null {
  if (["--help", "-h", "help"].includes(command)) return "read";
  if (command === "context-index") return "write";
  return writeCommands.has(command) ? "write" : readCommands.has(command) ? "read" : null;
}

/** Hold the selected generation through native process close; abrupt launcher loss retains its reader. */
export async function invokeRuntimeGeneration(registryPath: string, args: string[], workspace: string): Promise<number> {
  if (!args[0] || managedCommandEffect(args[0]) === null) {
    throw new Error("Command is not supported by managed invocation");
  }
  workspace = realpathSync(workspace);
  const generations = new RuntimeGenerations(registryPath);
  let reader: ReturnType<RuntimeGenerations["acquire"]> | undefined;
  try {
    const probe = process.env.GOVERNANCE_MAINTENANCE_PROBE;
    if (probe && (args.length !== 1 || args[0] !== "--version")) throw new Error("Maintenance probe permits version readback only");
    const startupToken=startupHookAdmission(args,workspace,registryPath,generations.state().maintenance);
    reader = generations.acquire(`invocation:${randomUUID()}`, startupToken??probe);
    const installation = inspectRuntimeGeneration(reader.directory);
    const lockPath = "config/governance/runtime.lock.yaml";
    if (realpathSync(join(workspace, lockPath)) !== join(workspace, lockPath)) throw new Error("Runtime lock cannot use a symlink");
    const lock = compiledRuntimeLock(parse(narrativeFile(workspace, lockPath)));
    if (digest(lock) !== installation.lockDigest) throw new Error("Project lock differs from selected installation");
    // Mark before dispatch: an uncertain write is never safe evidence for rollback.
    if ((args[0] === "telemetry" && (args[1] === "review" || (args[1] === "decisions" && parseDecisionTelemetryArgs(args.slice(2))["classify-history"]))) || writeCommands.has(args[0]) || (args[0] === "docs" && args[1] !== "route")) generations.markWritten(reader.token, reader.owner);
    return await new Promise<number>((resolve, reject) => {
      const child = spawn(process.execPath, [installation.executable as string, ...args], { cwd: workspace, stdio: "inherit",
        env: { ...process.env, GOVERNANCE_GENERATION_REGISTRY: registryPath,
          GOVERNANCE_GENERATION_TOKEN: reader!.token, GOVERNANCE_GENERATION_OWNER: reader!.owner } });
      let interrupted: number | null = null;
      const forward = (signal: "SIGINT" | "SIGTERM", code: number) => {
        interrupted ??= code;
        // This live child handle owns the PID; do not signal a recorded or guessed group.
        if (child.exitCode === null && child.signalCode === null) child.kill(signal);
      };
      const interrupt = () => forward("SIGINT", 130), terminate = () => forward("SIGTERM", 143);
      const detach = () => { process.off("SIGINT", interrupt); process.off("SIGTERM", terminate); };
      process.on("SIGINT", interrupt); process.on("SIGTERM", terminate);
      child.on("error", error => {
        // A failed signal is not proof that an already spawned child stopped.
        if (child.pid === undefined) { detach(); reject(error); }
      });
      child.once("close", (code, signal) => {
        detach(); resolve(interrupted ?? (signal === "SIGINT" ? 130 : signal === "SIGTERM" ? 143 : signal ? 1 : code ?? 1));
      });
    });
  } finally {
    try { if (reader) generations.release(reader.token, reader.owner); }
    finally { generations.close(); }
  }
}
