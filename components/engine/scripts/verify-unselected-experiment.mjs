import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const hash = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const save = (path, value) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 }); return path; };

/** Tripwires reject before any network dispatch or optional caller/dependency load. */
export function unselectedNetworkGuard(journal, optionalRoot) {
  return `import{appendFileSync}from'node:fs';import{registerHooks}from'node:module';import http from'node:http';import https from'node:https';import net from'node:net';
const fail=kind=>{appendFileSync(${JSON.stringify(journal)},JSON.stringify({kind})+'\\n');throw Error('Unselected experiment touched '+kind)};
globalThis.fetch=()=>fail('network-fetch');for(const target of[http,https]){target.request=()=>fail('network-request');target.get=()=>fail('network-get')}
net.Socket.prototype.connect=function(){return fail('network-connect')};
registerHooks({resolve(specifier,context,next){if(['playwright','playwright-core','sharp'].some(name=>specifier===name||specifier.startsWith(name+'/'))||specifier.startsWith(${JSON.stringify(optionalRoot)})||specifier.startsWith(${JSON.stringify(pathToFileURL(optionalRoot).href)}))return fail('optional-dependency');return next(specifier,context)}});\n`;
}

export function assertUnselectedOptionalCore(report) {
  assert.equal(report.startup.action, 'reserve'); assert.equal(report.startup.reason, 'initial-startup');
  assert.equal(report.startup.discovery, 'complete'); assert.equal(report.startup.result.status, 'manual');
  assert.equal(report.resumedStartup.action, 'reserve'); assert.equal(report.resumedStartup.reason, 'existing-task');
  assert.equal(report.resumedStartup.taskId, report.startup.taskId);
  assert.equal(report.resumedStartup.root, report.startup.root); assert.equal(report.resumed.workspace.worktree, report.startup.root);
  assert.equal(report.resumed.ok, true); assert.equal(report.resumed.workspace.withinTaskScope, true);
  assert.equal(report.resumed.task.taskId, report.task.taskId);
  assert.equal(report.resumed.checkpoint.checkpointId, report.checkpoint.checkpointId);
  assert.equal(report.resumed.attempt.attemptId, report.checkpoint.attemptId);
  assert.deepEqual(report.checked.plan.selected_packs, ['independent']); assert.deepEqual(report.checked.plan.execution_order, ['independent']);
  assert.deepEqual(report.checked.plan.changed_paths, ['src/native.fixture']);
  assert.equal(report.checked.plan.omitted_packs['optional-experiment'], 'not selected by the requested scope');
  assert.deepEqual(report.checked.results.map(item => item.pack_id), ['independent']); assert.equal(report.checked.status, 'passed');
  assert.equal(report.checked.results[0].commands[0].command_receipt.cleanup, 'confirmed');
  assert.equal(report.optionalEntered, false); assert.equal(report.networkOrDependencyTouched, false);
  assert.equal(report.corePayloadUnchanged, true); assert.equal(report.optionalDependenciesInstalled, false);
  assert.deepEqual(report.finalGeneration.readers, []); assert.equal(report.finalGeneration.maintenance, null);
}

/** One caller workspace exercises real installed owners with an explicitly registered, unselected experiment. */
export async function verifyUnselectedOptionalCore(packageRoot, generationDirectory, output) {
  const pkg = realpathSync(packageRoot), root = resolve(output), source = realpathSync(fileURLToPath(new URL('../../..', import.meta.url)));
  assert.ok(root !== pkg && !root.startsWith(pkg + '/') && root !== source && !root.startsWith(source + '/'), 'Caller proof belongs outside source and installed payload');
  assert.equal(existsSync(root), false, 'Retain prior caller trials'); mkdirSync(root, { recursive: true, mode: 0o700 });
  const load = name => import(pathToFileURL(join(pkg, `dist/engine/src/${name}.js`)).href);
  const [{ RuntimeGenerations }, { inspectRuntimeGeneration }, { runtimeLauncher }, { runtimeTree }] = await Promise.all([
    load('runtime-generations'), load('runtime-inspection'), load('runtime-launcher'), load('runtime-tree'),
  ]);
  const installation = inspectRuntimeGeneration(generationDirectory), installationReceipt = JSON.parse(readFileSync(join(installation.directory, 'installation.json'))),
    originalTree = runtimeTree(pkg), manifest = JSON.parse(readFileSync(join(pkg, 'package.json')));
  assert.deepEqual(installation.installedTree, originalTree);
  for (const dependency of ['playwright', 'playwright-core', 'sharp']) {
    assert.equal(manifest.dependencies?.[dependency], undefined); assert.equal(existsSync(join(pkg, 'node_modules', dependency)), false);
  }
  const workspace = join(root, 'repo'), registry = join(root, 'installation.sqlite'), receipts = join(root, 'startup.sqlite'),
    state = join(root, 'state'), optionalEntered = join(root, 'optional-entered.jsonl'), networkJournal = join(root, 'network-or-dependency.jsonl'),
    optionalRoot = fileURLToPath(new URL('../test/fixtures/optional-computer-use', import.meta.url)), guard = join(root, 'no-network.mjs'), marker = join(root, 'optional-entry.mjs'),
    launcher = join(workspace, '.governance/runtime/bin/project-governance'), native = join(root, 'independent.mjs');
  mkdirSync(dirname(launcher), { recursive: true }); mkdirSync(join(workspace, 'src'));
  writeFileSync(guard, unselectedNetworkGuard(networkJournal, optionalRoot));
  writeFileSync(marker, `import{appendFileSync}from'node:fs';appendFileSync(${JSON.stringify(optionalEntered)},'entered\\n');await import(${JSON.stringify(pathToFileURL(guard).href)});\n`);
  writeFileSync(native, `import assert from'node:assert/strict';assert.ok(!process.env.OPENAI_API_KEY&&!process.env.JEV_TOKEN&&!process.env.ENGINE_UNSELECTED_TOKEN);console.log(JSON.stringify({status:'passed',findings:[]}));\n`);
  save(join(workspace, 'config/governance/runtime.lock.yaml'), installationReceipt.lock);
  save(join(workspace, 'config/governance/profile.yaml'), { runtime_updates: { policy: 'manual' }, continuity: { decisions: { mode: 'off' } } });
  const pack = (id, glob, run) => ({ id, enforcement: 'blocking', stages: ['optional-isolation'], path_globs: [glob], run_when: 'matched', commands: [{ run }] });
  save(join(workspace, 'config/validation/packs/independent.yaml'), pack('independent', 'src/**', [process.execPath, '--import', guard, native]));
  save(join(workspace, 'config/validation/packs/optional-experiment.yaml'), pack('optional-experiment', 'optional-experiment/**',
    [process.execPath, '--import', marker, join(optionalRoot, 'command.ts'), '--mode', 'readiness']));
  writeFileSync(join(workspace, 'src/native.fixture'), 'Before the unrelated native change.\n');
  const environment = { ...process.env, XDG_STATE_HOME: state };
  for (const key of Object.keys(environment)) if (/^(GOVERNANCE_|HARNESS_)/u.test(key) || ['NODE_OPTIONS', 'CODEX_THREAD_ID', 'OPENAI_API_KEY', 'JEV_TOKEN', 'ENGINE_UNSELECTED_TOKEN', 'GH_TOKEN', 'GITHUB_TOKEN'].includes(key)) delete environment[key];
  const git = (...args) => execFileSync('git', args, { cwd: workspace, env: environment, stdio: 'pipe' });
  git('init', '-q');
  const custody = () => { const status = git('status', '--porcelain=v1', '-z').toString(), diff = hash(git('diff', '--binary'));
    return { index: hash(readFileSync(join(workspace, '.git/index'))), diff, status }; }, generations = new RuntimeGenerations(registry);
  try {
    generations.activate(installation.directory, 0);
    writeFileSync(launcher, runtimeLauncher(process.execPath, installation.executable, registry, workspace), { mode: 0o700 });
    // Freeze installation and configuration before changing only the unrelated native slice.
    git('add', '--', 'config', 'src', '.governance/runtime/bin/project-governance');
    git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'Freeze unselected experiment caller');
    writeFileSync(join(workspace, 'src/native.fixture'), 'The unrelated native change.\n');
    const beforeCustody = custody();
    const session = 'unselected-optional-host', event = { session_id: session, hook_event_name: 'SessionStart', source: 'startup', cwd: workspace },
      startPath = save(join(root, 'startup-event.json'), event), resumePath = save(join(root, 'resume-event.json'), { ...event, source: 'resume' }),
      endPath = save(join(root, 'end-event.json'), { ...event, hook_event_name: 'SessionEnd' }), parent = join(root, 'native-parent.mjs');
    // Explicit child preloads exercise the installed command; filtered workers need no widened environment.
    writeFileSync(parent, `import assert from'node:assert/strict';import{spawnSync}from'node:child_process';import{writeFileSync}from'node:fs';process.title='codex';
const workspace=${JSON.stringify(workspace)},cli=${JSON.stringify(installation.executable)},guard=${JSON.stringify(guard)},env={...process.env,HARNESS_SESSION:${JSON.stringify(session)}},commands=[];
const invoke=(args,expected=0)=>{const result=spawnSync(process.execPath,['--import',guard,cli,...args],{cwd:workspace,env,encoding:'utf8',timeout:30000,maxBuffer:4194304});commands.push({args,status:result.status,stdout:result.stdout,stderr:result.stderr});writeFileSync(${JSON.stringify(join(root, 'native-dispatches.json'))},JSON.stringify(commands,null,2)+'\\n');assert.equal(result.status,expected,result.stderr||result.error?.message);return JSON.parse(result.stdout)};
const startup=path=>invoke(['startup','observe','--provider','codex','--event-file',path,'--workspace',workspace,'--registry',${JSON.stringify(registry)},'--receipts',${JSON.stringify(receipts)}]);
let report={},failure=null;try{report.startup=startup(${JSON.stringify(startPath)});report.task=invoke(['harness','task','create','--outcome','Preserve the unrelated native operation','--scope',workspace]).task;
report.checkpoint=invoke(['harness','checkpoint','--summary','The unrelated slice is ready for its native check.','--next','Run only the selected independent check.']).checkpoint;
report.resumedStartup=startup(${JSON.stringify(resumePath)});report.resumed=invoke(['harness','resume']);report.checked=invoke(['check','--stage','optional-isolation','--mode','impacted','--base-ref','HEAD','--trigger','test','--expected-status','passed','--timeout-seconds','30']);}
catch(error){failure=error.message}finally{try{report.ended=startup(${JSON.stringify(endPath)})}catch(error){failure??=error.message}}
writeFileSync(${JSON.stringify(join(root, 'caller-original.json'))},JSON.stringify({parentPid:process.pid,...report,failure},null,2)+'\\n');if(failure)throw Error(failure);console.log(JSON.stringify(report));\n`);
    const result = spawnSync(process.execPath, [parent], { cwd: workspace, env: environment, encoding: 'utf8', timeout: 180000, maxBuffer: 4 * 1024 * 1024 });
    save(join(root, 'parent-dispatch.json'), { executable: process.execPath, args: [parent], cwd: workspace, status: result.status, stdout: result.stdout, stderr: result.stderr, error: result.error?.message ?? null });
    assert.equal(result.status, 0, 'Installed unselected caller failed; retained parent and command originals identify the boundary');
    const original = JSON.parse(readFileSync(join(root, 'caller-original.json'))), afterCustody = custody(), report = { ...original,
      optionalEntered: existsSync(optionalEntered), networkOrDependencyTouched: existsSync(networkJournal), corePayloadUnchanged: hash(JSON.stringify(runtimeTree(pkg))) === hash(JSON.stringify(originalTree)),
      optionalDependenciesInstalled: false, finalGeneration: generations.state(), custody: { before: beforeCustody, after: afterCustody } };
    assert.deepEqual(afterCustody, beforeCustody, 'Startup, resume and native check must preserve unrelated source and staged custody');
    assertUnselectedOptionalCore(report); assert.equal(report.ended.action, 'close');
    const path = save(join(root, 'unselected-core-proof.json'), { version: 1, status: 'passed', ...report,
      installation: { directory: installation.directory, archiveDigest: installation.archiveDigest, lockDigest: installation.lockDigest, installedTree: originalTree },
      claims: { externalCalls: 0, optionalDependenciesLoaded: false, optionalCommandSelected: false, actualInstalledOwners: true,
        networkProof: 'Explicit CLI and native-child tripwires; updates manual and worker decisions off. No ambient preload forwarding.',
        acceptedDevelopment: 'unknown', realHostConsumption: 'unknown', visualAccuracy: 'unqualified' } });
    return { case: 'unselected-optional-core', status: 'passed', original: { path, digest: hash(readFileSync(path)) },
      startup: 'passed', resume: 'passed', unrelatedNativeCheck: 'passed', optionalCommandSelected: false,
      optionalDependenciesLoaded: false, networkCalls: 0, custody: 'preserved', cleanup: 'confirmed', installation: installation.archiveDigest };
  } finally { generations.close(); }
}
