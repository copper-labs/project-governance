import { recoverStartupOwner } from "../src/startup-owner-recovery.ts";
import { StartupTasks } from "../src/startup-tasks.ts";
import { observeStartup } from "../src/startup-observation.ts";
import { runtimeOperationCommand } from "../src/runtime-operation-command.ts";
import { completePreparedRuntimeOperation } from "../src/runtime-operation-completion.ts";
import { prepareRuntimeOperation } from "../src/runtime-operation-preparation.ts";
import { stageRuntimeOperation } from "../src/runtime-stage-operation.ts";
import { releaseRecoveredWorkflowReader } from "../src/workflow-reader-recovery.ts";
import type { WorkflowRun } from "../src/workflow-store.ts";
import { digest } from "../src/core.ts";
import { runtimeMigrationPlan } from "../src/runtime-migration-plan.ts";
import { retireLegacyRuntimeEntrypoints } from "../src/runtime-legacy-retirement.ts";
import { archiveLegacyHistory } from "../src/legacy-history-archive.ts";
import { fileDigest } from "../src/core.ts";
import { runtimeCompletionCommand } from "../src/runtime-completion-command.ts";
import { hostInstructionBackupScope } from "../src/host-instruction-backup.ts";
import { completeHostInstructionTransition, requireHostInstructionCompletion } from "../src/host-instruction-transition.ts";
import { COMPILED_HOST_BLOCK } from "../src/provider-guidance.ts";
import { DatabaseSync } from "node:sqlite";
import { providerRuntime } from "../src/provider-runtime.ts";
import { forwardRepairRuntime } from "../src/runtime-forward-repair.ts";
import { runtimeDoctor } from "../src/runtime-doctor.ts";
import { installGitHooks } from "../src/git-hook-installation.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, realpathSync, chmodSync, statSync, lstatSync } from "node:fs";
import { join } from "node:path";
import { hostname, tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { inspectRuntimeGeneration } from "../src/runtime-inspection.ts";
import { stageRuntimeArchive } from "../src/runtime-staging.ts";
import { RuntimeGenerations } from "../src/runtime-generations.ts";
import { invokeRuntimeGeneration } from "../src/runtime-invocation.ts";
import type { CompiledRuntimeLock } from "../src/runtime-lock.ts";
import { backupRuntimeState } from "../src/runtime-backup.ts";
import { activateBackedRuntime } from "../src/runtime-activation.ts";
import { updateActivatedRuntimeLock } from "../src/runtime-lock-update.ts";
import { installActivatedLauncher } from "../src/runtime-launcher.ts";
import { finalizeRuntimeActivation } from "../src/runtime-finalization.ts";
import { completeRuntimeTransition } from "../src/runtime-transition.ts";
import { recoverPrewriteActivation } from "../src/runtime-recovery.ts";
test("inactive installation verifies identity and preserves a failed-generation receipt", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "runtime-stage-test-")));
  try {
    const source = join(root, "package"), archive = join(root, "runtime.tgz"), stages = join(root, "stages");
    mkdirSync(join(source, "dist/engine/src"), { recursive: true });
    writeFileSync(join(source, "package.json"), JSON.stringify({ name: "@organta/project-governance", version: "3.0.0", type: "module",
      engines: { node: ">=24.16.0 <25" }, bin: { "project-governance": "dist/engine/src/cli.js" },
      scripts: { postinstall: "node -e \"throw new Error('must never run')\"" } }));
    writeFileSync(join(source, "dist/engine/src/cli.js"), '#!/usr/bin/env node\nif(process.argv[2]==="doctor"){const signal=process.argv[3];process.on(signal,()=>setTimeout(()=>{console.log("child-cleanup-finished");process.exit(0)},50));setTimeout(()=>process.kill(process.ppid,signal),20);setInterval(()=>{},1000)}else console.log("project-governance 3.0.0");\n');
    mkdirSync(join(source, "dist/engine/assets"), { recursive: true });
    writeFileSync(join(source, "dist/engine/assets/runtime-dependencies.lock.json"), JSON.stringify({ lockfileVersion: 3,
      name: "@organta/project-governance", version: "3.0.0", packages: { "": {} } }));
    execFileSync("tar", ["-czf", archive, "-C", root, "package"]);
    const lock: CompiledRuntimeLock = { schema_version: 2, package: "@organta/project-governance", version: "3.0.0",
      artifact: { url: "file:///runtime.tgz", integrity: "sha512-" + createHash("sha512").update(readFileSync(archive)).digest("base64") },
      source_commit: "a".repeat(40), node: ">=24.16.0 <25", configuration_schema: 1 };
    const parentManifest = JSON.stringify({ name: "unrelated-parent", version: "1.0.0", private: true });
    writeFileSync(join(root, "package.json"), parentManifest);
    const sentinelPath = join(root, "node_modules", "parent-sentinel", "package.json");
    mkdirSync(join(root, "node_modules", "parent-sentinel"), { recursive: true });
    writeFileSync(sentinelPath, "parent dependency must remain unchanged");
    const priorGlobal = process.env.npm_config_global;
    process.env.npm_config_global = "true";
    let result: ReturnType<typeof stageRuntimeArchive>;
    try { result = stageRuntimeArchive(archive, lock, stages); }
    finally { if (priorGlobal === undefined) delete process.env.npm_config_global; else process.env.npm_config_global = priorGlobal; }
    assert.equal(readFileSync(join(root, "package.json"), "utf8"), parentManifest);
    assert.equal(readFileSync(sentinelPath, "utf8"), "parent dependency must remain unchanged");
    assert.deepEqual(readdirSync(join(root, "node_modules")), ["parent-sentinel"]);
    assert.equal(existsSync(join(root, "package-lock.json")), false);
    assert.equal(result.state, "staged"); assert.equal(result.activation, "not-performed");
    assert.equal(inspectRuntimeGeneration(result.directory).state, "verified");
    const operationDirectory=join(root,"stage-operation");
    const prepared=stageRuntimeOperation(archive,lock,operationDirectory);
    assert.equal(prepared.reused,false);
    assert.equal(stageRuntimeOperation(archive,lock,operationDirectory).directory,prepared.directory);
    assert.equal(stageRuntimeOperation(archive,lock,operationDirectory).reused,true);
    const operationLock=join(root,"operation-lock.json");writeFileSync(operationLock,JSON.stringify(lock));
    const cli=new URL("../src/cli.ts",import.meta.url);
    const replay=execFileSync(process.execPath,[fileURLToPath(cli),"runtime-stage","--lock-file",operationLock,
      "--archive",archive,"--operation-directory",operationDirectory],{encoding:"utf8",timeout:10000});
    assert.equal(JSON.parse(replay).directory,prepared.directory);
    assert.equal(JSON.parse(replay).reused,true);

    assert.throws(()=>stageRuntimeOperation(archive,{...lock,source_commit:"c".repeat(40)},operationDirectory),/identity differs/);
    const interrupted=join(root,"interrupted-stage");mkdirSync(interrupted);
    assert.throws(()=>stageRuntimeOperation(archive,lock,interrupted),/reservation is incomplete/);
    assert.deepEqual(readdirSync(interrupted),[]);
    const requestOnly=join(root,"request-only-stage");mkdirSync(requestOnly);
    writeFileSync(join(requestOnly,"request.json"),readFileSync(join(operationDirectory,"request.json")));
    assert.throws(()=>stageRuntimeOperation(archive,lock,requestOnly),/outcome unresolved/);
    assert.deepEqual(readdirSync(requestOnly),["request.json"]);
    mkdirSync(join(requestOnly,"candidates"));
    assert.throws(()=>stageRuntimeOperation(archive,lock,requestOnly),/candidate identity unresolved/);
    mkdirSync(join(requestOnly,"candidates","candidate-interrupted"));
    writeFileSync(join(requestOnly,"candidates","candidate-interrupted","installation.json"),JSON.stringify({state:"preparing"}));
    assert.throws(()=>stageRuntimeOperation(archive,lock,requestOnly));
    assert.deepEqual(readdirSync(join(requestOnly,"candidates")),["candidate-interrupted"]);

    const preparationRoot=join(root,"preparation"),preparationRegistry=join(root,"preparation.sqlite");
    const preservedPolicy=join(root,"preserved-policy");writeFileSync(preservedPolicy,"original policy");
    const preparationInput={workspace:root,registry:preparationRegistry,archive,lock,expectedRevision:0,
      inputs:[{path:preservedPolicy,kind:"file" as const}]};
    const preparedOperation=await prepareRuntimeOperation(preparationInput,preparationRoot,()=>{});
    assert.equal(preparedOperation.activation,"not-performed");
    const preparing=new RuntimeGenerations(preparationRegistry);
    try {
      assert.equal(preparing.state().directory,null);
      assert.equal(preparing.state().maintenance?.token,preparedOperation.maintenance.token);
      const resumed=await prepareRuntimeOperation(preparationInput,preparationRoot,()=>{});
      assert.equal(resumed.candidate,preparedOperation.candidate);
      assert.equal(resumed.backupDigest,preparedOperation.backupDigest);
      assert.equal(resumed.maintenance.token,preparedOperation.maintenance.token);
      await assert.rejects(prepareRuntimeOperation({...preparationInput,expectedRevision:1},preparationRoot,()=>{}),/identity differs/);
    }finally{preparing.close();}
    const fresh=join(root,"fresh-project"),freshOperation=join(root,"fresh-operation");
    mkdirSync(join(fresh,"config/governance"),{recursive:true});
    mkdirSync(join(fresh,".governance/runtime/bin"),{recursive:true});
    const freshLock=join(fresh,"config/governance/runtime.lock.yaml"),freshLauncher=join(fresh,".governance/runtime/bin/project-governance");
    const freshPrepared=await prepareRuntimeOperation({workspace:fresh,registry:join(fresh,"installation.sqlite"),archive,lock,
      expectedRevision:0,inputs:[freshLock,freshLauncher].map(path=>({path,kind:"absent" as const}))},freshOperation,()=>{});
    writeFileSync(freshLock,"authored after backup");
    await assert.rejects(completePreparedRuntimeOperation(freshOperation),/changed since backup/);
    assert.equal(readFileSync(freshLock,"utf8"),"authored after backup");
    rmSync(freshLock);
    writeFileSync(freshLauncher,"authored launcher");
    await assert.rejects(completePreparedRuntimeOperation(freshOperation),/Launcher changed since backup/);
    assert.equal(readFileSync(freshLauncher,"utf8"),"authored launcher");
    rmSync(freshLauncher);
    const freshResult=await completePreparedRuntimeOperation(freshOperation);
    assert.equal(freshResult.state.maintenance,null);
    assert.equal(JSON.parse(readFileSync(freshLock,"utf8")).schema_version,2);
    assert.equal(statSync(freshLauncher).mode & 0o777,0o700);
    assert.deepEqual(await completePreparedRuntimeOperation(freshOperation),freshResult);
    const next = stageRuntimeArchive(archive, lock, stages);
    const registryPath = join(root, "generations.sqlite");
    const generations = new RuntimeGenerations(registryPath), other = new RuntimeGenerations(registryPath);
    try {
      generations.activate(result.directory, 0);
      mkdirSync(join(root, "config/governance"), { recursive: true });
      const activeLock = join(root, "config/governance/runtime.lock.yaml");
      writeFileSync(activeLock, JSON.stringify({ ...lock, version: "3.0.1" }));
      await assert.rejects(() => invokeRuntimeGeneration(registryPath, ["--version"], root), /lock differs/);
      assert.equal(generations.state().readers.length, 0);
      writeFileSync(activeLock, JSON.stringify(lock));
      assert.equal(await invokeRuntimeGeneration(registryPath, ["--version"], root), 0);
      assert.equal(generations.state().readers.length, 0);
      assert.equal(await invokeRuntimeGeneration(registryPath,["resource-status"],root),0);
      assert.equal(await invokeRuntimeGeneration(registryPath,["startup-help"],root),0);
      assert.equal(generations.state().written, false);
      for (const [signal, expected] of [["SIGINT", 130], ["SIGTERM", 143]] as const) {
        const module = new URL("../src/runtime-invocation.ts", import.meta.url).href;
        const wrapper = `import {invokeRuntimeGeneration} from ${JSON.stringify(module)};process.exitCode=await invokeRuntimeGeneration(${JSON.stringify(registryPath)},["doctor",${JSON.stringify(signal)}],${JSON.stringify(root)});`;
        assert.throws(() => execFileSync(process.execPath, ["--input-type=module", "-e", wrapper], { encoding: "utf8", timeout: 5000, stdio: "pipe" }), error => {
          const result = error as {status:number;stdout:string};
          assert.equal(result.status, expected); assert.match(result.stdout, /child-cleanup-finished/); return true;
        });
        assert.equal(generations.state().readers.length, 0);
        assert.equal(generations.state().written, false);
      }
      await assert.rejects(() => invokeRuntimeGeneration(registryPath, ["unsupported-command"], root), /not supported/);
      const reader = other.acquire("running-job");
      const providerEnvironment = { GOVERNANCE_GENERATION_REGISTRY: registryPath, GOVERNANCE_GENERATION_TOKEN: reader.token, GOVERNANCE_GENERATION_OWNER: reader.owner };
      const installedEntry = join(result.directory, "node_modules/@organta/project-governance/dist/engine/src/cli.js");
      assert.equal(providerRuntime(root, providerEnvironment, installedEntry)!.directory, result.directory);
      assert.throws(() => providerRuntime(root, providerEnvironment), /helper does not belong/);
      assert.throws(() => providerRuntime(root, { ...providerEnvironment, GOVERNANCE_GENERATION_OWNER: "other" }, installedEntry), /parent generation reader/);
      writeFileSync(activeLock, JSON.stringify({ ...lock, version: "3.0.1" }));
      assert.throws(() => providerRuntime(root, providerEnvironment, installedEntry), /lock differs/);
      writeFileSync(activeLock, JSON.stringify(lock));
      const worker = other.retain(reader.token, reader.owner, "detached-worker");
      assert.equal(generations.state().written, true);
      assert.throws(() => other.retain(reader.token, "wrong-owner", "untrusted-child"), /parent reader/);
      assert.throws(() => generations.activate(next.directory, 1), /drained/);
      assert.throws(() => generations.release(reader.token, "another-owner"), /ownership/);
      other.release(reader.token, reader.owner);
      assert.throws(() => generations.activate(next.directory, 1), /drained/);
      const recoveredRun={id:"recovered-workflow",state:"failed",binding:{fixture:"saved-binding"}} as unknown as WorkflowRun;
      const recoveryParent=other.acquire("recovery-parent");
      const retained=other.retain(recoveryParent.token,recoveryParent.owner,`workflow:${recoveredRun.id}`);
      other.release(recoveryParent.token,recoveryParent.owner);
      const recoveryDirectory=join(root,"workflow-reader-recovery");mkdirSync(recoveryDirectory);
      const exited=spawnSync(process.execPath,["-e","process.exit(0)"],{timeout:5000});assert.equal(exited.status,0);
      const workerRequest={version:1,database:registryPath,runId:recoveredRun.id,bindingDigest:digest(recoveredRun.binding),
        generation:{registry:registryPath,...retained}};
      const saveRequest=()=>{
        writeFileSync(join(recoveryDirectory,"request.json"),JSON.stringify(workerRequest));
        writeFileSync(join(recoveryDirectory,"owner.json"),JSON.stringify({requestDigest:digest(workerRequest),pid:exited.pid}));
      };
      workerRequest.generation.revision++;saveRequest();
      assert.throws(()=>releaseRecoveredWorkflowReader(recoveryDirectory,registryPath,recoveredRun),/ownership mismatch/);
      assert.ok(generations.state().readers.some(row=>row.token===retained.token));
      workerRequest.generation.revision--;saveRequest();
      assert.equal(releaseRecoveredWorkflowReader(recoveryDirectory,registryPath,recoveredRun).state,"released");
      assert.equal(releaseRecoveredWorkflowReader(recoveryDirectory,registryPath,recoveredRun).state,"released");
      assert.equal(generations.state().readers.some(row=>row.token===retained.token),false);
      assert.ok(generations.state().readers.some(row=>row.token===worker.token));
      other.release(worker.token, worker.owner);
      assert.throws(() => generations.activate(next.directory, 0), /revision/);
      generations.activate(next.directory, 1);
      assert.equal(generations.rollback(2).directory, result.directory);
      generations.activate(next.directory, 3);
      const writer = other.acquire("writer");
      other.markWritten(writer.token, writer.owner);
      other.release(writer.token, writer.owner);
      assert.throws(() => generations.rollback(4), /forward-repair/);
      assert.equal(other.state().written, true);
      assert.equal(await invokeRuntimeGeneration(registryPath,["workflow-reconcile-cleanup"],root),0);
      const active = other.acquire("draining-reader");
      const maintenance = generations.beginMaintenance("updater", 4);
      assert.throws(() => other.acquire("new-reader"), /maintenance/);
      assert.throws(() => other.retain(active.token, active.owner, "new-worker"), /maintenance/);
      assert.throws(() => other.retain(active.token, active.owner, "new-worker", "wrong-token"), /maintenance/);
      assert.throws(() => other.retain(active.token, "wrong-owner", "hook-worker", maintenance.token), /parent reader/);
      const hookWorker = other.retain(active.token, active.owner, "hook-worker", maintenance.token);
      assert.throws(() => generations.activate(result.directory, 4, maintenance.token), /drained/);
      other.release(hookWorker.token, hookWorker.owner);
      assert.throws(() => other.endMaintenance(maintenance.token, "wrong-owner"), /ownership/);
      assert.throws(() => generations.activate(result.directory, 4), /ownership/);
      assert.throws(() => generations.activate(result.directory, 4, maintenance.token), /drained/);
      other.release(active.token, active.owner);
      const reopened = new RuntimeGenerations(registryPath);
      try {
        assert.equal(reopened.state().maintenance?.token, maintenance.token);
        assert.throws(() => reopened.acquire("after-restart"), /maintenance/);
        mkdirSync(join(root, "config/governance"), { recursive: true });
        const lockPath = join(root, "config/governance/runtime.lock.yaml"), snapshot = join(root, "migration-backup");
        writeFileSync(lockPath, '{"schema_version":1,"version":"2.8.2"}');
        mkdirSync(join(root, ".governance/runtime/bin"), { recursive: true });
        const launcher = join(root, ".governance/runtime/bin/project-governance");
        writeFileSync(launcher, "#!/bin/sh\nexit 1\n");
        const inputs = [{ path: lockPath, kind: "file" as const }, { path: launcher, kind: "file" as const }];
        await backupRuntimeState(registryPath, maintenance.token, maintenance.owner, inputs, snapshot);
        assert.throws(() => activateBackedRuntime(registryPath, result.directory, snapshot, [], maintenance.token, maintenance.owner), /scope differs/);
        assert.equal(reopened.state().directory, next.directory);
        const activation = activateBackedRuntime(registryPath, result.directory, snapshot, inputs, maintenance.token, maintenance.owner);
        assert.equal(activation.state.directory, result.directory);
        assert.equal(activation.admission, "maintenance-retained-for-readback");
        const reconnected = activateBackedRuntime(registryPath, result.directory, snapshot, inputs, maintenance.token, maintenance.owner);
        assert.equal(reconnected.state.revision, activation.state.revision);
        assert.equal(reconnected.backupDigest, activation.backupDigest);
        writeFileSync(lockPath, "authored-change: true");
        assert.throws(() => updateActivatedRuntimeLock(registryPath, root, snapshot, maintenance.token, maintenance.owner), /changed since backup/);
        writeFileSync(lockPath, '{"schema_version":1,"version":"2.8.2"}');
        assert.throws(()=>updateActivatedRuntimeLock(registryPath,root,snapshot,maintenance.token,maintenance.owner,
          JSON.stringify({...lock,version:"3.9.0"})),/Exact lock text differs/);
        const literalLock=JSON.stringify(lock,null,3)+"\n\n";
        assert.equal(updateActivatedRuntimeLock(registryPath, root, snapshot, maintenance.token, maintenance.owner,literalLock).changed, true);
        assert.equal(readFileSync(lockPath,"utf8"),literalLock);
        assert.equal(updateActivatedRuntimeLock(registryPath, root, snapshot, maintenance.token, maintenance.owner,literalLock).changed, false);
        assert.equal(updateActivatedRuntimeLock(registryPath, root, snapshot, maintenance.token, maintenance.owner).changed, false);
        assert.deepEqual(JSON.parse(readFileSync(lockPath, "utf8")), lock);
        writeFileSync(launcher, "authored launcher");
        assert.throws(() => completeRuntimeTransition(registryPath, root, result.directory, snapshot, inputs, maintenance.token, maintenance.owner), /changed since backup/);
        assert.equal(reopened.state().maintenance?.token, maintenance.token);
        assert.throws(() => installActivatedLauncher(registryPath, root, snapshot, maintenance.token, maintenance.owner), /changed since backup/);
        writeFileSync(launcher, "#!/bin/sh\nexit 1\n");
        assert.equal(installActivatedLauncher(registryPath, root, snapshot, maintenance.token, maintenance.owner).changed, true);
        assert.equal(installActivatedLauncher(registryPath, root, snapshot, maintenance.token, maintenance.owner).changed, false);
        assert.throws(() => reopened.acquire("before-readback"), /maintenance/);
        assert.throws(() => activateBackedRuntime(registryPath, next.directory, snapshot, inputs, maintenance.token, maintenance.owner), /current maintenance/);
        assert.throws(() => finalizeRuntimeActivation(registryPath, root, maintenance.token, "other-owner"), /owned drained/);
        const oldStore = join(root,"old-store"), oldId = "00000000-0000-0000-0000-000000000001", oldJob = join(oldStore,"jobs",oldId);
        mkdirSync(oldJob,{recursive:true});
        const oldReceipt = {job_id:oldId,protocol_version:1,workspace:root,state:"succeeded",cleanup_confirmed:true};
        for (const name of ["status.json","result.json"]) writeFileSync(join(oldJob,name),JSON.stringify(oldReceipt));
        const historyDirectory = join(root,"retained-history"); archiveLegacyHistory(root,oldStore,historyDirectory);
        const history = {directory:historyDirectory,receiptDigest:fileDigest(join(historyDirectory,"archive.json"))};
        const transition = await runtimeCompletionCommand(["--registry",registryPath,"--workspace",root,"--candidate",result.directory,
          "--backup",snapshot,"--token",maintenance.token,"--owner",maintenance.owner,"--file",lockPath,"--file",launcher,
          "--history-archive",history.directory,"--history-digest",history.receiptDigest]);
        assert.throws(()=>completeRuntimeTransition(registryPath,root,result.directory,snapshot,inputs,maintenance.token,maintenance.owner),/legacy history identity changed/);
        const retainedResult = join(history.directory,oldId,"result.json");
        writeFileSync(retainedResult,"changed");
        assert.throws(()=>completeRuntimeTransition(registryPath,root,result.directory,snapshot,inputs,maintenance.token,maintenance.owner,history),/contents differ/);
        writeFileSync(retainedResult,JSON.stringify(oldReceipt));
        const { backupDigest: transitionBackup, ...finalized } = transition;
        assert.equal(transitionBackup, activation.backupDigest);
        assert.deepEqual(completeRuntimeTransition(registryPath, root, result.directory, snapshot, inputs, maintenance.token, maintenance.owner, history), transition);
        assert.throws(() => completeRuntimeTransition(registryPath, root, next.directory, snapshot, inputs, maintenance.token, maintenance.owner), /identity differs/);
        assert.throws(() => completeRuntimeTransition(registryPath, root, result.directory, snapshot, [], maintenance.token, maintenance.owner), /scope or ownership/);
        assert.equal(finalized.readback, "project-governance 3.0.0");
        assert.equal(finalized.state.maintenance, null);
        execFileSync("git", ["init", "-q"], { cwd: root });
        installGitHooks(root, { configure: true });
        assert.equal(runtimeDoctor(root, registryPath).status, "passed");
        const verifiedLauncher = readFileSync(launcher, "utf8");
        writeFileSync(launcher, "changed launcher");
        assert.ok(runtimeDoctor(root, registryPath).findings.some(finding => finding.id === "installation.launcher-mismatch"));
        writeFileSync(launcher, verifiedLauncher);
        const completedAgain = finalizeRuntimeActivation(registryPath, root, maintenance.token, maintenance.owner, undefined, undefined, history);
        assert.deepEqual(completedAgain, finalized);
        const resumed = reopened.acquire("resumed");
        reopened.release(resumed.token, resumed.owner);
        const recoveryMaintenance = reopened.beginMaintenance("recovery-test", reopened.state().revision);
        const recoveryBackup = join(root, "recovery-backup");
        chmodSync(launcher, 0o750); chmodSync(lockPath, 0o640);
        const priorLauncher = readFileSync(launcher, "utf8");
        await backupRuntimeState(registryPath, recoveryMaintenance.token, recoveryMaintenance.owner, inputs, recoveryBackup);
        activateBackedRuntime(registryPath, next.directory, recoveryBackup, inputs, recoveryMaintenance.token, recoveryMaintenance.owner);
        installActivatedLauncher(registryPath, root, recoveryBackup, recoveryMaintenance.token, recoveryMaintenance.owner);
        const updatedLauncher = readFileSync(launcher, "utf8");
        writeFileSync(launcher, "unrelated edit");
        assert.throws(() => recoverPrewriteActivation(registryPath, root, recoveryBackup, recoveryMaintenance.token, recoveryMaintenance.owner), /unrelated edits/);
        assert.equal(readFileSync(launcher, "utf8"), "unrelated edit");
        writeFileSync(launcher, updatedLauncher);
        const recovered = recoverPrewriteActivation(registryPath, root, recoveryBackup, recoveryMaintenance.token, recoveryMaintenance.owner);
        assert.equal(recovered.state.directory, result.directory);
        assert.equal(readFileSync(launcher, "utf8"), priorLauncher);
        assert.equal(statSync(launcher).mode & 0o777, 0o750);
        assert.equal(statSync(lockPath).mode & 0o777, 0o640);
        assert.equal(recovered.state.maintenance?.token, recoveryMaintenance.token);
        const recoveredAgain = recoverPrewriteActivation(registryPath, root, recoveryBackup, recoveryMaintenance.token, recoveryMaintenance.owner);
        assert.deepEqual(recoveredAgain, recovered);
        reopened.endMaintenance(recoveryMaintenance.token, recoveryMaintenance.owner);
        const writer = reopened.acquire("post-cutover-task");
        reopened.markWritten(writer.token, writer.owner); reopened.release(writer.token, writer.owner);
        const taskPath = join(root, "post-write-tasks.sqlite"), taskDatabase = new DatabaseSync(taskPath);
        try { taskDatabase.exec("PRAGMA journal_mode=WAL; CREATE TABLE evidence(value TEXT); INSERT INTO evidence VALUES('new task evidence');"); } finally { taskDatabase.close(); }
        const repairMaintenance = reopened.beginMaintenance("forward-repair", reopened.state().revision);
        const proofPath = join(root, "retained-proof.txt"); writeFileSync(proofPath, "captured proof");
        const repairBackup = join(root, "forward-repair-backup"), repairInputs = [...inputs, { path: taskPath, kind: "sqlite" as const }, { path: proofPath, kind: "file" as const }];
        await backupRuntimeState(registryPath, repairMaintenance.token, repairMaintenance.owner, repairInputs, repairBackup);
        assert.throws(() => reopened.rollback(reopened.state().revision, repairMaintenance.token), /forward-repair/);
        writeFileSync(proofPath, "concurrent new evidence");
        await assert.rejects(() => forwardRepairRuntime(registryPath, root, next.directory, repairBackup, repairInputs, repairMaintenance.token, repairMaintenance.owner, history), /evidence changed/);
        assert.equal(reopened.state().maintenance?.token, repairMaintenance.token);
        assert.equal(readFileSync(proofPath, "utf8"), "concurrent new evidence");
        assert.throws(() => reopened.endMaintenance(repairMaintenance.token, repairMaintenance.owner), /preservation readback required/);
        const failedRepairLauncher = readFileSync(launcher, "utf8");
        assert.throws(() => recoverPrewriteActivation(registryPath, root, repairBackup, repairMaintenance.token, repairMaintenance.owner), /preservation readback required/);
        assert.throws(() => reopened.rollback(reopened.state().revision, repairMaintenance.token), /preservation readback required/);
        assert.equal(readFileSync(launcher, "utf8"), failedRepairLauncher);
        assert.throws(() => completeRuntimeTransition(registryPath, root, next.directory, repairBackup, repairInputs, repairMaintenance.token, repairMaintenance.owner, history), /preservation readback required/);
        assert.equal(reopened.state().maintenance?.token, repairMaintenance.token);
        // Reset only this synthetic fixture input to exercise reconnection to the same repair.
        writeFileSync(proofPath, "captured proof");
        const repaired = await forwardRepairRuntime(registryPath, root, next.directory, repairBackup, repairInputs, repairMaintenance.token, repairMaintenance.owner, history);
        assert.equal(repaired.state.maintenance, null); assert.equal(repaired.restoration, "none");
        assert.throws(()=>finalizeRuntimeActivation(registryPath,root,repairMaintenance.token,repairMaintenance.owner,repaired.preservedInputsDigest),/legacy history identity/);
        assert.deepEqual(await forwardRepairRuntime(registryPath, root, next.directory, repairBackup, repairInputs, repairMaintenance.token, repairMaintenance.owner, history), repaired);
        const retained = new DatabaseSync(taskPath, { readOnly: true });
        try { assert.equal(retained.prepare("SELECT value FROM evidence").get()?.value, "new task evidence"); } finally { retained.close(); }
        writeFileSync(join(root, "AGENTS.md"), "Keep this authored instruction.\n", { mode: 0o640 });
        const hostScope = hostInstructionBackupScope(root, COMPILED_HOST_BLOCK);
        const hostMaintenance = reopened.beginMaintenance("host-migration", reopened.state().revision);
        const hostBackup = join(root, "host-backup"), hostInputs = [...inputs, ...hostScope.inputs];
        await backupRuntimeState(registryPath, hostMaintenance.token, hostMaintenance.owner, hostInputs, hostBackup);
        requireHostInstructionCompletion(registryPath, hostScope.plan, COMPILED_HOST_BLOCK, hostBackup, hostMaintenance.token, hostMaintenance.owner);
        // Simulate a stopped updater after its first durable host write.
        const firstHostWrite = hostScope.plan.writes[0]!;
        writeFileSync(join(root, firstHostWrite.path), firstHostWrite.content);
        assert.throws(() => completeRuntimeTransition(registryPath, root, result.directory, hostBackup, hostInputs, hostMaintenance.token, hostMaintenance.owner), /completion readback required/);
        assert.throws(() => recoverPrewriteActivation(registryPath, root, hostBackup, hostMaintenance.token, hostMaintenance.owner), /completion readback required/);
        const hostPlanFile = join(root, "host-plan.json"); writeFileSync(hostPlanFile, JSON.stringify(hostScope));
        const hostResult = await runtimeCompletionCommand(["--registry", registryPath, "--workspace", root, "--candidate", result.directory,
          "--backup", hostBackup, "--token", hostMaintenance.token, "--owner", hostMaintenance.owner, "--host-plan", hostPlanFile, "--history-archive", history.directory, "--history-digest", history.receiptDigest,
          ...hostInputs.flatMap(input => [`--${input.kind}`, input.path])]);
        assert.equal(hostResult.state.maintenance, null);
        assert.equal(statSync(join(root, "AGENTS.md")).mode & 0o777, 0o640);
        assert.ok(readFileSync(join(root, "AGENTS.md"), "utf8").includes("Keep this authored instruction."));
        assert.deepEqual(completeHostInstructionTransition(registryPath, root, result.directory, hostBackup, hostInputs, hostMaintenance.token, hostMaintenance.owner, hostScope.plan, COMPILED_HOST_BLOCK, history), hostResult);
        assert.throws(() => finalizeRuntimeActivation(registryPath, root, hostMaintenance.token, hostMaintenance.owner, undefined, undefined, history), /host instruction identity/);
      } finally { reopened.close(); }
    } finally { generations.close(); other.close(); }
    const legacyRoot = join(root, "legacy-project");
    mkdirSync(join(legacyRoot, "config/governance"), { recursive: true });
    mkdirSync(join(legacyRoot, ".governance/runtime/bin"), { recursive: true });
    const legacyLockPath = join(legacyRoot, "config/governance/runtime.lock.yaml"), legacyLauncher = join(legacyRoot, ".governance/runtime/bin/project-governance");
    const legacyLock = { schema_version: 1, package: "project-governance-runtime", version: "2.8.2", wheel: "runtime-2.8.2.whl",
      sha256: "a".repeat(64), source_commit: "b".repeat(40), python: ">=3.9,<4", configuration_schema: 2, release_base_url: "https://example.invalid/releases" };
    writeFileSync(legacyLockPath, JSON.stringify(legacyLock));
    writeFileSync(legacyLauncher, "#!/bin/sh\necho 'project-governance 2.8.2'\n", { mode: 0o700 });
    const legacyProvider=join(legacyRoot,".governance/runtime/bin/harness-agent");
    writeFileSync(legacyProvider,"legacy provider entry",{mode:0o750});
    mkdirSync(join(legacyRoot,"tools"));
    const legacyScripts=["governance-bootstrap.py","governance-startup.py"].map(name=>{
      const path=join(legacyRoot,"tools",name);
      writeFileSync(path,readFileSync(join(process.cwd(),"src/project_governance_runtime/assets/tools",name)),{mode:0o750});
      return path;
    });
    const legacyRegistryPath = join(legacyRoot, "installation.sqlite"), legacyRegistry = new RuntimeGenerations(legacyRegistryPath);
    try {
      const maintenance = legacyRegistry.beginMaintenance("wheel-migration", 0), snapshot = join(root, "wheel-backup");
      const inputs = [{ path: legacyLockPath, kind: "file" as const }, { path: legacyLauncher, kind: "file" as const }, {path:legacyProvider,kind:"file" as const}, ...legacyScripts.map(path=>({path,kind:"file" as const}))];
      await backupRuntimeState(legacyRegistryPath, maintenance.token, maintenance.owner, inputs, snapshot);
      activateBackedRuntime(legacyRegistryPath, result.directory, snapshot, inputs, maintenance.token, maintenance.owner);
      updateActivatedRuntimeLock(legacyRegistryPath, legacyRoot, snapshot, maintenance.token, maintenance.owner);
      installActivatedLauncher(legacyRegistryPath, legacyRoot, snapshot, maintenance.token, maintenance.owner);
      assert.throws(()=>finalizeRuntimeActivation(legacyRegistryPath,legacyRoot,maintenance.token,maintenance.owner),/remains active/);
      writeFileSync(legacyProvider,"user change");
      assert.throws(()=>retireLegacyRuntimeEntrypoints(legacyRegistryPath,legacyRoot,snapshot,maintenance.token,maintenance.owner),/changed since backup/);
      writeFileSync(legacyProvider,"legacy provider entry");
      const scriptBytes=readFileSync(legacyScripts[0]!);
      writeFileSync(legacyScripts[0]!,"authored change");
      assert.throws(()=>retireLegacyRuntimeEntrypoints(legacyRegistryPath,legacyRoot,snapshot,maintenance.token,maintenance.owner),/changed since backup/);
      assert.ok(existsSync(legacyProvider));
      writeFileSync(legacyScripts[0]!,scriptBytes);
      retireLegacyRuntimeEntrypoints(legacyRegistryPath,legacyRoot,snapshot,maintenance.token,maintenance.owner);
      assert.throws(()=>lstatSync(legacyProvider),{code:"ENOENT"});
      retireLegacyRuntimeEntrypoints(legacyRegistryPath,legacyRoot,snapshot,maintenance.token,maintenance.owner);
      writeFileSync(legacyProvider,"new unrelated entry");
      assert.throws(()=>recoverPrewriteActivation(legacyRegistryPath,legacyRoot,snapshot,maintenance.token,maintenance.owner),/unrelated edits/);
      rmSync(legacyProvider);
      const restored = recoverPrewriteActivation(legacyRegistryPath, legacyRoot, snapshot, maintenance.token, maintenance.owner);
      assert.equal(readFileSync(legacyProvider,"utf8"),"legacy provider entry");
      assert.equal(statSync(legacyProvider).mode & 0o777,0o750);
      for (const path of legacyScripts) {
        assert.equal(statSync(path).mode & 0o777,0o750);
        assert.ok(readFileSync(path).length > 100);
      }
      assert.equal(restored.state.directory, null);
      assert.deepEqual(JSON.parse(readFileSync(legacyLockPath, "utf8")), legacyLock);
      assert.deepEqual(recoverPrewriteActivation(legacyRegistryPath, legacyRoot, snapshot, maintenance.token, maintenance.owner), restored);
      legacyRegistry.endMaintenance(maintenance.token,maintenance.owner);
      const nextMaintenance=legacyRegistry.beginMaintenance("wheel-cutover",legacyRegistry.state().revision);
      const cutoverBackup=join(root,"wheel-cutover-backup");
      const projectPlan=runtimeMigrationPlan(legacyRoot),projectPlanPath=join(root,"cutover-project-plan.json");
      writeFileSync(projectPlanPath,JSON.stringify(projectPlan));
      await backupRuntimeState(legacyRegistryPath,nextMaintenance.token,nextMaintenance.owner,projectPlan.inputs,cutoverBackup);
      const completionArgs=["--registry",legacyRegistryPath,"--workspace",legacyRoot,"--candidate",result.directory,
        "--backup",cutoverBackup,"--token",nextMaintenance.token,"--owner",nextMaintenance.owner,"--project-plan",projectPlanPath];
      const cutover=await runtimeCompletionCommand(completionArgs);
      assert.equal(cutover.state.maintenance,null);
      for(const path of legacyScripts)assert.equal(existsSync(path),false);
      assert.throws(()=>lstatSync(legacyProvider),{code:"ENOENT"});
      assert.deepEqual(await runtimeCompletionCommand(completionArgs),cutover);
      const updateOperation=join(root,"composed-update"),updatePlan=runtimeMigrationPlan(legacyRoot);
      const retainedStore=join(root,"composed-history-source"),historyId="00000000-0000-0000-0000-000000000002";
      const retainedJob=join(retainedStore,"jobs",historyId);mkdirSync(retainedJob,{recursive:true});
      const retainedRecord={job_id:historyId,protocol_version:1,workspace:legacyRoot,state:"failed",cleanup_confirmed:true};
      for(const name of ["status.json","result.json"])writeFileSync(join(retainedJob,name),JSON.stringify(retainedRecord));
      const retainedArchive=join(root,"composed-history-archive");archiveLegacyHistory(legacyRoot,retainedStore,retainedArchive);
      const updateHistory={directory:retainedArchive,receiptDigest:fileDigest(join(retainedArchive,"archive.json"))};
      const omittedHostRequest=join(root,"omitted-host.json"),discoveredPlanPath=join(root,"discovered-update-plan.json");
      writeFileSync(discoveredPlanPath,JSON.stringify(updatePlan));
      writeFileSync(omittedHostRequest,JSON.stringify({mode:"update",workspace:legacyRoot,registry:legacyRegistryPath,
        archive,lock,expectedRevision:legacyRegistry.state().revision,inputs:updatePlan.inputs}));
      await assert.rejects(runtimeOperationCommand("update",["--request-file",omittedHostRequest,
        "--operation-directory",join(root,"omitted-host-operation"),"--project-plan",discoveredPlanPath]),/host instruction plan/);
      assert.throws(()=>lstatSync(join(root,"omitted-host-operation")),{code:"ENOENT"});
      const updatePreparation=await prepareRuntimeOperation({mode:"update",workspace:legacyRoot,registry:legacyRegistryPath,
        archive,lock,expectedRevision:legacyRegistry.state().revision,inputs:updatePlan.inputs,hostPlan:updatePlan.hostPlan,history:updateHistory},updateOperation,()=>{});
      const preparedPath=join(updateOperation,"prepared.json"),preparedBytes=readFileSync(preparedPath);
      writeFileSync(preparedPath,JSON.stringify({...JSON.parse(preparedBytes.toString()),candidate:result.directory}));
      await assert.rejects(completePreparedRuntimeOperation(updateOperation),/candidate differs/);
      assert.equal(legacyRegistry.state().maintenance?.token,updatePreparation.maintenance.token);
      writeFileSync(preparedPath,preparedBytes);
      const retainedResultPath=join(retainedArchive,historyId,"result.json"),retainedBytes=readFileSync(retainedResultPath);
      writeFileSync(retainedResultPath,"changed history");
      const beforeRefusal=legacyRegistry.state();
      await assert.rejects(completePreparedRuntimeOperation(updateOperation),/contents differ/);
      assert.deepEqual(legacyRegistry.state(),beforeRefusal);
      writeFileSync(retainedResultPath,retainedBytes);
      const updateRequestPath=join(root,"update-request.json"),updatePlanPath=join(root,"update-plan.json");
      const {version:operationVersion,kind:operationKind,...updateRequest}=JSON.parse(readFileSync(join(updateOperation,"operation.json"),"utf8")).request;
      writeFileSync(updateRequestPath,JSON.stringify(updateRequest));writeFileSync(updatePlanPath,JSON.stringify(updatePlan));
      // Simulate loss after the backup committed but before prepared.json was persisted.
      rmSync(preparedPath);
      const backupReceiptBefore=readFileSync(join(updatePreparation.backup,"backup.json"));
      const newPolicy=join(legacyRoot,"config/governance/interrupted-policy.yaml");
      writeFileSync(newPolicy,"policy: changed\n");
      await assert.rejects(runtimeOperationCommand("update",["--request-file",updateRequestPath,
        "--operation-directory",updateOperation,"--project-plan",updatePlanPath]),/plan changed/);
      assert.equal(existsSync(preparedPath),false);
      assert.equal(legacyRegistry.state().maintenance?.token,updatePreparation.maintenance.token);
      assert.deepEqual(readFileSync(join(updatePreparation.backup,"backup.json")),backupReceiptBefore);
      rmSync(newPolicy);
      const updateResult=await runtimeOperationCommand("update",["--request-file",updateRequestPath,
        "--operation-directory",updateOperation,"--project-plan",updatePlanPath]);
      assert.equal(updateResult.state.maintenance,null);
      assert.equal(updateResult.state.directory,updatePreparation.candidate);
      assert.deepEqual(readFileSync(preparedPath),preparedBytes);
      assert.deepEqual(readFileSync(join(updatePreparation.backup,"backup.json")),backupReceiptBefore);
      assert.deepEqual(await completePreparedRuntimeOperation(updateOperation),updateResult);
      const taskDatabase=join(legacyRoot,"tasks.sqlite"),taskStore=new DatabaseSync(taskDatabase);
      taskStore.exec("CREATE TABLE evidence(value TEXT); INSERT INTO evidence VALUES('post-cutover proof')");taskStore.close();
      const writer=legacyRegistry.acquire("post-cutover-writer");legacyRegistry.markWritten(writer.token,writer.owner);legacyRegistry.release(writer.token,writer.owner);
      const repairOperation=join(root,"composed-repair"),repairPlan=runtimeMigrationPlan(legacyRoot);
      const repairRequestPath=join(root,"repair-request.json"),repairPlanPath=join(root,"repair-plan.json");
      writeFileSync(repairRequestPath,JSON.stringify({mode:"repair",workspace:legacyRoot,registry:legacyRegistryPath,archive,lock,
        expectedRevision:legacyRegistry.state().revision,inputs:[...repairPlan.inputs,{path:taskDatabase,kind:"sqlite"}],history:updateHistory}));
      writeFileSync(repairPlanPath,JSON.stringify(repairPlan));
      const repairArgs=["--request-file",repairRequestPath,"--operation-directory",repairOperation,"--project-plan",repairPlanPath];
      await assert.rejects(runtimeOperationCommand("repair",repairArgs,{workspace:root,registry:legacyRegistryPath}),/launcher scope/);
      assert.equal(existsSync(repairOperation),false);
      const managedRepair=[fileURLToPath(cli),"runtime-run","--registry",legacyRegistryPath,"--workspace",legacyRoot,"--","repair",...repairArgs];
      const concurrentReader=legacyRegistry.acquire("ongoing-project-work");
      await assert.rejects(runtimeOperationCommand("repair",repairArgs,{workspace:legacyRoot,registry:legacyRegistryPath}),/drained readers/);
      assert.equal(legacyRegistry.state().readers.length,1);
      assert.equal(legacyRegistry.state().readers[0]?.token,concurrentReader.token);
      legacyRegistry.release(concurrentReader.token,concurrentReader.owner);
      const repaired=JSON.parse(execFileSync(process.execPath,managedRepair,{encoding:"utf8",timeout:10000}));
      assert.equal(repaired.state.maintenance,null);
      assert.equal(repaired.state.readers.length,0);
      const preserved=new DatabaseSync(taskDatabase,{readOnly:true});
      try{assert.equal(preserved.prepare("SELECT value FROM evidence").get()?.value,"post-cutover proof");}finally{preserved.close();}
      const repairReplay=execFileSync(process.execPath,managedRepair,{encoding:"utf8",timeout:10000});
      assert.deepEqual(JSON.parse(repairReplay),repaired);


    } finally { legacyRegistry.close(); }
    const cliLegacy=join(root,"cli-legacy-project");
    mkdirSync(join(cliLegacy,"config/governance"),{recursive:true});
    execFileSync("python3",["-m","venv","--without-pip",join(cliLegacy,".governance/runtime")],{timeout:15000});
    writeFileSync(join(cliLegacy,".governance/runtime-use.lock"),"");
    writeFileSync(join(cliLegacy,"config/governance/runtime.lock.yaml"),JSON.stringify(legacyLock));
    writeFileSync(join(cliLegacy,".governance/runtime/bin/project-governance"),"#!/bin/sh\nexit 1\n",{mode:0o700});
    writeFileSync(join(cliLegacy,".governance/runtime/bin/harness-agent"),"old provider",{mode:0o700});
    mkdirSync(join(cliLegacy,".codex"));
    const legacyNativeHooks={hooks:Object.fromEntries(Object.entries({SessionStart:90,SubagentStart:90,SessionEnd:3,UserPromptSubmit:10})
      .map(([event,timeout])=>[event,[{hooks:[{type:"command",command:'python3 "$(git rev-parse --show-toplevel)/tools/governance-startup.py" codex',timeout}]}]]))};
    writeFileSync(join(cliLegacy,".codex/hooks.json"),JSON.stringify(legacyNativeHooks));
    const cliPlan=runtimeMigrationPlan(cliLegacy),cliPlanPath=join(root,"cli-legacy-plan.json"),cliRequestPath=join(root,"cli-legacy-request.json");
    writeFileSync(cliPlanPath,JSON.stringify(cliPlan));
    const cliRegistryPath=join(cliLegacy,"installation.sqlite"),cliOperation=join(root,"cli-legacy-operation");
    writeFileSync(cliRequestPath,JSON.stringify({mode:"update",workspace:cliLegacy,registry:cliRegistryPath,archive,lock,
      expectedRevision:0,inputs:cliPlan.inputs,hostPlan:cliPlan.hostPlan,startupReceipts:join(root,"migrated-startup.sqlite")}));
    const legacyArguments=[fileURLToPath(cli),"update","--request-file",cliRequestPath,"--project-plan",cliPlanPath,"--operation-directory",cliOperation];
    await assert.rejects(runtimeOperationCommand("update",legacyArguments.slice(2).concat("--request-digest","stale")),/changed during handoff/);
    assert.equal(existsSync(cliOperation),false);
    const validRequest=readFileSync(cliRequestPath,"utf8");
    for(const inputs of [[null],[{path:"relative",kind:"file"}],[...cliPlan.inputs,cliPlan.inputs[0]]]) {
      writeFileSync(cliRequestPath,JSON.stringify({...JSON.parse(validRequest),inputs}));
      await assert.rejects(runtimeOperationCommand("update",legacyArguments.slice(2)));
      assert.equal(existsSync(cliOperation),false);
      assert.equal(existsSync(cliRegistryPath),false);
    }
    writeFileSync(cliRequestPath,validRequest);
    const cliUpdate=JSON.parse(execFileSync(process.execPath,legacyArguments,{encoding:"utf8",timeout:15000}));
    assert.equal(cliUpdate.state.maintenance,null);
    assert.doesNotMatch(readFileSync(join(cliLegacy,".codex/hooks.json"),"utf8"),/governance-startup\.py/);
    assert.match(readFileSync(join(cliLegacy,".codex/hooks.json"),"utf8"),/startup observe/);
    assert.equal(JSON.parse(readFileSync(join(cliLegacy,"config/governance/runtime.lock.yaml"),"utf8")).schema_version,2);
    assert.throws(()=>lstatSync(join(cliLegacy,".governance/runtime/bin/harness-agent")),{code:"ENOENT"});
    assert.deepEqual(JSON.parse(execFileSync(process.execPath,legacyArguments,{encoding:"utf8",timeout:15000})),cliUpdate);
    const initWorkspace=join(root,"init-project");mkdirSync(initWorkspace);
    const checkout=join(root,"locked-checkout");mkdirSync(join(checkout,"config/governance"),{recursive:true});
    const checkoutLock=JSON.stringify(lock,null,4)+"\n";
    writeFileSync(join(checkout,"config/governance/runtime.lock.yaml"),checkoutLock);
    const checkoutPlan=runtimeMigrationPlan(checkout),checkoutPlanPath=join(root,"checkout-plan.json"),checkoutRequestPath=join(root,"checkout-request.json");
    writeFileSync(checkoutPlanPath,JSON.stringify(checkoutPlan));
    const checkoutRequest={mode:"init",lockedCheckout:true,workspace:checkout,registry:join(checkout,"installation.sqlite"),
      archive,lock,expectedRevision:0,inputs:checkoutPlan.inputs,hostPlan:checkoutPlan.hostPlan};
    const checkoutArgs=["--request-file",checkoutRequestPath,"--project-plan",checkoutPlanPath,"--operation-directory",join(root,"checkout-operation")];
    writeFileSync(checkoutRequestPath,JSON.stringify({...checkoutRequest,lock:{...lock,version:"9.9.9"}}));
    await assert.rejects(runtimeOperationCommand("init",checkoutArgs),/differs from requested artifact/);
    assert.equal(existsSync(checkoutRequest.registry),false);
    writeFileSync(checkoutRequestPath,JSON.stringify(checkoutRequest));
    const checkoutResult=JSON.parse(execFileSync(process.execPath,[fileURLToPath(cli),"init",...checkoutArgs],{encoding:"utf8",timeout:15000}));
    assert.equal(checkoutResult.state.maintenance,null);
    assert.equal(readFileSync(join(checkout,"config/governance/runtime.lock.yaml"),"utf8"),checkoutLock);
    assert.deepEqual(JSON.parse(execFileSync(process.execPath,[fileURLToPath(cli),"init",...checkoutArgs],{encoding:"utf8",timeout:15000})),checkoutResult);
    const initPlan=runtimeMigrationPlan(initWorkspace),initPlanPath=join(root,"init-plan.json"),initRequestPath=join(root,"init-request.json");
    writeFileSync(initPlanPath,JSON.stringify(initPlan));
    const initOperation=join(root,"init-operation");
    writeFileSync(initRequestPath,JSON.stringify({mode:"init",workspace:initWorkspace,registry:join(initWorkspace,"installation.sqlite"),
      archive,lock,expectedRevision:0,inputs:initPlan.inputs,hostPlan:initPlan.hostPlan}));
    const initArgs=[fileURLToPath(cli),"init","--request-file",initRequestPath,"--project-plan",initPlanPath,"--operation-directory",initOperation];
    const initialized=JSON.parse(execFileSync(process.execPath,initArgs,{encoding:"utf8",timeout:15000}));
    assert.equal(initialized.state.maintenance,null);
    assert.equal(JSON.parse(readFileSync(join(initWorkspace,"config/governance/runtime.lock.yaml"),"utf8")).schema_version,2);
    assert.match(readFileSync(join(initWorkspace,"AGENTS.md"),"utf8"),/governance/);
    assert.equal(readFileSync(join(initWorkspace,"config/governance/profile.yaml"),"utf8"),"schema_version: 1\nproject_extensions: []\n");
    assert.equal(readFileSync(join(initWorkspace,"config/governance/facts.lock.yaml"),"utf8"),"schema_version: 1\nfacts: {}\n");
    assert.equal(readFileSync(join(initWorkspace,".governance/.gitignore"),"utf8"),"*\n!.gitignore\n");
    for(const hook of ["commit-msg","pre-commit","pre-push","pre-pr"]) {
      const path=join(initWorkspace,".githooks",hook);
      assert.match(readFileSync(path,"utf8"),new RegExp(`hook ${hook}`));
      assert.equal(statSync(path).mode & 0o111,0o111);
    }
    assert.deepEqual(JSON.parse(execFileSync(process.execPath,initArgs,{encoding:"utf8",timeout:15000})),initialized);
    const startupInput={provider:"codex",event:{session_id:"init-session",hook_event_name:"SessionStart",source:"startup"},
      workspace:initWorkspace,registry:join(initWorkspace,"installation.sqlite"),receipts:join(root,"startup-receipts.sqlite")};
    const noNetwork={fetch:(async()=>{throw new Error("Manual policy must not fetch");}) as typeof fetch,environment:{}};
    const startupEventFile=join(root,"startup-event.json");writeFileSync(startupEventFile,JSON.stringify(startupInput.event));
    const startupArgs=[fileURLToPath(cli),"runtime-run","--registry",startupInput.registry,"--workspace",initWorkspace,"--","startup","observe",
      "--provider","codex","--event-stdin","--receipts",startupInput.receipts];
    const observed=JSON.parse(execFileSync(process.execPath,startupArgs,{input:JSON.stringify(startupInput.event),encoding:"utf8",timeout:10000}));
    assert.throws(()=>execFileSync(process.execPath,[...startupArgs,"--event-file",startupEventFile],
      {input:JSON.stringify(startupInput.event),encoding:"utf8",timeout:10000,stdio:["pipe","pipe","pipe"]}),/"status":"failed"/);
    assert.deepEqual(observed,{});
    const replayed=await observeStartup(startupInput,noNetwork);
    assert.equal(replayed.discover,false);
    if ("reason" in replayed && replayed.reason === "native-owner-unavailable") {
      // Headless CI has no native Codex ancestor. Refusal is the correct public behavior.
      assert.equal(replayed.action, "defer");
      const headlessRegistry = new RuntimeGenerations(startupInput.registry);
      try { assert.equal(headlessRegistry.state().readers.length, 0); }
      finally { headlessRegistry.close(); }
    } else {
    assert.equal("result" in replayed && replayed.result?.status,"manual");
    const startupProfile=join(initWorkspace,"config/governance/profile.yaml"),originalProfile=readFileSync(startupProfile);
    writeFileSync(startupProfile,"schema_version: 1\nruntime_updates:\n  policy: compatible\n");
    const failingStartup={...startupInput,event:{...startupInput.event,session_id:"unsupported-local-release"}};
    await assert.rejects(observeStartup(failingStartup,noNetwork),/GitHub release owner/);
    const failedReplay=await observeStartup(failingStartup,noNetwork);
    assert.equal("result" in failedReplay && failedReplay.result?.status,"discovery-failed");
    assert.equal(failedReplay.discover,false);
    writeFileSync(startupProfile,originalProfile);
    const startupRegistry=new RuntimeGenerations(startupInput.registry);
    try{
      assert.equal(startupRegistry.state().readers.length,2);
      const maintenance=startupRegistry.beginMaintenance("startup-drain",startupRegistry.state().revision);
      await assert.rejects(observeStartup(startupInput,noNetwork),/maintenance/);
      await observeStartup({...startupInput,event:{...startupInput.event,hook_event_name:"SessionEnd"}},noNetwork);
      assert.equal(startupRegistry.state().readers.length,1);
      await observeStartup({...failingStartup,event:{...failingStartup.event,hook_event_name:"SessionEnd"}},noNetwork);
      assert.equal(startupRegistry.state().readers.length,0);
      startupRegistry.endMaintenance(maintenance.token,maintenance.owner);
    }finally{startupRegistry.close();}

    }

    const recoveryTasks=new StartupTasks(startupInput.receipts),recoveryRegistry=new RuntimeGenerations(startupInput.registry);
    try {
      const recoveryTask=recoveryTasks.event("codex",{...startupInput.event,session_id:"lost-parent"},initWorkspace,fileDigest(join(initWorkspace,"config/governance/runtime.lock.yaml")),{});
      if(!("taskId" in recoveryTask))throw new Error("Missing recovery task");
      const reservation={registry:startupInput.registry,...recoveryRegistry.reserveStartupTask(recoveryTask.taskId)};
      const exitedPid=Number(execFileSync(process.execPath,["-e","console.log(process.pid)"],{encoding:"utf8"}));
      recoveryTasks.bindOwner(recoveryTask.taskId,{provider:"codex",host:hostname(),pid:exitedPid,fingerprint:"fixture recorded identity"},reservation);
      const boundDigest=digest(recoveryTasks.owner(recoveryTask.taskId));
      assert.throws(()=>recoverStartupOwner(startupInput.receipts,recoveryTask.taskId,boundDigest,"fixture:wrong-scope",
        {workspace:root,registry:startupInput.registry}),/workspace differs/);
      assert.equal(recoveryRegistry.state().readers.length,1);
      const recoveryArgs=[fileURLToPath(cli),"runtime-run","--registry",startupInput.registry,"--workspace",initWorkspace,"--","startup","recover",
        "--receipts",startupInput.receipts,"--task",recoveryTask.taskId,"--binding-digest",boundDigest,"--authority","fixture:lost-parent"];
      const recovered=JSON.parse(execFileSync(process.execPath,recoveryArgs,{encoding:"utf8",timeout:10000}));
      assert.equal(recovered.taskOutcome,"unknown");assert.equal(recoveryRegistry.state().readers.length,0);
      assert.deepEqual(recoverStartupOwner(startupInput.receipts,recoveryTask.taskId,boundDigest,"fixture:lost-parent"),recovered);
    }finally{recoveryTasks.close();recoveryRegistry.close();}

    await assert.rejects(runtimeOperationCommand("init",["--request-file",initRequestPath,"--project-plan",initPlanPath,
      "--operation-directory",join(root,"second-init")]),/existing installation/);
    assert.equal(existsSync(join(root,"second-init")),false);
    writeFileSync(result.executable, "throw new Error('changed payload must not execute');");
    assert.throws(() => inspectRuntimeGeneration(result.directory), /payload differs/);
    assert.equal(JSON.parse(readFileSync(join(result.directory, "installation.json"), "utf8")).state, "staged");
    assert.throws(() => stageRuntimeArchive(archive, { ...lock, version: "3.0.1" }, stages), /Candidate installation failed/);
    const records = readdirSync(stages).map(name => JSON.parse(readFileSync(join(stages, name, "installation.json"), "utf8")));
    assert.deepEqual(records.map(record => record.state).sort(), ["failed", "staged", "staged"]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
