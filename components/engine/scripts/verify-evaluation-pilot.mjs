import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';
import { verifyUnselectedOptionalCore } from './verify-unselected-experiment.mjs';

const hash = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const save = (path, value) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 }); return path; };

/** Frozen answers qualify process wiring only, never visual accuracy or a production threshold. */
export function evaluationPilotDefinition() {
  return { version: 1, suite: 'installed-evaluation-pilot-1',
    cases: ['text-cli', 'image-cli', 'exact-replay', 'changed-image-conflict', 'sibling-isolation', 'narrow-library',
      'declared-success', 'native-failure-positive-advice', 'known-defect', 'unknown', 'refusal', 'outage', 'undeclared-key', 'missing-declared-key',
      'optional-caller-unavailable', 'optional-caller-native-failure', 'optional-selected-absent', 'required-selected-absent', 'managed-local-only', 'unselected-optional-core'],
    limits: { externalCalls: 0, visualAccuracy: 'unqualified', requiredGateAdoption: 'unqualified', acceptedDevelopment: 'unknown', savings: 'unqualified' } };
}

/** The deliberate outage runs last so a real cooldown cannot contaminate independent positive trials. */
export function evaluationExecutionOrder() {
  return [...evaluationPilotDefinition().cases.filter(name => name !== 'outage'), 'outage'];
}

/** A project wrapper owns interpretation; advice cannot erase a separate native failure. */
export function interpretEvaluationCheckpoint(result, { nativeStatus = 'passed', required = false } = {}) {
  const answer = result?.answers?.checkpoint;
  if (nativeStatus === 'failed') return { status: 'failed', findings: [{ rule_id: 'fixture.native-check', severity: 'blocking', message: 'The original native assertion failed.' }] };
  if (result?.version === 3 && result.effect === 'advise' && answer?.status === 'answered' && answer.shape === 'choice' && answer.choice === 'matches')
    return { status: 'passed', findings: [] };
  const unresolved = answer?.status !== 'answered' || answer.shape !== 'choice' || answer.choice !== 'defect';
  return { status: required ? 'failed' : 'warning', findings: [{ rule_id: unresolved ? 'fixture.visual-unresolved' : 'fixture.visual-defect',
    severity: required ? 'blocking' : 'advisory', message: unresolved ? 'Visual evidence remains unresolved.' : 'The supplied checkpoint differs from its stated requirement.' }] };
}

export function assertEvaluationEnvelope(result, evaluationId) {
  assert.equal(result.version, 3); assert.equal(result.kind, 'supplied-evaluation'); assert.equal(result.evaluationId, evaluationId);
  assert.equal(result.effect, 'advise'); assert.equal(typeof result.requestId, 'string');
  assert.ok(['complete', 'partial', 'invalid', 'unsupported', 'unavailable'].includes(result.status));
  assert.ok(result.answers && typeof result.answers === 'object'); assert.ok(Array.isArray(result.evidence));
  assert.ok(result.coverage && result.timing && result.usage); assert.equal(result.association, null, 'A taskless call must remain taskless');
  return result;
}

/** Managed admission must write its selected generation even when disclosure forbids a hosted call. */
export function assertManagedEvaluationInvocation(result, evaluationId, before, after) {
  assertEvaluationEnvelope(result, evaluationId);
  assert.equal(result.status, 'unavailable'); assert.equal(result.reason, 'hosted-provider-local-only');
  assert.equal(result.providerCalled, false); assert.equal(result.receiptId, null);
  assert.equal(before.written, false); assert.equal(after.written, true);
  assert.equal(after.directory, before.directory); assert.equal(after.revision, before.revision);
  assert.deepEqual(after.readers, []); assert.equal(after.maintenance, null);
}

/** A real process failure stops execution; an ordinary missing-key finding does not stop independent packs. */
export function assertEvaluationCheckCoverage(checked, nativeProcessFailure = false) {
  assert.deepEqual(checked.plan.selected_packs, ['evaluation', 'independent']);
  assert.deepEqual(checked.plan.execution_order, ['evaluation', 'independent']);
  assert.deepEqual(checked.results.map(item => item.pack_id).sort(), nativeProcessFailure ? ['evaluation'] : ['evaluation', 'independent']);
  if (nativeProcessFailure) {
    const command = checked.results[0].commands[0]; assert.equal(command.exit_code, 1); assert.equal(command.process_failure, true); assert.equal(command.status, 'failed');
    return 'not-run-after-native-process-failure';
  }
  assert.equal(checked.results.find(item => item.pack_id === 'independent').status, 'passed'); return 'passed';
}

/** A real, static 1x1 PNG keeps the installed fixture independent of image libraries or devices. */
export function evaluationFixturePng(color = 0, { width = 1, height = 1 } = {}) {
  const crc = bytes => { let value = 0xffffffff; for (const byte of bytes) { value ^= byte; for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0); } return (value ^ 0xffffffff) >>> 0; };
  const chunk = (type, bytes) => { const body = Buffer.concat([Buffer.from(type), bytes]), length = Buffer.alloc(4), tail = Buffer.alloc(4); length.writeUInt32BE(bytes.length); tail.writeUInt32BE(crc(body)); return Buffer.concat([length, body, tail]); };
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const pixels = Buffer.concat(Array.from({ length: height }, () => Buffer.concat([Buffer.from([0]),
    Buffer.from(Array.from({ length: width }, () => [color, color, color, 255]).flat())])));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
}

export function fixtureEvaluationAnswers(questions, disposition = 'positive') {
  return questions.map(question => {
    if (disposition === 'refusal') return { name: question.name, type: 'refusal' };
    if (question.type === 'predicate') return { name: question.name, type: 'predicate', probability: 0.9 };
    if (question.type === 'choice') {
      const choice = disposition === 'unknown' ? 'unknown' : disposition === 'defect' ? 'defect' : question.choices[0].value;
      return { name: question.name, type: 'choice', choice, confidence: 1,
        probabilities: question.choices.map(item => ({ value: item.value, probability: item.value === choice ? 1 : 0 })) };
    }
    return { name: question.name, type: 'score', score: 1, confidence: 1,
      probabilities: question.levels.map((item, value) => ({ value, label: item.label, probability: value === 1 ? 1 : 0 })) };
  });
}

export function writeEvaluationProviderFixture(path, callsPath, credentialDigest) {
  writeFileSync(path, `import assert from 'node:assert/strict';
import {appendFileSync} from 'node:fs'; import {createHash} from 'node:crypto';
const answers=${fixtureEvaluationAnswers.toString()};
globalThis.fetch=async(url,init)=>{
 assert.equal(String(url),'https://api.openai.com/v1/decisions','Unexpected transport destination');
 const key=process.env.OPENAI_API_KEY; assert.ok(key,'The evaluator child must receive the declared key');
 assert.equal('sha256:'+createHash('sha256').update(key).digest('hex'),${JSON.stringify(credentialDigest)},'Unexpected fixture credential');
 assert.ok(new Headers(init.headers).get('authorization')==='Bearer '+key,'Credential is not in the transport environment');
 const payload=JSON.parse(init.body), disposition=payload.questions[0].instructions.match(/fixture-case=(positive|defect|unknown|refusal|outage)/)?.[1]??'positive';
 appendFileSync(${JSON.stringify(callsPath)},JSON.stringify({pid:process.pid,parentPid:process.ppid,workspace:process.cwd(),model:payload.model,
  payloadDigest:'sha256:'+createHash('sha256').update(init.body).digest('hex'),imageCount:(JSON.stringify(payload.input).match(/input_image/g)??[]).length,
  credentialObserved:true,disposition})+'\\n');
 if(disposition==='outage')return Response.json({error:{message:'Synthetic provider outage'}},{status:503});
 return Response.json({model:payload.model,answers:answers(payload.questions,disposition),usage:{input_tokens:40,output_tokens:6,total_tokens:46}});
};\n`, { mode: 0o600 });
}

/** Generated project-owned caller; every inference child imports its fixture explicitly. */
export function evaluationWrapperSource({ cli, preload, state, requestPath, required = false, nativeStatus = 'passed' }) {
  return `import {readFileSync,writeFileSync} from 'node:fs';import{join}from'node:path';import{createHash}from'node:crypto';import{spawnSync}from'node:child_process';
const interpret=${interpretEvaluationCheckpoint.toString()},request=JSON.parse(readFileSync(${JSON.stringify(requestPath)},'utf8'));
const child=spawnSync(process.execPath,['--import',${JSON.stringify(preload)},${JSON.stringify(cli)},'evaluate','--request-file',${JSON.stringify(requestPath)}],
 {cwd:process.cwd(),env:{...process.env,XDG_STATE_HOME:${JSON.stringify(state)}},encoding:'utf8',timeout:30000,maxBuffer:2097152});
let result;try{result=JSON.parse(child.stdout)}catch{result={status:'unavailable',reason:'unreadable-evaluator-result',answers:{}}}
const evidenceRoot=process.env.PROJECT_GOVERNANCE_EVIDENCE_ROOT,runId=process.env.PROJECT_GOVERNANCE_RUN_ID;
if(!evidenceRoot||!runId)throw Error('Native check evidence binding is missing');
const resultPath=join(evidenceRoot,'evaluation.json');writeFileSync(resultPath,JSON.stringify(result)+'\\n',{mode:0o600});
const artifact=request.evidence.find(item=>item.type==='image'),image=readFileSync(artifact.path),
 capture={scope:'synthetic-1x1-checkpoint',viewport:{width:1,height:1},theme:'fixture',locale:'en',referenceDigest:'sha256:'+createHash('sha256').update(image).digest('hex'),source:'synthetic-only'};
const original={version:1,runId,evaluationId:request.evaluationId,receiptId:result.receiptId??null,resultPath,
 resultDigest:'sha256:'+createHash('sha256').update(readFileSync(resultPath)).digest('hex'),capture,
 evaluatorExitCode:child.status,nativeStatus:${JSON.stringify(nativeStatus)},required:${required},wrapperPid:process.pid,
 credentialObserved:Boolean(process.env.OPENAI_API_KEY),unrelatedAbsent:!process.env.JEV_TOKEN&&!process.env.ENGINE_UNSELECTED_TOKEN};
writeFileSync(join(evidenceRoot,'visual-checkpoint.json'),JSON.stringify(original)+'\\n',{mode:0o600});
const judged=interpret(result,{nativeStatus:${JSON.stringify(nativeStatus)},required:${required}});
console.log(JSON.stringify({...judged,evaluation:original}));process.exitCode=judged.status==='failed'?1:0;\n`;
}

/** The optional caller remains outside the installed package and delegates to its public CLI. */
export function optionalCallerWrapperSource({ cli, preload, state, trialPath, localOnly = false }) {
  const caller = name => new URL(`../test/fixtures/optional-computer-use/${name}.ts`, import.meta.url).href;
  return `import assert from 'node:assert/strict';import{readFileSync,writeFileSync}from'node:fs';import{join}from'node:path';import{createHash}from'node:crypto';import{spawnSync}from'node:child_process';
import{evaluateFrozenTrial}from${JSON.stringify(caller('evaluate'))};import{minimalDriverEnvironment}from${JSON.stringify(caller('holo'))};import{pairedReport}from${JSON.stringify(caller('scenarios'))};
const hash=b=>'sha256:'+createHash('sha256').update(b).digest('hex'),trialPath=${JSON.stringify(trialPath)},trialBytes=readFileSync(trialPath),trial=JSON.parse(trialBytes),
 evidenceRoot=process.env.PROJECT_GOVERNANCE_EVIDENCE_ROOT,runId=process.env.PROJECT_GOVERNANCE_RUN_ID;
assert.ok(evidenceRoot&&runId,'Native check evidence binding is missing');
const image=trial.checkpoints[0].image,imageBefore=readFileSync(image.path),driverEnv=minimalDriverEnvironment(process.env),
 driver=spawnSync(process.execPath,['--input-type=module','-e',"console.log(JSON.stringify({pid:process.pid,credentialAbsent:!process.env.OPENAI_API_KEY&&!process.env.JEV_TOKEN&&!process.env.ENGINE_UNSELECTED_TOKEN}))"],
 {env:driverEnv,encoding:'utf8',timeout:5000});
assert.equal(driver.status,0);const driverProjection=JSON.parse(driver.stdout);assert.equal(driverProjection.credentialAbsent,true);
let invocation=null,result=null;
const evaluated=evaluateFrozenTrial(trial,{workspace:process.cwd(),evaluationId:'optional-'+trial.runId,requestFile:join(evidenceRoot,'caller-request.json'),
 node:process.execPath,cli:${JSON.stringify(cli)},declaredCredentialEnv:['OPENAI_API_KEY'],env:process.env,deadlineMs:30000,localOnly:${localOnly},
 invoke:(argv,env)=>{const actual=[...argv.slice(0,1),'--import',${JSON.stringify(preload)},...argv.slice(1)],child=spawnSync(actual[0],actual.slice(1),
 {cwd:process.cwd(),env:{...env,XDG_STATE_HOME:${JSON.stringify(state)}},encoding:'utf8',timeout:30000,maxBuffer:4194304});
 invocation={argv:actual,exitCode:child.status,credentialObserved:Boolean(env.OPENAI_API_KEY),unrelatedAbsent:!env.JEV_TOKEN&&!env.ENGINE_UNSELECTED_TOKEN};
 try{result=JSON.parse(child.stdout)}catch{result=null}return{stdout:child.stdout??'',exitCode:child.status};}});
assert.ok(invocation);assert.deepEqual(readFileSync(trialPath),trialBytes);assert.deepEqual(readFileSync(image.path),imageBefore);
const paired=pairedReport([trial],new Map([[trial.runId,evaluated.advice]]),new Map()),resultPath=join(evidenceRoot,'caller-evaluation.json');
writeFileSync(resultPath,JSON.stringify(result)+'\\n',{mode:0o600});
const link={version:1,runId,evaluationId:evaluated.evaluationId,receiptId:result?.receiptId??null,resultPath,resultDigest:hash(readFileSync(resultPath)),
 callerTrial:trialPath,callerTrialDigest:hash(trialBytes),preparedCapture:{path:image.path,digest:hash(imageBefore),width:image.pixelWidth,height:image.pixelHeight},
 advice:evaluated.advice,paired,invocation,driverProjection,wrapperPid:process.pid,scope:'synthetic-caller-wiring-only',browserExecuted:false,holoExecuted:false};
writeFileSync(join(evidenceRoot,'optional-caller.json'),JSON.stringify(link)+'\\n',{mode:0o600});
const nativeFailed=trial.nativeStatus==='failed',unavailable=evaluated.advice.some(item=>item.status!=='answered'||item.answer===null),
 status=nativeFailed?'failed':unavailable?'warning':'passed',findings=nativeFailed?[{rule_id:'fixture.optional-native-check',severity:'blocking',message:'The original native assertion failed.'}]:
 unavailable?[{rule_id:'fixture.optional-visual-unresolved',severity:'advisory',message:'The optional supplied capture remains unresolved.'}]:[];
console.log(JSON.stringify({status,findings,evaluation:link}));process.exitCode=status==='failed'?1:0;\n`;
}

/** Inspect raw saved bytes, including SQLite and saved command environments, without following package links. */
export function scanCredentialCanaries(directory, canaries) {
  let files = 0, bytes = 0;
  const visit = root => { for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name); if (entry.isDirectory()) visit(path);
    else if (entry.isFile()) { const value = readFileSync(path); files++; bytes += value.length;
      assert.ok(canaries.every(canary => !value.includes(canary)), `Credential canary persisted in ${path}`); }
  } };
  visit(directory); return { files, bytes, rawValuesAbsent: true, scope: 'all-retained-fixture-files-without-following-symlinks' };
}

/** Resolve missing suffixes through their real ancestor before creating any proof files. */
export function evaluationProofOutput(packageRoot, requested) {
  requested = resolve(requested); let ancestor = requested;
  while (!existsSync(ancestor)) ancestor = dirname(ancestor);
  const path = resolve(realpathSync(ancestor), relative(ancestor, requested));
  for (const root of [realpathSync(fileURLToPath(new URL('../../..', import.meta.url))), realpathSync(packageRoot)]) {
    const rel = relative(root, path); assert.ok(rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel), 'Keep proof evidence outside source and installed payloads');
  }
  for (let current = dirname(path); ; current = dirname(current)) {
    assert.equal(existsSync(join(current, '.git')), false, 'Keep proof evidence outside existing project checkouts');
    if (dirname(current) === current) break;
  }
  return path;
}

/** Verify the supplied stage before creating any fixture or intercepted transport. */
async function inspectEvaluationPilot(packageRoot, generationDirectory) {
  assert.ok(typeof generationDirectory === 'string' && generationDirectory.length > 0,
    'Installed evaluator proof requires an explicit verified staged generation. Usage: node verify-evaluation-pilot.mjs <installed-package-root> <fresh-output> <verified-generation-directory>');
  packageRoot = realpathSync(resolve(packageRoot));
  const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')), cli = join(packageRoot, 'dist/engine/src/cli.js');
  assert.ok(existsSync(cli), 'Build/install the candidate before evaluator proof');
  assert.ok(manifest.exports?.['./evaluation/v1'], 'The narrow installed evaluator export is missing');
  const load = name => import(pathToFileURL(join(packageRoot, `dist/engine/src/${name}.js`)).href);
  const [{ RuntimeGenerations }, { inspectRuntimeGeneration }, { runtimeLauncher }, { runtimeTree }] = await Promise.all([
    load('runtime-generations'), load('runtime-inspection'), load('runtime-launcher'), load('runtime-tree'),
  ]);
  const installation = inspectRuntimeGeneration(generationDirectory), installationReceipt = JSON.parse(readFileSync(join(installation.directory, 'installation.json'), 'utf8'));
  assert.deepEqual(installation.installedTree, runtimeTree(packageRoot), 'Managed generation must contain the exact same installed payload');
  return { packageRoot, manifest, cli, RuntimeGenerations, runtimeLauncher, installation, installationReceipt };
}

/** One shared fixture owns account state, exact receipts, canaries and command originals. */
function createEvaluationFixture(candidate, output) {
  const { packageRoot, cli } = candidate;
  const directory = output ? evaluationProofOutput(packageRoot, output) : realpathSync(mkdtempSync(join(tmpdir(), 'governance-evaluation-pilot-')));
  if (output) { assert.equal(existsSync(directory), false, 'Retain prior trials; use a fresh proof directory'); mkdirSync(directory, { recursive: true, mode: 0o700 }); }
  const definition = evaluationPilotDefinition(); save(join(directory, 'definition.json'), definition);
  const repo = join(directory, 'repo'), sibling = join(directory, 'sibling'), state = join(directory, 'state'), consumer = join(directory, 'consumer');
  for (const root of [repo, consumer, state]) mkdirSync(root, { recursive: true });
  for (const path of ['config/governance', 'config/validation/packs', 'artifacts', 'src']) mkdirSync(join(repo, path), { recursive: true });
  const canaries = [`synthetic-openai-${randomUUID()}`, `synthetic-jev-${randomUUID()}`, `synthetic-unselected-${randomUUID()}`];
  const preload = join(directory, 'provider-fixture.mjs'), callsPath = join(directory, 'provider-calls.jsonl');
  writeEvaluationProviderFixture(preload, callsPath, hash(canaries[0]));
  const environment = { ...process.env, XDG_STATE_HOME: state, OPENAI_API_KEY: canaries[0], JEV_TOKEN: canaries[1], ENGINE_UNSELECTED_TOKEN: canaries[2] };
  for (const key of Object.keys(environment)) if (key.startsWith('GOVERNANCE_GENERATION_') || ['HARNESS_SESSION', 'HARNESS_THREAD', 'CODEX_THREAD_ID', 'NODE_OPTIONS'].includes(key)) delete environment[key];
  const calls = () => existsSync(callsPath) ? readFileSync(callsPath, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
  const retainedEvaluation = receiptId => {
    assert.equal(typeof receiptId, 'string', 'Admitted evaluation must retain a receipt identity');
    const paths = [];
    const visit = root => { if (!existsSync(root)) return; for (const item of readdirSync(root, { withFileTypes: true })) {
      const path = join(root, item.name); if (item.isDirectory()) visit(path);
      else if (item.name === `${receiptId}.json` && root.endsWith('/supplied-evaluations')) paths.push(path);
    } };
    visit(state); assert.equal(paths.length, 1, 'Evaluation receipt must have one retained original');
    const bytes = readFileSync(paths[0]), value = JSON.parse(bytes); assert.equal(value.version, 3); assert.equal(value.receiptId, receiptId);
    assert.equal(value.outcome.receiptId, receiptId); assert.equal(value.outcome.association, null);
    for (const item of value.outcome.evidence) { assert.equal(item.text, undefined); assert.equal(item.dataUrl, undefined); }
    assert.ok(!bytes.includes('data:image/'), 'Ordinary receipts must not retain inline image bytes');
    return { path: paths[0], digest: hash(bytes) };
  };
  const git = (...args) => execFileSync('git', args, { cwd: repo, env: environment, stdio: 'pipe' });
  const custody = root => {
    const run = (...args) => execFileSync('git', args, { cwd: root, env: environment, stdio: 'pipe' });
    return { root: realpathSync(root), head: run('rev-parse', 'HEAD').toString().trim(), branch: run('branch', '--show-current').toString().trim(),
      common: run('rev-parse', '--path-format=absolute', '--git-common-dir').toString().trim(), stagedDigest: hash(run('diff', '--cached', '--binary')), status: run('status', '--porcelain=v1', '-z').toString() };
  };
  let commandNumber = 0;
  const invoke = (args, { cwd = repo, env = environment, exit = 0, script } = {}) => {
    const argv = ['--import', preload, ...(script ? [script] : [cli, ...args])], result = spawnSync(process.execPath, argv, { cwd, env, encoding: 'utf8', timeout: 90000, maxBuffer: 4 * 1024 * 1024 });
    save(join(directory, 'commands', `${++commandNumber}.json`), { executable: process.execPath, argv, cwd, status: result.status, stdout: result.stdout, stderr: result.stderr, error: result.error?.message ?? null });
    assert.equal(result.status, exit, 'Installed public command failed; inspect its retained original receipt'); return JSON.parse(result.stdout.trim());
  };
  const request = (evaluationId, disposition = 'positive', image = false) => ({ version: 1, evaluationId,
    evidence: [{ id: 'requirements', type: 'text', text: 'The synthetic checkpoint must preserve its stated requirement.', role: 'requirements' },
      ...(image ? [{ id: 'actual', type: 'image', path: join(repo, 'artifacts/checkpoint.png'), role: 'actual' }] : [])],
    questions: [{ name: 'checkpoint', type: 'choice', instructions: `fixture-case=${disposition}; compare the supplied evidence with its written requirement.`,
      choices: [{ value: 'matches', description: 'The stated requirement is represented.' }, { value: 'defect', description: 'The stated requirement differs.' }] }] });
  const rows = [], runs = [];
  return { ...candidate, directory, definition, repo, sibling, state, consumer, canaries, preload, callsPath, environment, calls, retainedEvaluation, git, custody, invoke, request, rows, runs };
}

/** Freeze the caller and sibling once; every case shares this configured account. */
function initializeEvaluationRepository(fixture) {
  const { packageRoot, repo, sibling, git } = fixture;
  const skill = join(packageRoot, 'dist/engine/assets/skills/evaluate-evidence/SKILL.md');
  assert.match(readFileSync(skill, 'utf8'), /project-governance evaluate --request-file/); assert.match(readFileSync(skill, 'utf8'), /Native failures remain failures/);
  git('init', '-q'); git('-c', 'user.name=Test', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-qm', 'Initialize evaluator fixture');
  const profile = { continuity: { decisions: { mode: 'auto', allowed_data_classes: ['supplied-evidence'], evaluation: { enabled: true, provider: 'openai', model: 'gpt-6-luna',
    allowed_artifact_roots: ['artifacts'], daily_budget: { max_calls: 100, max_request_bytes: 104857600 } } } } };
  save(join(repo, 'config/governance/profile.yaml'), profile); writeFileSync(join(repo, 'artifacts/checkpoint.png'), evaluationFixturePng()); writeFileSync(join(repo, 'src/checkpoint.ts'), 'export const nativeCheckpoint = true;\n');
  git('add', '.'); git('-c', 'user.name=Test', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'Freeze supplied checkpoint'); git('worktree', 'add', '-qb', 'fixture-sibling', sibling);
  return profile;
}

/** Public CLI, replay, conflict, worktree isolation and the narrow external import. */
function runEvaluationPublicCases(fixture) {
  const { packageRoot, directory, repo, sibling, consumer, request, custody, invoke, rows, calls, retainedEvaluation } = fixture;
  const text = request('installed-text'); text.questions.push({ name: 'present', type: 'predicate', instructions: 'Is the stated checkpoint present?' },
    { name: 'severity', type: 'score', instructions: 'Which stated severity applies?', levels: [{ label: 'None', description: 'No issue' }, { label: 'Limited', description: 'Limited issue' }] });
  const textPath = save(join(directory, 'text-request.json'), text), beforeText = custody(repo), textResult = assertEvaluationEnvelope(invoke(['evaluate', '--request-file', textPath]), text.evaluationId);
  assert.equal(textResult.status, 'complete'); assert.equal(textResult.answers.present.probability, 0.9); assert.equal(textResult.answers.severity.score, 1); assert.deepEqual(custody(repo), beforeText);
  rows.push({ case: 'text-cli', receiptId: textResult.receiptId, status: textResult.status });
  const image = request('installed-image', 'positive', true), imagePath = save(join(directory, 'image-request.json'), image), originalImage = readFileSync(join(repo, 'artifacts/checkpoint.png'));
  const imageResult = assertEvaluationEnvelope(invoke(['evaluate', '--request-file', imagePath]), image.evaluationId);
  assert.equal(imageResult.evidence.find(item => item.id === 'actual').digest, hash(originalImage)); assert.equal(imageResult.evidence.find(item => item.id === 'actual').mediaType, 'image/png');
  const imageReceipt = retainedEvaluation(imageResult.receiptId); assert.equal(calls().at(-1).imageCount, 1);
  rows.push({ case: 'image-cli', receiptId: imageResult.receiptId, imageDigest: hash(originalImage), originalReceipt: imageReceipt });
  const imageCalls = calls().length, replay = invoke(['evaluate', '--request-file', imagePath]); assert.equal(replay.receiptId, imageResult.receiptId); assert.equal(calls().length, imageCalls);
  rows.push({ case: 'exact-replay', receiptId: replay.receiptId, dispatches: 0 });
  writeFileSync(join(repo, 'artifacts/checkpoint.png'), evaluationFixturePng(255));
  const conflict = invoke(['evaluate', '--request-file', imagePath], { exit: 1 }); assert.equal(conflict.status, 'invalid'); assert.equal(calls().length, imageCalls);
  assert.deepEqual(retainedEvaluation(imageResult.receiptId), imageReceipt, 'Replay/conflict must not rewrite the original image outcome');
  writeFileSync(join(repo, 'artifacts/checkpoint.png'), originalImage); rows.push({ case: 'changed-image-conflict', status: conflict.status, reason: conflict.reason, dispatches: 0 });
  const siblingImage = { ...image, evidence: image.evidence.map(item => item.type === 'image' ? { ...item, path: join(sibling, 'artifacts/checkpoint.png') } : item) };
  const siblingPath = save(join(directory, 'sibling-request.json'), siblingImage), siblingBefore = custody(sibling), siblingResult = invoke(['evaluate', '--request-file', siblingPath], { cwd: sibling });
  assert.equal(calls().length, imageCalls + 1); assert.notEqual(siblingResult.receiptId, imageResult.receiptId); assert.deepEqual(custody(sibling), siblingBefore);
  rows.push({ case: 'sibling-isolation', receiptId: siblingResult.receiptId, workspace: sibling });
  mkdirSync(join(consumer, 'node_modules/@organta'), { recursive: true }); symlinkSync(packageRoot, join(consumer, 'node_modules/@organta/project-governance'), 'dir');
  const libraryRequest = request('installed-library', 'positive', true), libraryPath = save(join(directory, 'library-request.json'), libraryRequest), libraryScript = join(consumer, 'evaluation.mjs');
  writeFileSync(libraryScript, `import * as api from '@organta/project-governance/evaluation/v1';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';assert.deepEqual(Object.keys(api),['EVALUATION_API_VERSION','evaluateEvidence']);assert.equal(api.EVALUATION_API_VERSION,1);console.log(JSON.stringify(await api.evaluateEvidence(JSON.parse(readFileSync(${JSON.stringify(libraryPath)},'utf8')),{workspace:${JSON.stringify(repo)}})));\n`);
  const library = assertEvaluationEnvelope(invoke([], { cwd: consumer, script: libraryScript }), libraryRequest.evaluationId); assert.equal(library.status, 'complete');
  rows.push({ case: 'narrow-library', receiptId: library.receiptId, externalCaller: consumer, allowedExports: ['EVALUATION_API_VERSION', 'evaluateEvidence'] });
}

/** Register native packs once so unavailable credentials cannot reset the account or scope. */
function prepareEvaluationPacks(fixture) {
  const { directory, repo } = fixture;
  const independent = join(directory, 'independent.mjs'); writeFileSync(independent, `import assert from 'node:assert/strict';assert.ok(!process.env.OPENAI_API_KEY&&!process.env.JEV_TOKEN&&!process.env.ENGINE_UNSELECTED_TOKEN);console.log(JSON.stringify({status:'passed',findings:[]}));\n`);
  const pack = (id, commands) => ({ id, enforcement: 'blocking', stages: ['evaluation-proof'], path_globs: ['src/**'], commands });
  save(join(repo, 'config/validation/packs/independent.yaml'), pack('independent', [{ run: [process.execPath, independent] }]));
  save(join(repo, 'config/validation/packs/unselected.yaml'), pack('unselected', [{ run: [process.execPath, independent], credentialEnv: ['ENGINE_UNSELECTED_TOKEN'] }]));
  return pack;
}

/** Frozen native dispositions; the outage is invoked only after all other groups. */
function nativeEvaluationExamples() {
  return [
    { case: 'declared-success', disposition: 'positive', expected: 'passed' },
    { case: 'native-failure-positive-advice', disposition: 'positive', nativeStatus: 'failed', expected: 'failed' },
    { case: 'known-defect', disposition: 'defect', expected: 'warning' },
    { case: 'unknown', disposition: 'unknown', expected: 'warning' },
    { case: 'refusal', disposition: 'refusal', expected: 'warning' },
    { case: 'outage', disposition: 'outage', expected: 'warning' },
    { case: 'undeclared-key', disposition: 'positive', undeclared: true, expected: 'warning' },
    { case: 'missing-declared-key', disposition: 'positive', missing: true, expected: 'failed' },
  ];
}

/** A native check remains the authority, independent of the evaluator advice. */
function runNativeEvaluationCase(fixture, example) {
  const { directory, repo, cli, preload, state, request, pack, environment, custody, calls, invoke, runs, rows, retainedEvaluation } = fixture;
  const requestPath = save(join(directory, 'requests', `${example.case}.json`), request(`installed-${example.case}`, example.disposition, true)), wrapper = join(directory, `${example.case}-wrapper.mjs`);
  writeFileSync(wrapper, evaluationWrapperSource({ cli, preload, state, requestPath, nativeStatus: example.nativeStatus ?? 'passed' }));
  save(join(repo, 'config/validation/packs/evaluation.yaml'), pack('evaluation', [{ run: [process.execPath, '--import', preload, wrapper], ...(example.undeclared ? {} : { credentialEnv: ['OPENAI_API_KEY'] }) }]));
  const before = custody(repo), beforeCalls = calls().length, env = { ...environment }; if (example.missing) delete env.OPENAI_API_KEY;
  const checked = invoke(['check', '--stage', 'evaluation-proof', '--mode', 'all', '--pack', 'evaluation', '--pack', 'independent', '--trigger', 'test', '--expected-status', example.expected,
    '--timeout-seconds', '60'], { env, exit: example.expected === 'failed' ? 1 : 0 });
  runs.push(checked.run_directory); assert.equal(checked.status, example.expected); assert.deepEqual(custody(repo), before);
  const independentStatus = assertEvaluationCheckCoverage(checked, example.case === 'native-failure-positive-advice');
  const command = checked.results.find(item => item.pack_id === 'evaluation').commands[0], run = JSON.parse(readFileSync(join(checked.run_directory, 'run.json'), 'utf8'));
  assert.ok(run.owner.pid > 1); assert.notEqual(run.owner.pid, process.pid, 'The real check worker must be detached');
  if (example.missing) {
    assert.equal(command.termination_reason, 'credential-unavailable'); assert.equal(command.findings[0].rule_id, 'checker.credential-unavailable'); assert.equal(command.command_receipt, undefined); assert.equal(calls().length, beforeCalls);
    assert.equal(command.process_failure, false);
    rows.push({ case: example.case, status: checked.status, runId: checked.run_id, unavailableOnlyDeclaringCommand: true, independentStatus }); return;
  }
  const original = JSON.parse(command.stdout), link = original.evaluation, evaluated = JSON.parse(readFileSync(link.resultPath, 'utf8'));
  assert.equal(link.runId, checked.run_id); assert.equal(link.resultDigest, hash(readFileSync(link.resultPath))); assert.equal(link.receiptId, evaluated.receiptId ?? null);
  if (link.receiptId) retainedEvaluation(link.receiptId);
  assert.equal(link.unrelatedAbsent, true); assert.equal(link.credentialObserved, !example.undeclared); assert.equal(command.command_receipt.cleanup, 'confirmed');
  assert.notEqual(run.owner.pid, link.wrapperPid); assert.notEqual(link.wrapperPid, process.pid);
  assert.equal(command.status, example.expected); assert.notEqual(command.status, 'not-applicable');
  if (example.undeclared) { assert.equal(evaluated.status, 'unavailable'); assert.equal(calls().length, beforeCalls); }
  else { const call = calls().at(-1); assert.equal(call.parentPid, link.wrapperPid); assert.equal(calls().length, beforeCalls + 1); }
  if (example.case === 'native-failure-positive-advice') { assert.equal(evaluated.answers.checkpoint.choice, 'matches'); assert.equal(command.status, 'failed'); }
  rows.push({ case: example.case, status: checked.status, runId: checked.run_id, receiptId: link.receiptId, evaluationStatus: evaluated.status,
    questionStatus: evaluated.answers.checkpoint?.status ?? null, evaluatorExitCode: link.evaluatorExitCode, wrapperPid: link.wrapperPid, workerPid: run.owner.pid, credentialObserved: link.credentialObserved, independentStatus });
}

/** Actual caller-owned prepared captures and the optional adapter retain their originals. */
async function runOptionalEvaluationCallerCases(fixture) {
  const { directory, repo, cli, preload, state, pack, custody, calls, invoke, runs, rows, retainedEvaluation } = fixture;
  const callerModule = new URL('../test/fixtures/optional-computer-use/evaluate.ts', import.meta.url),
    { derivativeProvenance } = await import(callerModule.href);
  for (const example of [
    { case: 'optional-caller-unavailable', nativeStatus: 'passed', localOnly: true, expected: 'warning' },
    { case: 'optional-caller-native-failure', nativeStatus: 'failed', localOnly: false, expected: 'failed' },
  ]) {
    const artifactRoot = join(repo, 'artifacts', 'optional-testing', example.case); mkdirSync(artifactRoot, { recursive: true });
    const originalPath = join(artifactRoot, 'original.png'), imagePath = join(artifactRoot, 'prepared.png'),
      original = evaluationFixturePng(0, { width: 2, height: 2 }), prepared = evaluationFixturePng();
    writeFileSync(originalPath, original); writeFileSync(imagePath, prepared);
    // Constant pixels make this frozen derivative exact without installing an image processor.
    const provenancePath = save(join(artifactRoot, 'prepared.json'), derivativeProvenance({ digest: hash(original).slice(7), width: 2, height: 2 },
      prepared, { kind: 'resize', width: 1, height: 1 }, { x: 0, y: 0, width: 2, height: 2 }));
    const trialPath = save(join(artifactRoot, 'trial.json'), { version: 1, runId: example.case, scenario: 'settings', fault: 'frozen-installed-wiring',
      nativeStatus: example.nativeStatus, nativeState: { secretOracle: 'synthetic-readback-excluded-from-evaluator' }, wrongTarget: false, duplicateActions: false,
      receipts: [], checkpoints: [{ id: 'after', independentLabel: 'unlabeled', image: { path: imagePath, digest: hash(prepared).slice(7),
        token: `${example.case}-capture`, session: 'synthetic-caller', generation: 1, width: 1, height: 1, pixelWidth: 1, pixelHeight: 1, scale: 1, origin: 'http://127.0.0.1' } }],
      counters: { steps: 0, calls: 0, captures: 1, elapsedMs: 0 }, modelProof: 'injected-fixture-only' });
    const custodyFiles = [originalPath, imagePath, provenancePath, trialPath], originals = custodyFiles.map(path => hash(readFileSync(path))),
      wrapper = join(directory, `${example.case}-wrapper.mjs`);
    writeFileSync(wrapper, optionalCallerWrapperSource({ cli, preload, state, trialPath, localOnly: example.localOnly }));
    save(join(repo, 'config/validation/packs/optional-caller.yaml'), pack('optional-caller', [{ run: [process.execPath, '--import', preload, wrapper], credentialEnv: ['OPENAI_API_KEY'] }]));
    const before = custody(repo), beforeCalls = calls().length,
      checked = invoke(['check', '--stage', 'evaluation-proof', '--mode', 'all', '--pack', 'optional-caller', '--pack', 'independent', '--trigger', 'test',
        '--expected-status', example.expected, '--timeout-seconds', '60'], { exit: example.expected === 'failed' ? 1 : 0 });
    runs.push(checked.run_directory); assert.equal(checked.status, example.expected); assert.deepEqual(custody(repo), before);
    assert.deepEqual(custodyFiles.map(path => hash(readFileSync(path))), originals, 'Caller originals and derivative provenance must stay unchanged');
    assert.equal(checked.results.find(item => item.pack_id === 'independent').status, 'passed');
    const command = checked.results.find(item => item.pack_id === 'optional-caller').commands[0], link = JSON.parse(command.stdout).evaluation,
      evaluated = JSON.parse(readFileSync(link.resultPath, 'utf8')), run = JSON.parse(readFileSync(join(checked.run_directory, 'run.json'), 'utf8'));
    assert.equal(command.status, example.expected); assert.equal(command.command_receipt.cleanup, 'confirmed'); assert.equal(link.runId, checked.run_id);
    assert.equal(link.resultDigest, hash(readFileSync(link.resultPath))); assert.equal(link.callerTrialDigest, originals[3]);
    assert.equal(link.driverProjection.credentialAbsent, true); assert.equal(link.invocation.unrelatedAbsent, true);
    assert.equal(link.invocation.credentialObserved, !example.localOnly); assert.notEqual(link.wrapperPid, run.owner.pid);
    assert.notEqual(link.driverProjection.pid, link.wrapperPid); assert.equal(link.browserExecuted, false); assert.equal(link.holoExecuted, false);
    const callerRequest = JSON.parse(readFileSync(join(dirname(link.resultPath), 'caller-request.json'), 'utf8'));
    assert.deepEqual(callerRequest.evidence.map(item => item.path), [relative(repo, imagePath)]);
    assert.equal(JSON.stringify(callerRequest).includes('synthetic-readback-excluded-from-evaluator'), false);
    assert.equal(JSON.stringify(callerRequest).includes('independentLabel'), false); assert.equal(link.paired.visual.accuracyQualified, false);
    if (example.localOnly) { assert.equal(evaluated.status, 'unavailable'); assert.equal(link.advice[0].status, 'unavailable'); assert.equal(calls().length, beforeCalls); }
    else { assert.equal(link.advice[0].answer, true); assert.equal(link.paired.native.failed, 1); assert.equal(link.paired.native.passed, 0);
      assert.equal(calls().length, beforeCalls + 1); assert.equal(calls().at(-1).parentPid, link.wrapperPid); retainedEvaluation(link.receiptId); }
    rows.push({ case: example.case, status: checked.status, runId: checked.run_id, receiptId: link.receiptId, evaluationStatus: evaluated.status,
      callerAdapter: { path: fileURLToPath(callerModule), digest: hash(readFileSync(callerModule)) }, callerTrialDigest: link.callerTrialDigest,
      preparedCapture: link.preparedCapture, driverProjection: link.driverProjection, sourceOriginalsUnchanged: true, nativeStatus: example.nativeStatus,
      browserExecuted: false, holoExecuted: false, visualAccuracy: 'unqualified' });
  }
}

/** Selected absence stays advisory or blocking while the unrelated native pack still runs. */
function runOptionalEvaluationAbsenceCases(fixture) {
  const { directory, repo, pack, custody, calls, invoke, runs, rows } = fixture;
  const optionalCommand = fileURLToPath(new URL('../test/fixtures/optional-computer-use/command.ts', import.meta.url)),
    passivePreload = join(directory, 'optional-passive-transport.mjs'), networkAttempts = join(directory, 'optional-network-attempts.jsonl');
  writeFileSync(passivePreload, `import assert from 'node:assert/strict';import{appendFileSync}from'node:fs';
assert.ok(!process.env.OPENAI_API_KEY&&!process.env.JEV_TOKEN&&!process.env.ENGINE_UNSELECTED_TOKEN,'An undeclared optional command received a credential');
globalThis.fetch=async()=>{appendFileSync(${JSON.stringify(networkAttempts)},'attempted\\n');throw Error('Passive optional absence must not call a provider')};\n`);
  for (const example of [
    { case: 'optional-selected-absent', required: false, expected: 'warning', severity: 'advisory' },
    { case: 'required-selected-absent', required: true, expected: 'failed', severity: 'blocking' },
  ]) {
    const argv = [process.execPath, '--import', passivePreload, optionalCommand, '--mode', 'readiness', '--run-id', example.case, ...(example.required ? ['--required'] : [])];
    save(join(repo, 'config/validation/packs/optional-command.yaml'), pack('optional-command', [{ run: argv }]));
    const before = custody(repo), beforeCalls = calls().length,
      checked = invoke(['check', '--stage', 'evaluation-proof', '--mode', 'all', '--pack', 'optional-command', '--pack', 'independent', '--trigger', 'test',
        '--expected-status', example.expected, '--timeout-seconds', '60'], { exit: example.required ? 1 : 0 });
    runs.push(checked.run_directory); assert.deepEqual(custody(repo), before); assert.equal(checked.status, example.expected);
    assert.equal(checked.results.find(item => item.pack_id === 'independent').status, 'passed');
    const command = checked.results.find(item => item.pack_id === 'optional-command').commands[0], original = JSON.parse(command.stdout);
    assert.equal(command.status, example.expected); assert.equal(command.command_receipt.cleanup, 'confirmed');
    assert.equal(original.status, example.expected); assert.equal(original.findings[0].rule_id, 'computer-use.not-run');
    assert.equal(original.findings[0].severity, example.severity); assert.equal(original.findings[0].coverage, 'not-run'); assert.equal(original.findings[0].reason, 'unconfigured');
    assert.equal(command.findings[0].severity, example.severity); assert.equal(calls().length, beforeCalls); assert.equal(existsSync(networkAttempts), false);
    rows.push({ case: example.case, status: checked.status, runId: checked.run_id, command: { path: optionalCommand, digest: hash(readFileSync(optionalCommand)) },
      severity: original.findings[0].severity, coverage: original.findings[0].coverage, reason: original.findings[0].reason,
      unrelatedCheck: 'passed', externalCalls: 0, thirdPartyDependenciesRequired: false, cleanup: 'confirmed' });
  }
}

/** The pinned launcher admits evaluate as a write even when local-only prevents disclosure. */
function runManagedEvaluationCase(fixture) {
  const { directory, profile, request, RuntimeGenerations, installation, installationReceipt, runtimeLauncher, environment, calls, rows } = fixture;
  const managedWorkspace = join(directory, 'managed-workspace'), registry = join(directory, 'managed-installation.sqlite'),
    launcher = join(managedWorkspace, '.governance/runtime/bin/project-governance');
  mkdirSync(dirname(launcher), { recursive: true }); save(join(managedWorkspace, 'config/governance/runtime.lock.yaml'), installationReceipt.lock);
  save(join(managedWorkspace, 'config/governance/profile.yaml'), profile);
  const managedRequest = { ...request('installed-managed-local-only'), localOnly: true },
    managedPath = save(join(directory, 'managed-request.json'), managedRequest), generations = new RuntimeGenerations(registry);
  try {
    generations.activate(installation.directory, 0);
    writeFileSync(launcher, runtimeLauncher(process.execPath, installation.executable, registry, managedWorkspace), { mode: 0o700 });
    const before = generations.state(), beforeCalls = calls().length, env = { ...environment };
    for (const key of ['OPENAI_API_KEY', 'JEV_TOKEN', 'ENGINE_UNSELECTED_TOKEN']) delete env[key];
    const args = ['evaluate', '--request-file', managedPath], result = spawnSync(launcher, args,
      { cwd: managedWorkspace, env, encoding: 'utf8', timeout: 30000, maxBuffer: 2 * 1024 * 1024 }), after = generations.state();
    const original = save(join(directory, 'managed-invocation.json'), { launcher, args, cwd: managedWorkspace, status: result.status,
      stdout: result.stdout, stderr: result.stderr, error: result.error?.message ?? null, before, after });
    assert.equal(result.status, 1, 'Local-only must reach the evaluator rather than unsupported managed command admission');
    const evaluated = JSON.parse(result.stdout); assertManagedEvaluationInvocation(evaluated, managedRequest.evaluationId, before, after);
    assert.equal(calls().length, beforeCalls); assert.equal(hash(readFileSync(managedPath)), hash(JSON.stringify(managedRequest, null, 2) + '\n'));
    rows.push({ case: 'managed-local-only', status: evaluated.status, reason: evaluated.reason, providerCalled: false,
      entry: [launcher, ...args], original: { path: original, digest: hash(readFileSync(original)) },
      installation: { directory: installation.directory, archiveDigest: installation.archiveDigest, lockDigest: installation.lockDigest,
        runtimeVersion: installation.runtimeVersion, installedTree: installation.installedTree },
      generationWritten: after.written, readersReleased: after.readers.length === 0, sourceIdentity: 'synthetic fixture only; not release provenance', externalCalls: 0 });
  } finally { generations.close(); }
}

/** Inspect real native owners without signalling processes or deleting failure evidence. */
async function cleanupEvaluationFixture(fixture) {
  const { packageRoot, state, directory } = fixture;
  const { processFingerprint } = await import(pathToFileURL(join(packageRoot, 'dist/engine/src/process-owner.js')).href), owners = [];
  const walk = root => { if (!existsSync(root)) return; for (const item of readdirSync(root, { withFileTypes: true })) { const path = join(root, item.name);
    if (item.isDirectory()) walk(path); else if (['owner.json', 'guardian.json', 'run.json'].includes(item.name)) { const value = JSON.parse(readFileSync(path, 'utf8')), owner = item.name === 'run.json' ? value.owner : value;
      if (owner?.pid && owner.fingerprint) owners.push({ path, pid: owner.pid, fingerprint: owner.fingerprint }); } } };
  walk(state); const live = () => owners.some(owner => processFingerprint(owner.pid) === owner.fingerprint), deadline = Date.now() + 5000;
  while (live() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100));
  const cleanup = { confirmed: !live(), owners: owners.map(owner => ({ ...owner, live: processFingerprint(owner.pid) === owner.fingerprint })) };
  save(join(directory, 'cleanup.json'), cleanup);
  return cleanup;
}

/** Retain complete originals and report honest coverage after one final canary scan. */
function finishEvaluationPilot(fixture, failure, cleanup) {
  const { packageRoot, manifest, cli, directory, definition, rows, runs, canaries, calls } = fixture;
  let canaryScan; try { canaryScan = scanCredentialCanaries(directory, canaries); } catch (error) { failure ??= error.message; }
  const report = { version: 1, status: failure ? 'failed' : 'passed', failure, definition, definitionDigest: hash(JSON.stringify(definition)),
    assessor: { path: fileURLToPath(import.meta.url), digest: hash(readFileSync(fileURLToPath(import.meta.url))) },
    executionOrder: rows.map(row => row.case), rows: rows.toSorted((a, b) => definition.cases.indexOf(a.case) - definition.cases.indexOf(b.case)),
    package: { root: packageRoot, version: manifest.version, launcherDigest: hash(readFileSync(cli)) },
    runDirectories: runs, fixtureCalls: calls(), canaryScan, cleanup, claims: { externalCalls: 0, fixtureTransportOnly: true, narrowExportOnly: true,
      actualDetachedNativeCommands: true, nativeAuthorityPreserved: true, visualAccuracy: 'unqualified', liveServiceCompatibility: 'unqualified', acceptedDevelopmentOutcome: 'unknown', savingsQualified: false } };
  const reportPath = save(join(directory, 'evaluation-pilot.json'), report);
  assert.equal(report.status, 'passed', `Installed evaluator proof failed; originals retained at ${reportPath}: ${failure}`);
  return { status: report.status, reportPath, cases: rows.length, fixtureDispatches: calls().length, canaryScan, cleanup: cleanup.confirmed, claims: report.claims };
}

/** Constituent installed proof, not a second evaluator, browser runner or live-provider test. */
export async function verifyEvaluationPilot(packageRoot, { output, generationDirectory } = {}) {
  const fixture = createEvaluationFixture(await inspectEvaluationPilot(packageRoot, generationDirectory), output);
  let failure = null, cleanup = null;
  try {
    fixture.profile = initializeEvaluationRepository(fixture);
    runEvaluationPublicCases(fixture);
    fixture.pack = prepareEvaluationPacks(fixture);
    const nativeExamples = nativeEvaluationExamples();
    for (const example of nativeExamples.filter(example => example.case !== 'outage')) runNativeEvaluationCase(fixture, example);
    await runOptionalEvaluationCallerCases(fixture);
    runOptionalEvaluationAbsenceCases(fixture);
    runManagedEvaluationCase(fixture);
    fixture.rows.push(await verifyUnselectedOptionalCore(fixture.packageRoot, generationDirectory, join(fixture.directory, 'unselected-core')));
    // The deliberate 503 retains its real cooldown, after every positive provider-calling case.
    runNativeEvaluationCase(fixture, nativeExamples.find(example => example.case === 'outage'));
    assert.deepEqual(fixture.rows.map(row => row.case), evaluationExecutionOrder());
    assert.equal(fixture.calls().length, 11, 'Only the frozen admitted fixture calls may dispatch');
    assert.ok(fixture.calls().every(call => call.credentialObserved && call.model === 'gpt-6-luna'));
    assert.equal(fixture.calls().filter(call => call.disposition === 'outage').length, 1, 'Outage must not retry');
  } catch (error) { failure = error instanceof Error ? error.message : 'Unknown installed evaluator proof failure'; }
  finally {
    cleanup = await cleanupEvaluationFixture(fixture);
    if (!cleanup.confirmed) failure ??= 'Native fixture cleanup remains unconfirmed';
  }
  return finishEvaluationPilot(fixture, failure, cleanup);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  console.log(JSON.stringify(await verifyEvaluationPilot(process.argv[2] ?? process.cwd(), { ...(process.argv[3] ? { output: process.argv[3] } : {}),
    ...(process.argv[4] ? { generationDirectory: process.argv[4] } : {}) })));
