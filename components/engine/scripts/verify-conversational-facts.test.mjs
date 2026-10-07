import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { digest } from '../src/core.ts';
import { FACTS_MARKER, conversationalFactsDefinition, readDeliveredFacts, assessConversationalFacts,
  assessNativeFactsIdentity, workspaceCustodySnapshot, continuitySnapshot, verifyConversationalFacts,
  CONVERSATIONAL_WORKFLOW_WAIT_MS, observeFixtureFailure, conversationalInitRequest,
  conversationalInstallationPaths, assessMatureFactsGrowth, assessSteeringIdentity } from './verify-conversational-facts.mjs';
import { execFileSync } from 'node:child_process';
import { workflowWaitCommand } from '../src/workflow-wait.ts';
import { runtimeMigrationPlan } from '../src/runtime-migration-plan.ts';
import { runtimeOperationCommand } from '../src/runtime-operation-command.ts';
import { renderTaskFacts } from '../src/task-facts.ts';

function fixture() {
  const task = { taskId: 'synthetic-task-A', version: 1, outcome: 'Retain original reconnect proof.' };
  const checkpoint = { checkpointId: 'original-checkpoint', taskId: task.taskId, taskVersion: 1, attemptId: 'original-attempt',
    summary: 'Implementation is declared, proof pending.', next: 'Run the focused proof.', createdAt: '2026-10-05T12:00:00.000Z' };
  const originals = { task, checkpoint, requiredGuidance: ['# Required original\nDeclarations are not proof.\n'] };
  const facts = { version: 1, observed_at: '2026-10-05T12:01:00.000Z', association: { status: 'associated', taskId: task.taskId,
    observedRevision: 1, boundRevision: 1, attemptId: checkpoint.attemptId }, task: { outcome: task.outcome, status: 'open', execution_permission: 'not granted by this snapshot' },
    checkpoint: { ...checkpoint, provenance: 'caller-declared summary and next action; not executed proof' }, plan: { status: 'linked', progress: { items: [
      { id: 'B1.I', completed: true }, { id: 'B1.V', completed: false }, { id: 'B1.C', completed: false } ] } }, actions: [], checks: [], unavailable: [], omitted: [] };
  const output = value => ({ hookSpecificOutput: { additionalContext: 'Required current guidance:\n' + originals.requiredGuidance.join('') + FACTS_MARKER + JSON.stringify(value) + '\n' } });
  return { originals, facts, output, expected: { id: 'initial-bound', association: 'taskA', plan: 'pending-proof' } };
}

test('installation and startup evidence stays outside sibling and empty-greenfield source custody', () => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'conversational-evidence-layout-')));
  try {
    for (const label of ['sibling', 'greenfield']) {
      const workspace = join(directory, label); mkdirSync(workspace);
      execFileSync('git', ['init', '-q'], { cwd: workspace, stdio: 'pipe' });
      writeFileSync(join(workspace, 'AGENTS.md'), 'Required instructions.\n');
      const before = workspaceCustodySnapshot(workspace), paths = conversationalInstallationPaths(directory, label);
      for (const path of [paths.plan, paths.registry, paths.request, join(paths.operation, 'operation.json'), join(dirname(paths.registry), 'startup.sqlite')]) {
        assert.ok(relative(workspace, path).startsWith('../'), 'Control evidence must not land in a source checkout');
        mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, 'synthetic control evidence\n');
      }
      assert.deepEqual(workspaceCustodySnapshot(workspace), before, 'Creating owned control evidence changed source custody');
      // The earlier fixture layout exposes the real defect instead of hiding it with a Git ignore.
      writeFileSync(join(workspace, 'startup.sqlite'), 'synthetic control evidence\n');
      assert.notDeepEqual(workspaceCustodySnapshot(workspace), before);
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('stock greenfield needs no duplicate host guidance, but configured required originals cannot be dropped', () => {
  const f = fixture(), withoutGuidance = { hookSpecificOutput: { additionalContext:
    'Required current guidance:\n' + FACTS_MARKER + JSON.stringify(f.facts) + '\n' } };
  const configured = assessConversationalFacts(f.expected, f.output(f.facts), f.originals);
  assert.equal(configured.actualAdditionalContext, true);
  assert.throws(() => assessConversationalFacts(f.expected, withoutGuidance, f.originals), /Required original guidance/);
  const stock = assessConversationalFacts(f.expected, withoutGuidance, { ...f.originals, requiredGuidance: [] });
  assert.equal(stock.actualAdditionalContext, true); assert.equal(stock.consumed, 'unknown');
  assert.throws(() => assessConversationalFacts(f.expected, withoutGuidance, { ...f.originals, requiredGuidance: [''] }), /nonempty/);
  assert.throws(() => assessConversationalFacts(f.expected, withoutGuidance, { ...f.originals, requiredGuidance: undefined }), /configured required-packet/);
});

test('installed failure observation uses public wait bounds and preserves a pending owner without redispatch', async () => {
  await assert.rejects(workflowWaitCommand(['--wait-ms', '45000']), /Invalid workflow wait bounds/);
  await assert.rejects(workflowWaitCommand(['--wait-ms', String(CONVERSATIONAL_WORKFLOW_WAIT_MS)]), /Existing workflow ledger and run required/);
  const calls = [], terminal = { run: { id: 'original-run', state: 'failed' }, reason: 'outcome' };
  const result = observeFixtureFailure((args, exits) => {
    calls.push({ args, exits }); return calls.length === 1 ? { run: { id: 'original-run', state: 'running' }, reason: 'timeout' } : terminal;
  }, '/fixture/original-ledger.sqlite', 'original-run');
  assert.equal(result, terminal); assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.deepEqual(call.args, ['workflow-wait', '--database', '/fixture/original-ledger.sqlite', '--run', 'original-run', '--wait-ms', '30000']);
    assert.deepEqual(call.exits, [1, 2]);
  }
  assert.throws(() => observeFixtureFailure(() => ({ run: { id: 'other-run', state: 'failed' } }), 'ledger', 'original-run'), /another run/);
  assert.throws(() => observeFixtureFailure(() => ({ run: { id: 'original-run', state: 'running' }, reason: 'timeout' }), 'ledger', 'original-run'), /do not redispatch/);
});

test('linked fixture initialization preserves the exact pin and refuses mismatches before installation mutation', async () => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'conversational-locked-init-'))), workspace = join(directory, 'repo');
  try {
    mkdirSync(join(workspace, 'config/governance'), { recursive: true });
    execFileSync('git', ['init', '-q'], { cwd: workspace, stdio: 'pipe' });
    const archive = join(directory, 'archive.tgz'); writeFileSync(archive, 'synthetic archive not installed');
    const lock = { schema_version: 2, package: '@organta/project-governance', version: '4.1.0',
      artifact: { url: 'https://example.invalid/4.1.0.tgz', integrity: 'sha512-' + Buffer.alloc(64).toString('base64') },
      source_commit: 'a'.repeat(40), node: '>=24.16.0 <25', configuration_schema: 1 };
    const lockPath = join(workspace, 'config/governance/runtime.lock.yaml'), original = JSON.stringify(lock) + '\n'; writeFileSync(lockPath, original);
    const plan = runtimeMigrationPlan(workspace), planPath = join(directory, 'plan.json'), requestPath = join(directory, 'request.json');
    const registry = join(directory, 'installation.sqlite'), operation = join(directory, 'operation'); writeFileSync(planPath, JSON.stringify(plan));
    const request = conversationalInitRequest(workspace, registry, archive, lock, plan);
    assert.equal(Object.hasOwn(request, 'lockedCheckout'), false);
    const locked = conversationalInitRequest(workspace, registry, archive, lock, plan, true);
    assert.equal(locked.lockedCheckout, true); assert.equal(locked.lock, lock); assert.deepEqual(locked.inputs, request.inputs);
    const args = ['--request-file', requestPath, '--project-plan', planPath, '--operation-directory', operation];
    writeFileSync(requestPath, JSON.stringify(request));
    await assert.rejects(runtimeOperationCommand('init', args), /Init requires absent installation targets/);
    writeFileSync(requestPath, JSON.stringify({ ...locked, lock: { ...lock, source_commit: 'b'.repeat(40) } }));
    await assert.rejects(runtimeOperationCommand('init', args), /Locked checkout differs from requested artifact/);
    assert.equal(readFileSync(lockPath, 'utf8'), original); assert.equal(existsSync(registry), false); assert.equal(existsSync(operation), false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('multi-turn labels freeze status, mixed requests, replay and isolation before execution', () => {
  const first = conversationalFactsDefinition(), second = conversationalFactsDefinition();
  assert.deepEqual(first, second); const { definitionDigest, ...body } = first; assert.equal(definitionDigest, digest(body));
  assert.equal(first.suiteVersion, 'installed-conversational-facts-6');
  assert.equal(first.cases.length, 27); assert.equal(new Set(first.cases.map(row => row.id)).size, 27);
  assert.equal(first.cases[22].id, 'mature-at-cap-selected-evidence', 'The prior 23 labels remain unchanged');
  assert.deepEqual(first.cases.slice(23).map(row => row.id), ['same-turn-steering', 'same-turn-steering-replay', 'same-turn-earlier-prompt', 'same-turn-earlier-prompt-replay']);
  assert.equal(first.matureHistory.actionCount, 15);
  assert.equal(first.matureHistoryAtCap.actionCount, 64);
  assert.equal(first.matureHistoryAtCap.sourcePath, first.matureHistory.sourcePath);
  assert.equal(first.matureHistoryAtCap.decisiveText, first.matureHistory.decisiveText);
  assert.equal(first.cases.find(row => row.actionCap).prompt, first.cases.find(row => row.id === 'mature-selected-evidence').prompt);
  for (const id of ['unrelated-wording', 'mixed-request', 'unchanged-turn-replay', 'commentary-stable', 'definition-drift', 'accepted', 'fork-isolation', 'sibling-unbound', 'missing-token', 'greenfield-unbound', 'greenfield-first-task', 'greenfield-progress', 'mature-selected-evidence', 'mature-at-cap-selected-evidence'])
    assert.ok(first.cases.some(row => row.id === id));
  assert.equal(first.limits.externalCalls, 0); assert.equal(first.limits.consumed, 'unknown');
});

test('installed steering qualification binds the current prompt to the immutable original native accounting claim', () => {
  const anchor = { provider: 'codex', entryId: 'a'.repeat(64), promptDigest: digest('Original request'), workspace: '/fixture/repo', worktreeLocator: 'fs:1:2:3', session: 'chat', turn: 'active-turn' };
  const marker = { ...anchor, submittedAt: '2026-10-06T12:00:00.000Z' };
  const entry = { ...anchor, entryId: 'b'.repeat(64), promptDigest: digest('Changed request'), familyId: anchor.entryId,
    predecessor: { entryId: anchor.entryId, claimDigest: digest(marker) },
    accountingAnchor: { entryId: anchor.entryId, reservationDigest: digest(marker), entryDigest: digest(anchor), ready: true },
    contextFamily: { entry: 'b'.repeat(64), familyId: anchor.entryId, sharedAllowance: true } };
  entry.entryId = digest({ provider: entry.provider, workspace: entry.workspace, session: entry.session, turn: entry.turn,
    worktreeLocator: entry.worktreeLocator, promptDigest: entry.promptDigest, predecessor: entry.predecessor }).slice(7);
  entry.contextFamily.entry = entry.entryId;
  assert.equal(assessSteeringIdentity(entry, anchor, marker).accountingFamily, anchor.entryId);
  for (const mutate of [value => { value.entryId = anchor.entryId; }, value => { value.promptDigest = anchor.promptDigest; },
    value => { value.turn = 'other-turn'; }, value => { value.session = 'other-chat'; }, value => { value.workspace = '/other/repo'; },
    value => { value.familyId = value.entryId; }, value => { value.accountingAnchor.reservationDigest = digest('other-claim'); },
    value => { value.accountingAnchor.entryDigest = digest('other-original'); }, value => { value.accountingAnchor.ready = false; }]) {
    const changed = structuredClone(entry); mutate(changed); assert.throws(() => assessSteeringIdentity(changed, anchor, marker));
  }
});

test('15 to 64 action comparison uses the actual assessor case row and rejects missing or growing facts', () => {
  const f = fixture(), original = assessConversationalFacts({ ...f.expected, id: 'mature-selected-evidence' }, f.output(f.facts), f.originals);
  assert.equal(original.case, 'mature-selected-evidence'); assert.equal(original.id, undefined);
  const rows = [{ ...original, factsRenderingBytes: 1553 }];
  assert.doesNotThrow(() => assessMatureFactsGrowth(rows, 1553));
  assert.throws(() => assessMatureFactsGrowth(rows, 1554), /Reduced facts grew/);
  assert.throws(() => assessMatureFactsGrowth([{ ...rows[0], case: 'other-case', id: original.case }], 1553), /15-action result is missing/);
});

test('exact native facts identity refuses another workspace, session, turn, packet or fabricated consumption', () => {
  const f = fixture(), output = f.output(f.facts), text = output.hookSpecificOutput.additionalContext;
  const entry = { status: 'prepared', entryId: 'a'.repeat(64), workspace: '/fixture/repo', session: 'fixture-session', turn: 'progress',
    currentPromptComplete: true, promptDigest: digest('How is it going?'), packetDigest: digest(text), packetBytes: Buffer.byteLength(text),
    packetLimitBytes: 24000, taskFacts: { digest: digest(f.facts) }, nativeUsage: null, acceptedOutcome: 'unknown' };
  const packet = { entryId: entry.entryId, text, taskFacts: f.facts };
  const input = { entry, packet, output, workspace: entry.workspace, session: entry.session, turn: entry.turn, prompt: 'How is it going?' };
  assert.equal(assessNativeFactsIdentity(input).hostConsumption, 'unknown');
  for (const mutate of [value => { value.entry.workspace = '/fixture/sibling'; }, value => { value.entry.session = 'different-chat'; },
    value => { value.entry.turn = 'different-turn'; }, value => { value.packet.text += 'invented'; },
    value => { value.entry.packetDigest = 'sha256:invented'; }, value => { value.entry.packetBytes++; },
    value => { value.entry.packetLimitBytes = 1; }, value => { value.entry.taskFacts.digest = 'sha256:invented'; },
    value => { value.packet.taskFacts.checkpoint.summary = 'Invented checkpoint'; }, value => { value.entry.acceptedOutcome = 'accepted'; },
    value => { value.entry.nativeUsage = { inputTokens: 0 }; }]) {
    const changed = structuredClone(input); mutate(changed); assert.throws(() => assessNativeFactsIdentity(changed));
  }
});

test('reduced native facts keep the original snapshot identity and independently bind the delivered reduction', () => {
  const f = fixture(), rendered = renderTaskFacts(f.facts, 10000, 'references');
  const text = 'Required current guidance:\n' + f.originals.requiredGuidance.join('') + rendered;
  const output = { hookSpecificOutput: { additionalContext: text } };
  const entry = { status: 'prepared', entryId: 'a'.repeat(64), workspace: '/fixture/repo', session: 'fixture-session', turn: 'mature',
    currentPromptComplete: true, promptDigest: digest('Fix reconnect'), packetDigest: digest(text), packetBytes: Buffer.byteLength(text),
    packetLimitBytes: 14000, taskFacts: { digest: digest(f.facts) }, nativeUsage: null, acceptedOutcome: 'unknown',
    factsRendering: { detail: 'reduced', digest: digest(rendered), bytes: Buffer.byteLength(rendered) } };
  const packet = { entryId: entry.entryId, text, taskFacts: f.facts };
  const input = { entry, packet, output, workspace: entry.workspace, session: entry.session, turn: entry.turn, prompt: 'Fix reconnect', reduced: true };
  assert.equal(assessNativeFactsIdentity(input).hostConsumption, 'unknown');
  for (const mutate of [value => { value.entry.factsRendering.digest = 'sha256:invented'; }, value => { value.entry.factsRendering.bytes++; },
    value => { value.entry.factsRendering.detail = 'full'; }, value => { value.packet.taskFacts.task.status = 'accepted'; },
    value => { value.packet.taskFacts.checkpoint.checkpointId = 'different-original'; }]) {
    const changed = structuredClone(input); mutate(changed); assert.throws(() => assessNativeFactsIdentity(changed));
  }
});

test('workspace custody detects staged changes and uncommitted source edits without changing Git state', () => {
  const directory = mkdtempSync(join(tmpdir(), 'conversational-custody-'));
  const git = (...args) => execFileSync('git', args, { cwd: directory, stdio: 'pipe' });
  try {
    git('init', '-q'); writeFileSync(join(directory, 'AGENTS.md'), 'Required original guidance.\n');
    const initial = workspaceCustodySnapshot(directory); assert.equal(initial.head, null);
    assert.deepEqual(workspaceCustodySnapshot(directory), initial);
    writeFileSync(join(directory, 'AGENTS.md'), 'Changed untracked original guidance.\n');
    const changed = workspaceCustodySnapshot(directory); assert.equal(changed.status, initial.status);
    assert.notDeepEqual(changed.files, initial.files, 'Untracked original edits need byte identity');
    git('add', 'AGENTS.md'); const staged = workspaceCustodySnapshot(directory);
    assert.notEqual(staged.stagedDigest, changed.stagedDigest);
    assert.deepEqual(workspaceCustodySnapshot(directory), staged);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('only actual native additionalContext qualifies, with one well-formed snapshot', () => {
  const f = fixture(); assert.equal(readDeliveredFacts(f.output(f.facts)).facts.task.status, 'open');
  assert.throws(() => readDeliveredFacts({ text: f.output(f.facts).hookSpecificOutput.additionalContext }), /additionalContext/);
  assert.throws(() => readDeliveredFacts({ hookSpecificOutput: { additionalContext: FACTS_MARKER + '{}' } }));
  assert.throws(() => readDeliveredFacts({ hookSpecificOutput: { additionalContext: FACTS_MARKER + JSON.stringify(f.facts) + '\n' + FACTS_MARKER } }), /repeated/);
});

test('implementation declared complete cannot substitute for pending verification and acceptance', () => {
  const f = fixture(), qualified = assessConversationalFacts(f.expected, f.output(f.facts), f.originals);
  assert.equal(qualified.prepared, true); assert.equal(qualified.consumed, 'unknown'); assert.equal(qualified.acceptedDevelopmentOutcome, 'unknown');
  for (const edit of [value => { value.plan.progress.items[1].completed = true; }, value => { value.task.status = 'accepted'; },
    value => { value.task.execution_permission = 'allowed'; }, value => { value.association.taskId = 'sibling-task'; },
    value => { value.checkpoint.next = 'Invented next step'; }, value => { value.checkpoint.createdAt = '2026-10-05T12:03:00.000Z'; }]) {
    const changed = structuredClone(f.facts); edit(changed); assert.throws(() => assessConversationalFacts(f.expected, f.output(changed), f.originals));
  }
});

test('no phrase classifier is needed and an unbound request must not borrow a task', () => {
  const f = fixture(); assert.equal(assessConversationalFacts({ ...f.expected, id: 'unrelated-wording' }, f.output(f.facts), f.originals).actualAdditionalContext, true);
  const empty = { version: 1, observed_at: f.facts.observed_at, association: { status: 'session-unbound' }, unavailable: ['session-unbound'], omitted: [] };
  assert.equal(assessConversationalFacts({ id: 'unbound', association: 'unbound' }, f.output(empty), f.originals).taskStatus, null);
  assert.throws(() => assessConversationalFacts({ id: 'unbound', association: 'unbound' }, f.output({ ...empty, task: f.facts.task }), f.originals), /borrowed/);
});

test('definition drift and forks preserve unknown progress instead of certifying stale plans', () => {
  const f = fixture(), stale = structuredClone(f.facts); stale.plan = { status: 'definition-stale', recorded_definition_digest: 'sha256:old', observed_definition_digest: 'sha256:new' };
  stale.unavailable = ['plan-definition-stale'];
  assert.equal(assessConversationalFacts({ id: 'drift', association: 'taskA', plan: 'definition-stale' }, f.output(stale), f.originals).planStatus, 'definition-stale');
  stale.plan.progress = f.facts.plan.progress;
  assert.throws(() => assessConversationalFacts({ id: 'drift', association: 'taskA', plan: 'definition-stale' }, f.output(stale), f.originals), /current progress credit/);
  const fork = structuredClone(f.facts); delete fork.plan; fork.unavailable = ['plan-not-linked'];
  assert.equal(assessConversationalFacts({ id: 'fork', association: 'child', plan: 'not-linked' }, f.output(fork), f.originals).planStatus, null);
});

test('failed check and refused action need their original identities, outcomes and reasons', () => {
  const f = fixture(); f.originals.failedAction = { actionId: 'failed-original' };
  const result = { state: 'failed', exitCode: 1, cleanup: 'confirmed', log: '/fixture/original-log' };
  f.originals.failedWorkflow = { run: { id: 'original-run', state: 'failed' }, stages: [{ id: 'batch', state: 'failed', result }] };
  f.originals.refusedAction = { actionId: 'refused-original', refusedReason: 'action exceeds the task scope' };
  f.facts.actions = [{ actionId: 'failed-original', status: 'authorized', workflowRun: { runId: 'original-run', state: 'failed',
    stages: [{ id: 'batch', state: 'failed', resultDigest: digest(result), exitCode: 1, cleanup: 'confirmed', log: result.log }] },
    resultProvenance: 'recorded original only; no collection or cleanup action' }, { ...f.originals.refusedAction, status: 'refused' }];
  const expected = { id: 'failure', association: 'taskA', failedAction: true, refusedAction: true };
  assert.equal(assessConversationalFacts(expected, f.output(f.facts), f.originals).taskStatus, 'open');
  for (const edit of [v => { v.actions[0].workflowRun.state = 'succeeded'; }, v => { v.actions[0].workflowRun.runId = 'unrelated-run'; },
    v => { v.actions[0].workflowRun.stages[0].resultDigest = 'sha256:invented'; }, v => { v.actions[0].workflowRun.stages[0].cleanup = 'unknown'; },
    v => { v.actions[1].refusedReason = 'invented blocker'; }, v => { v.actions = []; }]) {
    const changed = structuredClone(f.facts); edit(changed); assert.throws(() => assessConversationalFacts(expected, f.output(changed), f.originals));
  }
});

test('logical core snapshots detect row mutation even when table counts stay the same', () => {
  const directory = mkdtempSync(join(tmpdir(), 'conversational-core-snapshot-')), path = join(directory, 'core.sqlite');
  try {
    assert.deepEqual(continuitySnapshot(path), { present: false });
    const db = new DatabaseSync(path); db.exec('CREATE TABLE task(id TEXT, state TEXT); INSERT INTO task VALUES(\'a\',\'open\')');
    const first = continuitySnapshot(path); assert.deepEqual(continuitySnapshot(path), first);
    db.exec("UPDATE task SET state='accepted'"); const second = continuitySnapshot(path); db.close();
    assert.deepEqual(second.tableCounts, first.tableCounts); assert.notEqual(second.digest, first.digest);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('freeze-only persists independent labels without installation or provider calls', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'conversational-freeze-'));
  try {
    const result = await verifyConversationalFacts({ packageRoot: '/missing', output: directory, freezeOnly: true });
    assert.equal(result.status, 'frozen'); assert.deepEqual(result.rows, []);
    assert.equal(JSON.parse(readFileSync(result.reportPath, 'utf8')).definitionDigest, conversationalFactsDefinition().definitionDigest);
    await assert.rejects(verifyConversationalFacts({ output: directory, freezeOnly: true }), /fresh proof directory/);
    await assert.rejects(verifyConversationalFacts({ output: join(directory, 'no-archive') }), /exact candidate archive/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
