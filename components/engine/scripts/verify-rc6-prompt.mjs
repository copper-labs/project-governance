import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, realpathSync, rmSync, existsSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Prove a prompt's temporary generation reader closes or can be recovered after abrupt exit. */
async function verifyPromptReaderRecovery({ packageRoot, temporary, workspace, environment }) {
  const rolloverUrl = pathToFileURL(join(packageRoot, 'dist/engine/src/startup-prompt-rollover.js')).href;
  const generationsUrl = pathToFileURL(join(packageRoot, 'dist/engine/src/runtime-generations.js')).href;
  const recoveryUrl = pathToFileURL(join(packageRoot, 'dist/engine/src/startup-observation-owner.js')).href;
  const { withCurrentRuntimePrompt } = await import(rolloverUrl);
  const { RuntimeGenerations } = await import(generationsUrl);
  const { recoverStartupObservation } = await import(recoveryUrl);
  const registry = join(temporary, 'installation.sqlite');
  const readers = () => { const g = new RuntimeGenerations(registry); try { return g.state().readers; } finally { g.close(); } };
  const beforeReaders = readers().length;
  await withCurrentRuntimePrompt(workspace, registry, async () => {
    assert.equal(readers().length, beforeReaders + 1);
  });
  assert.equal(readers().length, beforeReaders);
  await assert.rejects(withCurrentRuntimePrompt(workspace, registry, async () => {
    throw new Error('fixture prompt failure');
  }), /fixture prompt failure/);
  assert.equal(readers().length, beforeReaders);
  const child = `import {withCurrentRuntimePrompt} from ${JSON.stringify(rolloverUrl)};
    import {RuntimeGenerations} from ${JSON.stringify(generationsUrl)};
    await withCurrentRuntimePrompt(${JSON.stringify(workspace)},${JSON.stringify(registry)},async()=>{
      const g=new RuntimeGenerations(${JSON.stringify(registry)});
      const row=g.state().readers.find(item=>item.owner.startsWith('startup-observation:v1:'));
      console.log(JSON.stringify({token:row.token})); g.close(); process.exit(7);
    });`;
  let abandoned;
  try { execFileSync(process.execPath, ['--input-type=module', '-e', child], { cwd: workspace, env: environment, encoding: 'utf8', timeout: 10000 }); }
  catch (error) { assert.equal(error.status, 7); abandoned = JSON.parse(error.stdout); }
  assert.ok(abandoned?.token);
  assert.equal(readers().length, beforeReaders + 1);
  assert.equal(recoverStartupObservation(workspace, registry, abandoned.token, 'installed-fixture:exited-prompt').status, 'released');
  assert.equal(readers().length, beforeReaders);
  return { RuntimeGenerations, registry, readers, beforeReaders };
}

/** Exercise native owner rollover through the installed launcher without changing the old owner. */
async function verifyOwnerRollover({ packageRoot, temporary, workspace, environment, launcher, registry, readers,
  beforeReaders, invoke, RuntimeGenerations, event }) {
  const { StartupTasks } = await import(pathToFileURL(join(packageRoot, 'dist/engine/src/startup-tasks.js')).href);
  const seedPriorHost = (session, pid) => {
    const receipts = join(dirname(registry), 'startup.sqlite');
    const prompt = { ...event, session_id: session, turn_id: 'resumed-turn' };
    const tasks = new StartupTasks(receipts);
    const lockDigest = 'sha256:' + createHash('sha256').update(readFileSync(join(workspace, 'config/governance/runtime.lock.yaml'))).digest('hex');
    const task = tasks.event('codex', prompt, workspace, lockDigest, environment);
    assert.equal(task.action, 'reserve');
    const generations = new RuntimeGenerations(registry);
    const reader = generations.reserveStartupTask(task.taskId);
    tasks.bindOwner(task.taskId, { provider: 'codex', host: hostname(), pid, fingerprint: `prior-${session}` }, { registry, ...reader });
    generations.close(); tasks.close();
    return { receipts, prompt, reader };
  };
  const invokeNativePrompt = (receipts, nativeEvent) => {
    // A titled parent exercises the real native-ancestor check and installed command path.
    const ownerUrl = pathToFileURL(join(packageRoot, 'dist/engine/src/startup-host-owner.js')).href;
    const command = `import {spawnSync} from 'node:child_process';
      process.title='codex';
      const probe=spawnSync(process.execPath,['--input-type=module','-e',
        ${JSON.stringify(`import {captureStartupHostOwner} from ${JSON.stringify(ownerUrl)}; console.log(JSON.stringify(captureStartupHostOwner('codex')));`)}],
        {cwd:${JSON.stringify(workspace)},env:process.env,encoding:'utf8',timeout:5000});
      const result=spawnSync(${JSON.stringify(launcher)},${JSON.stringify(['startup', 'observe', '--provider', 'codex', '--event-stdin', '--workspace', workspace, '--registry', registry, '--receipts', receipts])},
        {cwd:${JSON.stringify(workspace)},env:process.env,input:${JSON.stringify(JSON.stringify(nativeEvent))},encoding:'utf8',timeout:50000,maxBuffer:1048576});
      process.stdout.write(JSON.stringify({parentPid:process.pid,probeStatus:probe.status,captured:JSON.parse(probe.stdout||'null'),
        status:result.status,stdout:result.stdout,stderr:result.stderr,error:result.error?.message}));`;
    const parent = spawnSync(process.execPath, ['--input-type=module', '-e', command],
      { cwd: workspace, env: environment, encoding: 'utf8', timeout: 55000, maxBuffer: 1024 * 1024 });
    assert.equal(parent.status, 0, parent.stderr || parent.error?.message);
    const result = JSON.parse(parent.stdout);
    assert.equal(result.probeStatus, 0);
    assert.equal(result.captured?.pid, result.parentPid, 'The titled fixture parent must be the captured host');
    assert.equal(result.status, 0, result.stderr || result.error);
    return JSON.parse(result.stdout);
  };
  const exitedHost = spawnSync(process.execPath, ['-e', ''], { cwd: workspace, env: environment, timeout: 5000 });
  assert.equal(exitedHost.status, 0);
  const departed = seedPriorHost('departed-host', exitedHost.pid);
  assert.equal(readers().length, beforeReaders + 1);
  const resumedPrompt = invokeNativePrompt(departed.receipts, departed.prompt);
  assert.match(resumedPrompt.hookSpecificOutput.additionalContext, /app.ts/);
  assert.deepEqual(invokeNativePrompt(departed.receipts,
    { ...departed.prompt, hook_event_name: 'SessionStart', source: 'resume' }), {});
  assert.equal(readers().length, beforeReaders + 1, 'The old startup reader stays held after rollover');
  const rolloverStatus = invoke(launcher, ['telemetry', 'context', 'status']);
  assert.equal(rolloverStatus.counts['context-observations:startup-owner-rollover'], 1);
  const present = seedPriorHost('present-host', process.pid);
  const refusedRollover = invokeNativePrompt(present.receipts, present.prompt);
  assert.match(refusedRollover.hookSpecificOutput.additionalContext, /lifecycle is unavailable/);
  assert.equal(invoke(launcher, ['telemetry', 'context', 'status']).counts['context-observations:startup-owner-rollover'], 1);
  invokeNativePrompt(departed.receipts, { ...departed.prompt, hook_event_name: 'SessionEnd' });
  assert.equal(readers().length, beforeReaders + 1, 'Only the departed owner was retired');
  // The deliberately live owner belongs to this fixture, so tear its exact row down locally.
  const fixtureCleanup = new RuntimeGenerations(registry);
  assert.equal(fixtureCleanup.releaseConfirmed(present.reader.token, present.reader.owner, present.reader.revision), true);
  fixtureCleanup.close();
  assert.equal(readers().length, beforeReaders);
}

function startupReceiptFingerprint(directory) {
  return ['startup.sqlite', 'startup.sqlite-wal', 'startup.sqlite-shm'].map(name => {
    const path = join(directory, name);
    return existsSync(path) ? createHash('sha256').update(readFileSync(path)).digest('hex') : null;
  });
}

/** The tracked hook must execute in the sibling, then leave the primary's store untouched. */
async function verifyLinkedNativeHooks({ packageRoot, sibling, siblingRegistry, temporary, environment }) {
  const { contextDoctor } = await import(pathToFileURL(join(packageRoot, 'dist/engine/src/context-doctor.js')).href);
  const report = contextDoctor(sibling);
  assert.equal(report.promptHook, 'configured');
  assert.equal(report.promptHookSource.shared, true);
  // Match Codex's definition source, rather than accidentally testing only the linked copy.
  const hooks = JSON.parse(readFileSync(report.promptHookSource.path, 'utf8')).hooks;
  const siblingReceipts = join(dirname(siblingRegistry), 'startup.sqlite'),primaryBefore=startupReceiptFingerprint(temporary);
  assert.equal(existsSync(siblingReceipts), false);
  const event = { session_id: 'linked-host', hook_event_name: 'SessionStart', source: 'resume', cwd: sibling };
  const nested = join(sibling, 'nested'); mkdirSync(nested);
  const invoke = (name, input, cwd = sibling) => {
    const command = hooks[name][0].hooks[0].command;
    // Native receipt creation requires an identifiable Codex ancestor, as in a real hook call.
    const child = `import {spawnSync} from 'node:child_process';
      process.title='codex';
      const result=spawnSync('/bin/sh',['-c',${JSON.stringify(command)}],{cwd:${JSON.stringify(cwd)},env:process.env,
        input:${JSON.stringify(JSON.stringify(input))},encoding:'utf8',timeout:50000,maxBuffer:1048576});
      if(result.stdout)process.stdout.write(result.stdout);
      if(result.stderr)process.stderr.write(result.stderr);
      if(result.error)process.stderr.write(result.error.message);
      process.exit(result.status??1);`;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', child], { cwd, env: environment,
      encoding: 'utf8', timeout: 55000, maxBuffer: 1024 * 1024 });
    assert.equal(result.status, 0, result.stderr || result.stdout || result.error?.message);
    return JSON.parse(result.stdout);
  };
  invoke('SessionStart', event, nested);
  assert.equal(existsSync(siblingReceipts), true);
  const prompt = invoke('UserPromptSubmit', { ...event, hook_event_name: 'UserPromptSubmit',
    turn_id: 'linked-turn', prompt: 'Fix app.ts in this worktree.' });
  assert.match(prompt.hookSpecificOutput.additionalContext, /app.ts/);
  invoke('SessionEnd', { ...event, hook_event_name: 'SessionEnd' });
  assert.deepEqual(startupReceiptFingerprint(temporary), primaryBefore, 'The sibling must not write primary startup receipts');
}

/** A pin arriving by merge is reconciled in that worktree after its existing reader drains. */
async function verifyWorktreeCutover({ packageRoot, archive, temporary, workspace, environment, lock }) {
  const { runtimeMigrationPlan } = await import(pathToFileURL(join(packageRoot, 'dist/engine/src/runtime-migration-plan.js')).href);
  const { RuntimeGenerations } = await import(pathToFileURL(join(packageRoot, 'dist/engine/src/runtime-generations.js')).href);
  const { runtimeDoctor } = await import(pathToFileURL(join(packageRoot, 'dist/engine/src/runtime-doctor.js')).href);
  const { runtimeOperationCommand } = await import(pathToFileURL(join(packageRoot, 'dist/engine/src/runtime-operation-command.js')).href);
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, env: environment, encoding: 'utf8', timeout: 30000 }).trim();
  const install = async (mode, target, registry, nextLock, suffix, lockedCheckout = false) => {
    const plan = runtimeMigrationPlan(target), planPath = join(temporary, `${suffix}-plan.json`);
    const requestPath = join(temporary, `${suffix}-request.json`), operation = join(temporary, `${suffix}-operation`);
    const generations = mode === 'init' ? null : new RuntimeGenerations(registry);
    let expectedRevision = 0;
    try { if (generations) expectedRevision = generations.state().revision; }
    finally { generations?.close(); }
    writeFileSync(planPath, JSON.stringify(plan));
    writeFileSync(requestPath, JSON.stringify({ mode, workspace: target, registry, archive, lock: nextLock,
      expectedRevision, inputs: plan.inputs, hostPlan: plan.hostPlan, ...(lockedCheckout ? { lockedCheckout: true } : {}) }));
    const result = await runtimeOperationCommand(mode, ['--request-file', requestPath, '--project-plan', planPath,
      '--operation-directory', operation]);
    assert.equal(result.state.maintenance, null);
  };
  git(workspace, 'config', 'user.name', 'Fixture'); git(workspace, 'config', 'user.email', 'fixture@example.invalid');
  git(workspace, 'config', 'extensions.worktreeConfig', 'true');
  git(workspace, 'config', '--worktree', 'core.hooksPath', '.githooks');
  git(workspace, 'add', '.');
  if (git(workspace, 'diff', '--cached', '--name-only'))
    git(workspace, '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'Pin initial runtime');
  const integrationBranch = git(workspace, 'branch', '--show-current');
  const sibling = join(temporary, 'linked-worktree'), siblingRegistry = join(sibling, '.governance/installation.sqlite');
  git(workspace, 'worktree', 'add', '-q', '-b', 'fixture-feature', sibling, 'HEAD');
  const sharedPath = join(workspace, '.codex/hooks.json'), sharedBytes = readFileSync(sharedPath, 'utf8');
  const obsolete = JSON.parse(sharedBytes);
  for (const groups of Object.values(obsolete.hooks)) for (const group of groups) for (const handler of group.hooks)
    if (handler.command?.includes('startup observe')) handler.command = 'python3 "$(git rev-parse --show-toplevel)/tools/governance-startup.py" codex';
  writeFileSync(sharedPath, JSON.stringify(obsolete));
  try {
    await assert.rejects(install('init', sibling, siblingRegistry, lock, 'shared-source-rejected', true), /Shared Codex hook source/);
    assert.equal(existsSync(siblingRegistry), false, 'Shared-source failure precedes runtime mutation');
    assert.equal(existsSync(join(temporary, 'shared-source-rejected-operation')), false);
    assert.equal(readFileSync(sharedPath, 'utf8'), JSON.stringify(obsolete), 'A sibling cannot repair the main checkout implicitly');
  } finally { writeFileSync(sharedPath, sharedBytes); }
  await install('init', sibling, siblingRegistry, lock, 'linked-init', true);
  assert.equal(runtimeDoctor(sibling, siblingRegistry).status, 'passed');
  await verifyLinkedNativeHooks({packageRoot,sibling,siblingRegistry,temporary,environment});
  const siblingGenerations = new RuntimeGenerations(siblingRegistry), reader = siblingGenerations.acquire('fixture:active-job');
  const pinnedDirectory = reader.directory;
  try {
    const nextLock = { ...lock, source_commit: 'b'.repeat(40) };
    const integration = new RuntimeGenerations(join(temporary, 'installation.sqlite'));
    try { assert.equal(integration.state().readers.length, 0, JSON.stringify(integration.state().readers)); }
    finally { integration.close(); }
    const hookPath = join(workspace, '.codex/hooks.json'), portableHooks = readFileSync(hookPath, 'utf8');
    const oldHooks = JSON.parse(portableHooks);
    for (const groups of Object.values(oldHooks.hooks)) for (const group of groups) for (const handler of group.hooks)
      if (handler.command?.includes('startup observe')) handler.command = `'${join(workspace, '.governance/runtime/bin/project-governance')}' startup observe --provider codex --event-stdin --receipts '${join(temporary, 'startup.sqlite')}'`;
    writeFileSync(hookPath, JSON.stringify(oldHooks));
    await assert.rejects(install('update', workspace, join(temporary, 'installation.sqlite'), nextLock, 'old-hook-update'),
      /deliberate RC6 cutover/);
    writeFileSync(hookPath, portableHooks);
    await install('update', workspace, join(temporary, 'installation.sqlite'), nextLock, 'integration-update');
    const siblingHookPath=join(sibling,'.codex/hooks.json'),siblingPortable=readFileSync(siblingHookPath,'utf8');
    writeFileSync(siblingHookPath,JSON.stringify(oldHooks));
    const primaryAfterUpdate=startupReceiptFingerprint(temporary);
    for(const name of ['SessionStart','SessionEnd']) {
      const stale=spawnSync('/bin/sh',['-c',oldHooks.hooks[name][0].hooks[0].command],
        {cwd:sibling,env:environment,input:JSON.stringify({session_id:'stale-sibling',hook_event_name:name,cwd:sibling,source:'resume'}),
          encoding:'utf8',timeout:5000});
      assert.equal(stale.status,0,stale.stderr||stale.error?.message);
      assert.deepEqual(JSON.parse(stale.stdout),{});
    }
    assert.deepEqual(startupReceiptFingerprint(temporary),primaryAfterUpdate,'An RC5 sibling hook cannot write primary receipts');
    writeFileSync(siblingHookPath,siblingPortable);
    assert.equal(siblingGenerations.state().directory, pinnedDirectory);
    assert.equal(siblingGenerations.state().readers.length, 1);
    assert.equal(JSON.parse(readFileSync(join(sibling, 'config/governance/runtime.lock.yaml'), 'utf8')).source_commit, lock.source_commit);
    git(workspace, 'add', '.');
    git(workspace, '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'Approve new runtime pin');
  } finally { siblingGenerations.release(reader.token, reader.owner); siblingGenerations.close(); }
  writeFileSync(join(sibling, 'feature.ts'), 'export const feature = true;\n');
  git(sibling, 'add', 'feature.ts');
  git(sibling, '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'Feature work');
  git(sibling, 'merge', '--no-commit', '--no-ff', integrationBranch);
  assert.equal(existsSync(git(sibling, 'rev-parse', '--path-format=absolute', '--git-path', 'MERGE_HEAD')), true);
  assert.equal(runtimeDoctor(sibling, siblingRegistry).findings.some(item => item.id === 'installation.lock-mismatch'), true);
  writeFileSync(join(sibling, 'unrelated.txt'), 'preserve staged content\n');
  git(sibling, 'add', 'unrelated.txt');
  const preserved = git(sibling, 'show', ':unrelated.txt');
  await install('update', sibling, siblingRegistry, { ...lock, source_commit: 'b'.repeat(40) }, 'linked-update');
  assert.equal(git(sibling, 'show', ':unrelated.txt'), preserved);
  const unstaged = git(sibling, 'diff', '--name-only').split('\n').filter(Boolean);
  for (const path of unstaged) {
    assert.match(path, /^(?:config\/|\.githooks\/|\.codex\/|\.claude\/|\.agents\/|AGENTS\.md|CLAUDE\.md|GEMINI\.md)/u);
    git(sibling, 'add', '--', path);
  }
  assert.equal(runtimeDoctor(sibling, siblingRegistry).status, 'passed');
  const mergedLock = readFileSync(join(sibling, 'config/governance/runtime.lock.yaml'), 'utf8');
  assert.equal(git(sibling, 'show', ':config/governance/runtime.lock.yaml'), mergedLock.trimEnd());
  git(sibling, 'commit', '-qm', 'Integrate approved runtime pin', '-m',
    'The destination worktree reconciles its installed runtime after the pin arrives by merge, while preserving the staged feature work.');
  assert.equal(runtimeDoctor(sibling, siblingRegistry).status, 'passed');
  assert.equal(git(workspace, 'config', '--worktree', 'core.hooksPath'), '.githooks');
}

/** Qualify the installed launcher and stdin protocol in an unborn disposable repository. */
/** Check task transitions through the installed launcher without disturbing later lifecycle proof. */
function verifyTaskSwitch({ invoke, launcher, workspace, environment, session, calls }) {
  environment.HARNESS_SESSION = session;
  const first = invoke(launcher, ['harness', 'task', 'create', '--outcome', 'First app task', '--scope', workspace]);
  assert.equal(first.contextEntry.status, 'linked');
  const second = invoke(launcher, ['harness', 'task', 'create', '--outcome', 'Repair app launch', '--scope', workspace]);
  assert.equal(second.contextEntry.status, 'refresh-required');
  const refreshed = invoke(launcher, ['context-route', '--task', 'Repair app launch']);
  assert.equal(refreshed.selection.binding.taskId, second.task.taskId);
  assert.equal(refreshed.expansion.entry, first.contextEntry.entryId);
  assert.ok(refreshed.expansion.transitionId);
  assert.equal(refreshed.timing.operationBudgetMs, 45000);
  assert.equal(refreshed.metadata.reason, 'answered');
  assert.equal(readFileSync(calls, 'utf8').trim().split('\n').length, 2);
  delete environment.HARNESS_SESSION;
}

/** A reviewed larger envelope must survive the installed hook, replay and doctor. */
function verifyNativeEnvelope({ invoke, hooks, workspace, launcher, event }) {
  const path = join(workspace, 'config/governance/profile.yaml'), before = readFileSync(path);
  const policy = join(workspace, 'required-policy.md');
  const turn = { ...event, session_id: 'large-packet-host', turn_id: 'large-packet-turn' };
  try {
    writeFileSync(policy, 'Required current guidance.\n'.repeat(1200));
    writeFileSync(path, JSON.stringify({ context_router: { default_route: 'project', default_context: ['required-policy.md'], routes: [{ id: 'project',
      token_budget: { primary_context_tokens: 9000, total_context_tokens: 14000 } }] } }));
    const output = invoke('/bin/sh', ['-c', hooks.hooks.UserPromptSubmit[0].hooks[0].command], JSON.stringify(turn));
    const text = output.hookSpecificOutput.additionalContext;
    assert.ok(Buffer.byteLength(text) > 24000 && Buffer.byteLength(text) <= 56000);
    assert.ok(text.includes(readFileSync(policy, 'utf8')));
    assert.deepEqual(invoke('/bin/sh', ['-c', hooks.hooks.UserPromptSubmit[0].hooks[0].command], JSON.stringify(turn)), output);
    const doctor = invoke(launcher, ['doctor', '--capability', 'context']);
    assert.ok(doctor.budgets.routes.every(route => route.status === 'fits'));
  } finally {
    invoke('/bin/sh', ['-c', hooks.hooks.SessionEnd[0].hooks[0].command], JSON.stringify({ ...turn, hook_event_name: 'SessionEnd' }));
    writeFileSync(path, before); rmSync(policy, { force: true });
  }
}

/** Exercise procedure/source delivery and exact reuse through the shipped native hook. */
function verifyRc10Delivery({ invoke, hooks, workspace, launcher, environment, temporary, event }) {
  const profile = join(workspace, 'config/governance/profile.yaml'), before = readFileSync(profile), app = readFileSync(join(workspace, 'app.ts'));
  const guide = join(workspace, 'recovery.md'), assertion = join(workspace, 'app.test.ts'), calls = join(temporary, 'delivery-calls.jsonl'), preload = join(temporary, 'delivery-fixture.mjs');
  const oldSession = environment.HARNESS_SESSION, oldOptions = environment.NODE_OPTIONS, oldToken = environment.JEV_TOKEN;
  const turn = { ...event, session_id: 'delivery-host', turn_id: 'delivery-turn', prompt: 'Retain the original result when a run closes; use the recovery procedure and its assertion.' };
  // Unborn startup was proved above. Ordinary development starts from a committed installation,
  // so generated host files do not consume slots reserved for explicitly changed source.
  execFileSync('git', ['add', '.'], { cwd: workspace, env: environment });
  execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
    'commit', '-qm', 'Install the fixture runtime'], { cwd: workspace, env: environment });
  try {
    writeFileSync(guide, '# Recovery\nKeep the operator original.\n\n## Retained result\nNever delete the saved original run.\n' + 'Preserve the exact prior result and its trace.\n'.repeat(130));
    writeFileSync(join(workspace, 'app.ts'), 'export function closeRun(record) {\n' + '  inspectRecordedOwner(record);\n'.repeat(150) + '  if (record.closed) return record.original;\n}\n');
    writeFileSync(assertion, "test('the original survives closeout', () => {\n" + '  inspectRecordedFixture();\n'.repeat(50) + '  assert.equal(closeRun(closedRecord), closedRecord.original);\n});\n');
    writeFileSync(profile, JSON.stringify({ context_router: { default_route: 'project', optional_excerpt_bytes: 8192, procedure_sources: ['recovery.md'], routes: [{ id: 'project', token_budget: { expansion_context_tokens: 4000, total_context_tokens: 14000 } }] },
      continuity: { decisions: { mode: 'auto', evidence_bytes: 16384, max_candidates: 64, allowed_data_classes: ['metadata', 'source'], allowed_metadata_paths: ['app.ts', 'app.test.ts', 'recovery.md'], allowed_source_paths: ['app.ts', 'app.test.ts', 'recovery.md'],
        budget: { max_calls: 32, max_request_bytes: 524288 }, consumers: { DL03: { mode: 'auto', questions: ['context.metadata-relevance/1', 'context.passage-evidence/1', 'context.passage-role/1'] } } } } }));
    writeFileSync(preload, `import {appendFileSync} from 'node:fs'; globalThis.fetch=async(url,init)=>{
      if(url!=='https://api.typesafe.ai/v1/systemone') throw Error('Unexpected provider');
      const wire=JSON.parse(init.body); if(wire.state.layout!=='compact-v1') throw Error('Missing compact layout');
      appendFileSync(${JSON.stringify(calls)},JSON.stringify({questions:Object.keys(wire.questions).length})+'\\n');
      return Response.json({model:'jev-1.13.0',answers:Object.fromEntries(Object.entries(wire.questions).map(([name,q])=>{
        const key=q.instructions.question.match(/state\\.items\\.(c\\d+)/)?.[1],item=wire.state.items[key];
        if(!item)throw Error('Unnamed source item');
        return [name,{type:'noul',noul:item.passage?0.95:item.path==='recovery.md'?0.1:0.95}];
      }))});};`);
    environment.JEV_TOKEN = 'fixture'; environment.NODE_OPTIONS = `--import ${pathToFileURL(preload).href}`; environment.HARNESS_SESSION = turn.session_id;
    const command = hooks.hooks.UserPromptSubmit[0].hooks[0].command, output = invoke('/bin/sh', ['-c', command], JSON.stringify(turn));
    const text = output.hookSpecificOutput.additionalContext;
    assert.match(text, /Never delete the saved original run/); assert.match(text, /record.closed/); assert.match(text, /assert.equal/);
    assert.ok(text.includes(JSON.stringify(readFileSync(join(workspace, 'app.ts'), 'utf8'))),
      'The native profile allowance must deliver this complete source unit, which exceeds the default 3 KB slot');
    assert.ok(Buffer.byteLength(text) > 8000, 'The normal hook must honor the declared envelope instead of a second 8 KB optional cap');
    const entry = text.match(/Entry ([a-f0-9]{64}); route/)?.[1]; assert.ok(entry);
    const count = () => readFileSync(calls, 'utf8').trim().split('\n').length, dispatched = count();
    assert.ok(dispatched >= 2);
    assert.deepEqual(invoke('/bin/sh', ['-c', command], JSON.stringify(turn)), output);
    assert.equal(invoke(launcher, ['context-route', '--entry', entry]).reuse.status, 'validated-entry-replay');
    assert.equal(count(), dispatched, 'A normal repeat and explicit replay cannot pay for another selection');
    writeFileSync(guide, readFileSync(guide, 'utf8') + '\nChanged current source.\n');
    const stale = spawnSync(launcher, ['context-route', '--entry', entry], { cwd: workspace, env: environment, encoding: 'utf8', timeout: 5000 });
    assert.notEqual(stale.status, 0); assert.equal(JSON.parse(stale.stderr).code, 'entry-source-stale'); assert.equal(count(), dispatched);
    environment.JEV_TOKEN = '';
    const fallback = invoke('/bin/sh', ['-c', command], JSON.stringify({ ...turn, turn_id: 'delivery-fallback' }));
    assert.match(fallback.hookSpecificOutput.additionalContext, /recovery.md/); assert.equal(count(), dispatched);
  } finally {
    invoke('/bin/sh', ['-c', hooks.hooks.SessionEnd[0].hooks[0].command], JSON.stringify({ ...turn, hook_event_name: 'SessionEnd' }));
    writeFileSync(profile, before); writeFileSync(join(workspace, 'app.ts'), app); rmSync(guide, { force: true }); rmSync(assertion, { force: true });
    if (oldSession === undefined) delete environment.HARNESS_SESSION; else environment.HARNESS_SESSION = oldSession;
    if (oldOptions === undefined) delete environment.NODE_OPTIONS; else environment.NODE_OPTIONS = oldOptions;
    if (oldToken === undefined) delete environment.JEV_TOKEN; else environment.JEV_TOKEN = oldToken;
  }
}

/** End-of-turn usage must survive installed transport without ending the startup session. */
function verifyStopUsage({ temporary, event, invoke, hooks, launcher }) {
  const transcript = join(temporary, 'host-usage.jsonl');
  writeFileSync(transcript, JSON.stringify({ type: 'token_usage_record', payload: { thread_id: event.session_id,
    root_turn_id: event.turn_id, response_id: 'installed-response', usage: { input_tokens: 100, output_tokens: 20 } } }) + '\n');
  const stop = { ...event, hook_event_name: 'Stop', transcript_path: transcript };
  for (let replay = 0; replay < 2; replay++)
    assert.deepEqual(invoke('/bin/sh', ['-c', hooks.hooks.Stop[0].hooks[0].command], JSON.stringify(stop)), {});
  assert.deepEqual(invoke(launcher, ['telemetry', 'context', 'status']).usage, { responses: 1, inputTokens: 100, outputTokens: 20 });
}

export async function verifyRc6Prompt(packageRoot, archive) {
  const temporary = realpathSync(mkdtempSync(join(tmpdir(), 'rc6-installed-prompt-'))), workspace = join(temporary, 'repo');
  mkdirSync(workspace);
  const environment = { ...process.env, XDG_STATE_HOME: join(temporary, 'state'), JEV_TOKEN: '' };
  for (const key of Object.keys(environment)) if (/^(GOVERNANCE_|HARNESS_)/u.test(key)) delete environment[key];
  const cli = join(resolve(packageRoot), 'dist/engine/src/cli.js');
  const invoke = (command, args, input) => {
    const result = spawnSync(command, args, { cwd: workspace, env: environment, input, encoding: 'utf8', timeout: 50000, maxBuffer: 1024 * 1024 });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
    return JSON.parse(result.stdout);
  };
  try {
    execFileSync('git', ['init', '-q'], { cwd: workspace });
    writeFileSync(join(workspace, 'app.ts'), 'export function launch() { return "ready"; }\n');
    const { runtimeMigrationPlan } = await import(pathToFileURL(join(packageRoot, 'dist/engine/src/runtime-migration-plan.js')));
    const plan = runtimeMigrationPlan(workspace), planPath = join(temporary, 'plan.json'), requestPath = join(temporary, 'request.json');
    const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
    const lock = { schema_version: 2, package: manifest.name, version: manifest.version,
      artifact: { url: pathToFileURL(archive).href, integrity: 'sha512-' + createHash('sha512').update(readFileSync(archive)).digest('base64') },
      source_commit: 'a'.repeat(40), node: manifest.engines.node, configuration_schema: 1 };
    writeFileSync(planPath, JSON.stringify(plan));
    writeFileSync(requestPath, JSON.stringify({ mode: 'init', workspace, registry: join(temporary, 'installation.sqlite'), archive,
      lock, expectedRevision: 0, inputs: plan.inputs, hostPlan: plan.hostPlan }));
    const initialized = invoke(process.execPath, [cli, 'init', '--request-file', requestPath, '--project-plan', planPath, '--operation-directory', join(temporary, 'operation')]);
    assert.equal(initialized.state.maintenance, null);
    const hooks = JSON.parse(readFileSync(join(workspace, '.codex/hooks.json'), 'utf8'));
    assert.equal(hooks.hooks.UserPromptSubmit.length, 1);
    const handler = hooks.hooks.UserPromptSubmit[0].hooks[0];
    assert.equal(handler.additionalContextLimit, 0);
    assert.equal(handler.timeout, 55);
    assert.equal(hooks.hooks.Stop.length, 1);
    assert.equal(hooks.hooks.Stop[0].hooks[0].timeout, 3);
    const event = { session_id: 'installed-host', turn_id: 'turn-one', hook_event_name: 'UserPromptSubmit', cwd: workspace, prompt: 'Fix the app launch.' };
    const output = invoke('/bin/sh', ['-c', handler.command], JSON.stringify(event));
    assert.equal(output.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
    assert.match(output.hookSpecificOutput.additionalContext, /app.ts/);
    const launcher = join(workspace, '.governance/runtime/bin/project-governance');
    verifyStopUsage({ temporary, event, invoke, hooks, launcher });
    const help = spawnSync(launcher, ['--help'], { cwd: workspace, env: environment, encoding: 'utf8', timeout: 5000 });
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /context-route/);
    assert.equal(invoke(launcher, ['context-index', 'status']).status, 'present');
    const wrongReceipts = join(temporary, 'wrong-startup.sqlite');
    const refusedStore = spawnSync(launcher, ['startup', 'observe', '--provider', 'codex', '--event-stdin', '--receipts', wrongReceipts],
      { cwd: workspace, env: environment, input: JSON.stringify(event), encoding: 'utf8', timeout: 5000 });
    assert.notEqual(refusedStore.status, 0);
    assert.equal(existsSync(wrongReceipts), false);
    const doctor = invoke(launcher, ['doctor', '--capability', 'context']);
    assert.equal(doctor.promptHook, 'configured');
    assert.equal(doctor.hostTrust, 'not-observable');
    assert.equal(doctor.documentation.status, 'configured');
    assert.deepEqual(doctor.documentation.activeLanguages, ['python', 'kotlin']);
    assert.ok(doctor.documentation.advisoryLanguages.includes('typescript'));
    assert.equal(doctor.observations.documentation.status, 'observed-subset');
    const status = invoke(launcher, ['telemetry', 'context', 'status']);
    assert.equal(status.counts['prompt-entries:prepared'], 1);
    assert.equal(status.avoidedTokens, null);
    const preload = join(temporary, 'metadata-fixture.mjs'), calls = join(temporary, 'metadata-calls.jsonl');
    writeFileSync(preload, `import {appendFileSync} from 'node:fs'; globalThis.fetch=async(url,init)=>{
      if(url!=='https://api.typesafe.ai/v1/systemone') throw Error('Unexpected provider');
      const wire=JSON.parse(init.body); if(wire.state.layout!=='compact-v1') throw Error('Missing metadata layout');
      appendFileSync(${JSON.stringify(calls)},JSON.stringify({questions:Object.keys(wire.questions).length})+'\\n');
      return Response.json({model:'jev-1.13.0',answers:Object.fromEntries(Object.keys(wire.questions).map(id=>[id,{type:'noul',noul:0.95}]))});};`);
    writeFileSync(join(workspace, 'config/governance/profile.yaml'), JSON.stringify({ context_router: { default_route: 'project', routes: [{ id: 'project' }] },
      continuity: { decisions: { mode: 'auto', allowed_data_classes: ['metadata', 'source'], allowed_metadata_paths: ['app.ts'], allowed_source_paths: ['app.ts'],
        consumers: { DL03: { mode: 'auto', questions: ['context.metadata-relevance/1'] } } } } }));
    environment.JEV_TOKEN = 'fixture'; environment.NODE_OPTIONS = `--import ${pathToFileURL(preload).href}`;
    const active = invoke('/bin/sh', ['-c', handler.command], JSON.stringify({ ...event, turn_id: 'turn-two', prompt: '- Repair app.ts' }));
    assert.match(active.hookSpecificOutput.additionalContext, /app.ts/);
    assert.equal(readFileSync(calls, 'utf8').trim().split('\n').length, 1);
    verifyTaskSwitch({ invoke, launcher, workspace, environment, session: event.session_id, calls });
    verifyRc10Delivery({ invoke, hooks, workspace, launcher, environment, temporary, event });
    const observed = invoke(launcher, ['telemetry', 'context', 'status']).documentation;
    assert.equal(observed.status, 'observed-subset');
    const appGap = observed.candidates.find(item => item.path === 'app.ts');
    assert.ok(appGap, 'The changed app source remains in the documentation gap sample');
    assert.match(appGap.sourceDigest, /^sha256:[a-f0-9]{64}$/u);
    delete environment.NODE_OPTIONS; environment.JEV_TOKEN = '';
    const { RuntimeGenerations, registry, readers, beforeReaders } = await verifyPromptReaderRecovery({
      packageRoot, temporary, workspace, environment });
    await verifyOwnerRollover({ packageRoot, temporary, workspace, environment, launcher, registry,
      readers, beforeReaders, invoke, RuntimeGenerations, event });
    // The original installed-host session still owns a startup reader. End that exact
    // session before the integration tree changes its pin.
    invoke('/bin/sh', ['-c', hooks.hooks.SessionEnd[0].hooks[0].command],
      JSON.stringify({ ...event, hook_event_name: 'SessionEnd' }));
    assert.equal(readers().length, 0);
    verifyNativeEnvelope({ invoke, hooks, workspace, launcher, event });
    assert.equal(readers().length, 0);
    const failedLifecycle = invoke(process.execPath, [cli, 'startup', 'observe', '--provider', 'codex', '--event-stdin', '--workspace', workspace,
      '--registry', join(temporary, 'absent-registry.sqlite'), '--receipts', join(temporary, 'receipt.sqlite')], JSON.stringify(event));
    assert.match(failedLifecycle.hookSpecificOutput.additionalContext, /lifecycle is unavailable/);
    for (const input of ['{', ' '.repeat(262145)]) {
      const refused = invoke(process.execPath, [cli, 'startup', 'observe', '--provider', 'codex', '--event-stdin', '--workspace', workspace,
        '--registry', join(temporary, 'absent-registry.sqlite'), '--receipts', join(temporary, 'receipt.sqlite')], input);
      assert.deepEqual(refused, {});
    }
    await verifyWorktreeCutover({ packageRoot, archive, temporary, workspace, environment, lock });
    return { status: 'passed', scope: 'Exact installed package, initial and linked-worktree hooks, stale sibling hook refusal, merged pin cutover, unborn prompt stdin, no-token fallback, compact metadata/procedure/source/assertion delivery through the native hook, exact no-dispatch replay, recoverable prompt reader, synthetic native-parent rollover admission and lifecycle failure. Real native host trust/use not tested.', sourceIdentity: 'synthetic fixture only' };
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}
