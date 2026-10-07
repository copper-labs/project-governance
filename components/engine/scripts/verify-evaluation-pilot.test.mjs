import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { evaluationPilotDefinition, evaluationExecutionOrder, interpretEvaluationCheckpoint, fixtureEvaluationAnswers, evaluationFixturePng,
  evaluationWrapperSource, optionalCallerWrapperSource, scanCredentialCanaries, assertEvaluationEnvelope, assertManagedEvaluationInvocation, assertEvaluationCheckCoverage, writeEvaluationProviderFixture, evaluationProofOutput, verifyEvaluationPilot } from './verify-evaluation-pilot.mjs';
import { assertUnselectedOptionalCore, unselectedNetworkGuard } from './verify-unselected-experiment.mjs';
import { verifyDecisionPilot } from './verify-decision-pilot.mjs';
import { inspectStaticImage } from '../src/evaluation-images.ts';
import { requestForTrial, derivativeProvenance } from '../test/fixtures/optional-computer-use/evaluate.ts';

const result = (status = 'answered', choice = 'matches') => ({ version: 3, kind: 'supplied-evaluation', evaluationId: 'fixture', requestId: 'request', receiptId: 'receipt',
  effect: 'advise', status: 'complete', answers: { checkpoint: { status, shape: 'choice', choice } }, evidence: [], association: null, coverage: {}, timing: {}, usage: {} });

test('installed evaluator cases freeze wiring coverage independently of provider answers', () => {
  const definition = evaluationPilotDefinition(); assert.equal(definition.cases.length, 20); assert.equal(new Set(definition.cases).size, 20);
  assert.deepEqual(definition.cases.slice(-6), ['optional-caller-unavailable', 'optional-caller-native-failure', 'optional-selected-absent', 'required-selected-absent', 'managed-local-only', 'unselected-optional-core']);
  assert.equal(definition.limits.externalCalls, 0); assert.equal(definition.limits.visualAccuracy, 'unqualified');
  assert.deepEqual(evaluationExecutionOrder().toSorted(), definition.cases.toSorted());
  assert.equal(evaluationExecutionOrder().at(-1), 'outage');
  assert.ok(evaluationExecutionOrder().indexOf('optional-caller-native-failure') < evaluationExecutionOrder().indexOf('outage'),
    'An actual outage cooldown must not contaminate the later positive caller proof');
});

test('standalone evaluator rejects a missing explicit staged generation before fixture work', async t => {
  const root = mkdtempSync(join(tmpdir(), 'evaluation-no-generation-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  const output = join(root, 'proof');
  await assert.rejects(verifyEvaluationPilot(join(root, 'not-installed'), { output }), /explicit verified staged generation/);
  await assert.rejects(verifyDecisionPilot(join(root, 'not-installed')), /explicit verified staged generation/);
  assert.equal(existsSync(output), false);
});

test('unselected proof requires actual startup, resume, native selection and untouched optional paths', () => {
  const report = { startup: { action: 'reserve', reason: 'initial-startup', discovery: 'complete', result: { status: 'manual' }, taskId: 'startup', root: '/caller' },
    resumedStartup: { action: 'reserve', reason: 'existing-task', taskId: 'startup', root: '/caller' }, task: { taskId: 'task' }, checkpoint: { checkpointId: 'checkpoint', attemptId: 'attempt' },
    resumed: { ok: true, workspace: { worktree: '/caller', withinTaskScope: true }, task: { taskId: 'task' }, checkpoint: { checkpointId: 'checkpoint' }, attempt: { attemptId: 'attempt' } },
    checked: { status: 'passed', plan: { selected_packs: ['independent'], execution_order: ['independent'], changed_paths: ['src/native.fixture'],
      omitted_packs: { 'optional-experiment': 'not selected by the requested scope' } },
      results: [{ pack_id: 'independent', commands: [{ command_receipt: { cleanup: 'confirmed' } }] }] },
    optionalEntered: false, networkOrDependencyTouched: false, corePayloadUnchanged: true, optionalDependenciesInstalled: false,
    finalGeneration: { readers: [], maintenance: null } };
  assertUnselectedOptionalCore(report);
  for (const field of ['optionalEntered', 'networkOrDependencyTouched', 'optionalDependenciesInstalled'])
    assert.throws(() => assertUnselectedOptionalCore({ ...report, [field]: true }));
  assert.throws(() => assertUnselectedOptionalCore({ ...report, startup: { action: 'defer', reason: 'native-owner-unavailable' } }));
  assert.throws(() => assertUnselectedOptionalCore({ ...report, resumed: { ...report.resumed, checkpoint: null } }));
  assert.throws(() => assertUnselectedOptionalCore({ ...report, checked: { ...report.checked, plan: { ...report.checked.plan, selected_packs: ['independent', 'optional-experiment'] } } }));
  assert.throws(() => assertUnselectedOptionalCore({ ...report, finalGeneration: { readers: [{ token: 'held' }], maintenance: null } }));
});

test('unselected tripwires reject network and optional dependency loads before effects', t => {
  const root = mkdtempSync(join(tmpdir(), 'unselected-tripwire-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  const optional = join(root, 'optional'); mkdirSync(optional);
  const loaded = join(root, 'optional-loaded'); writeFileSync(join(optional, 'caller.mjs'), `import{writeFileSync}from'node:fs';writeFileSync(${JSON.stringify(loaded)},'loaded');`);
  for (const [kind, code] of [['network-fetch', "await fetch('http://127.0.0.1:1')"],
    ['optional-dependency', "await import('playwright')"], ['optional-dependency', `await import(${JSON.stringify(join(optional, 'caller.mjs'))})`]]) {
    const journal = join(root, `${kind}-${Math.random()}.jsonl`), guard = join(root, 'guard.mjs'); writeFileSync(guard, unselectedNetworkGuard(journal, optional));
    const child = spawnSync(process.execPath, ['--import', guard, '--input-type=module', '-e', code], { encoding: 'utf8', env: { PATH: process.env.PATH } });
    assert.equal(child.status, 1); assert.match(child.stderr, /Unselected experiment touched/);
    assert.deepEqual(JSON.parse(readFileSync(journal, 'utf8')), { kind }); assert.equal(existsSync(loaded), false);
  }
});

test('project visual advice preserves native failures and unresolved required proof', () => {
  assert.equal(interpretEvaluationCheckpoint(result()).status, 'passed');
  assert.equal(interpretEvaluationCheckpoint(result(), { nativeStatus: 'failed' }).status, 'failed');
  for (const status of ['unknown', 'refused', 'invalid', 'unavailable']) {
    assert.equal(interpretEvaluationCheckpoint(result(status)).status, 'warning');
    assert.equal(interpretEvaluationCheckpoint(result(status), { required: true }).status, 'failed');
  }
  assert.equal(interpretEvaluationCheckpoint(result('answered', 'defect')).status, 'warning');
  assert.equal(interpretEvaluationCheckpoint(result('answered', 'defect'), { required: true }).status, 'failed');
  assert.equal(interpretEvaluationCheckpoint(null).status, 'warning');
});

test('installed native process failure preserves selection while ordinary credential failure permits an independent check', () => {
  // Captured selected/ordered/result shape from the actual installed process-failure trial.
  const failed = { plan: { selected_packs: ['evaluation', 'independent'], execution_order: ['evaluation', 'independent'] },
    results: [{ pack_id: 'evaluation', status: 'failed', commands: [{ status: 'failed', exit_code: 1, process_failure: true }] }] };
  assert.equal(assertEvaluationCheckCoverage(failed, true), 'not-run-after-native-process-failure');
  assert.throws(() => assertEvaluationCheckCoverage(failed));
  assert.throws(() => assertEvaluationCheckCoverage({ ...failed, plan: { ...failed.plan, selected_packs: ['evaluation'] } }, true));
  const credential = { ...failed, results: [{ pack_id: 'evaluation', status: 'failed', commands: [{ status: 'failed', exit_code: null, process_failure: false, termination_reason: 'credential-unavailable' }] },
    { pack_id: 'independent', status: 'passed', commands: [] }] };
  assert.equal(assertEvaluationCheckCoverage(credential), 'passed');
  assert.throws(() => assertEvaluationCheckCoverage({ ...credential, results: credential.results.slice(0, 1) }));
});

test('fixture creates valid static media and typed OpenAI distributions, including unknown', () => {
  assert.deepEqual(inspectStaticImage(evaluationFixturePng()), { mediaType: 'image/png', width: 1, height: 1 });
  assert.deepEqual(inspectStaticImage(evaluationFixturePng(0, { width: 2, height: 2 })), { mediaType: 'image/png', width: 2, height: 2 });
  assert.notDeepEqual(evaluationFixturePng(), evaluationFixturePng(255));
  const questions = [{ name: 'checkpoint', type: 'choice', choices: [{ value: 'matches' }, { value: 'defect' }, { value: 'unknown' }] }];
  for (const disposition of ['positive', 'defect', 'unknown']) {
    const answer = fixtureEvaluationAnswers(questions, disposition)[0];
    assert.equal(answer.probabilities.reduce((sum, item) => sum + item.probability, 0), 1);
    assert.equal(answer.probabilities.find(item => item.value === answer.choice).probability, 1);
  }
  assert.equal(fixtureEvaluationAnswers(questions, 'refusal')[0].type, 'refusal');
});

test('native wrapper explicitly preloads each child and never promotes exit zero to assertion pass', () => {
  const source = evaluationWrapperSource({ cli: '/installed/cli.js', preload: '/fixture/transport.mjs', state: '/fixture/state', requestPath: '/fixture/request.json' });
  assert.match(source, /spawnSync\(process.execPath,\['--import'/); assert.match(source, /PROJECT_GOVERNANCE_RUN_ID/);
  assert.match(source, /PROJECT_GOVERNANCE_EVIDENCE_ROOT/); assert.match(source, /evaluatorExitCode:child.status/);
  assert.doesNotMatch(source, /child.status===0\?'passed'/);
});

test('generated explicit child transport returns fixture answers and records no raw credential or evidence', t => {
  const root = mkdtempSync(join(tmpdir(), 'evaluation-child-fixture-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  const preload = join(root, 'preload.mjs'), calls = join(root, 'calls.jsonl'), canary = 'isolated-synthetic-key';
  writeEvaluationProviderFixture(preload, calls, 'sha256:' + createHash('sha256').update(canary).digest('hex'));
  const code = `const r=await fetch('https://api.openai.com/v1/decisions',{headers:{authorization:'Bearer '+process.env.OPENAI_API_KEY},body:JSON.stringify({model:'gpt-6-luna',input:'fixture-original-evidence',questions:[{name:'checkpoint',type:'choice',instructions:'fixture-case=unknown',choices:[{value:'matches'},{value:'defect'},{value:'unknown'}]}]})});console.log(JSON.stringify(await r.json()));`;
  const response = JSON.parse(execFileSync(process.execPath, ['--import', preload, '--input-type=module', '-e', code], { encoding: 'utf8', env: { PATH: process.env.PATH, OPENAI_API_KEY: canary } }));
  assert.equal(response.answers[0].choice, 'unknown'); assert.equal(response.usage.input_tokens, 40);
  assert.equal(scanCredentialCanaries(root, [canary, 'fixture-original-evidence']).rawValuesAbsent, true);
});

test('raw artifact scan covers saved environments and binary files without leaking canary values', t => {
  const root = mkdtempSync(join(tmpdir(), 'evaluation-canary-scan-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, 'request.json'), JSON.stringify({ credentialEnv: ['OPENAI_API_KEY'], env: {} }));
  assert.equal(scanCredentialCanaries(root, ['secret-canary']).rawValuesAbsent, true);
  writeFileSync(join(root, 'budget.sqlite'), Buffer.from('prefix\0secret-canary\0suffix'));
  assert.throws(() => scanCredentialCanaries(root, ['secret-canary']), /Credential canary persisted/);
});

test('installed assessor distinguishes a taskless v3 result from leaked task authority or old shapes', () => {
  assert.equal(assertEvaluationEnvelope(result(), 'fixture').effect, 'advise');
  assert.throws(() => assertEvaluationEnvelope({ ...result(), association: { taskId: 'invented' } }, 'fixture'), /taskless/);
  assert.throws(() => assertEvaluationEnvelope({ ...result(), version: 2 }, 'fixture'));
  assert.throws(() => assertEvaluationEnvelope({ ...result(), effect: 'authorize' }, 'fixture'));
});

test('managed evaluator proof distinguishes unavailable disclosure from unsupported admission and unwritten generation', () => {
  const before = { directory: '/exact/staged/generation', revision: 1, written: false, readers: [], maintenance: null },
    after = { ...before, written: true }, local = { ...result('unavailable'), status: 'unavailable', receiptId: null,
      reason: 'hosted-provider-local-only', providerCalled: false };
  assertManagedEvaluationInvocation(local, 'fixture', before, after);
  assert.throws(() => assertManagedEvaluationInvocation(local, 'fixture', before, before));
  assert.throws(() => assertManagedEvaluationInvocation({ ...local, reason: 'unsupported-command' }, 'fixture', before, after));
  assert.throws(() => assertManagedEvaluationInvocation(local, 'fixture', before, { ...after, readers: [{ token: 'unreleased' }] }));
  assert.throws(() => assertManagedEvaluationInvocation({ ...local, providerCalled: true }, 'fixture', before, after));
});

test('installed proof refuses source, installed-payload and adopter output before writing', t => {
  const root = mkdtempSync(join(tmpdir(), 'evaluation-output-custody-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  const pkg = join(root, 'package'), adopter = join(root, 'adopter'); mkdirSync(pkg); mkdirSync(adopter); mkdirSync(join(adopter, '.git'));
  assert.throws(() => evaluationProofOutput(pkg, join(process.cwd(), 'proof-output')), /outside source/);
  assert.throws(() => evaluationProofOutput(pkg, join(pkg, 'proof-output')), /outside source/);
  assert.throws(() => evaluationProofOutput(pkg, join(adopter, 'proof-output')), /existing project/);
  assert.ok(evaluationProofOutput(pkg, join(root, 'external-output')).endsWith('/external-output'));
});

test('actual optional caller projects a frozen derivative path without native readback or labels', t => {
  const root = mkdtempSync(join(tmpdir(), 'evaluation-caller-request-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  const image = join(root, 'prepared.png'), bytes = evaluationFixturePng(), digest = createHash('sha256').update(bytes).digest('hex'); writeFileSync(image, bytes);
  const trial = { scenario: 'settings', nativeState: { oracle: 'private-readback' }, checkpoints: [{ id: 'after', independentLabel: true, image: { path: image, digest } }] };
  const request = requestForTrial(trial, root, 'caller-wiring'); assert.deepEqual(request.evidence.map(item => item.path), ['prepared.png']);
  assert.equal(JSON.stringify(request).includes('private-readback'), false); assert.equal(JSON.stringify(request).includes('independentLabel'), false);
  assert.equal(request.questions[0].name, 'checkpoint-after');
  const provenance = derivativeProvenance({ digest: 'original', width: 2, height: 2 }, bytes, { kind: 'resize', width: 1, height: 1 }, { x: 0, y: 0, width: 2, height: 2 });
  assert.equal(provenance.derivedSha256, digest); assert.equal(provenance.controlCaptureChanged, false); assert.equal(provenance.tokenSavings, null);
  assert.throws(() => requestForTrial({ ...trial, checkpoints: [{ id: 'after', image: { path: image, digest: 'stale' } }] }, root, 'bad'), /capture-provenance-invalid/);
});

test('optional wrapper runs the actual caller adapter and credential-free driver projection child', t => {
  const root = mkdtempSync(join(tmpdir(), 'evaluation-caller-wrapper-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  const canary = 'synthetic-optional-only', image = join(root, 'prepared.png'), bytes = evaluationFixturePng(),
    digest = createHash('sha256').update(bytes).digest('hex'); writeFileSync(image, bytes);
  const preload = join(root, 'preload.mjs'); writeFileSync(preload, "globalThis.fetch=()=>{throw Error('Unit fixture must not use a network transport')};\n");
  const cli = join(root, 'unit-cli.mjs');
  writeFileSync(cli, `import assert from 'node:assert/strict';import{readFileSync}from'node:fs';import{createHash}from'node:crypto';
const request=JSON.parse(readFileSync(process.argv.at(-1),'utf8'));assert.equal(Boolean(process.env.OPENAI_API_KEY),!request.localOnly);assert.ok(!process.env.JEV_TOKEN&&!process.env.ENGINE_UNSELECTED_TOKEN);
console.log(JSON.stringify({version:3,kind:'supplied-evaluation',evaluationId:request.evaluationId,status:request.localOnly?'unavailable':'complete',receiptId:null,
evidence:request.evidence.map(item=>({id:item.id,type:item.type,digest:'sha256:'+createHash('sha256').update(readFileSync(item.path)).digest('hex')})),
answers:Object.fromEntries(request.questions.map(q=>[q.name,request.localOnly?{status:'unavailable'}:{status:'answered',shape:'choice',choice:'criterion-met'}]))}));process.exitCode=request.localOnly?1:0;\n`);
  for (const [localOnly, nativeStatus, expected] of [[true, 'passed', 'warning'], [false, 'failed', 'failed']]) {
    const evidence = join(root, expected); mkdirSync(evidence);
    const trialPath = join(evidence, 'trial.json'); writeFileSync(trialPath, JSON.stringify({ version: 1, runId: expected, scenario: 'settings', nativeStatus,
      nativeState: { oracle: 'synthetic-private-readback' }, wrongTarget: false, duplicateActions: false, receipts: [], checkpoints: [{ id: 'after', independentLabel: 'unlabeled', image: { path: image, digest, pixelWidth: 1, pixelHeight: 1 } }],
      counters: { elapsedMs: 0 }, modelProof: 'injected-fixture-only' }));
    const wrapper = join(evidence, 'wrapper.mjs'); writeFileSync(wrapper, optionalCallerWrapperSource({ cli, preload, state: join(root, 'state'), trialPath, localOnly }));
    let stdout;
    try { stdout = execFileSync(process.execPath, [wrapper], { cwd: root, encoding: 'utf8', env: { PATH: process.env.PATH, OPENAI_API_KEY: canary,
      JEV_TOKEN: canary, ENGINE_UNSELECTED_TOKEN: canary, PROJECT_GOVERNANCE_RUN_ID: 'unit-only', PROJECT_GOVERNANCE_EVIDENCE_ROOT: evidence } }); }
    catch (error) { assert.equal(error.status, 1); stdout = error.stdout; }
    const output = JSON.parse(stdout); assert.equal(output.status, expected); assert.equal(output.evaluation.driverProjection.credentialAbsent, true);
    assert.equal(output.evaluation.invocation.credentialObserved, !localOnly); assert.equal(output.evaluation.invocation.unrelatedAbsent, true);
    assert.equal(output.evaluation.browserExecuted, false); assert.equal(output.evaluation.holoExecuted, false);
    if (!localOnly) { assert.equal(output.evaluation.advice[0].answer, true); assert.equal(output.evaluation.paired.native.failed, 1); assert.equal(output.findings[0].severity, 'blocking'); }
    else { assert.equal(output.evaluation.advice[0].status, 'unavailable'); assert.equal(output.findings[0].severity, 'advisory'); }
    assert.equal(readFileSync(image).equals(bytes), true);
  }
  assert.equal(scanCredentialCanaries(root, [canary]).rawValuesAbsent, true);
});

test('actual optional command preserves advisory and blocking absence without a dependency or network call', t => {
  const root = mkdtempSync(join(tmpdir(), 'evaluation-optional-absence-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  const preload = join(root, 'no-network.mjs'); writeFileSync(preload, "globalThis.fetch=()=>{throw Error('Selected absence must be passive')};\n");
  const command = fileURLToPath(new URL('../test/fixtures/optional-computer-use/command.ts', import.meta.url));
  for (const [required, status, severity] of [[false, 'warning', 'advisory'], [true, 'failed', 'blocking']]) {
    let stdout;
    try { stdout = execFileSync(process.execPath, ['--import', preload, command, '--mode', 'readiness', ...(required ? ['--required'] : [])],
      { cwd: root, env: { PATH: process.env.PATH }, encoding: 'utf8' }); }
    catch (error) { assert.equal(required, true); assert.equal(error.status, 1); stdout = error.stdout; }
    const result = JSON.parse(stdout); assert.equal(result.status, status); assert.equal(result.findings.length, 1);
    assert.equal(result.findings[0].rule_id, 'computer-use.not-run'); assert.equal(result.findings[0].severity, severity);
    assert.equal(result.findings[0].coverage, 'not-run'); assert.equal(result.findings[0].reason, 'unconfigured');
  }
});
