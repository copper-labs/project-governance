import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Exercise recovery through the shipped launcher; a direct handler test cannot catch missing admission. */
export async function verifyCheckRecovery(pkg, installation, lock, root) {
  root = realpathSync(root);
  const { RuntimeGenerations } = await import(pathToFileURL(join(pkg, 'dist/engine/src/runtime-generations.js')).href);
  const { digest, durableJson } = await import(pathToFileURL(join(pkg, 'dist/engine/src/core.js')).href);
  const workspace = join(root, 'check-recovery-project'), state = join(root, 'check-recovery-state');
  const runsRoot = join(state, 'project-governance/check-runs'), id = randomUUID(), directory = join(runsRoot, id);
  const registry = join(workspace, 'generations.sqlite');
  mkdirSync(join(workspace, 'config/governance'), { recursive: true });
  writeFileSync(join(workspace, 'config/governance/runtime.lock.yaml'), JSON.stringify(lock));
  const generations = new RuntimeGenerations(registry);
  try {
    generations.activate(installation, 0);
    const held = { registry, ...generations.acquire(`check:${id}`) }, other = generations.acquire('unrelated-check');
    const plan = { execution_order: ['fixture'] }, scope = { subject: 'synthetic stopped check' }, packs = { fixture: {} };
    const pid = Number(execFileSync(process.execPath, ['-e', 'console.log(process.pid)'], { encoding: 'utf8' }));
    const request = { version: 1, id: `${id}:fixture:0`, operation: { cwd: workspace } }, hash = digest(request);
    const commandDirectory = join(directory, digest('fixture').slice(7), 'command-0');
    const resultPath = join(directory, 'result.json');
    durableJson(join(directory, 'dispatch.json'), { version: 1, id, root: workspace, runsRoot, generation: held, plan, scope, packs });
    durableJson(join(directory, 'run.json'), { version: 1, id, root: workspace, plan, scope, packs_digest: digest(packs), owner: { pid, fingerprint: 'exited-fixture' } });
    durableJson(resultPath, { version: 1, run_id: id, run_directory: directory, plan, status: 'failed', results: [{ pack_id: 'fixture', commands: [{ request_digest: hash }] }] });
    durableJson(join(commandDirectory, 'request.json'), request);
    const receipt = { version: 1, requestDigest: hash, state: 'failed', cleanup: 'unknown' };
    durableJson(join(commandDirectory, 'result.json'), receipt);
    const original = readFileSync(resultPath);
    const invoke = (command = 'check-reconcile', run = id) => spawnSync(process.execPath, [join(pkg, 'dist/engine/src/cli.js'), 'runtime-run', '--registry', registry,
      '--workspace', workspace, '--', command, '--run', run], { cwd: workspace, env: { ...process.env, XDG_STATE_HOME: state }, encoding: 'utf8', timeout: 10000 });
    const refused = invoke();
    assert.equal(refused.status, 2, refused.stderr);
    assert.equal(JSON.parse(refused.stdout).reason, 'Confirmed native command cleanup required');
    assert.deepEqual(generations.state().readers.map(row => row.owner).sort(), [held.owner, other.owner].sort());
    durableJson(join(commandDirectory, 'result.json'), { ...receipt, cleanup: 'confirmed' });
    const recovered = invoke();
    assert.equal(recovered.status, 0, recovered.stderr);
    assert.equal(JSON.parse(recovered.stdout).original_status, 'failed');
    assert.deepEqual(generations.state().readers.map(row => row.owner), [other.owner]);
    assert.deepEqual(readFileSync(resultPath), original);
    assert.equal(invoke().status, 0, 'Repeated recovery must retain the same failed result');
    const outputId = randomUUID();
    durableJson(join(runsRoot, outputId, 'run.json'), { version: 1, id: outputId, root: workspace, state: 'queued', owner: null, plan: { execution_order: [] } });
    const output = invoke('check-output', outputId);
    assert.equal(output.status, 2, output.stderr);
    assert.equal(JSON.parse(output.stdout).state, 'queued', 'Output selection must reach its existing handler through the launcher');
    assert.deepEqual(generations.state().readers.map(row => row.owner), [other.owner]);
    assert.equal(generations.state().written, true);
    generations.release(other.token, other.owner);
    return { status: 'passed', managedInvocation: 'write', uncertainCleanup: 'refused', originalFailure: 'preserved', unrelatedReservation: 'preserved', outputCommand: 'handler reached; no source selection or provider call' };
  } finally { generations.close(); }
}
