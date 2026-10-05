import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { verifyConsultationJourney } from './verify-consultation-journey.mjs';

/** Installed public workflow/check proof. The final step prepares evidence for a synthetic review. */
export async function verifyBatchReview(packageRoot, archive) {
  const pkg = resolve(packageRoot), manifest = JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8'));
  const cli = join(pkg, 'dist/engine/src/cli.js');
  assert.equal(manifest.name, '@organta/project-governance');
  const host = await import(pathToFileURL(join(pkg, manifest.exports['./host/v1'].import)).href);
  assert.equal(host.HOST_API_VERSION, 1);
  const { commandEnvironment, processLiveFingerprint } = await import(pathToFileURL(join(pkg, 'dist/engine/src/process-owner.js')).href);
  const temporary = realpathSync(mkdtempSync(join(tmpdir(), 'governance-batch-review-'))), repo = join(temporary, 'repo'), state = join(temporary, 'state');
  mkdirSync(join(repo, 'config/governance'), { recursive: true }); mkdirSync(join(repo, 'config/validation/packs'), { recursive: true });
  mkdirSync(join(repo, 'src')); mkdirSync(join(repo, 'tools'));
  for (const name of ['batch-check.mjs', 'batch-lifecycle.test.mjs']) copyFileSync(fileURLToPath(new URL(`../test/fixtures/${name}`, import.meta.url)), join(repo, 'tools', name));
  const environment = { ...commandEnvironment({}), XDG_STATE_HOME: state };
  const checker = join(repo, 'tools/batch-check.mjs'), sourcePath = join(repo, 'src/owner-lifecycle.mjs');
  const good = 'export function releaseOwner(owners, owner, workspace) { return owners.filter(row => row.owner !== owner); }\n';
  const bad = 'export function releaseOwner(owners, owner, workspace) { return owners.filter(row => row.workspace !== workspace); }\n';
  const write = (path, value) => writeFileSync(join(repo, path), JSON.stringify(value));
  const git = (...args) => execFileSync('git', args, { cwd: repo, stdio: 'pipe' });
  const invoke = (label, args, expected) => {
    const response = spawnSync(process.execPath, [cli, ...args], { cwd: repo, env: environment, encoding: 'utf8', timeout: 45000, maxBuffer: 2 * 1024 * 1024 });
    writeFileSync(join(temporary, `${label}.stdout`), response.stdout ?? ''); writeFileSync(join(temporary, `${label}.stderr`), response.stderr ?? '');
    assert.equal(response.status, expected, response.stderr || response.error?.message);
    return JSON.parse(response.stdout);
  };
  // Bind the existing CLI's output to its workflow artifact directory without replacing its runner.
  const batchCode = `
    const {spawnSync}=require('node:child_process'),{join}=require('node:path');
    const result=spawnSync(process.execPath,[${JSON.stringify(cli)},'check','--stage','batch','--mode','impacted','--base-ref','HEAD',
      '--summary','--trigger','test','--timeout-seconds','15','--json-output',join(process.env.PROJECT_GOVERNANCE_WORKFLOW_ARTIFACT_DIR,'batch-result.json')],
      {encoding:'utf8',timeout:25000});
    process.stdout.write(result.stdout??'');process.stderr.write(result.stderr??'');
    process.exitCode=result.status??2;
  `;
  write('config/governance/profile.yaml', { continuity: { decisions: { mode: 'off' } } });
  write('config/governance/operations.json', { version: 1, operations: {
    batch: { argv: [process.execPath, '-e', batchCode], cwd: repo, env: { XDG_STATE_HOME: state }, effect: 'local' },
    review: { argv: [process.execPath, checker, 'review'], cwd: repo, effect: 'read' },
  } });
  write('config/validation/packs/fixture-lifecycle.yaml', { id: 'fixture-lifecycle', enforcement: 'blocking', stages: ['batch'],
    path_globs: ['src/owner-lifecycle.mjs'], change_packet_contract: 1, commands: [{ run: [process.execPath, checker, 'lifecycle'] }] });
  writeFileSync(sourcePath, good);
  git('init', '-q'); git('add', '.'); git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'Synthetic batch-review baseline');
  const database = join(temporary, 'ledger.sqlite'), continuity = new host.Store(database), store = new host.WorkflowStore(database), cases = [];
  let finished = false;
  try {
    for (const [label, source, expected] of [['fault', bad, 'failed'], ['corrected', good + '// corrected candidate\n', 'succeeded']]) {
      writeFileSync(sourcePath, source);
      const policy = host.defaultPolicy(), task = continuity.createTask('Release one fixture owner without releasing its sibling', [{ kind: 'scope', provenance: 'operator', body: repo }]);
      const request = { operation: 'check', scope: [repo], targets: [], destination: null, policyRevision: policy.revision };
      const action = host.authorizeAction(continuity, host.proposeAction(continuity, task.taskId, request), request, policy, repo);
      const rawRecipe = { version: 1, id: 'batch-before-review', workspace: repo, inputs: [{ path: 'src/owner-lifecycle.mjs', digest: host.fileDigest(sourcePath) }], resources: [],
        stages: [{ id: 'batch', operation: 'batch', deadlineMs: 20000 }, { id: 'review', operation: 'review', dependsOn: ['batch'], deadlineMs: 5000 }],
        deadlineMs: 30000, policyRevision: policy.revision, claims: ['Batch precedes synthetic read-only review preparation'] };
      const recipe = host.resolveWorkflowRecipe(rawRecipe), operationId = `fixture-batch-review-${label}`, authority = 'host:synthetic-fixture';
      store.authorizeWorkflow({ taskId: task.taskId, taskVersion: task.version, actionId: action.actionId, authorityRef: authority,
        recipe, recipeDigest: host.recipeDigest(recipe), operationId });
      const recipePath = join(temporary, `${label}-recipe.json`); writeFileSync(recipePath, JSON.stringify(rawRecipe));
      const submitted = invoke(`${label}-submit`, ['workflow-submit', '--database', database, '--task', task.taskId, '--task-version', String(task.version),
        '--action', action.actionId, '--recipe', recipePath, '--authority', authority, '--operation-id', operationId], 2);
      const observed = invoke(`${label}-wait`, ['workflow-wait', '--database', database, '--run', submitted.run.id, '--wait-ms', '30000'], expected === 'failed' ? 1 : 0);
      assert.equal(observed.run.state, expected);
      assert.deepEqual(observed.stages.map(stage => stage.state), expected === 'failed' ? ['failed', 'blocked'] : ['succeeded', 'succeeded']);
      const commands = join(submitted.workerDirectory, 'commands'), batchDirectory = join(commands, `${submitted.run.id}-0-artifacts`);
      const early = JSON.parse(readFileSync(join(batchDirectory, 'batch-result.json'), 'utf8'));
      assert.deepEqual(early.plan.selected_packs, ['fixture-lifecycle']);
      const originalPath = join(early.run_directory, 'result.json'), originalBytes = readFileSync(originalPath), original = JSON.parse(originalBytes);
      assert.equal(original.run_id, early.run_id); assert.equal(original.status, expected === 'failed' ? 'failed' : 'passed');
      const packet = JSON.parse(readFileSync(join(early.run_directory, 'packet/change-packet.json'), 'utf8'));
      assert.equal(packet.records.length, 1); assert.equal(packet.records[0].path, 'src/owner-lifecycle.mjs');
      assert.equal(readFileSync(packet.records[0].after_path, 'utf8'), source);
      assert.equal(`sha256:${packet.records[0].after_sha256}`, host.fileDigest(sourcePath));
      const testEvidence = JSON.parse(original.results[0].commands[0].stdout).evidence;
      assert.equal(testEvidence.subject_digest, packet.subject_digest);
      assert.equal(testEvidence.test_exit_code, expected === 'failed' ? 1 : 0);
      const tap = readFileSync(testEvidence.original, 'utf8');
      assert.match(tap, expected === 'failed' ? /not ok 1 - release keeps another owner in the same worktree/ : /ok 1 - release keeps another owner in the same worktree/);
      const reviewPath = join(commands, `${submitted.run.id}-1-artifacts/review-input.json`);
      if (expected === 'failed') {
        assert.equal(original.results[0].commands[0].findings[0].rule_id, 'fixture.lifecycle-owner-isolation');
        assert.equal(existsSync(join(commands, `${submitted.run.id}-1`)), false, 'The review command must never be dispatched after a failing batch');
        assert.equal(existsSync(reviewPath), false);
      } else {
        const review = JSON.parse(readFileSync(reviewPath, 'utf8'));
        assert.equal(review.run_id, early.run_id); assert.equal(review.subject_digest, packet.subject_digest);
        assert.deepEqual(review.difference, packet.records.map(record => ({ path: record.path, before_sha256: record.before_sha256, after_sha256: record.after_sha256 })));
        assert.equal(review.original_result, originalPath);
        assert.deepEqual(review.unknowns, ['No semantic reviewer was invoked']);
      }
      assert.deepEqual(readFileSync(originalPath), originalBytes, 'Review preparation must preserve the retained native result');
      assert.ok(observed.stages.filter(stage => stage.result).every(stage => stage.result.cleanup === 'confirmed'));
      cases.push({ label, workflow_run: submitted.run.id, state: observed.run.state, stages: observed.stages.map(stage => ({ id: stage.id, state: stage.state })),
        worker_directory: submitted.workerDirectory, check_run: early.run_id, subject_digest: packet.subject_digest, original_result: originalPath,
        executed_test: testEvidence.original, review_input: expected === 'failed' ? null : reviewPath });
    }
    finished = true;
  } finally {
    store.close(); continuity.close();
    const owners = [];
    const walk = directory => { if (!existsSync(directory)) return; for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (['owner.json', 'guardian.json', 'run.json'].includes(entry.name)) {
        const value = JSON.parse(readFileSync(path, 'utf8')), owner = entry.name === 'run.json' ? value.owner : value;
        if (owner?.pid && owner.fingerprint) owners.push({ path, pid: owner.pid, fingerprint: owner.fingerprint });
      }
    } };
    walk(state);
    const live = () => owners.some(owner => processLiveFingerprint(owner.pid) === owner.fingerprint), deadline = Date.now() + 5000;
    while (live() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
    const cleanup = { confirmed: !live(), owners: owners.map(owner => ({ ...owner, live: processLiveFingerprint(owner.pid) === owner.fingerprint })) };
    writeFileSync(join(temporary, 'cleanup.json'), JSON.stringify(cleanup));
    if (!finished) console.error(`Installed batch-review failure evidence retained: ${temporary}`);
    assert.equal(cleanup.confirmed, true, 'Recorded writers must exit before proof closeout');
  }
  const consultation = await verifyConsultationJourney(pkg, archive);
  const receipt = { status: 'passed', version: manifest.version, launcher: cli, launcher_digest: host.fileDigest(cli),
    archive: archive ? { path: resolve(archive), digest: host.fileDigest(resolve(archive)) } : null,
    evidence_directory: temporary, cases, consultation, cleanup: join(temporary, 'cleanup.json'), provider: 'synthetic-controlled-read-only',
    entry: 'Installed workflow-submit/workflow-wait with installed check --stage batch',
    limits: ['Synthetic target module and trusted-host task setup', 'Review preparation and controlled provider fixture only; no semantic reviewer', 'No desktop prompt/Stop automation or adopter qualification'] };
  writeFileSync(join(temporary, 'receipt.json'), JSON.stringify(receipt));
  return receipt;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  console.log(JSON.stringify(await verifyBatchReview(process.argv[2] ?? process.cwd(), process.argv[3])));
