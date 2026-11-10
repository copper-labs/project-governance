import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, realpathSync, unlinkSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
const source = resolve(process.argv[2]), archive = resolve(process.argv[3]), temporary = resolve(process.argv[4]);
mkdirSync(temporary, { recursive: true });
const workspace = join(realpathSync(temporary), 'project'); mkdirSync(workspace);
const home = join(temporary, 'home'); mkdirSync(home);
const environment = { ...process.env, HOME: home, XDG_STATE_HOME: join(temporary, 'state') };
for (const key of Object.keys(environment)) if (/^(GOVERNANCE_|HARNESS_|CODEX_|JEV_|ANTHROPIC_|OPENAI_)/u.test(key)) delete environment[key];
delete environment.NODE_OPTIONS;
const run = (executable, args, input, expected = 0) => {
  const result = spawnSync(executable, args, { cwd: workspace, env: environment, input, encoding: 'utf8', timeout: 60000, maxBuffer: 4 * 1024 * 1024 });
  assert.equal(result.status, expected, result.stderr || result.stdout || result.error?.message);
  return result.stdout;
};
run('git', ['init', '-q']); run('git', ['config', 'user.name', 'Governance fixture']); run('git', ['config', 'user.email', 'fixture@example.invalid']);
const cli = join(source, 'dist/engine/src/cli.js');
const { runtimeMigrationPlan } = await import(pathToFileURL(join(source, 'dist/engine/src/runtime-migration-plan.js')));
const plan = runtimeMigrationPlan(workspace), planPath = join(temporary, 'plan.json'), requestPath = join(temporary, 'request.json');
const manifest = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8'));
const lock = { schema_version: 2, package: manifest.name, version: manifest.version,
  artifact: { url: pathToFileURL(archive).href, integrity: 'sha512-' + createHash('sha512').update(readFileSync(archive)).digest('base64') },
  source_commit: 'a'.repeat(40), node: manifest.engines.node, configuration_schema: 1 };
writeFileSync(planPath, JSON.stringify(plan));
writeFileSync(requestPath, JSON.stringify({ mode: 'init', workspace, registry: join(temporary, 'registry.sqlite'), archive, lock,
  expectedRevision: 0, inputs: plan.inputs, hostPlan: plan.hostPlan }));
run(process.execPath, [cli, 'init', '--request-file', requestPath, '--project-plan', planPath, '--operation-directory', join(temporary, 'installation')]);
const launcher = join(workspace, '.governance/runtime/bin/project-governance');
run(launcher, ['hooks', '--apply', '--configure']);
const invoke = (operation, input) => JSON.parse(run(launcher, ['cowork', operation], JSON.stringify(input)));
const registration = invoke('register', { label: 'Synthetic Cowork journey' });
const refreshed = invoke('register', { label: 'Synthetic Cowork journey' }); assert.equal(refreshed.project_id, registration.project_id);
const task = invoke('task-start', { project_id: registration.project_id, outcome: 'Write and verify the fixture documentation', scope: ['.'], acceptance: ['Native checks pass'], constraints: [] });
const bound = { project_id: registration.project_id, task_id: task.task.taskId, session: task.session, expected_version: task.task.version };
assert.equal(invoke('task-resume', { project_id: bound.project_id, task_id: bound.task_id, session: bound.session }).session, bound.session);
const context = invoke('context', { ...bound, question: 'What guidance applies to writing the fixture documentation?', retrieval: 'none' });
assert.ok(context);
const applied = invoke('file-apply', { ...bound, edits: [{ path: 'docs/example.md', expected: 'absent', text: '# Example\n\nSynthetic candidate.\n' }] });
assert.equal(applied.ok, true);
const read = invoke('file-read', { project_id: bound.project_id, task_id: bound.task_id, session: bound.session, path: 'docs/example.md' });
assert.equal(read.text, '# Example\n\nSynthetic candidate.\n');
async function check(candidate) {
  const checked = invoke('check-start', { ...bound, candidate });
  for (let attempts = 0; attempts < 30; attempts++) {
    const status = invoke('check-status', { project_id: bound.project_id, task_id: bound.task_id, session: bound.session, run_id: checked.run_id });
    if (status.state === 'terminal') return status;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error('Detached check did not finish');
}
const failed = await check([{ path: 'docs/example.md', expected: read.sha256 }]);
assert.equal(failed.status, 'failed');
assert.ok(failed.result.findings.some(finding => finding.rule_id === 'documentation.governance'), 'Expected the real documentation failure, not an invocation error');
const fixed = '---\nid: fixture.example\ntitle: Example\ntype: guide\nstatus: current\nowner: fixture\ncreated: 2026-11-10\nupdated: 2026-11-10\nsummary: Demonstrate native Cowork development.\n---\n\n# Example\n\nSynthetic candidate.\n';
assert.equal(invoke('file-apply', { ...bound, edits: [{ path: 'docs/example.md', expected: read.sha256, text: fixed }] }).ok, true);
const fixedRead = invoke('file-read', { project_id: bound.project_id, task_id: bound.task_id, session: bound.session, path: 'docs/example.md' });
const passed = await check([{ path: 'docs/example.md', expected: fixedRead.sha256 }]);
assert.equal(passed.status, 'passed', JSON.stringify(passed));
const checkpoint = invoke('task-checkpoint', { ...bound, summary: 'Fixture documentation fixed and checked', next: 'Commit the verified candidate', evidence: [] });
assert.equal(checkpoint.ok, true);
const submitted = invoke('commit', { ...bound, candidate: [{ path: 'docs/example.md', expected: fixedRead.sha256 }], message: 'Document the synthetic Cowork example\n\nProvide a valid guide so the installed native workflow can verify documentation and preserve its commit evidence.' });
let committed;
for (let attempts = 0; attempts < 60; attempts++) {
  committed = invoke('commit-status', { project_id: bound.project_id, task_id: bound.task_id, session: bound.session, request_id: submitted.request_id });
  if (committed.state === 'terminal') break;
  await new Promise(resolve => setTimeout(resolve, 1000));
}
assert.equal(committed.result?.status, 'committed', JSON.stringify(committed));
assert.equal(run('git', ['rev-parse', 'HEAD']).trim(), committed.result.commit);
writeFileSync(join(temporary, 'journey-result.json'), JSON.stringify({ registration, task: { task_id: bound.task_id, session: bound.session }, context, failed, passed, checkpoint, committed }, null, 2));
console.log(JSON.stringify({ workspace, registered: true, refreshed: true, task: true, nested_edit: true, failed_then_passed: true, committed: committed.result.commit }));

// Exercise the actual adapter boundary against the installed archive, not just its launcher.
const { invokeRegistered, registrationInventory } = await import(pathToFileURL(join(source, 'components/cowork/src/transport.ts')));
const previousHome = process.env.HOME;
process.env.HOME = home;
try {
  assert.equal(registrationInventory().valid.length, 1);
  const shown = await invokeRegistered('task-show', { project_id: bound.project_id, task_id: bound.task_id, session: bound.session });
  assert.equal(shown.task.taskId, bound.task_id);
  const observed = await invokeRegistered('commit-status', { project_id: bound.project_id, task_id: bound.task_id, session: bound.session, request_id: submitted.request_id });
  assert.equal(observed.result.commit, committed.result.commit);
  const original = readFileSync(registration.registration, 'utf8');
  try {
    const altered = JSON.parse(original); altered.revision += 1;
    writeFileSync(registration.registration, JSON.stringify(altered));
    const refused = await invokeRegistered('task-show', { project_id: bound.project_id, task_id: bound.task_id, session: bound.session });
    assert.equal(refused.code, 'cowork-registration-stale');
  } finally { writeFileSync(registration.registration, original); }
  console.log(JSON.stringify({ transport_readback: true, stale_revision_refused: true }));
} finally {
  if (previousHome === undefined) delete process.env.HOME; else process.env.HOME = previousHome;
}

// The real commit entry point must preserve unrelated staging while selecting edits and deletions.
writeFileSync(join(workspace, 'delete.txt'), 'tracked deletion fixture\n');
writeFileSync(join(workspace, 'other.txt'), 'unrelated base\n');
run('git', ['add', '--', 'delete.txt', 'other.txt']);
run('git', ['commit', '-m', 'Prepare selected deletion and unrelated staging fixtures', '-m', 'Add controlled text inputs so the native commit boundary can verify preservation of unrelated staged work.']);
writeFileSync(join(workspace, 'other.txt'), 'unrelated staged change\n'); run('git', ['add', '--', 'other.txt']);
writeFileSync(join(workspace, 'other.txt'), 'unrelated working change\n');
const indexBefore = run('git', ['ls-files', '--stage', '--', 'other.txt']);
const changedText = fixed + '\nUpdated candidate.\n';
assert.equal(invoke('file-apply', { ...bound, edits: [{ path: 'docs/example.md', expected: fixedRead.sha256, text: changedText }] }).ok, true);
unlinkSync(join(workspace, 'delete.txt'));
const changedRead = invoke('file-read', { project_id: bound.project_id, task_id: bound.task_id, session: bound.session, path: 'docs/example.md' });
const second = invoke('commit', { ...bound, candidate: [{ path: 'docs/example.md', expected: changedRead.sha256 }, { path: 'delete.txt', expected: 'absent' }], message: 'Update the fixture guide and remove its obsolete input\n\nExercise selected edits and deletion while preserving unrelated staged and working content.' });
let secondResult;
for (let attempt = 0; attempt < 60; attempt++) {
  secondResult = invoke('commit-status', { project_id: bound.project_id, task_id: bound.task_id, session: bound.session, request_id: second.request_id });
  if (secondResult.state === 'terminal') break;
  await new Promise(resolve => setTimeout(resolve, 1000));
}
assert.equal(secondResult.result?.status, 'committed', JSON.stringify(secondResult));
assert.equal(run('git', ['ls-files', '--stage', '--', 'other.txt']), indexBefore);
assert.equal(readFileSync(join(workspace, 'other.txt'), 'utf8'), 'unrelated working change\n');
console.log(JSON.stringify({ selected_edit_delete: true, unrelated_index_preserved: true }));
