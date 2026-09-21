#!/usr/bin/env node
import { durableJson } from "./core.ts";
import { checkSummary } from "./check-summary.ts";
import { checkObservationContext } from "./check-observation-context.ts";
import { continuityCommand } from "../../harness/src/cli.ts";
import { resumeStoppedWorkflowCleanup } from "./workflow-cleanup-continuation.ts";
import { recoverStoppedWorkflow } from "./workflow-worker-recovery.ts";
import { startupCommand, startupExitCode } from "./startup-command.ts";
import { runtimeOperationCommand } from "./runtime-operation-command.ts";
import { stageRuntimeOperation } from "./runtime-stage-operation.ts";
import { resourceStatusCommand } from "./resource-status.ts";
import { runtimeMigrationPlan } from "./runtime-migration-plan.ts";
import { legacyJobInventory } from "./legacy-job-inventory.ts";
import { archiveLegacyHistory, inspectLegacyHistoryArchive } from "./legacy-history-archive.ts";
import { runtimeMaintenanceCommand } from "./runtime-maintenance-command.ts";
import { withDecisionCancellation } from "./decision-cancellation.ts";
import { decisionDoctor } from "./decision-doctor.ts";
import { PROVIDER_COMMANDS, providerJobCommand } from "./provider-job-command.ts";
import { resourceMaintenance } from "./resource-maintenance.ts";
import { providerTelemetry } from "./provider-telemetry.ts";
import { providerGuidance, startupGuidance } from "./provider-guidance.ts";
import { skillReadCommand } from "./skill-read-command.ts";
import { hostInstructionCommand } from "./host-instruction-command.ts";
import { runtimeCompletionCommand } from "./runtime-completion-command.ts";
import { hostInstructionBackupScope } from "./host-instruction-backup.ts";
import { COMPILED_HOST_BLOCK } from "./provider-guidance.ts";
import { initializeDocumentation } from "./documentation-installation.ts";
import { routeDocumentation } from "./documentation.ts";
import { runtimeDoctor } from "./runtime-doctor.ts";
import { kmpDoctorFindings } from "./checkers/kmp-doctor.ts";
import { decisionTelemetry } from "./decision-telemetry.ts";
import { contextStateRoot } from "./context-command.ts";
import { installGitHooks, planGitHookInstallation } from "./git-hook-installation.ts";
import { hookCheckArguments } from "./git-hooks.ts";
import { inspectRuntimeGeneration } from "./runtime-inspection.ts";
import { invokeRuntimeGeneration } from "./runtime-invocation.ts";
import { contextRouteCommand } from "./context-route-command.ts";
import { workflowWaitCommand } from "./workflow-wait.ts";
import { repositoryMap } from "./repository-map.ts";
import { parseArgs } from "node:util";
import { contextCommand, contextEvaluationCommand } from "./context-command.ts";
import { stageRuntimeArchive } from "./runtime-staging.ts";
import { compiledRuntimeLock } from "./runtime-lock.ts";
import { narrativeFile } from "./narrative-inputs.ts";
import { workflowCommand, workflowExitCode } from "./workflow-command.ts";
import { fileURLToPath } from "node:url";
import { realpathSync, existsSync } from "node:fs";
import { resolveChangeScope, ValidationSubject } from "./change-subject.ts";
import { loadSubjectPacks } from "./pack-configuration.ts";
import { buildPlan } from "./planning.ts";
import { join } from "node:path";
import { checkTelemetry, reviewCheckRun } from "./check-telemetry.ts";
import { checkRunRoot } from "./check-run.ts";
import { requestCheckCancellation } from "./check-cancellation.ts";
import { inspectCheckRun } from "./check-status.ts";
import { dispatchChecks } from "./check-worker.ts";
import { narrativeInputs } from "./narrative-inputs.ts";
import { PackagedCheckerAssets } from "./checker-assets.ts";

/** Public argument parsing rejects conflicting subjects before reading a candidate. */
export function prepareCommand(args: string[], root: string, builtinDirectory: string, command: "plan" | "check" = "plan") {
  const { values, positionals } = parseArgs({ args, strict: true, allowPositionals: false, options: {
    stage: { type: "string" }, mode: { type: "string", default: "impacted" }, staged: { type: "boolean" },
    "changed-path": { type: "string", multiple: true }, "base-ref": { type: "string" }, pack: { type: "string", multiple: true },
    json: { type: "boolean" }, summary: { type: "boolean" },
    ...(command === "check" ? { "json-output": { type: "string" as const }, "expected-status": { type: "string" as const }, trigger: { type: "string" as const }, detach: { type: "boolean" as const }, "timeout-seconds": { type: "string" as const }, "commit-message-file": { type: "string" as const }, "pr-body-file": { type: "string" as const }, "pr-title": { type: "string" as const } } : {}),
  } });
  if (positionals.length) throw new Error("Unexpected arguments");
  const trigger = values["trigger"] ?? "manual";
  const expected = values["expected-status"];
  if (typeof trigger !== "string" || (expected !== undefined && typeof expected !== "string")) throw new Error("Invalid check observation context");
  const observation = checkObservationContext(trigger, expected);
  const jsonOutput = values["json-output"];
  if (jsonOutput !== undefined && (typeof jsonOutput !== "string" || !jsonOutput.trim() || values.detach)) throw new Error("JSON output requires a path and a foreground check");
  const timeout = values["timeout-seconds"];
  const deadlineMs = timeout === undefined ? 300000 : Number(timeout) * 1000;
  if (!Number.isSafeInteger(deadlineMs) || deadlineMs <= 0 || deadlineMs > 86400000) throw new Error("Invalid timeout");
  const mode = values.mode, stage = values.stage ?? null, paths = values["changed-path"] ?? [], packs = values.pack ?? [];
  const baseRef = values["base-ref"] ?? process.env["GOVERNANCE_BASE_REF"]?.trim();
  if (mode !== "all" && mode !== "impacted") throw new Error("--mode must be all or impacted");
  if (!stage && (!packs.length || mode === "all")) throw new Error("--stage is required for this selection");
  if (mode === "all" && (values.staged || paths.length || baseRef)) throw new Error("All mode cannot combine with a comparison scope");
  if (values.staged && (paths.length || baseRef || stage !== "pre-commit")) throw new Error("Staged scope requires pre-commit and cannot combine with paths or a base");
  const scope = resolveChangeScope(root, { all: mode === "all" || stage === "commit-msg", staged: values.staged ?? (stage === "pre-commit" && !paths.length && !baseRef),
    paths, ...(baseRef ? { baseRef } : {}) });
  const subject = new ValidationSubject(root, scope), registry = loadSubjectPacks(subject, builtinDirectory);
  const narrative = command === "check" ? narrativeInputs(root, {
    ...(typeof values["commit-message-file"] === "string" ? { commitFile: values["commit-message-file"] } : {}),
    ...(typeof values["pr-body-file"] === "string" ? { prFile: values["pr-body-file"] } : {}),
    ...(typeof values["pr-title"] === "string" ? { prTitle: values["pr-title"] } : {}),
  }) : {};
  return { plan: buildPlan(registry, { stage, mode, changedPaths: scope.records.map(record => record.path), explicitPackIds: packs }), scope, subject, registry, narrative, deadlineMs, ...observation, jsonOutput: typeof jsonOutput === "string" ? jsonOutput : null, summary: values.summary === true, detach: values["detach"] === true };
}

export function planCommand(args: string[], root: string, builtinDirectory: string) {
  const prepared = prepareCommand(args, root, builtinDirectory);
  return { ...prepared.plan, change_scope: prepared.scope };
}
export async function main(args = process.argv.slice(2)): Promise<number> {
  try {
    const command = args[0];
    if (command === "--help" || command === "-h" || command === "help") {
      if (args.length !== 1) throw new Error("Top-level help accepts no arguments");
      console.log(`Usage: project-governance <command> [options]

Checks:
  plan --stage <stage> --mode impacted|all [--summary]
  check --stage <stage> --mode impacted|all [--summary] [--json-output <path>]
  check-status --run <run-id> | check-cancel --run <run-id>
  hook <hook-name> [hook arguments]

Project setup and context:
  doctor | docs | hooks
  init | update | repair     Use the versioned installation request contract
  context-route | context-packet | source-map | skill-read
  harness --help            Task, history and continuity commands

Operations:
  telemetry | context-evaluate | resource-status | resource-maintenance
  workflow-wait | workflow-recover-observation | workflow-resume-cleanup
  runtime-stage | runtime-run | runtime-inspect | runtime-complete
  runtime-maintenance | runtime-backup | runtime-migration-plan | runtime-host-plan
  runtime-inspect-legacy | runtime-archive-legacy | runtime-legacy-jobs
  startup | startup-help | provider-help | host-instructions

Use the owning command contract for structured request fields.
  --version                 Print the runtime version
  --help, -h, help           Show this help without opening project state`);
      return 0;
    }
    if (command === "harness") {
      // The canonical parser owns global flags and help as well as task/history operations.
      return continuityCommand(args.slice(1), {groups: ["governance", "task", "resume", "checkpoint", "context", "artifact", "budget", "paths", "status", "reconcile", "usage", "export", "import", "events"]});
    }
    if (command === "hook") return main(["check", "--trigger", "hook", ...hookCheckArguments(realpathSync(process.cwd()), args[1] ?? "", args.slice(2))]);
    if (command === "docs") {
      if (args[1] === "init") {
        const { values } = parseArgs({ args: args.slice(2), strict: true, allowPositionals: false, options: { "dry-run": { type: "boolean" } } });
        const result = initializeDocumentation(process.cwd(), values["dry-run"] ?? false);
        console.log(JSON.stringify(result)); return result.status === "failed" ? 1 : 0;
      }
      if (args[1] !== "route") throw new Error("Unsupported documentation command");
      const { values } = parseArgs({ args: args.slice(2), strict: true, allowPositionals: false,
        options: { capability: { type: "string" }, symbol: { type: "string" }, json: { type: "boolean" } } });
      if ((values.capability === undefined) === (values.symbol === undefined)) throw new Error("Select exactly one capability or symbol");
      const root = realpathSync(process.cwd()), subject = new ValidationSubject(root, resolveChangeScope(root, { all: true }));
      const result = routeDocumentation(subject, values.capability !== undefined ? { capability: values.capability } : { symbol: values.symbol! });
      console.log(values.json ? JSON.stringify(result) : `status=${result.status} query_kind=${result.query_kind} match_count=${result.match_count}`);
      return result.status === "invalid" ? 1 : 0;
    }
    if (command === "doctor") {
      const { values } = parseArgs({ args: args.slice(1), strict: true, allowPositionals: false, options: { capability: { type: "string" }, registry: { type: "string" } } });
      if (!values.capability) {
        const registry = values.registry ?? process.env.GOVERNANCE_GENERATION_REGISTRY;
        if (!registry) throw new Error("Installation doctor requires --registry or a managed runtime invocation");
        const result = runtimeDoctor(process.cwd(), registry);
        console.log(JSON.stringify(result)); return result.status === "passed" ? 0 : 1;
      }
      if (values.capability === "decisions" && !values.registry) {
        const result = decisionDoctor(realpathSync(process.cwd()));
        console.log(JSON.stringify(result)); return result.status === "passed" ? 0 : 1;
      }
      if (values.capability !== "kmp-surface-validation" || values.registry) throw new Error("Unsupported capability doctor arguments");
      const root = realpathSync(process.cwd()), subject = new ValidationSubject(root, resolveChangeScope(root, { all: true }));
      const packs = loadSubjectPacks(subject, fileURLToPath(new URL("../assets/packs/", import.meta.url)));
      const findings = kmpDoctorFindings(subject, packs);
      console.log(JSON.stringify({ version: 1, capability: values.capability, status: findings.length ? "failed" : "passed", findings })); return findings.length ? 1 : 0;
    }
    if (command === "hooks") {
      const { values } = parseArgs({ args: args.slice(1), strict: true, allowPositionals: false,
        options: { apply: { type: "boolean" }, configure: { type: "boolean" } } });
      const root = realpathSync(process.cwd());
      const result = values.apply ? installGitHooks(root, { configure: values.configure ?? false }) : planGitHookInstallation(root);
      console.log(JSON.stringify(result)); return result.ready ? 0 : 2;
    }
    if (command === "runtime-run") {
      const separator = args.indexOf("--");
      if (separator < 0) throw new Error("Runtime invocation requires an argument separator");
      const { values } = parseArgs({ args: args.slice(1, separator), strict: true, allowPositionals: false,
        options: { registry: { type: "string" }, workspace: { type: "string" } } });
      if (!values.registry || !values.workspace) throw new Error("Registry and workspace required");
      const operation=args[separator+1];
      if(operation === "startup") {
        const result = await startupCommand(args.slice(separator+2),{registry:values.registry,workspace:values.workspace});
        console.log(JSON.stringify(result));
        return startupExitCode(result);
      }
      if(operation === "update" || operation === "repair") {
        // The coordinator owns maintenance; a normal invocation reader would block its drain.
        console.log(JSON.stringify(await runtimeOperationCommand(operation,args.slice(separator+2),
          {registry:values.registry,workspace:values.workspace})));
        return 0;
      }
      return await invokeRuntimeGeneration(values.registry, args.slice(separator + 1), values.workspace);
    }
    if(command === "startup") {
      const result = await startupCommand(args.slice(1));
      console.log(JSON.stringify(result));return startupExitCode(result);
    }
    if (command === "context-route") {
      const result = await withDecisionCancellation(options => contextRouteCommand(args.slice(1), process.cwd(), undefined, undefined, options));
      console.log(JSON.stringify(result.value));
      return result.exitCode ?? (result.value.ready ? 0 : 2);
    }
    if (command === "source-map") {
      const { values } = parseArgs({ args: args.slice(1), strict: true, allowPositionals: false,
        options: { staged: { type: "boolean" }, base: { type: "string" } } });
      if (values.staged && values.base) throw new Error("Staged mapping cannot select another base");
      const scope = resolveChangeScope(process.cwd(), values.staged ? { staged: true } : { baseRef: values.base ?? "HEAD" });
      const result = repositoryMap(new ValidationSubject(process.cwd(), scope));
      console.log(JSON.stringify({ ...result, source: { base: scope.base_ref, mode: scope.mode, changes: scope.subject_digest } }));
      return result.issues.length ? 2 : 0;
    }
    if (command === "workflow-wait") {
      const result = await workflowWaitCommand(args.slice(1));
      console.log(JSON.stringify(result));
      return workflowExitCode(result.run.state);
    }
    if (command === "startup-help") {
      if(args.length!==1)throw new Error("Startup help accepts no arguments");
      console.log(startupGuidance());return 0;
    }
    if(command === "skill-read") {
      console.log(JSON.stringify(skillReadCommand(args.slice(1))));return 0;
    }
    if (command === "provider-help") {
      if (args.length !== 1) throw new Error("Provider help accepts no arguments");
      console.log(providerGuidance()); return 0;
    }
    if (command === "host-instructions") {
      const result = hostInstructionCommand(args.slice(1), process.cwd());
      console.log(JSON.stringify(result)); return 0;
    }
    if (command === "resource-status") {
      console.log(JSON.stringify(resourceStatusCommand(args.slice(1)))); return 0;
    }
    if (command === "resource-maintenance") {
      console.log(JSON.stringify(resourceMaintenance(args.slice(1))));
      return 0;
    }
    if (PROVIDER_COMMANDS.includes(command ?? "")) {
      const response = await providerJobCommand(command!, args.slice(1));
      console.log(JSON.stringify(response.result));
      return response.exitCode;
    }
    if (command === "workflow-recover-observation" || command === "workflow-resume-cleanup") {
      const { values } = parseArgs({ args: args.slice(1), strict: true, allowPositionals: false,
        options: Object.fromEntries(["worker-directory", "database", "run", "revision"].map(key => [key, { type: "string" as const }])) });
      if (!values["worker-directory"] || !values.database || !values.run || !values.revision ||
          !/^\d+$/u.test(values.revision) || !Number.isSafeInteger(Number(values.revision)))
        throw new Error("Worker directory, database, run and current revision required");
      const recover = command === "workflow-resume-cleanup" ? resumeStoppedWorkflowCleanup : recoverStoppedWorkflow;
      const result = await recover(values["worker-directory"], values.database, values.run, Number(values.revision));
      console.log(JSON.stringify(result));
      return workflowExitCode(result.run.state);
    }
    if (["workflow-submit", "workflow-status", "workflow-cancel", "workflow-reconcile-cleanup"].includes(command ?? "")) {
      const result = workflowCommand(command!, args.slice(1));
      console.log(JSON.stringify(result));
      return workflowExitCode(result.run.state);
    }
    if (command === "runtime-inspect-legacy") {
      const { values } = parseArgs({ args: args.slice(1), strict: true, allowPositionals: false, options: { directory: { type: "string" }, digest: { type: "string" } } });
      if (!values.directory || !values.digest) throw new Error("Archive directory and expected receipt digest required");
      console.log(JSON.stringify(inspectLegacyHistoryArchive(values.directory,values.digest))); return 0;
    }
    if (command === "runtime-archive-legacy") {
      const { values } = parseArgs({ args: args.slice(1), strict: true, allowPositionals: false, options: { workspace: { type: "string" }, store: { type: "string" }, destination: { type: "string" } } });
      if (!values.workspace || !values.store || !values.destination) throw new Error("Legacy workspace, store and archive destination required");
      console.log(JSON.stringify(archiveLegacyHistory(values.workspace,values.store,values.destination))); return 0;
    }
    if (command === "runtime-legacy-jobs") {
      const { values } = parseArgs({ args: args.slice(1), strict: true, allowPositionals: false, options: { workspace: { type: "string" }, store: { type: "string" } } });
      if (!values.workspace || !values.store) throw new Error("Legacy workspace and store required");
      console.log(JSON.stringify(legacyJobInventory(values.workspace,values.store))); return 0;
    }
    if (command === "runtime-migration-plan") {
      const { values } = parseArgs({ args: args.slice(1), strict: true, allowPositionals: false, options: { workspace: { type: "string" } } });
      if (!values.workspace) throw new Error("Migration workspace required");
      console.log(JSON.stringify(runtimeMigrationPlan(values.workspace))); return 0;
    }
    if (command === "runtime-host-plan") {
      const { values } = parseArgs({ args: args.slice(1), strict: true, allowPositionals: false,
        options: { workspace: { type: "string" } } });
      if (!values.workspace) throw new Error("Host instruction workspace required");
      console.log(JSON.stringify(hostInstructionBackupScope(values.workspace, COMPILED_HOST_BLOCK))); return 0;
    }
    if (command === "runtime-maintenance" || command === "runtime-backup") {
      console.log(JSON.stringify(await runtimeMaintenanceCommand(command, args.slice(1)))); return 0;
    }
    if (command === "runtime-complete") {
      console.log(JSON.stringify(await runtimeCompletionCommand(args.slice(1)))); return 0;
    }
    if (command === "runtime-inspect") {
      const { values } = parseArgs({ args: args.slice(1), strict: true, allowPositionals: false,
        options: { directory: { type: "string" } } });
      if (!values.directory) throw new Error("Runtime generation directory required");
      console.log(JSON.stringify(inspectRuntimeGeneration(values.directory)));
      return 0;
    }
    if (command === "init" || command === "update" || command === "repair") {
      console.log(JSON.stringify(await runtimeOperationCommand(command,args.slice(1)))); return 0;
    }
    if (command === "runtime-stage") {
      const { values } = parseArgs({ args: args.slice(1), strict: true, allowPositionals: false, options: {
        "lock-file": { type: "string" }, archive: { type: "string" }, destination: { type: "string" }, "operation-directory": { type: "string" },
      } });
      if (!values["lock-file"] || !values.archive || Boolean(values.destination) === Boolean(values["operation-directory"])) throw new Error("Lock file, archive and exactly one staging destination or operation directory are required");
      const lock = compiledRuntimeLock(JSON.parse(narrativeFile(process.cwd(), values["lock-file"])));
      console.log(JSON.stringify(values["operation-directory"] ? stageRuntimeOperation(values.archive, lock, values["operation-directory"]) : stageRuntimeArchive(values.archive, lock, values.destination!))); return 0;
    }
    if (command === "context-evaluate") {
      const result = await withDecisionCancellation(options => contextEvaluationCommand(args.slice(1), process.cwd(), options));
      console.log(JSON.stringify(result.value)); return result.exitCode ?? 0;
    }
    if (command === "context-packet") {
      const result = await withDecisionCancellation(options => contextCommand(args.slice(1), process.cwd(), undefined, options));
      console.log(JSON.stringify(result.value)); return result.exitCode ?? 0;
    }
    if (command === "--version") { console.log("project-governance 3.0.0-preview.1"); return 0; }
    if (command === "telemetry") {
      if (args[1] === "review") {
        const { values } = parseArgs({ args: args.slice(2), strict: true, allowPositionals: false, options: { "run-id": { type: "string" }, disposition: { type: "string" } } });
        if (!values["run-id"] || !values.disposition) throw new Error("Run ID and disposition required");
        console.log(JSON.stringify(reviewCheckRun(checkRunRoot(), process.cwd(), values["run-id"], values.disposition))); return 0;
      }
      if (args[1] === "providers") {
        const { values } = parseArgs({ args: args.slice(2), strict: true, allowPositionals: false, options: { manifest: { type: "string" } } });
        if (!values.manifest) throw new Error("Provider telemetry manifest required");
        console.log(JSON.stringify(providerTelemetry(JSON.parse(narrativeFile(process.cwd(), values.manifest))))); return 0;
      }
      if (args[1] === "decisions") {
        const { values } = parseArgs({ args: args.slice(2), strict: true, allowPositionals: false, options: { since: { type: "string" }, limit: { type: "string" } } });
        console.log(JSON.stringify(decisionTelemetry(contextStateRoot(process.cwd()), { ...(values.since ? { since: values.since } : {}),
          ...(values.limit ? { limit: Number(values.limit) } : {}) }))); return 0;
      }
      if (args[1] !== "status") throw new Error("Unsupported telemetry command");
      const parsed = parseArgs({ args: args.slice(2), strict: true, options: { since: { type: "string" }, stage: { type: "string" }, "runtime-version": { type: "string" }, trigger: { type: "string" } } });
      console.log(JSON.stringify(checkTelemetry(checkRunRoot(), process.cwd(), { ...parsed.values, ...(parsed.values["runtime-version"] ? { runtimeVersion: parsed.values["runtime-version"] } : {}) }))); return 0;
    }
    if (command === "check-status" || command === "check-cancel") {
      const parsed = parseArgs({ args: args.slice(1), strict: true, options: { run: { type: "string" } } });
      if (!parsed.values.run) throw new Error("Run ID is required");
      const observed = inspectCheckRun(parsed.values.run);
      if (command === "check-cancel" && observed.state !== "terminal") {
        requestCheckCancellation(join(checkRunRoot(), parsed.values.run), parsed.values.run, "operator:cli");
        console.log(JSON.stringify({ run_id: parsed.values.run, status: "cancellation-requested" })); return 0;
      }
      console.log(JSON.stringify(observed));
      return observed.state === "terminal" ? (observed.status === "failed" ? 1 : 0) : 2;
    }
    if (command !== "plan" && command !== "check") throw new Error("Unsupported command");
    const prepared = prepareCommand(args.slice(1), realpathSync(process.cwd()), fileURLToPath(new URL("../assets/packs/", import.meta.url)), command);
    if (command === "plan") {
      const result = { ...prepared.plan, change_scope: prepared.scope }; console.log(JSON.stringify(prepared.summary ? checkSummary(result) : result)); return result.status === "ready" ? 0 : 1;
    }
    const submission = dispatchChecks(prepared.registry, prepared.plan, {
      subject: prepared.subject, scope: prepared.scope, assets: new PackagedCheckerAssets(), packIds: new Set(Object.keys(prepared.registry)),
      stage: prepared.plan.stage ?? "", asOf: new Date().toISOString(), ...prepared.narrative,
    }, { deadlineMs: prepared.deadlineMs, ...checkObservationContext(prepared.trigger, prepared.expectedStatus) });
    if (prepared.detach) { console.log(JSON.stringify({ status: "submitted", ...submission })); return 0; }
    console.error(JSON.stringify({ status: "submitted", ...submission }));
    const submittedAt = Date.now();
    while (true) {
      const observed = inspectCheckRun(submission.run_id);
      if (observed.state === "terminal") {
        if (prepared.jsonOutput) durableJson(prepared.jsonOutput, observed.result);
        console.log(JSON.stringify(prepared.summary ? checkSummary(observed.result) : observed.result)); return observed.status === "failed" ? 1 : 0; }
      if (observed.state === "incomplete" && (observed.orchestrator_failure || Date.now() - submittedAt > 10000)) {
        if (prepared.jsonOutput) durableJson(prepared.jsonOutput, observed);
        console.log(JSON.stringify(observed)); return 2;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  } catch (error) {
    // CLI parsing errors contain flags, not file contents. Source-loading diagnostics remain private.
    console.error(JSON.stringify({ status: "failed", error: error instanceof TypeError ? "Invalid invocation" : "Planning could not resolve a valid invocation, candidate, or pack configuration." }));
    return 2;
  }
}
if (process.argv[1] && existsSync(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) process.exitCode = await main();
