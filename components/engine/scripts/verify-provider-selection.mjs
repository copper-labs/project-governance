import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Installed caller proof: a native fixture receives the selected packet on stdin, once per job. */
export async function verifyProviderSelection({ packageRoot, repo, temporary, run, write, environment, callsPath }) {
  const load = path => import(pathToFileURL(join(resolve(packageRoot), 'dist', `${path}.js`)).href);
  const { Store } = await load('harness/src/store/store');
  const { authorizeProviderAssignment } = await load('engine/src/provider-admission');
  const { authorizeProviderContinuation } = await load('engine/src/provider-continuation');
  const { ResourceRegistry } = await load('engine/src/resources');
  const trusted = join(temporary, 'selected-provider'); mkdirSync(trusted);
  const executable = join(trusted, 'native-fixture'), inputPath = join(trusted, 'input.txt');
  writeFileSync(executable, `#!${process.execPath}\nconst fs=require('node:fs'),args=process.argv;
    if(args.includes('--version')) { console.log('2.1.267 (Claude Code)'); process.exit(0); }
    let input=''; process.stdin.on('data',part=>input+=part); process.stdin.on('end',()=> {
      fs.writeFileSync(${JSON.stringify(inputPath)},input);
      console.log(JSON.stringify({type:'system',subtype:'init',model:args[args.indexOf('--model')+1],effort:args[args.indexOf('--effort')+1],session_id:'installed-fixture',permissionMode:'dontAsk',tools:['Read','Grep','Glob','StructuredOutput']}));
      console.log(JSON.stringify({type:'assistant',message:{content:[{type:'tool_use',id:'r',name:'Read',input:{file_path:'source.ts'}}]}}));
      console.log(JSON.stringify({type:'user',message:{content:[{type:'tool_result',tool_use_id:'r',content:'fixture source'}]}}));
      console.log(JSON.stringify({type:'result',subtype:'success',structured_output:{outcome:'completed',answer:'Read selected input',checks:[],sources:['source.ts'],artifacts:[],remaining:[]}}));
    });`); chmodSync(executable, 0o700);
  const config = join(trusted, 'models.json'), storePath = join(trusted, 'authority.sqlite'), registry = join(trusted, 'resources.sqlite');
  writeFileSync(config, JSON.stringify({ version: 1, providers: { claude: { model: 'fixture-baseline', effort: 'high', executable } } }));
  const store = new Store(storePath), task = store.createTask('Fix the source with the supplied context', [{ kind: 'scope', body: repo, provenance: 'operator' }]); store.close();
  const profile = { profile_id: 'fixture', context_router: { routes: [{ id: 'fix', match: { prompt_terms: ['Fix'] }, primary_context: ['rules.md'], skills: ['test-execution'] }] },
    continuity: { decisions: { mode: 'auto', allowed_data_classes: ['source'], allowed_source_paths: ['source.ts'], consumers: { DL03: { mode: 'auto' } } } } };
  write('config/governance/profile.yaml', profile);
  writeFileSync(join(repo, 'rules.md'), 'REQUIRED_CONTEXT_MARKER: preserve failures and original sources.');
  const source = Array.from({length:500},(_,i)=>`export const fixture${i} = 'some optional source context';`).join('\n');
  writeFileSync(join(repo, 'source.ts'), source);
  const request = { id: 'selected', provider: 'claude', workspace: repo, config, registry, access: 'reader', requiredTools: ['read'],
    prompt: task.outcome, assignment: { role: 'reviewer', constraints: 'Read only', context: '' }, deadlineMs: 10000, outputLimit: 100000,
    decision: { version: 1, workspace: repo, taskId: task.taskId, revision: String(task.version), requirement: task.outcome, acceptance: ['Use the supplied evidence'], sourcePaths: ['source.ts'] } };
  const path = join(trusted, 'admission.json'), directory = join(trusted, 'job'), requestPath = join(trusted, 'request.json');
  authorizeProviderAssignment({ store: storePath, taskId: task.taskId, path, request });
  writeFileSync(requestPath, JSON.stringify({ ...request, admission: path }));
  const submitArgs = ['provider-submit', '--request', requestPath, '--directory', directory];
  const submitted = run(submitArgs);
  const waited = run(['provider-wait', '--directory', directory, '--digest', submitted.requestDigest, '--milliseconds', '30000']);
  assert.equal(waited.receipt.state, 'succeeded');
  const captured = readFileSync(inputPath, 'utf8');
  assert.ok(captured.includes('REQUIRED_CONTEXT_MARKER')); assert.ok(captured.includes('source.ts')); assert.ok(!captured.includes(source));
  const retained = JSON.parse(readFileSync(join(directory, 'request.json'), 'utf8'));
  assert.equal(retained.decisionBinding.context.status, 'prepared-for-native-input');
  assert.ok(retained.decisionBinding.context.decisionReceipt);
  const before = readFileSync(callsPath, 'utf8');
  assert.equal(run(submitArgs).submitted, false); assert.equal(readFileSync(callsPath, 'utf8'), before);
  const readback = run(['provider-doctor', '--request', requestPath, '--directory', directory]);
  assert.equal(readback.routeCoverage, 'guarded-child'); assert.equal(readback.routing.status, 'baseline-only');
  delete environment.JEV_TOKEN;
  const fallback = { ...request, id: 'fallback' }, fallbackPath = join(trusted, 'fallback-admission.json'), fallbackDirectory = join(trusted, 'fallback');
  authorizeProviderAssignment({ store: storePath, taskId: task.taskId, path: fallbackPath, request: fallback });
  writeFileSync(requestPath, JSON.stringify({ ...fallback, admission: fallbackPath }));
  const next = run(['provider-submit', '--request', requestPath, '--directory', fallbackDirectory]);
  assert.equal(run(['provider-wait', '--directory', fallbackDirectory, '--digest', next.requestDigest, '--milliseconds', '30000']).receipt.state, 'succeeded');
  assert.equal(JSON.parse(readFileSync(join(fallbackDirectory, 'request.json'), 'utf8')).decisionBinding.context.reason, 'missing-token');
  assert.equal(readFileSync(callsPath, 'utf8'), before);
  writeFileSync(requestPath, JSON.stringify({ ...request, id: 'local-only', dataDestination: 'local-only' }));
  const localPreview = run(['provider-doctor', '--request', requestPath, '--directory', join(trusted, 'local-only')], 1);
  assert.match(localPreview.detail, /Local-only/);
  assert.equal(JSON.parse(run(['provider-submit', '--request', requestPath, '--directory', join(trusted, 'local-only')], 2).error).status, 'failed');
  assert.equal(readFileSync(callsPath, 'utf8'), before); assert.equal(existsSync(join(trusted, 'local-only')), false);
  const continuation = { id: 'stale-context', prompt: 'Clarify the same source summary', directory: join(trusted, 'stale-context') };
  const continuationPath = join(trusted, 'continuation.json');
  authorizeProviderContinuation({ parentDirectory: directory, parentDigest: submitted.requestDigest, next: continuation, context: request.decision, path: continuationPath });
  writeFileSync(join(repo, 'source.ts'), source + '\n// The inherited packet is now stale.\n');
  writeFileSync(requestPath, JSON.stringify({ ...continuation, admission: continuationPath }));
  const continued = run(['provider-follow-up', '--directory', directory, '--digest', submitted.requestDigest, '--request', requestPath]);
  const refused = run(['provider-wait', '--directory', continuation.directory, '--digest', continued.requestDigest, '--milliseconds', '30000'], 1);
  assert.equal(refused.receipt.reason, 'guarded-admission-changed'); assert.equal(refused.receipt.cleanup, 'confirmed');
  assert.equal(existsSync(join(continuation.directory, 'launch.json')), false);
  const resources = new ResourceRegistry(registry);
  try { assert.ok(resources.inspect().every(item => item.state === 'released')); } finally { resources.close(); }
  const { observeAndroidCapacity, observeAndroidEmulatorCleanup } = await load('engine/src/host-api-v1');
  const adapter = { serial: 'emulator-5564', adb: executable, lockPath: '/fixture/lock', capacity: { beforeStage: 'install', minimumAvailableBytes: 2048 } };
  const capacity = await observeAndroidCapacity(adapter, repo, async (_adapter, args) => args[0] === 'devices' ? 'List of devices attached\nemulator-5564\tdevice\n' : 'Filesystem 1024-blocks Used Available Capacity Mounted on\n/data 10 9 1 90% /data\n');
  assert.equal(capacity.state, 'insufficient');
  assert.ok(await observeAndroidEmulatorCleanup(['android-emulator:emulator-5564'], adapter, repo,
    { devices: async () => 'List of devices attached\n', portClosed: async () => true, lockAbsent: async () => true }));
  return { status: 'passed', installedAndroidAdapterFixture: true, actualStdin: true, nativeFixtureOnly: true, missingTokenFallback: true, staleContinuationRefused: true, replayCalls: 0 };
}
