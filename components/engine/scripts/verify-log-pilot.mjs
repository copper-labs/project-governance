import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const hash = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const completeLines = value => value.match(/[^\n]*\n|[^\n]+$/gu) ?? [];
const readCalls = path => existsSync(path) ? readFileSync(path, 'utf8').split('\n').filter(line => line.trim()).map(line => JSON.parse(line)) : [];
const callsFor = (path, consumer) => readCalls(path).filter(call => call.state?.consumers?.includes(consumer)).length;
export const LOG_PILOT_REQUIRED = ['ERROR: fixture.owner-identity expected current, observed previous', '  at fixtureOwner()',
  '  at fixtureCaller()', 'Result: fixture.owner-identity failed', 'Cleanup uncertainty: diagnostic resource observation is unavailable'];
export function logPilotTaskContext(workspace) {
  return { version: 1, workspace, taskId: 'installed-long-log', revision: '1',
    requirement: 'Diagnose the owner mismatch while preserving complete failure, result and cleanup evidence',
    acceptance: [], sourcePaths: ['tools/long-log-native.mjs'] };
}
const LOG_TEXT = ['Native log fixture started', ...Array.from({ length: 40 }, (_, index) => `DEBUG progress ${index} ${'.'.repeat(160)}`),
  ...LOG_PILOT_REQUIRED, 'Native log fixture finished'].join('\n\n') + '\n';

/** Validate independently fixed essential lines and exact original coordinates, never provider scores. */
export function verifyLogPilotOutput(output, original, receipt, required = LOG_PILOT_REQUIRED) {
  const originalDigest = hash(original), sourceLines = completeLines(original);
  assert.equal(output.source.digest, originalDigest); assert.equal(output.retrieval.digest, originalDigest);
  assert.equal(output.source.path, receipt.log); assert.equal(output.retrieval.path, receipt.log);
  assert.deepEqual(output.native, { state: receipt.state, exitCode: receipt.exitCode, signal: receipt.signal, cleanup: receipt.cleanup, reason: receipt.reason });
  assert.equal(output.native.state, 'failed'); assert.equal(output.native.exitCode, 1);
  assert.equal(output.source.windowTruncated, false); assert.equal(output.source.blocksTruncated, false);
  assert.equal(output.source.totalBytes, Buffer.byteLength(original)); assert.equal(output.source.capturedBytes, Buffer.byteLength(original));
  assert.ok(output.selection && output.delivered === true); assert.equal(output.selection.bytes, Buffer.byteLength(output.selection.text));
  for (const line of required) {
    assert.ok(output.selection.text.includes(line), `Complete required log evidence disappeared: ${line}`);
    const lineNumber = sourceLines.findIndex(value => value.replace(/\n$/u, '') === line) + 1;
    assert.ok(lineNumber > 0, 'The independently labelled essential line must exist in the native original');
    const block = output.source.ranges.find(range => range.firstLine <= lineNumber && range.lastLine >= lineNumber);
    assert.ok(block?.protected, `Required evidence is not code-protected at original line ${lineNumber}`);
    assert.ok(output.selection.blockIds.includes(block.id), 'The complete protected block must reach the presentation');
  }
  for (const range of output.source.ranges) {
    assert.ok(Number.isSafeInteger(range.firstLine) && Number.isSafeInteger(range.lastLine) && range.firstLine > 0 && range.lastLine >= range.firstLine && range.lastLine <= sourceLines.length);
    assert.equal(range.rangeDigest, hash(sourceLines.slice(range.firstLine - 1, range.lastLine).join('')));
  }
  for (const omission of output.omitted) {
    const range = output.source.ranges.find(item => item.id === omission.id);
    assert.ok(range && !range.protected); assert.equal(omission.within, 'log');
    assert.equal(omission.coordinateTextDigest, originalDigest); assert.equal(omission.rangeDigest, range.rangeDigest);
    assert.equal(omission.firstLine, range.firstLine); assert.equal(omission.lastLine, range.lastLine);
  }
  assert.ok(output.omitted.length > 0, 'This long fixture must exercise filtering');
  assert.equal('acceptedOutcome' in output, false, 'Presentation advice is not task acceptance');
  return { state: output.native.state, cleanup: output.native.cleanup, source_digest: originalDigest,
    original: output.retrieval, original_bytes: output.source.totalBytes, selected_bytes: output.selection.bytes,
    protected_ranges: output.source.ranges.filter(range => range.protected), omitted_ranges: output.omitted };
}

/** Run both conditions against one actual installed native log using only the caller's intercepted transport. */
export function verifyInstalledLogPilot({ packageRoot, repo, temporary, run, write, git, callsPath }) {
  const packageManifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
  const launcher = join(packageRoot, 'dist/engine/src/cli.js'), launcherDigest = hash(readFileSync(launcher));
  mkdirSync(join(repo, 'tools'), { recursive: true });
  const nativePath = join(repo, 'tools/long-log-native.mjs');
  writeFileSync(nativePath, `const expected='current', actual='previous';\nconsole.log(${JSON.stringify(LOG_TEXT.slice(0, -1))});\nprocess.exitCode=Number(expected!==actual);\n`);
  write('config/validation/packs/log-pilot.yaml', { id: 'log-pilot', enforcement: 'blocking', stages: ['log-pilot'], path_globs: ['tools/long-log-native.mjs'],
    commands: [{ run: [process.execPath, nativePath] }] });
  const taskContext = logPilotTaskContext(repo), taskContextPath = 'config/governance/log-pilot-context.json';
  write(taskContextPath, taskContext);
  git('add', 'tools/long-log-native.mjs', 'config/validation/packs/log-pilot.yaml', taskContextPath);
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'Freeze synthetic long-log pilot');
  const beforeNative = callsFor(callsPath, 'DL13');
  const checked = run(['check', '--stage', 'log-pilot', '--mode', 'all', '--pack', 'log-pilot', '--trigger', 'test', '--expected-status', 'failed', '--timeout-seconds', '10',
    '--decision-context', taskContextPath, '--decision-task', taskContext.taskId, '--decision-revision', taskContext.revision], 1);
  assert.equal(checked.status, 'failed'); assert.deepEqual(checked.plan.selected_packs, ['log-pilot']);
  const dispatch = JSON.parse(readFileSync(join(checked.run_directory, 'dispatch.json'), 'utf8'));
  assert.deepEqual(dispatch.decisionContext, taskContext, 'The native check must retain complete explicit synthetic task context');
  assert.equal(dispatch.taskBinding.source, 'context-file'); assert.equal(dispatch.taskBinding.status, 'bound');
  assert.equal(callsFor(callsPath, 'DL13'), beforeNative, 'Running the native check must not call the optional log selector');
  const resultPath = join(checked.run_directory, 'result.json'), resultBytes = readFileSync(resultPath);
  const retained = JSON.parse(resultBytes), command = retained.results[0].commands[0], receipt = command.command_receipt;
  assert.ok(receipt, 'The installed check must retain an actual native command receipt');
  assert.equal(receipt.state, 'failed'); assert.equal(receipt.exitCode, 1); assert.equal(receipt.cleanup, 'confirmed');
  const original = readFileSync(receipt.log, 'utf8'); assert.equal(original, LOG_TEXT);
  const unrequested = run(['check-output', '--run', checked.run_id], 1).outputs[0];
  assert.equal(unrequested.reason, 'log-pilot-not-requested'); assert.equal(unrequested.delivered, false); assert.equal(unrequested.selection.text, original);
  assert.equal(unrequested.decision, null); assert.equal(callsFor(callsPath, 'DL13'), beforeNative);
  const deterministic = run(['check-output', '--run', checked.run_id, '--log-pilot', 'deterministic'], 1).outputs[0];
  assert.equal(deterministic.pilot.arm, 'deterministic'); assert.equal(deterministic.decision, null);
  assert.equal(callsFor(callsPath, 'DL13'), beforeNative, 'The controlled deterministic arm must spend no model call');
  const deterministicProof = verifyLogPilotOutput(deterministic, original, receipt);
  const advised = run(['check-output', '--run', checked.run_id, '--log-pilot', 'jev'], 1).outputs[0];
  assert.equal(advised.pilot.arm, 'jev'); assert.equal(advised.decision.consumerId, 'DL13');
  assert.equal(advised.decision.providerCalled, true); assert.equal(advised.decision.delivered, true); assert.equal(advised.decision.method, 'jev');
  assert.equal(callsFor(callsPath, 'DL13'), beforeNative + 1, 'The JEV arm must issue exactly one intercepted fixture request');
  const jevProof = verifyLogPilotOutput(advised, original, receipt);
  // This fixture answers every optional question negatively; matching packets prove wiring, not benefit.
  assert.equal(advised.selection.text, deterministic.selection.text);
  const replay = run(['check-output', '--run', checked.run_id, '--log-pilot', 'jev'], 1).outputs[0];
  assert.equal(replay.decision.receiptId, advised.decision.receiptId); assert.equal(callsFor(callsPath, 'DL13'), beforeNative + 1);
  assert.deepEqual(readFileSync(resultPath), resultBytes); assert.equal(readFileSync(receipt.log, 'utf8'), original);
  const proof = { version: 1, kind: 'installed-dl13-long-log-proof', status: 'passed', run_id: checked.run_id,
    suite_version: 'installed-log-pilot-1', case_input_digest: hash(LOG_TEXT),
    expected_label_digest: hash(JSON.stringify({ expected_native_state: 'failed', required_lines: LOG_PILOT_REQUIRED, originals_unchanged: true })),
    task_context: { path: join(repo, taskContextPath), digest: hash(readFileSync(join(repo, taskContextPath))), binding: dispatch.taskBinding },
    package_version: packageManifest.version, launcher: { path: launcher, digest: launcherDigest },
    native_result: { path: resultPath, digest: hash(resultBytes), status: retained.status, request_digest: command.request_digest },
    no_pilot: { delivered: false, provider_calls: 0, original_preserved: true },
    arms: [{ arm: 'deterministic', provider_calls: 0, ...deterministicProof }, { arm: 'jev', provider_calls: 1, decision_receipt: advised.decision.receiptId, ...jevProof }],
    replay: { additional_provider_calls: 0, decision_receipt: replay.decision.receiptId }, provider: 'intercepted-fixture-only',
    semantic_accuracy: 'unqualified', accepted_task_benefit: 'unqualified', token_savings: null,
    retention: 'Original references were verified during proof and follow the existing temporary verifier retention policy' };
  const proofPath = join(temporary, 'installed-log-pilot-proof.json'); writeFileSync(proofPath, JSON.stringify(proof, null, 2) + '\n');
  return { ...proof, proof_path: proofPath };
}

/** Standalone offline public-command proof. Originals and failed attempts stay in caller-owned evidence. */
export function verifyLogPilot({ packageRoot, output }) {
  const checkout = realpathSync(fileURLToPath(new URL('../../..', import.meta.url))), requested = resolve(output);
  let ancestor = requested; while (!existsSync(ancestor)) ancestor = dirname(ancestor);
  const temporary = resolve(realpathSync(ancestor), relative(ancestor, requested)), fromCheckout = relative(checkout, temporary);
  if (!fromCheckout || !fromCheckout.startsWith('..') && !isAbsolute(fromCheckout)) throw new Error('Keep log proof evidence outside this checkout');
  assert.equal(existsSync(join(temporary, 'repo')), false, 'Use a fresh output directory');
  packageRoot = realpathSync(resolve(packageRoot));
  const cli = join(packageRoot, 'dist/engine/src/cli.js'); assert.ok(existsSync(cli), 'An installed compiled package is required');
  const repo = join(temporary, 'repo'), state = join(temporary, 'state'), callsPath = join(temporary, 'calls.jsonl'), preload = join(temporary, 'transport.mjs');
  mkdirSync(join(repo, 'config/governance'), { recursive: true }); mkdirSync(join(repo, 'config/validation/packs'), { recursive: true }); mkdirSync(state);
  const write = (path, value) => writeFileSync(join(repo, path), JSON.stringify(value, null, 2) + '\n');
  const git = (...args) => execFileSync('git', args, { cwd: repo, stdio: 'pipe' });
  write('config/governance/profile.yaml', { profile_id: 'synthetic-log-pilot', continuity: { decisions: { mode: 'auto',
    allowed_data_classes: ['diagnostic'], allowed_source_paths: ['**'], consumers: { DL13: { mode: 'auto' } } } } });
  write('config/governance/facts.lock.yaml', { profile_id: 'synthetic-log-pilot', facts: {} });
  git('init'); git('add', 'config'); git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'Freeze synthetic log policy');
  writeFileSync(preload, `import{appendFileSync}from'node:fs';globalThis.fetch=async(url,init)=>{\nif(String(url)!=='https://api.typesafe.ai/v1/systemone')throw Error('Unexpected network');\nconst payload=JSON.parse(init.body);if(!payload.state?.consumers?.includes('DL13'))throw Error('Unexpected proof consumer');\nappendFileSync(${JSON.stringify(callsPath)},JSON.stringify(payload)+'\\n');\nreturn Response.json({model:payload.model,usage:{input_tokens:100,output_tokens:10},answers:Object.fromEntries(Object.keys(payload.questions).map(id=>[id,{type:'noul',noul:0.1}]))});};\n`);
  const environment = { ...process.env, XDG_STATE_HOME: state, JEV_TOKEN: 'fixture-only' };
  for (const key of Object.keys(environment)) if (key.startsWith('GOVERNANCE_GENERATION_') || ['HARNESS_SESSION', 'CODEX_THREAD_ID'].includes(key)) delete environment[key];
  let commandNumber = 0;
  const run = (args, expectedStatus = 0) => {
    const number = commandNumber++, result = spawnSync(process.execPath, ['--import', preload, cli, ...args], { cwd: repo, env: environment,
      encoding: 'utf8', timeout: 60000, maxBuffer: 4 * 1024 * 1024 });
    writeFileSync(join(temporary, `command-${number}.stdout.json`), result.stdout ?? '');
    writeFileSync(join(temporary, `command-${number}.json`), JSON.stringify({ args, expectedStatus, status: result.status,
      error: result.error?.code ?? null, stderrDigest: hash(result.stderr ?? '') }, null, 2) + '\n');
    assert.equal(result.status, expectedStatus, `Installed command ${number} failed; inspect retained synthetic proof evidence`);
    assert.equal(result.error, undefined, `Installed command ${number} did not complete`);
    return JSON.parse(result.stdout);
  };
  try {
    const proof = verifyInstalledLogPilot({ packageRoot, repo, temporary, run, write, git, callsPath });
    return { ...proof, retention: 'Native originals, command outputs and intercepted fixture requests retained in the external proof directory' };
  } catch (error) {
    const proof = { version: 1, kind: 'installed-dl13-long-log-proof', status: 'failed', provider: 'intercepted-fixture-only',
      reason: error instanceof Error ? error.message : 'Proof did not complete', temporary, semantic_accuracy: 'unqualified',
      accepted_task_benefit: 'unqualified', token_savings: null, native_cleanup: 'inspect-retained-native-receipts' };
    writeFileSync(join(temporary, 'failed-proof.json'), JSON.stringify(proof, null, 2) + '\n');
    return { ...proof, proof_path: join(temporary, 'failed-proof.json') };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2), value = name => args.find(item => item.startsWith(`--${name}=`))?.slice(name.length + 3);
  if (!value('output') || args.some(item => !/^--(?:package|output)=.+$/u.test(item))) throw new Error('Use --package=<compiled-package-root> --output=<external-proof-directory>');
  const proof = verifyLogPilot({ packageRoot: value('package') ?? process.cwd(), output: value('output') });
  console.log(JSON.stringify({ status: proof.status, proof_path: proof.proof_path, arms: proof.arms?.map(item => ({ arm: item.arm, provider_calls: item.provider_calls })) }));
  process.exitCode = proof.status === 'passed' ? 0 : 1;
}
