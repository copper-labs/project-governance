import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readOnlyProviderFixture } from './verify-provider-selection.mjs';

/** Existing workflow prerequisites and guarded provider admission, through installed public commands. */
export async function verifyConsultationJourney(packageRoot, archive) {
  const pkg = resolve(packageRoot), cli = join(pkg, 'dist/engine/src/cli.js');
  const manifest = JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8'));
  const host = await import(pathToFileURL(join(pkg, manifest.exports['./host/v1'].import)).href);
  const load = name => import(pathToFileURL(join(pkg, `dist/engine/src/${name}.js`)).href);
  const [{ authorizeProviderAssignment }, { authorizeProviderContinuation }, { commandEnvironment, processLiveFingerprint }, { commandProcesses }] = await Promise.all([
    load('provider-admission'), load('provider-continuation'), load('process-owner'), load('command-owner-recovery'),
  ]);
  const temporary = realpathSync(mkdtempSync(join(tmpdir(), 'governance-consultation-'))), state = join(temporary, 'state');
  const environment = { ...commandEnvironment({}), XDG_STATE_HOME: state };
  const cases = [], nativeRefusals = [], lost = [];
  let finished = false;
  const read = path => JSON.parse(readFileSync(path, 'utf8'));
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const until = async (predicate, label, budget = 5000) => {
    const deadline = performance.now() + budget;
    while (!predicate() && performance.now() < deadline) await pause(25);
    assert.ok(predicate(), label);
  };
  const invoke = (repo, label, args, expected) => {
    const result = spawnSync(process.execPath, [cli, ...args], { cwd: repo, env: environment, encoding: 'utf8', timeout: 45000, maxBuffer: 2 * 1024 * 1024 });
    writeFileSync(join(temporary, `${label}.stdout`), result.stdout ?? ''); writeFileSync(join(temporary, `${label}.stderr`), result.stderr ?? '');
    assert.notEqual(result.error?.code, 'ETIMEDOUT', `${label}: observation timeout is not a refusal or cleanup proof`);
    assert.equal(result.status, expected, result.stderr || result.error?.message || result.stdout);
    return result.stdout.trim() ? JSON.parse(result.stdout) : { error: result.stderr.trim() };
  };
  const dispatches = fixture => existsSync(fixture.dispatchesPath) ? readFileSync(fixture.dispatchesPath, 'utf8').trim().split('\n').map(JSON.parse) : [];
  const captureOwners = directory => {
    const owners = [];
    const walk = path => { if (!existsSync(path)) return; for (const entry of readdirSync(path, { withFileTypes: true })) {
      const file = join(path, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (['owner.json', 'guardian.json', 'run.json'].includes(entry.name)) {
        const value = read(file), owner = entry.name === 'run.json' ? value.owner : value;
        if (owner?.pid && owner.fingerprint) owners.push({ path: file, pid: owner.pid, fingerprint: owner.fingerprint });
      }
    } };
    walk(directory); return owners;
  };
  try {
    for (const label of ['success', 'check-failed', 'context-missing', 'source-drift', 'provider-unavailable', 'cleanup-unknown']) {
      const directory = join(temporary, label), repo = join(directory, 'repo');
      mkdirSync(join(repo, 'config/governance'), { recursive: true }); mkdirSync(join(repo, 'config/validation/packs'), { recursive: true });
      mkdirSync(join(repo, 'src')); mkdirSync(join(repo, 'tools'));
      for (const name of ['batch-check.mjs', 'batch-lifecycle.test.mjs']) copyFileSync(fileURLToPath(new URL(`../test/fixtures/${name}`, import.meta.url)), join(repo, 'tools', name));
      const sourcePath = join(repo, 'src/owner-lifecycle.mjs'), checker = join(repo, 'tools/batch-check.mjs');
      const good = 'export function releaseOwner(owners, owner, workspace) { return owners.filter(row => row.owner !== owner); }\n';
      const bad = 'export function releaseOwner(owners, owner, workspace) { return owners.filter(row => row.workspace !== workspace); }\n';
      const write = (path, value) => writeFileSync(join(repo, path), JSON.stringify(value));
      const fixture = readOnlyProviderFixture(join(directory, 'trusted'), 'src/owner-lifecycle.mjs');
      const database = join(directory, 'ledger.sqlite'), continuity = new host.Store(database), workflows = new host.WorkflowStore(database);
      const task = continuity.createTask('Release one fixture owner without releasing its sibling', [{ kind: 'scope', provenance: 'operator', body: repo }]);
      const provider = { id: label, provider: 'claude', workspace: repo, config: fixture.config, registry: fixture.registry, access: 'reader', requiredTools: ['read'],
        prompt: task.outcome, assignment: { role: 'reviewer', constraints: 'Read only; preserve original check evidence', context: '' }, deadlineMs: 10000, outputLimit: 100000,
        decision: { version: 1, workspace: repo, taskId: task.taskId, revision: String(task.version), requirement: task.outcome,
          acceptance: ['Use only exact checked source and retained original evidence'], sourcePaths: ['src/owner-lifecycle.mjs'] } };
      const admissionPath = join(directory, 'trusted/admission.json'), providerRequest = join(directory, 'trusted/request.json'), providerJob = join(directory, 'trusted/job');
      const ready = join(directory, 'batch-held');
      write('config/governance/profile.yaml', { profile_id: 'fixture', continuity: { decisions: { mode: 'off' } }, context_router: { default_route: 'review', routes: [{ id: 'review',
        primary_context: [label === 'context-missing' ? 'missing-rules.md' : 'rules.md', 'review-check.json'] }] } });
      write('config/governance/facts.lock.yaml', { profile_id: 'fixture', facts: {} });
      writeFileSync(join(repo, 'rules.md'), 'REQUIRED_CONSULTATION_MARKER: preserve original failures and release only owned claims.\n');
      const batchCode = `
        const {spawnSync}=require('node:child_process'),{readFileSync,writeFileSync}=require('node:fs'),{join}=require('node:path'),{createHash}=require('node:crypto');
        const output=join(process.env.PROJECT_GOVERNANCE_WORKFLOW_ARTIFACT_DIR,'batch-result.json');
        const result=spawnSync(process.execPath,[${JSON.stringify(cli)},'check','--stage','batch','--mode','impacted','--base-ref','HEAD','--summary','--trigger','test',
          '--decision-task',${JSON.stringify(task.taskId)},'--decision-revision',${JSON.stringify(String(task.version))},'--decision-purpose',${JSON.stringify(task.outcome)},
          '--timeout-seconds','15','--json-output',output],{encoding:'utf8',timeout:25000});
        process.stdout.write(result.stdout??'');process.stderr.write(result.stderr??'');
        if(result.status===0) {
          const check=JSON.parse(readFileSync(output)),packet=JSON.parse(readFileSync(join(check.run_directory,'packet/change-packet.json'))),original=join(check.run_directory,'result.json');
          const evidence={taskId:${JSON.stringify(task.taskId)},taskRevision:${JSON.stringify(task.version)},stage:'batch',requiredPacks:['fixture-lifecycle'],
            runId:check.run_id,subjectDigest:packet.subject_digest,original,originalDigest:'sha256:'+createHash('sha256').update(readFileSync(original)).digest('hex'),
            difference:packet.records.map(record=>({path:record.path,before:record.before_sha256,after:record.after_sha256}))};
          writeFileSync('review-check.json',JSON.stringify(evidence));
          ${label === 'source-drift' ? `writeFileSync(${JSON.stringify(sourcePath)},readFileSync(${JSON.stringify(sourcePath)},'utf8')+'// changed after the exact check\\n');` : ''}
          ${label === 'cleanup-unknown' ? `writeFileSync(${JSON.stringify(ready)},'exact check completed; supervisor cleanup is not complete');setInterval(()=>{},1000);` : ''}
        }
        process.exitCode=result.status??2;
      `;
      const reviewCode = `
        const {spawnSync}=require('node:child_process'),{readFileSync,writeFileSync}=require('node:fs'),{join}=require('node:path'),{createHash}=require('node:crypto');
        const prior=JSON.parse(process.env.PROJECT_GOVERNANCE_WORKFLOW_STAGE_ARTIFACTS_JSON),check=JSON.parse(readFileSync(join(prior.batch,'batch-result.json')));
        const original=join(check.run_directory,'result.json'),native=JSON.parse(readFileSync(original)),evidence=JSON.parse(readFileSync('review-check.json'));
        if(check.status!=='passed'||native.status!=='passed'||native.run_id!==evidence.runId||evidence.original!==original||
          evidence.originalDigest!=='sha256:'+createHash('sha256').update(readFileSync(original)).digest('hex'))throw Error('Exact passed check prerequisite unavailable');
        const invoke=args=>{const value=spawnSync(process.execPath,[${JSON.stringify(cli)},...args],{encoding:'utf8',timeout:35000});
          if(value.status!==0)throw Error(value.stderr||value.stdout||value.error?.message);return JSON.parse(value.stdout);};
        const submitted=invoke(['provider-submit','--request',${JSON.stringify(providerRequest)},'--directory',${JSON.stringify(providerJob)}]);
        const observed=invoke(['provider-wait','--directory',${JSON.stringify(providerJob)},'--digest',submitted.requestDigest,'--milliseconds','30000']);
        if(observed.receipt.state!=='succeeded'||observed.receipt.cleanup!=='confirmed')throw Error('Native consultation or cleanup unavailable');
        writeFileSync(join(process.env.PROJECT_GOVERNANCE_WORKFLOW_ARTIFACT_DIR,'consultation.json'),JSON.stringify({submitted,observed,check:evidence}));
        console.log(JSON.stringify({status:'passed',findings:[]}));
      `;
      write('config/governance/operations.json', { version: 1, operations: {
        batch: { argv: [process.execPath, '-e', batchCode], cwd: repo, env: { XDG_STATE_HOME: state }, effect: 'local' },
        review: { argv: [process.execPath, '-e', reviewCode], cwd: repo, env: { XDG_STATE_HOME: state }, effect: 'read' },
      } });
      write('config/validation/packs/fixture-lifecycle.yaml', { id: 'fixture-lifecycle', enforcement: 'blocking', stages: ['batch'], path_globs: ['src/owner-lifecycle.mjs'],
        change_packet_contract: 1, commands: [{ run: [process.execPath, checker, 'lifecycle'] }] });
      writeFileSync(sourcePath, good);
      const git = (...args) => execFileSync('git', args, { cwd: repo, env: environment, stdio: 'pipe' });
      git('init', '-q'); git('add', '.'); git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'Consultation fixture baseline');
      writeFileSync(sourcePath, label === 'check-failed' ? bad : good + '// exact consultation candidate\n');
      authorizeProviderAssignment({ store: database, taskId: task.taskId, path: admissionPath, request: provider });
      writeFileSync(providerRequest, JSON.stringify({ ...provider, admission: admissionPath }));
      let preflightReason = null;
      if (label === 'provider-unavailable') {
        rmSync(fixture.executable);
        const unavailable = invoke(repo, 'provider-unavailable-doctor', ['provider-doctor', '--request', providerRequest, '--directory', providerJob], 1);
        assert.equal(unavailable.reason, 'executable-unavailable'); assert.equal(unavailable.network, 'not-attempted');
        preflightReason = unavailable.reason;
      }
      const policy = host.defaultPolicy(), request = { operation: 'check', scope: [repo], targets: [], destination: null, policyRevision: policy.revision };
      const action = host.authorizeAction(continuity, host.proposeAction(continuity, task.taskId, request), request, policy, repo);
      const raw = { version: 1, id: 'checked-consultation', workspace: repo,
        inputs: ['src/owner-lifecycle.mjs', 'rules.md', 'config/governance/profile.yaml', 'config/governance/facts.lock.yaml', 'config/validation/packs/fixture-lifecycle.yaml', 'tools/batch-check.mjs', 'tools/batch-lifecycle.test.mjs']
          .map(path => ({ path, digest: host.fileDigest(join(repo, path)) })), resources: [],
        stages: [{ id: 'batch', operation: 'batch', deadlineMs: label === 'cleanup-unknown' ? 8000 : 20000 }, { id: 'review', operation: 'review', dependsOn: ['batch'], deadlineMs: 15000 }],
        deadlineMs: 45000, policyRevision: policy.revision, claims: ['Exact native check and confirmed cleanup precede controlled read-only consultation'] };
      const recipe = host.resolveWorkflowRecipe(raw), operationId = `consultation-${label}`, authority = 'host:synthetic-consultation';
      workflows.authorizeWorkflow({ taskId: task.taskId, taskVersion: task.version, actionId: action.actionId, authorityRef: authority, recipe, recipeDigest: host.recipeDigest(recipe), operationId });
      const recipePath = join(directory, 'recipe.json'); writeFileSync(recipePath, JSON.stringify(raw));
      let submitted;
      try {
        submitted = invoke(repo, `${label}-submit`, ['workflow-submit', '--database', database, '--task', task.taskId, '--task-version', String(task.version),
          '--action', action.actionId, '--recipe', recipePath, '--authority', authority, '--operation-id', operationId], 2);
        const commands = join(submitted.workerDirectory, 'commands'), batchDirectory = join(commands, `${submitted.run.id}-0`);
        if (label === 'cleanup-unknown') {
          await until(() => existsSync(ready) && ['launch.json', 'guardian.json', 'group-members.json'].every(name => existsSync(join(batchDirectory, name))), 'Owned held batch did not acknowledge launch');
          const launch = read(join(batchDirectory, 'launch.json')), guardian = read(join(batchDirectory, 'guardian.json')), nativeRequest = read(join(batchDirectory, 'request.json'));
          assert.equal(launch.requestDigest, host.digest(nativeRequest)); assert.equal(guardian.requestDigest, launch.requestDigest);
          lost.push({ repo, directory: batchDirectory, digest: launch.requestDigest, records: [guardian, launch.owner, launch.child] });
          for (const owner of [guardian, launch.owner]) {
            assert.equal(processLiveFingerprint(owner.pid), owner.fingerprint, 'Only the exact run-owned live supervisor may be faulted');
            process.kill(owner.pid, 'SIGKILL');
          }
        }
        const observed = invoke(repo, `${label}-wait`, ['workflow-wait', '--database', database, '--run', submitted.run.id, '--wait-ms', '30000'], label === 'success' ? 0 : 1);
        const expected = label === 'success' ? ['succeeded', 'succeeded'] : ['check-failed', 'source-drift'].includes(label) ? ['failed', 'blocked']
          : label === 'cleanup-unknown' ? ['unknown', 'blocked'] : ['succeeded', 'failed'];
        assert.deepEqual(observed.stages.map(stage => stage.state), expected);
        assert.equal(observed.run.state, label === 'success' ? 'succeeded' : label === 'cleanup-unknown' ? 'unknown' : 'failed');
        const summary = read(join(commands, `${submitted.run.id}-0-artifacts/batch-result.json`)), originalPath = join(summary.run_directory, 'result.json');
        const original = read(originalPath), originalBytes = readFileSync(originalPath), packet = read(join(summary.run_directory, 'packet/change-packet.json'));
        assert.equal(original.status, label === 'check-failed' ? 'failed' : 'passed'); assert.equal(original.run_id, summary.run_id);
        assert.deepEqual(summary.plan.selected_packs, ['fixture-lifecycle']);
        assert.equal(packet.records.length, 1); assert.equal(packet.records[0].path, 'src/owner-lifecycle.mjs');
        if (label === 'check-failed') assert.equal(original.results[0].commands[0].findings[0].rule_id, 'fixture.lifecycle-owner-isolation');
        if (label === 'source-drift') {
          assert.equal(observed.stages[0].result.inputValidity, 'stale');
          assert.notEqual(`sha256:${packet.records[0].after_sha256}`, host.fileDigest(sourcePath));
        }
        if (label === 'success') {
          assert.equal(dispatches(fixture).length, 1);
          const input = readFileSync(fixture.inputPath, 'utf8'), retained = read(join(providerJob, 'request.json'));
          const delivered = retained.decisionBinding.context;
          assert.equal(retained.provider.model, 'fixture-baseline'); assert.equal(retained.provider.effort, 'high'); assert.equal(retained.provider.access, 'reader');
          assert.equal(delivered.status, 'prepared-for-native-input'); assert.equal(delivered.scope.taskId, task.taskId);
          for (const marker of ['REQUIRED_CONSULTATION_MARKER', host.fileDigest(originalPath), packet.subject_digest, 'src/owner-lifecycle.mjs']) assert.ok(input.includes(marker), marker);
          for (const source of delivered.sources.filter(source => ['rules.md', 'review-check.json', 'src/owner-lifecycle.mjs'].includes(source.path)))
            assert.equal(source.digest, host.fileDigest(join(repo, source.path)));
          assert.equal(delivered.sources.filter(source => ['rules.md', 'review-check.json', 'src/owner-lifecycle.mjs'].includes(source.path)).length, 3);
          const providerReceipt = read(join(providerJob, 'result.json')), providerResult = read(providerReceipt.providerResult);
          assert.equal(providerReceipt.cleanup, 'confirmed'); assert.equal(providerResult.identity.model, 'fixture-baseline');
          assert.equal(providerResult.identity.permissions, 'dontAsk'); assert.equal(providerReceipt.providerResultDigest, host.fileDigest(providerReceipt.providerResult));
          const parentBytes = readFileSync(join(providerJob, 'result.json')), next = { id: 'source-drift-follow-up', prompt: 'Continue the same read-only consultation', directory: join(directory, 'trusted/stale-follow-up') };
          const continuation = join(directory, 'trusted/continuation.json');
          authorizeProviderContinuation({ parentDirectory: providerJob, parentDigest: providerReceipt.requestDigest, next, context: provider.decision, path: continuation });
          writeFileSync(sourcePath, readFileSync(sourcePath, 'utf8') + '// inherited context is stale\n');
          const followPath = join(directory, 'trusted/follow-up.json'); writeFileSync(followPath, JSON.stringify({ ...next, admission: continuation }));
          const follow = invoke(repo, 'source-drift-follow-up-submit', ['provider-follow-up', '--directory', providerJob, '--digest', providerReceipt.requestDigest, '--request', followPath], 0);
          const refused = invoke(repo, 'source-drift-follow-up-wait', ['provider-wait', '--directory', next.directory, '--digest', follow.requestDigest, '--milliseconds', '30000'], 1);
          assert.equal(refused.receipt.reason, 'provider-context-invalid'); assert.equal(refused.receipt.cleanup, 'confirmed');
          assert.equal(refused.receipt.exitCode, null); assert.equal(refused.receipt.logBytes, 0); assert.equal(existsSync(join(next.directory, 'launch.json')), false);
          assert.equal(dispatches(fixture).length, 1); assert.deepEqual(readFileSync(join(providerJob, 'result.json')), parentBytes);
          nativeRefusals.push({ case: 'inherited-source-drift', directory: next.directory, requestDigest: follow.requestDigest, reason: refused.receipt.reason,
            cleanup: refused.receipt.cleanup, exitCode: refused.receipt.exitCode, logBytes: refused.receipt.logBytes, nativeDispatched: false });
        } else {
          assert.equal(dispatches(fixture).length, 0, `${label}: refused prerequisites must never dispatch the native provider`);
          assert.equal(existsSync(providerJob), false);
          if (['check-failed', 'source-drift', 'cleanup-unknown'].includes(label)) assert.equal(existsSync(join(commands, `${submitted.run.id}-1`)), false);
          if (label === 'context-missing') assert.match(readFileSync(join(commands, `${submitted.run.id}-1/stderr.log`), 'utf8'), /context|missing-rules/i);
          if (label === 'provider-unavailable') assert.match(readFileSync(join(commands, `${submitted.run.id}-1/stderr.log`), 'utf8'), /"status":"failed"/);
        }
        let recovery = null;
        if (label === 'cleanup-unknown') {
          assert.equal(observed.stages[0].result.cleanup, 'unknown');
          writeFileSync(join(directory, 'original-unknown-workflow.json'), JSON.stringify(observed));
          const lostCommand = lost.at(-1);
          invoke(repo, 'cleanup-unknown-resume', ['command-resume-cleanup', '--directory', lostCommand.directory, '--digest', lostCommand.digest, '--authority', authority], 0);
          await until(() => existsSync(join(lostCommand.directory, 'result.json')) && !commandProcesses().some(row => lostCommand.records.some(owner => row.pid === owner.pid)), 'Supported cleanup did not retire the owned lost command');
          const receiptPath = join(lostCommand.directory, 'result.json'), receiptBytes = readFileSync(receiptPath), receipt = read(receiptPath);
          assert.equal(receipt.state, 'unknown'); assert.equal(receipt.reason, 'owner-lost'); assert.equal(receipt.cleanup, 'confirmed');
          await until(() => !commandProcesses().some(row => row.pid === read(join(submitted.workerDirectory, 'owner.json')).pid), 'Original workflow owner did not exit');
          recovery = invoke(repo, 'cleanup-unknown-workflow-resume', ['workflow-resume-cleanup', '--worker-directory', submitted.workerDirectory, '--database', database,
            '--run', submitted.run.id, '--revision', String(observed.run.revision)], 1);
          assert.equal(recovery.run.state, 'failed'); assert.deepEqual(recovery.stages.map(stage => stage.state), ['failed', 'blocked']);
          assert.equal(recovery.stages[0].result.commandOutcome, 'unknown'); assert.equal(recovery.stages[0].result.cleanup, 'confirmed');
          assert.deepEqual(readFileSync(receiptPath), receiptBytes, 'Cleanup cannot manufacture successful original execution');
          assert.equal(dispatches(fixture).length, 0);
        }
        assert.deepEqual(readFileSync(originalPath), originalBytes);
        const resources = new host.ResourceRegistry(fixture.registry);
        try { assert.ok(resources.inspect().every(resource => resource.state === 'released')); } finally { resources.close(); }
        cases.push({ case: label, state: observed.run.state, stages: observed.stages.map(stage => ({ id: stage.id, state: stage.state, cleanup: stage.result?.cleanup ?? null })),
          taskId: task.taskId, workflow: submitted.run.id, workerDirectory: submitted.workerDirectory, originalCheck: originalPath, originalCheckDigest: host.fileDigest(originalPath),
          subjectDigest: packet.subject_digest, nativeDispatches: dispatches(fixture).length, nativeDispatchLog: fixture.dispatchesPath,
          providerJob: existsSync(providerJob) ? providerJob : null, preflightReason, recoveredState: recovery?.run.state ?? null });
      } finally { workflows.close(); continuity.close(); }
    }
    finished = true;
  } catch (error) { error.proofDirectory = temporary; throw error; }
  finally {
    // Only exact run-owned processes are signaled; supported recovery writes its own cleanup evidence.
    for (const job of lost) {
      for (const record of job.records) if (processLiveFingerprint(record.pid) === record.fingerprint) process.kill(record.pid, 'SIGKILL');
      if (!existsSync(join(job.directory, 'owner-recovery.json'))) {
        try { invoke(job.repo, 'failed-proof-owned-cleanup', ['command-resume-cleanup', '--directory', job.directory, '--digest', job.digest, '--authority', 'host:synthetic-fixture-cleanup'], 0); }
        catch (error) { console.error(`Owned consultation cleanup requires inspection: ${error.message}`); }
      }
    }
    const owners = captureOwners(temporary);
    await until(() => !commandProcesses().some(row => owners.some(owner => row.pid === owner.pid)), 'Recorded consultation writers must exit before proof closeout');
    writeFileSync(join(temporary, 'cleanup.json'), JSON.stringify({ confirmed: true, owners }));
    if (!finished) console.error(`Consultation failure evidence retained: ${temporary}`);
  }
  const receipt = { status: 'passed', version: manifest.version, launcher: cli, launcherDigest: host.fileDigest(cli),
    archive: archive ? { path: resolve(archive), digest: host.fileDigest(resolve(archive)) } : null,
    evidenceDirectory: temporary, cases, nativeRefusals, cleanup: join(temporary, 'cleanup.json'), provider: 'synthetic-controlled-read-only',
    limits: ['Trusted-host task/admission setup is synthetic', 'No real Claude/model calls or host read-tool enforcement qualification',
      'Exact declared fixture inputs only; no universal candidate completeness or semantic acceptance', 'Previous development payload proof; final frozen major archive remains V5'] };
  writeFileSync(join(temporary, 'receipt.json'), JSON.stringify(receipt)); return receipt;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  console.log(JSON.stringify(await verifyConsultationJourney(process.argv[2] ?? process.cwd(), process.argv[3])));
