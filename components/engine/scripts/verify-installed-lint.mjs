import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const identity = path => ({ path, sha256: hash(readFileSync(path)) });

/** Inspect original execution evidence, never a summary or an inferred backend pass. */
export function inspectInstalledLintCase({ resultPath, packId, backend, expected, sourcePath, sourceBytes, configPath, configBytes }) {
  const original = readFileSync(resultPath), result = JSON.parse(original);
  assert.equal(result.kind, 'project-governance-check-run'); assert.equal(result.status, expected);
  assert.deepEqual(result.plan.selected_packs, [packId]); assert.equal(result.termination_reason, 'completed');
  const command = result.results.find(pack => pack.pack_id === packId)?.commands[0]; assert.ok(command);
  assert.equal(command.exit_code, 0); assert.equal(command.process_failure, false); assert.equal(command.integrity_failure, false);
  assert.equal(command.command_receipt.cleanup, 'confirmed'); assert.equal(command.command_receipt.state, 'succeeded');
  assert.equal(command.input_manifest.status, 'complete'); assert.equal(command.input_manifest.version, 1);
  assert.equal(command.input_manifest.input_mode, 'staged'); assert.equal(command.input_manifest.tool.backend, backend);
  assert.ok(command.findings.every(finding => finding.path === sourcePath));
  if (expected === 'failed') assert.ok(command.findings.some(finding => finding.severity === 'blocking' && finding.rule_id === (backend === 'ruff' ? 'lint.ruff.F821' : 'lint.eslint.no-dupe-keys')));
  else assert.deepEqual(command.findings, []);
  const packDirectory = dirname(dirname(command.lint_evidence.path)), evidence = join(packDirectory, 'evidence');
  assert.equal(command.lint_evidence.path, join(evidence, 'lint-result.json'));
  const detail = read(command.lint_evidence.path), inputsPath = join(evidence, 'lint-inputs.json'), inputs = read(inputsPath);
  assert.deepEqual(command.input_manifest, detail.input_manifest);
  assert.deepEqual(command.input_manifest.files, inputs.snapshots.map(entry => ({ path: entry.path, sha256: entry.sha256 })));
  assert.equal(detail.backend, backend); assert.equal(detail.backend_version, backend === 'ruff' ? '0.15.14' : '9.39.1');
  assert.equal(detail.input_mode, 'staged'); assert.equal(detail.subject_digest, result.plan.subject_digest ?? read(join(result.run_directory, 'run.json')).scope.subject_digest);
  assert.ok(detail.checked_count > 0); assert.equal(detail.checked_count, detail.selected_count);
  for (const [path, bytes] of [[sourcePath, sourceBytes], [configPath, configBytes]]) {
    const captured = inputs.snapshots.find(entry => entry.path === path); assert.ok(captured, `Missing captured input ${path}`);
    assert.equal(captured.snapshot, join(evidence, 'candidate', path)); assert.equal(realpathSync(captured.snapshot), captured.snapshot);
    assert.equal(captured.sha256, hash(bytes)); assert.deepEqual(readFileSync(captured.snapshot), Buffer.from(bytes));
    assert.ok(command.input_manifest.files.some(entry => entry.path === path && entry.sha256 === hash(bytes)));
  }
  const native = detail.native_results.map((entry, index) => {
    const path = join(evidence, `lint-native-${index + 1}.json`); assert.deepEqual(read(path), entry); return identity(path);
  });
  assert.ok(native.length >= 2); assert.equal(detail.native_results.at(-1).exit_code, expected === 'failed' ? 1 : 0);
  const receiptPath = join(packDirectory, 'command-0/result.json'); assert.deepEqual(read(receiptPath), command.command_receipt);
  const requestPath = join(packDirectory, 'command-0/request.json'); assert.equal(command.request_digest, command.command_receipt.requestDigest);
  const manifestPath = join(evidence, 'evidence-manifest.json'), manifest = read(manifestPath);
  assert.equal(manifest.subject_digest, detail.subject_digest); assert.equal(result.results.find(pack => pack.pack_id === packId).evidence_manifest.status, 'valid');
  assert.ok(manifest.claims[0].artifact_digests.includes(`sha256:${hash(readFileSync(command.lint_evidence.path))}`));
  assert.deepEqual(readFileSync(resultPath), original, 'Inspection must preserve the original result');
  return { status: expected, run_id: result.run_id, subject_digest: detail.subject_digest, selected_paths: detail.selected_paths,
    original_result: identity(resultPath), native_receipt: identity(receiptPath), native_request: identity(requestPath),
    lint_result: identity(command.lint_evidence.path), input_manifest: identity(inputsPath), evidence_manifest: identity(manifestPath), native_results: native, cleanup: 'confirmed' };
}

/** Two disposable installed projects qualify actual backends; no provider or package acquisition. */
export async function verifyInstalledLint(packageRoot, archive, toolRoot, { receiptRoot, ruffExecutable } = {}) {
  const pkg = realpathSync(resolve(packageRoot)), tools = realpathSync(resolve(toolRoot)), archivePath = realpathSync(resolve(archive));
  const manifest = read(join(pkg, 'package.json')); assert.equal(manifest.name, '@organta/project-governance');
  assert.equal(read(join(tools, 'node_modules/eslint/package.json')).version, '9.39.1');
  assert.equal(read(join(tools, 'node_modules/@typescript-eslint/parser/package.json')).version, '8.46.4');
  assert.ok(existsSync(join(tools, 'package-lock.json')), 'Explicit tool root must retain its installed dependency lock');
  const load = name => import(pathToFileURL(join(pkg, `dist/engine/src/${name}.js`)).href);
  const [{ runtimeMigrationPlan }, { RuntimeGenerations }, { commandEnvironment }, { commandExecutable }, yaml] = await Promise.all([
    load('runtime-migration-plan'), load('runtime-generations'), load('process-owner'), load('native-check-command'), import(pathToFileURL(join(pkg, 'node_modules/yaml/dist/index.js')).href),
  ]);
  const ruff = commandExecutable(ruffExecutable ?? 'ruff', tools);
  assert.equal(execFileSync(ruff, ['--version'], { encoding: 'utf8', env: commandEnvironment({}) }).trim(), 'ruff 0.15.14');
  const temporary = receiptRoot ? realpathSync(resolve(receiptRoot)) : realpathSync(mkdtempSync(join(tmpdir(), 'governance-installed-lint-')));
  assert.ok(temporary !== pkg && temporary !== tools && !temporary.startsWith(pkg + '/') && !temporary.startsWith(tools + '/'), 'Proof evidence belongs outside the package/tool checkout');
  assert.deepEqual(readdirSync(temporary), [], 'Explicit proof directory must be empty');
  const cli = join(pkg, 'dist/engine/src/cli.js'), dispatches = [], cases = [], installations = [];
  const environment = { ...commandEnvironment({}), XDG_STATE_HOME: join(temporary, 'state') };
  // The declared direct Ruff binary is the first PATH entry; the installed helper still owns execution.
  environment.PATH = `${dirname(ruff)}:${environment.PATH ?? ''}`;
  const write = (repo, path, content) => { mkdirSync(dirname(join(repo, path)), { recursive: true }); writeFileSync(join(repo, path), content); };
  const invoke = (repo, label, command, args, expected = 0) => {
    const started = performance.now(), result = spawnSync(command, args, { cwd: repo, env: environment, encoding: 'utf8', timeout: 60000, maxBuffer: 8 * 1024 * 1024 });
    const record = { label, command, args, exit_code: result.status, signal: result.signal, timed_out: result.error?.code === 'ETIMEDOUT', elapsed_ms: Math.round(performance.now() - started) };
    dispatches.push(record); writeFileSync(join(temporary, `${label}.stdout`), result.stdout ?? ''); writeFileSync(join(temporary, `${label}.stderr`), result.stderr ?? '');
    writeFileSync(join(temporary, 'dispatches.json'), JSON.stringify(dispatches, null, 2) + '\n');
    assert.equal(record.timed_out, false, `${label} exceeded its command deadline`);
    assert.equal(result.status, expected, `${label}: ${result.stderr || result.error?.message || result.stdout}`);
    return JSON.parse(result.stdout);
  };
  const install = async backend => {
    const repo = join(temporary, backend), registry = join(temporary, `${backend}.sqlite`); mkdirSync(repo);
    execFileSync('git', ['init', '-q'], { cwd: repo, stdio: 'pipe', env: environment });
    const plan = runtimeMigrationPlan(repo), planFile = join(temporary, `${backend}-init-plan.json`), requestFile = join(temporary, `${backend}-init-request.json`);
    const lock = { schema_version: 2, package: manifest.name, version: manifest.version, artifact: { url: pathToFileURL(archivePath).href,
      integrity: 'sha512-' + createHash('sha512').update(readFileSync(archivePath)).digest('base64') }, source_commit: 'a'.repeat(40), node: manifest.engines.node, configuration_schema: 1 };
    writeFileSync(planFile, JSON.stringify(plan)); writeFileSync(requestFile, JSON.stringify({ mode: 'init', workspace: repo, registry, archive: archivePath, lock,
      expectedRevision: 0, inputs: plan.inputs, hostPlan: plan.hostPlan }));
    assert.equal(invoke(repo, `${backend}-init`, process.execPath, [cli, 'init', '--request-file', requestFile, '--project-plan', planFile, '--operation-directory', join(temporary, `${backend}-init-operation`)]).state.maintenance, null);
    const launcher = join(repo, '.governance/runtime/bin/project-governance');
    const record = { repo, registry, launcher }; installations.push(record); return record;
  };
  try {
    for (const backend of ['ruff', 'eslint']) {
      const { repo, registry, launcher } = await install(backend), git = (...args) => execFileSync('git', args, { cwd: repo, env: environment, stdio: 'pipe' });
      const sourcePath = backend === 'ruff' ? 'src/example.py' : 'src/example.ts', packId = `lint-${backend}-src`, configPath = backend === 'ruff' ? 'src/ruff.toml' : 'src/eslint.config.mjs';
      const clean = backend === 'ruff' ? 'value = 1\n' : 'const value: number = 1; const object = { one: value };\n';
      const fault = backend === 'ruff' ? 'undefined_name\n' : 'const value: number = 1; const object = { one: value, one: 2 };\n';
      write(repo, '.gitignore', '.governance/\nnode_modules/\n'); write(repo, sourcePath, clean);
      if (backend === 'eslint') {
        cpSync(join(tools, 'node_modules'), join(repo, 'node_modules'), { recursive: true, dereference: false });
        write(repo, 'package.json', readFileSync(join(tools, 'package.json'))); write(repo, 'package-lock.json', readFileSync(join(tools, 'package-lock.json')));
      }
      const setupArgs = ['lint', 'setup', '--root', 'src', '--include-dependencies'];
      const proposal = invoke(repo, `${backend}-setup-proposal`, launcher, setupArgs); assert.deepEqual(proposal.findings, []);
      assert.equal(invoke(repo, `${backend}-setup-apply`, launcher, [...setupArgs, '--apply', '--plan-digest', proposal.plan_digest]).status, 'installed');
      const repeat = invoke(repo, `${backend}-setup-repeat`, launcher, setupArgs); assert.deepEqual(repeat.files, []); assert.deepEqual(repeat.findings, []);
      const profilePath = 'config/governance/profile.yaml', profile = yaml.parse(readFileSync(join(repo, profilePath), 'utf8'));
      profile.continuity = { decisions: { mode: 'off' } }; write(repo, profilePath, yaml.stringify(profile));
      assert.equal(invoke(repo, `${backend}-doctor`, launcher, ['doctor', '--capability', 'lint']).status, 'ready');
      const config = readFileSync(join(repo, configPath)), tracked = ['src', profilePath, `config/validation/packs/${packId}.yaml`, '.gitignore', ...(backend === 'eslint' ? ['package.json', 'package-lock.json'] : [])];
      git('add', '--', ...tracked);
      const checkArgs = ['check', '--stage', 'pre-commit', '--mode', 'impacted', '--staged', '--pack', packId, '--trigger', 'test', '--timeout-seconds', '30'];
      for (const [label, stagedSource, expected, liveSource] of [['clean', clean, 'passed', clean], ['fault', fault, 'failed', clean], ['corrected', clean + (backend === 'ruff' ? '# corrected\n' : '// corrected\n'), 'passed', fault]]) {
        write(repo, sourcePath, stagedSource); write(repo, configPath, config); git('add', '--', sourcePath, configPath);
        write(repo, sourcePath, liveSource);
        write(repo, configPath, backend === 'ruff' ? '[lint]\nselect=[]\n' : 'export default [{files:["**/*.ts"],rules:{}}];\n');
        const live = git('diff', '--binary'), index = readFileSync(join(repo, '.git/index')), source = readFileSync(join(repo, sourcePath)), liveConfig = readFileSync(join(repo, configPath));
        const plan = invoke(repo, `${backend}-${label}-plan`, launcher, ['plan', ...checkArgs.slice(1, checkArgs.indexOf('--trigger'))]); assert.equal(plan.status, 'ready'); assert.deepEqual(plan.selected_packs, [packId]);
        const checked = invoke(repo, `${backend}-${label}-check`, launcher, checkArgs, expected === 'failed' ? 1 : 0);
        assert.deepEqual(readFileSync(join(repo, '.git/index')), index); assert.deepEqual(git('diff', '--binary'), live);
        assert.deepEqual(readFileSync(join(repo, sourcePath)), source); assert.deepEqual(readFileSync(join(repo, configPath)), liveConfig);
        const evidence = inspectInstalledLintCase({ resultPath: join(checked.run_directory, 'result.json'), packId, backend, expected, sourcePath, sourceBytes: stagedSource, configPath, configBytes: config });
        const generations = new RuntimeGenerations(registry); try { assert.equal(generations.state().readers.length, 0); assert.equal(generations.state().maintenance, null); } finally { generations.close(); }
        cases.push({ backend, label, entry: [launcher, ...checkArgs], index_preserved: true, live_source_and_config_preserved: true, ...evidence });
      }
    }
    const receipt = { version: 1, suite: 'installed-real-lint-backends', status: 'passed', runtime_version: manifest.version, package_root: pkg,
      archive: identity(archivePath), tool_root: tools, tools: { ruff: { executable: ruff, version: '0.15.14' }, eslint: '9.39.1', typescript_parser: '8.46.4' },
      receipt_directory: temporary, cases, dispatches: identity(join(temporary, 'dispatches.json')), acquisition: 'not-performed', providers: 'not-used',
      evidence_boundary: 'Synthetic disposable installed backend qualification, including first-commit staged/live source and configuration opposition; not accepted ordinary tasks, live adopters, benefit evaluation or release provenance.' };
    const receiptPath = join(temporary, 'installed-lint-receipt.json'); writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
    return { ...receipt, receipt_path: receiptPath };
  } catch (error) {
    writeFileSync(join(temporary, 'failure.json'), JSON.stringify({ status: 'failed', message: error.message, cases, dispatches }, null, 2) + '\n');
    error.proofDirectory = temporary; throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [packageRoot, archive, toolRoot, receiptRoot] = process.argv.slice(2);
  if (!packageRoot || !archive || !toolRoot) throw new Error('Expected packageRoot archive toolRoot [existing outside-checkout receiptRoot]');
  console.log(JSON.stringify(await verifyInstalledLint(packageRoot, archive, toolRoot, { ...(receiptRoot ? { receiptRoot } : {}) })));
}
