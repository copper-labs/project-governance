import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, cpSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline';

/** Select explicit local payloads without installing, relabeling or changing supplied locks. */
export function continuationInputs(packageRoot, archive, options = {}) {
  const allowed = ['oldPackageRoot', 'oldArchive', 'oldLock', 'candidatePackageRoot', 'candidateArchive', 'candidateLock'];
  assert.ok(Object.keys(options).every(key => allowed.includes(key)), 'Unknown continuity payload option');
  assert.equal(Boolean(options.oldPackageRoot), Boolean(options.oldArchive), 'Old package and archive must be supplied together');
  assert.equal(Boolean(options.candidatePackageRoot), Boolean(options.candidateArchive), 'Candidate package and archive must be supplied together');
  const explicit = Boolean(options.oldPackageRoot || options.candidatePackageRoot);
  assert.ok(!options.candidateLock || explicit, 'Candidate lock needs an explicit payload');
  const inspect = (root, path, suppliedLock, role) => {
    root = realpathSync(resolve(root)); path = realpathSync(resolve(path));
    const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')), bytes = readFileSync(path);
    assert.equal(manifest.name, '@organta/project-governance');
    const artifact = { url: pathToFileURL(path).href, integrity: 'sha512-' + createHash('sha512').update(bytes).digest('base64') };
    const lock = suppliedLock ?? { schema_version: 2, package: manifest.name, version: manifest.version, artifact,
      source_commit: (role === 'old' ? 'a' : 'b').repeat(40), node: manifest.engines.node, configuration_schema: 1 };
    assert.equal(lock.package, manifest.name); assert.equal(lock.version, manifest.version); assert.equal(lock.node, manifest.engines.node);
    assert.equal(lock.artifact.integrity, artifact.integrity, 'Supplied archive bytes must match the original lock');
    return { packageRoot: root, archive: path, version: manifest.version, archiveDigest: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
      artifact: lock.artifact, lock, sourceIdentity: suppliedLock ? 'caller-supplied exact lock; publication provenance requires independent verification' : 'synthetic fixture source identity; not release provenance' };
  };
  const old = inspect(options.oldPackageRoot ?? packageRoot, options.oldArchive ?? archive, options.oldLock, 'old');
  const candidate = explicit ? inspect(options.candidatePackageRoot ?? packageRoot, options.candidateArchive ?? archive, options.candidateLock, 'candidate') : null;
  if (candidate) assert.notEqual(candidate.version, old.version, 'Explicit continuity proof requires distinct old and candidate versions');
  return { old, candidate, mode: candidate ? 'explicit-local-archives' : 'synthetic-generation-separation' };
}

/** Derive a distinct offline version in scratch; the qualified source package stays intact. */
export function continuationCandidate(packageRoot, temporary, environment = process.env) {
  const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
  const version = `${Number(manifest.version.split('.')[0]) + 1}.0.0-continuity-fixture.1`;
  const stage = join(temporary, 'continuity-candidate'), destination = join(temporary, 'continuity-archives');
  cpSync(packageRoot, stage, { recursive: true, dereference: false }); mkdirSync(destination);
  writeFileSync(join(stage, 'package.json'), JSON.stringify({ ...manifest, version,
    bundleDependencies: Object.keys(manifest.dependencies ?? {}) }, null, 2) + '\n');
  const path = join(stage, 'dist/engine/assets/runtime-dependencies.lock.json');
  const dependencyLock = JSON.parse(readFileSync(path, 'utf8'));
  dependencyLock.version = version; dependencyLock.packages[''].version = version;
  writeFileSync(path, JSON.stringify(dependencyLock, null, 2) + '\n');
  const result = JSON.parse(execFileSync('npm', ['pack', '--offline', '--ignore-scripts', '--json', '--cache', join(temporary, 'continuity-npm-cache'), '--pack-destination', destination],
    { cwd: stage, env: environment, encoding: 'utf8', timeout: 60000, maxBuffer: 4 * 1024 * 1024 }));
  const packed = Array.isArray(result) ? result[0] : Object.values(result)[0];
  assert.equal(packed.version, version); assert.ok(packed.filename && !packed.filename.includes('/'));
  const archive = join(destination, packed.filename);
  return { archive, version, artifact: { url: pathToFileURL(archive).href,
    integrity: 'sha512-' + createHash('sha512').update(readFileSync(archive)).digest('base64') },
  sourceIdentity: 'synthetic version of the supplied compiled payload; not release provenance' };
}

async function nativeHost({ packageRoot, workspace, environment, log }) {
  const ownerModule = pathToFileURL(join(packageRoot, 'dist/engine/src/startup-host-owner.js')).href;
  const child = spawn(process.execPath, [new URL('./fixtures/continuity-native-host.mjs', import.meta.url).pathname,
    workspace, ownerModule], { cwd: workspace, env: environment, stdio: ['pipe', 'pipe', 'pipe'] });
  const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
  let stderr = '', lastDispatch;
  child.stderr.on('data', bytes => { stderr += bytes; });
  const exited = new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code, signal) => resolve({ code, signal })); });
  const next = async () => {
    let timer;
    try {
      const line = await Promise.race([lines.next(), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Synthetic native host timed out: ${stderr}`)), 60000);
      })]);
      assert.equal(line.done, false, `Synthetic native host exited: ${stderr}`);
      const result = JSON.parse(line.value); appendFileSync(log, JSON.stringify(result) + '\n'); return result;
    } finally { clearTimeout(timer); }
  };
  try {
    const ready = await next();
    assert.equal(ready.status, 0, ready.stderr); assert.equal(ready.captured?.pid, child.pid);
    return { pid: child.pid, ready,
      get lastDispatch() { return lastDispatch; },
      async run(command, args, input, expected = 0, plain = false, timeoutMs = 50000) {
        child.stdin.write(JSON.stringify({ command, args, input, timeoutMs }) + '\n');
        const result = await next();
        lastDispatch = { timeoutMs: result.timeoutMs, elapsedMs: result.elapsedMs,
          exitCode: result.status, signal: result.signal, timedOut: result.timedOut };
        assert.equal(result.timedOut, false, `Synthetic native dispatch exceeded ${timeoutMs}ms (${result.errorCode}; ${result.signal})`);
        assert.equal(result.status, expected, result.stderr || result.error || result.stdout);
        return plain ? result.stdout.trim() : expected === 0 ? JSON.parse(result.stdout)
          : JSON.parse(result.stderr.trim().split('\n').findLast(line => line.startsWith('{')));
      },
      async stop() { child.stdin.end(JSON.stringify({ stop: true }) + '\n'); const result = await exited; assert.equal(result.code, 0, stderr); },
    };
  } catch (error) { child.stdin.end(); await exited; throw error; }
}

/** Real installed hooks and live fixture parents; continuity inspection never substitutes for entry. */
export async function continuityUpgradeJourney({ packageRoot, temporary, workspace, sibling, registry, siblingRegistry, environment, oldPayload, candidatePayload }) {
  const load = name => import(pathToFileURL(join(packageRoot, `dist/engine/src/${name}.js`)).href);
  const [{ RuntimeGenerations }, { StartupTasks }, { contextDoctor }, { contextStateRoot }, { startupEvent }, { defaultDbPath, workContext }] = await Promise.all([
    load('runtime-generations'), load('startup-tasks'), load('context-doctor'), load('context-command'),
    load('startup-event'),
    import(pathToFileURL(join(packageRoot, 'dist/harness/src/store/location.js')).href),
  ]);
  const session = 'continuity-upgrade-host', env = { ...environment, HARNESS_SESSION: session, JEV_TOKEN: '' };
  delete env.NODE_OPTIONS; delete env.GOVERNANCE_DECISION_CONTEXT;
  const stateRoot = root => {
    const previous = process.env.XDG_STATE_HOME;
    try { process.env.XDG_STATE_HOME = env.XDG_STATE_HOME; return contextStateRoot(root); }
    finally { if (previous === undefined) delete process.env.XDG_STATE_HOME; else process.env.XDG_STATE_HOME = previous; }
  };
  const items = [workspace, sibling].map((root, index) => ({ root, registry: index ? siblingRegistry : registry,
    launcher: join(root, '.governance/runtime/bin/project-governance'), role: index ? 'linked' : 'main', host: null, ended: false }));
  const { parse } = await import(pathToFileURL(join(packageRoot, 'node_modules/yaml/dist/index.js')).href);
  for (const item of items) item.profile = readFileSync(join(item.root, 'config/governance/profile.yaml'));
  const [main, linked] = items;
  const hookDeadlines = [];
  const restoreProfile = item => writeFileSync(join(item.root, 'config/governance/profile.yaml'), item.profile);
  const localProfile = item => {
    const profile = parse(item.profile.toString('utf8'));
    profile.context_router = { ...profile.context_router, default_route: `continuity-${item.role}`,
      routes: [{ id: `continuity-${item.role}`, primary_context: ['app.ts'] }] };
    writeFileSync(join(item.root, 'config/governance/profile.yaml'), JSON.stringify(profile));
  };
  const generations = item => { const store = new RuntimeGenerations(item.registry); try { return store.state(); } finally { store.close(); } };
  const owner = item => {
    const receipts = new StartupTasks(join(dirname(item.registry), 'startup.sqlite'));
    try { return receipts.owner(item.startupTask); } finally { receipts.close(); }
  };
  const hooks = item => JSON.parse(readFileSync(contextDoctor(item.root).promptHookSource.path, 'utf8')).hooks;
  const hook = (item, name, turn) => {
    const handler = hooks(item)[name][0].hooks[0];
    assert.ok(Number.isFinite(handler.timeout) && handler.timeout > 0, 'Installed native hook must declare its budget');
    return item.host.run('/bin/sh', ['-c', handler.command], JSON.stringify({ session_id: session,
      hook_event_name: name, cwd: item.root, source: 'resume',
      ...(turn ? { turn_id: turn, prompt: `Continue the ${item.role} app launch task in this worktree.` } : {}) }),
    0, false, handler.timeout * 1000);
  };
  const command = (item, args, expected = 0, plain = false) => item.host.run(item.launcher, args, undefined, expected, plain);
  const start = async item => {
    item.ended = false;
    // Native owner discovery comes from the actual selected archive in this worktree.
    const nativePackageRoot = join(generations(item).directory, 'node_modules/@organta/project-governance');
    item.host = await nativeHost({ packageRoot: nativePackageRoot, workspace: item.root, environment: env,
      log: join(temporary, `continuity-${item.role}-${item.previousPid ? 'successor' : 'original'}.jsonl`) });
    item.startupTask = startupEvent('codex', { session_id: session, hook_event_name: 'UserPromptSubmit' }, item.root, false, env).taskId;
  };
  const entry = async (item, turn) => {
    const prompt = await hook(item, 'UserPromptSubmit', turn);
    const id = /Entry ([a-f0-9]{64}); route/u.exec(prompt.hookSpecificOutput?.additionalContext)?.[1];
    assert.ok(id, JSON.stringify(prompt));
    const path = join(stateRoot(item.root), 'prompt-entries', `${id}.json`);
    const bytes = readFileSync(path, 'utf8'), record = JSON.parse(bytes);
    assert.equal(record.session, session); assert.equal(record.workspace, item.root);
    assert.equal(record.worktreeLocator, workContext(item.root).locator);
    return { id, path, bytes, record };
  };
  const assertHistory = async item => {
    const shown = await command(item, ['harness', 'task', 'show']);
    assert.deepEqual(shown.task, item.task); assert.deepEqual(shown.checkpoint, item.checkpoint);
    const resumed = await command(item, ['harness', 'resume']);
    assert.equal(resumed.task.taskId, item.task.taskId); assert.equal(resumed.task.version, item.task.version);
    assert.deepEqual(resumed.attempt, item.attempt); assert.deepEqual(resumed.checkpoint, item.checkpoint);
    assert.equal(resumed.workspace.worktree, item.root); assert.equal(resumed.workspace.withinTaskScope, true);
    assert.equal((await command(item, ['harness', 'export'])).digest, item.historyDigest);
  };
  const refuseForeign = async (item, foreign) => {
    const refused = await command(item, ['context-route', '--entry', foreign.id], 2);
    assert.equal(refused.code, 'entry-unavailable-in-workspace'); assert.ok(refused.receipt);
    assert.equal(JSON.parse(readFileSync(refused.receipt, 'utf8')).code, refused.code);
  };
  const assertLocalPacket = async (item, id) => {
    const packet = await command(item, ['context-route', '--entry', id]);
    assert.equal(packet.ready, true); assert.equal(packet.route.selected.id, `continuity-${item.role}`);
    assert.equal(packet.selection.binding.taskId, item.task.taskId); assert.equal(packet.selection.binding.revision, String(item.task.version));
    const observed = JSON.parse(readFileSync(join(stateRoot(item.root), 'prompt-entries', `${id}.json`), 'utf8'));
    assert.equal(observed.binding.taskId, item.task.taskId); assert.equal(observed.binding.attemptId, item.attempt.attemptId);
    assert.equal(packet.execution.nativeSession, session); assert.equal(packet.reuse.status, 'validated-entry-replay');
    const index = await command(item, ['context-index', 'status']);
    assert.equal(index.status, 'present'); assert.equal(index.recordedWorkspace, item.root);
    item.indexLocator = index.recordedLocator;
  };
  const end = async item => {
    if (!item.host || item.ended) return;
    try {
      await hook(item, 'SessionEnd');
      hookDeadlines.push({ hook: 'SessionEnd', worktree: item.role, process: item.previousPid ? 'successor' : 'original',
        ...item.host.lastDispatch });
      assert.equal(owner(item), null);
      assert.ok(!generations(item).readers.some(reader => reader.owner === `startup-task:${item.startupTask}`));
      item.ended = true;
    } finally {
      item.previousPid = item.host.pid;
      await item.host.stop(); item.host = null;
    }
  };
  const cleanup = async () => {
    const errors = [];
    for (const item of items) try { await end(item); } catch (error) { errors.push(error); } finally { restoreProfile(item); }
    if (errors.length) throw new AggregateError(errors, 'Synthetic native cleanup failed; retained proof directory requires inspection');
  };
  try {
    assert.equal(defaultDbPath(workspace), defaultDbPath(sibling));
    assert.notEqual(workContext(workspace).locator, workContext(sibling).locator);
    assert.notEqual(stateRoot(workspace), stateRoot(sibling));
    for (const item of items) {
      if (oldPayload) {
        const installation = JSON.parse(readFileSync(join(generations(item).directory, 'installation.json'), 'utf8'));
        assert.equal(installation.lock.version, oldPayload.version); assert.equal(installation.archive.digest, oldPayload.archiveDigest);
      }
      localProfile(item);
      await start(item);
      item.firstEntry = await entry(item, `${item.role}-before-upgrade`);
      const created = await command(item, ['harness', 'task', 'create', '--outcome', `Continue ${item.role} app launch`, '--scope', item.root,
        '--constraint', `Preserve the ${item.role} checkpoint`, '--acceptance', 'Continue the original task after the runtime update']);
      assert.equal(created.contextEntry.status, 'linked'); item.task = created.task;
      item.checkpoint = (await command(item, ['harness', 'checkpoint', '--summary', `${item.role} diagnosis retained`, '--next', 'Verify after upgrade'])).checkpoint;
      item.attempt = (await command(item, ['harness', 'resume'])).attempt;
      assert.equal(item.checkpoint.attemptId, item.attempt.attemptId);
      item.historyDigest = (await command(item, ['harness', 'export'])).digest;
      const bound = await entry(item, `${item.role}-bound-before-upgrade`);
      item.boundEntry = bound;
      await assertLocalPacket(item, bound.id);
      assert.equal(owner(item).host.pid, item.host.pid);
    }
    assert.notEqual(main.task.taskId, linked.task.taskId); assert.notEqual(main.attempt.workspaceId, linked.attempt.workspaceId);
    assert.notEqual(main.checkpoint.checkpointId, linked.checkpoint.checkpointId);
    assert.notEqual(main.indexLocator, linked.indexLocator);
    await refuseForeign(main, linked.boundEntry); await refuseForeign(linked, main.boundEntry);
    const siblingState = generations(linked), siblingOwner = owner(linked);
    await end(main);
    assert.deepEqual(generations(linked), siblingState); assert.deepEqual(owner(linked), siblingOwner);
    await assertHistory(linked);
    for (const item of items) restoreProfile(item);
    return {
      async afterMainUpdate(version) {
        await start(main); assert.notEqual(main.host.pid, main.previousPid);
        assert.equal(await command(main, ['--version'], 0, true), `project-governance ${version}`);
        const refused = await command(main, ['context-route', '--entry', main.boundEntry.id], 2);
        assert.equal(refused.code, 'entry-runtime-changed');
        assert.equal(readFileSync(main.boundEntry.path, 'utf8'), main.boundEntry.bytes);
        await assertHistory(main);
        localProfile(main);
        main.currentEntry = await entry(main, 'main-after-upgrade');
        await assertLocalPacket(main, main.currentEntry.id);
        const active = JSON.parse(readFileSync(join(generations(main).directory, 'installation.json'), 'utf8'));
        assert.equal(active.lock.version, version); assert.equal(owner(main).host.pid, main.host.pid);
        if (candidatePayload) { assert.equal(version, candidatePayload.version); assert.equal(active.archive.digest, candidatePayload.archiveDigest); }
        assert.deepEqual(generations(linked), siblingState); assert.deepEqual(owner(linked), siblingOwner);
        await assertHistory(linked); await refuseForeign(main, linked.boundEntry); await refuseForeign(linked, main.currentEntry);
        await end(main); restoreProfile(main);
        assert.deepEqual(generations(linked), siblingState); assert.deepEqual(owner(linked), siblingOwner);
      },
      async beforeLinkedUpdate() { await end(linked); },
      async afterLinkedUpdate(version) {
        await start(linked); assert.notEqual(linked.host.pid, linked.previousPid);
        assert.equal(await command(linked, ['--version'], 0, true), `project-governance ${version}`);
        await assertHistory(linked);
        localProfile(linked);
        linked.currentEntry = await entry(linked, 'linked-after-upgrade');
        await assertLocalPacket(linked, linked.currentEntry.id);
        const active = JSON.parse(readFileSync(join(generations(linked).directory, 'installation.json'), 'utf8'));
        assert.equal(active.lock.version, version);
        if (candidatePayload) { assert.equal(version, candidatePayload.version); assert.equal(active.archive.digest, candidatePayload.archiveDigest); }
        await refuseForeign(linked, main.currentEntry); await end(linked); restoreProfile(linked);
        for (const item of items) assert.equal(generations(item).readers.length, 0);
        return { status: 'passed', session: 'same synthetic session in distinct linked worktrees',
          taskHistory: 'preserved', changedNativeProcess: 'passed', siblingCleanupIsolation: 'passed',
          staleRuntimePacket: 'refused', crossWorktreePackets: 'refused', candidateVersion: version,
          candidatePayload: candidatePayload?.sourceIdentity ?? 'same compiled development payload with a distinct synthetic version; published-old to actual 4.0.0 upgrade remains release qualification',
          archives: { old: oldPayload ? { path: oldPayload.archive, version: oldPayload.version, digest: oldPayload.archiveDigest, sourceIdentity: oldPayload.sourceIdentity } : null,
            candidate: candidatePayload ? { path: candidatePayload.archive, version: candidatePayload.version, digest: candidatePayload.archiveDigest, sourceIdentity: candidatePayload.sourceIdentity } : null },
          hookDeadlines,
          hostEvidence: 'synthetic native ancestors and installed hooks only; desktop reattachment and accepted ordinary development not tested' };
      }, cleanup,
    };
  } catch (error) { await cleanup(); throw error; }
}
