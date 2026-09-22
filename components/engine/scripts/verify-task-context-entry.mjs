import assert from 'node:assert/strict';
import { join } from 'node:path';
import { existsSync, readFileSync, watch, writeFileSync } from 'node:fs';

/** Public installed commands: register once, select before reading, capture intent through detach. */
export async function verifyTaskContextEntry({ repo, temporary, run, write, git, environment }) {
  environment.HARNESS_SESSION = 'installed-task-entry';
  environment.JEV_TOKEN = 'fixture-only';
  delete environment.GOVERNANCE_DECISION_CONTEXT;
  try {
    write('config/governance/profile.yaml', { context_router: { routes: [{ id: 'source', match: { path_globs: ['src/**'] }, primary_context: ['rules.md'] }] },
      continuity: { decisions: { mode: 'auto', allowed_data_classes: ['source'], allowed_source_paths: ['src/*.ts', 'config/validation/packs/**', 'config/governance/profile.yaml'],
        consumers: { DL03: { mode: 'auto' }, DL07: { mode: 'auto' }, DL13: { mode: 'off' } } } } });
    write('config/governance/facts.lock.yaml', { facts: {} });
    writeFileSync(join(repo, 'rules.md'), 'Preserve all required proof, failures and cleanup ownership.\n');
    git('add', 'config', 'rules.md', 'source.ts');
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'Capture task entry configuration');
    run(['harness', 'task', 'create', '--outcome', 'Inspect current changes']);
    const rootScoped = run(['context-route']);
    assert.equal(rootScoped.ready, true);
    assert.equal(rootScoped.routingPaths.mode, 'bound-task-empty-scope');
    assert.equal(rootScoped.selection.candidateCount, 0);
    const created = run(['harness', 'task', 'create', '--outcome', 'Repair the regression without weakening assertions', '--acceptance', 'Preserve required proof', '--scope', 'src']);
    const task = created.task;
    assert.ok(task.taskId);
    const packet = run(['context-route']);
    assert.equal(packet.ready, true);
    assert.equal(packet.selection.binding.taskId, task.taskId);
    assert.equal(packet.selection.binding.source, 'session');
    assert.equal(packet.optional.decision.method, 'jev');
    assert.ok(packet.optional.entries.some(entry => entry.id === 'src/example.test.ts'));
    assert.equal(packet.entries[0].content, 'Preserve all required proof, failures and cleanup ownership.\n');
    const planned = run(['plan', '--stage', 'pilot-check', '--base-ref', 'HEAD']);
    assert.equal(planned.decisionAdvice.validation.delivered, true);
    const submitted = run(['check', '--stage', 'pilot-check', '--base-ref', 'HEAD', '--detach', '--trigger', 'test']);
    const dispatch = JSON.parse(readFileSync(join(submitted.run_directory, 'dispatch.json'), 'utf8'));
    assert.equal(dispatch.decisionContext.taskId, task.taskId);
    assert.equal(dispatch.decisionContext.revision, '1');
    assert.equal(dispatch.taskBinding.source, 'session');
    // Subsequent host rebinding must not redirect an already submitted check's output.
    run(['harness', 'task', 'create', '--outcome', 'Another assigned task', '--scope', 'rules.md']);
    const resultPath = join(submitted.run_directory, 'result.json');
    if (!existsSync(resultPath)) await new Promise((resolve, reject) => {
      const done = error => { watcher.close(); clearTimeout(timer); error ? reject(error) : resolve(); };
      const watcher = watch(submitted.run_directory, () => { if (existsSync(resultPath)) done(); });
      const timer = setTimeout(() => done(new Error('Detached fixture did not finish')), 15000);
      if (existsSync(resultPath)) done();
    });
    const observed = run(['check-status', '--run', submitted.run_id]);
    assert.equal(observed.status, 'passed');
    const output = run(['check-output', '--run', submitted.run_id]);
    assert.equal(JSON.parse(readFileSync(output.episode.episode.path, 'utf8')).scope.taskId, task.taskId);
    run(['harness', 'resume', '--task', task.taskId]);
    delete environment.JEV_TOKEN;
    const noToken = run(['context-route']);
    assert.equal(noToken.ready, true);
    assert.equal(noToken.optional.reason, 'missing-token');
    assert.ok(noToken.optional.entries.length);
    const revised = run(['harness', 'task', 'revise', '--task', task.taskId, '--expected-version', '1', '--acceptance', 'Updated acceptance retained']);
    const current = run(['context-route']);
    assert.equal(current.selection.binding.revision, String(revised.task.version));
    assert.notEqual(current.selection.binding.attemptId, noToken.selection.binding.attemptId);
    return { status: 'passed', taskEntry: 'public commands', context: 'active fixture and no-token fallback', detached: 'captured task retained after host rebind', benefit: 'not evaluated' };
  } finally { delete environment.HARNESS_SESSION; }
}
