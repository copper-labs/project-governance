import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const json = path => JSON.parse(readFileSync(path, 'utf8'));
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');

/** Own the temporary Git process environment and preserve authored file/index observations. */
function createFixture(evidence) {
  const workspace = join(evidence, 'project'), state = join(evidence, 'state');
  const environment = { PATH: process.env.PATH, XDG_STATE_HOME: state,
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: join(evidence, 'gitconfig') };
  writeFileSync(environment.GIT_CONFIG_GLOBAL, '');
  mkdirSync(workspace);
  const call = (executable, args, cwd = workspace) => spawnSync(executable, args, {
    cwd, env: environment, encoding: 'utf8', timeout: 60000, maxBuffer: 4 * 1024 * 1024,
  });
  const run = (executable, args, cwd = workspace) => {
    const result = call(executable, args, cwd);
    assert.equal(result.status, 0, result.stderr || result.error?.message || result.stdout);
    return result.stdout.trim();
  };
  const git = (...args) => run('git', ['--no-optional-locks', ...args]);
  const snapshot = () => ({ head: git('rev-parse', 'HEAD'), index: hash(join(workspace, '.git/index')),
    live: hash(join(workspace, 'candidate.txt')), retained: hash(join(workspace, 'retained.txt')),
    integration: git('rev-parse', 'refs/heads/integration') });
  return { evidence, workspace, environment, call, run, git, snapshot,
    remote: join(evidence, 'remote.git'), registry: join(evidence, 'registry.sqlite'),
    runs: join(state, 'project-governance/check-runs'),
    launcher: join(workspace, '.governance/runtime/bin/project-governance') };
}

/** Install the exact archive through its public initial-installation operation. */
async function installFixtureRuntime(fixture, packageRoot, archive) {
  const { workspace, evidence, registry, git, run } = fixture;
  git('init', '-q', '--initial-branch=integration');
  git('config', 'user.name', 'Fixture');
  git('config', 'user.email', 'fixture@example.invalid');
  const { runtimeMigrationPlan } = await import(pathToFileURL(join(packageRoot, 'dist/engine/src/runtime-migration-plan.js')).href);
  const plan = runtimeMigrationPlan(workspace), manifest = json(join(packageRoot, 'package.json'));
  const lock = { schema_version: 2, package: manifest.name, version: manifest.version,
    artifact: { url: pathToFileURL(archive).href,
      integrity: 'sha512-' + createHash('sha512').update(readFileSync(archive)).digest('base64') },
    source_commit: 'a'.repeat(40), node: manifest.engines.node, configuration_schema: 1 };
  const planPath = join(evidence, 'plan.json'), requestPath = join(evidence, 'request.json');
  writeFileSync(planPath, JSON.stringify(plan));
  writeFileSync(requestPath, JSON.stringify({ mode: 'init', workspace, registry, archive, lock,
    expectedRevision: 0, inputs: plan.inputs, hostPlan: plan.hostPlan }));
  run(process.execPath, [join(packageRoot, 'dist/engine/src/cli.js'), 'init', '--request-file', requestPath,
    '--project-plan', planPath, '--operation-directory', join(evidence, 'installation')]);
  return manifest.version;
}

/** Declare a required native check and form exact remote, candidate and unrelated local histories. */
function prepareFixtureHistory({ workspace, remote, evidence, git, run, call, launcher }) {
  mkdirSync(join(workspace, 'config/validation/packs'), { recursive: true });
  writeFileSync(join(workspace, 'config/validation/packs/first-push.yaml'), JSON.stringify({
    id: 'first-push-proof', enforcement: 'blocking', stages: ['pre-push'], run_when: 'matched',
    path_globs: ['candidate.txt'], depends_on: [], commands: [{ run: [process.execPath, '-e',
      "require('node:fs').writeFileSync('.governance/first-push-command','completed\\n'); console.log(JSON.stringify({status:'passed',findings:[]}))"] }],
  }));
  writeFileSync(join(workspace, 'candidate.txt'), 'base\n');
  git('add', '.');
  git('commit', '-qm', 'Establish the fixture base');
  const base = git('rev-parse', 'HEAD');
  run('git', ['init', '-q', '--bare', remote], evidence);
  git('remote', 'add', 'origin', remote);
  git('push', '-q', 'origin', 'integration');
  git('switch', '-q', '--no-track', '-c', 'topic');
  git('config', 'push.default', 'upstream');
  writeFileSync(join(workspace, 'candidate.txt'), 'candidate\n');
  git('commit', '-qam', 'Prepare the first candidate');
  const candidate = git('rev-parse', 'HEAD');
  const localIntegration = git('commit-tree', `${base}^{tree}`, '-p', base, '-m', 'Retain separate integration work');
  git('update-ref', 'refs/heads/integration', localIntegration);
  assert.notEqual(localIntegration, candidate);
  assert.equal(JSON.parse(run(launcher, ['hooks', '--apply', '--configure'])).ready, true);
  assert.notEqual(call('git', ['rev-parse', '--verify', '@{upstream}']).status, 0);
  writeFileSync(join(workspace, 'candidate.txt'), 'intentional staged input\n');
  git('add', 'candidate.txt');
  writeFileSync(join(workspace, 'candidate.txt'), 'intentional live input\n');
  writeFileSync(join(workspace, 'retained.txt'), 'intentional untracked input\n');
  return { base, candidate };
}

/** Refuse an absent comparison or invalid declaration before a native check can be created. */
function verifyPreparationRefusals({ call, evidence, runs, snapshot, workspace, environment }, preparation, before) {
  const missing = call('git', ['push', '--set-upstream', 'origin', 'refs/heads/topic:refs/heads/topic']);
  writeFileSync(join(evidence, 'missing-target.log'), missing.stdout + missing.stderr);
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /pre-push-base-unavailable/);
  assert.ok(!existsSync(runs));
  assert.deepEqual(snapshot(), before);
  for (const declaredTarget of ['', 'origin/missing']) {
    const refused = spawnSync('/bin/sh', ['-eu', '-c', preparation], {
      cwd: workspace, env: { ...environment, declared_target: declaredTarget }, encoding: 'utf8', timeout: 10000,
    });
    assert.notEqual(refused.status, 0);
    assert.notEqual(call('git', ['rev-parse', '--verify', '@{upstream}']).status, 0);
    assert.ok(!existsSync(runs));
    assert.deepEqual(snapshot(), before);
  }
}

/** Read original terminal receipts and the bare ref to establish complete managed publication. */
function verifyPublishedCandidate({ runs, workspace, remote, run, git, evidence }, { base, candidate }) {
  const ids = readdirSync(runs).filter(id => existsSync(join(runs, id, 'dispatch.json')));
  assert.equal(ids.length, 1, 'One ordinary push must dispatch exactly one check');
  const directory = join(runs, ids[0]), dispatch = json(join(directory, 'dispatch.json'));
  const result = json(join(directory, 'result.json'));
  assert.equal(dispatch.trigger, 'hook');
  assert.equal(dispatch.scope.base_ref, base);
  assert.equal(dispatch.scope.candidate_ref, candidate);
  assert.equal(result.status, 'passed');
  assert.equal(result.termination_reason, 'completed');
  assert.equal(result.results.length, dispatch.plan.execution_order.length);
  assert.ok(result.results.every(pack => pack.status === 'passed'));
  assert.ok(dispatch.plan.selected_packs.includes('first-push-proof'));
  assert.equal(readFileSync(join(workspace, '.governance/first-push-command'), 'utf8'), 'completed\n');
  const commands = result.results.flatMap(pack => pack.commands ?? []).filter(command => command.command_receipt);
  assert.equal(commands.length, 1);
  assert.ok(commands.every(command => command.command_receipt.cleanup === 'confirmed'), JSON.stringify(commands));
  const published = run('git', ['--git-dir', remote, 'for-each-ref', '--format=%(refname) %(objectname)', 'refs/heads/'], evidence);
  assert.deepEqual(published.split('\n').sort(), [`refs/heads/integration ${base}`, `refs/heads/topic ${candidate}`]);
  assert.equal(git('rev-parse', '--symbolic-full-name', '@{upstream}'), 'refs/remotes/origin/topic');
  return { runId: ids[0], selectedPacks: dispatch.plan.selected_packs };
}

/** Release only quiescent owned Git fixtures; retain original receipts and installation evidence. */
async function closeFixture({ registry, workspace, remote }, packageRoot) {
  const { RuntimeGenerations } = await import(pathToFileURL(join(packageRoot, 'dist/engine/src/runtime-generations.js')).href);
  const generations = new RuntimeGenerations(registry);
  try {
    const state = generations.state();
    if (state.readers.length || state.maintenance !== null) return { fixtureCleanup: 'retained-active' };
    rmSync(workspace, { recursive: true, force: true });
    rmSync(remote, { recursive: true, force: true });
    return { fixtureCleanup: 'complete', readers: 0, maintenance: null };
  } finally { generations.close(); }
}

/** Run the shipped preparation and ordinary managed push against an owned local bare remote. */
export async function verifyFirstPush(packageRoot, archive, evidence) {
  evidence = realpathSync(evidence);
  const fixture = createFixture(evidence);
  const report = { status: 'started', evidenceDirectory: evidence, sourceIdentity: 'synthetic local fixture' };
  let pushCompleted = false;
  try {
    const runtimeVersion = await installFixtureRuntime(fixture, packageRoot, archive);
    const endpoints = prepareFixtureHistory(fixture), before = fixture.snapshot();
    const skill = readFileSync(join(packageRoot, 'dist/engine/assets/skills/work/SKILL.md'), 'utf8');
    const preparation = skill.match(/^   (git branch --set-upstream-to="\$declared_target")$/mu)?.[1];
    assert.ok(preparation, 'Packaged Work entry must prepare the declared target');
    verifyPreparationRefusals(fixture, preparation, before);
    const prepared = spawnSync('/bin/sh', ['-eu', '-c', preparation], {
      cwd: fixture.workspace, env: { ...fixture.environment, declared_target: 'origin/integration' }, encoding: 'utf8', timeout: 10000,
    });
    assert.equal(prepared.status, 0, prepared.stderr);
    assert.equal(fixture.git('rev-parse', '@{upstream}'), endpoints.base);
    const pushed = fixture.call('git', ['push', '--set-upstream', 'origin', 'refs/heads/topic:refs/heads/topic']);
    writeFileSync(join(evidence, 'normal-push.log'), pushed.stdout + pushed.stderr);
    assert.equal(pushed.status, 0, pushed.stderr);
    pushCompleted = true;
    const terminal = verifyPublishedCandidate(fixture, endpoints);
    assert.deepEqual(fixture.snapshot(), before);
    Object.assign(report, { status: 'passed', runtimeVersion, ...endpoints, ...terminal,
      declaredTarget: 'origin/integration', allSelectedChecks: 'passed/completed', nativeCommandCleanup: 'confirmed',
      missingAndInvalidTargets: 'refused before dispatch', preparation: 'packaged Work entry',
      ordinaryPush: 'managed hook; no comparison environment override',
      featureDestination: 'refs/heads/topic', remoteIntegrationRefPreserved: true,
      stagedLiveUntrackedPreserved: true, unrelatedLocalRefPreserved: true });
  } catch (error) {
    report.error = error.message;
    throw error;
  } finally {
    if (pushCompleted) Object.assign(report, await closeFixture(fixture, packageRoot));
    writeFileSync(join(evidence, 'first-push-proof.json'), JSON.stringify(report, null, 2) + '\n');
  }
  assert.equal(report.fixtureCleanup, 'complete');
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const archive = realpathSync(process.argv[2]), evidence = realpathSync(mkdtempSync(join(tmpdir(), 'governance-first-push-proof-')));
  const installed = join(evidence, 'installed');
  execFileSync('npm', ['install', '--prefix', installed, '--offline', '--ignore-scripts', '--no-audit', '--no-fund', archive],
    { stdio: 'pipe', timeout: 60000 });
  console.log(JSON.stringify(await verifyFirstPush(join(installed, 'node_modules/@organta/project-governance'), archive, evidence)));
}
