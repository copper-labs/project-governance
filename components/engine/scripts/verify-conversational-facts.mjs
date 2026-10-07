import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { digest } from '../src/core.ts';
import { nativeFixture } from './verify-bound-continuation.mjs';
import { stageContextQualityArchive } from './verify-context-quality.mjs';

export const FACTS_MARKER = 'Current task facts (read-only snapshot; declarations are not proof):\n';
export const CONVERSATIONAL_WORKFLOW_WAIT_MS = 30000;
const PLAN_PATH = 'docs/exec-plans/active/reconnect.md';
const hash = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const save = (path, value) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 }); return path; };

/** Expectations are authored before hooks run, independently of any model/provider answer. */
export function conversationalFactsDefinition() {
  const body = { version: 1, suiteVersion: 'installed-conversational-facts-6',
    taskA: { outcome: 'Finish the reconnect lifecycle and retain the original verification evidence.', acceptance: 'Reconnect state survives collection and cleanup.' },
    taskB: { outcome: 'Document the unrelated sample configuration.', acceptance: 'The sample configuration has a documented default.' },
    checkpointA: { summary: 'The reconnect implementation is declared complete; verification remains pending.', next: 'Run the focused reconnect proof before accepting the task.' },
    checkpointLater: { summary: 'The focused check failed; the original result is retained.', next: 'Fix the reconnect condition and repeat only the affected proof.' },
    matureHistory: { actionCount: 15, sourcePath: 'src/reconnect.ts', decisiveText: 'Preserve reconnect cleanup ownership until the original settlement is confirmed.' },
    matureHistoryAtCap: { actionCount: 64, sourcePath: 'src/reconnect.ts', decisiveText: 'Preserve reconnect cleanup ownership until the original settlement is confirmed.' },
    cases: [
      { id: 'unbound', prompt: 'Is it done?', association: 'unbound' },
      { id: 'initial-bound', prompt: 'I need an update on progress', association: 'taskA', checkpoint: 'initial', plan: 'pending-proof' },
      { id: 'alternative-progress', prompt: 'What is left?', association: 'taskA', checkpoint: 'initial', plan: 'pending-proof' },
      { id: 'unrelated-wording', prompt: 'Explain this state in one sentence.', association: 'taskA', checkpoint: 'initial', plan: 'pending-proof' },
      { id: 'failed-check', prompt: 'Why are we blocked?', association: 'taskA', checkpoint: 'later', failedAction: true, refusedAction: true },
      { id: 'unchanged-turn-replay', prompt: 'Why are we blocked?', association: 'taskA', checkpoint: 'later', replay: true },
      { id: 'new-turn-checkpoint', prompt: 'Continue where you left off', association: 'taskA', checkpoint: 'newest' },
      { id: 'mixed-request', prompt: 'Give me an update, then fix the reconnect issue.', association: 'taskA', mixed: true },
      { id: 'bookkeeping-stable', prompt: 'What verification evidence do we have?', association: 'taskA', plan: 'linked-verified' },
      { id: 'commentary-stable', prompt: 'What is next after the progress note?', association: 'taskA', plan: 'linked-verified' },
      { id: 'definition-drift', prompt: 'What remains after that plan edit?', association: 'taskA', plan: 'definition-stale' },
      { id: 'explicit-task-switch', prompt: 'Switch to the configuration task and give me an update.', association: 'taskB' },
      { id: 'needs-input', prompt: 'Why are we waiting?', association: 'taskB', status: 'needs-input' },
      { id: 'accepted', prompt: 'Is the configuration task accepted?', association: 'taskB', status: 'accepted' },
      { id: 'cancelled', prompt: 'What happened to the configuration task?', association: 'taskB', status: 'cancelled' },
      { id: 'fork-isolation', prompt: 'Where are we at in this fork?', association: 'child', plan: 'not-linked' },
      { id: 'sibling-unbound', prompt: 'Is it done?', association: 'unbound' },
      { id: 'missing-token', prompt: 'Give me the current reconnect status.', association: 'taskA', missingToken: true },
      { id: 'greenfield-unbound', prompt: 'Where do we start?', association: 'unbound' },
      { id: 'greenfield-first-task', prompt: 'What is the plan?', association: 'greenfield' },
      { id: 'greenfield-progress', prompt: 'How is it going?', association: 'greenfield', checkpoint: 'greenfield' },
      { id: 'mature-selected-evidence', prompt: 'Give me an update, then fix reconnect cleanup from src/reconnect.ts.', association: 'mature', status: 'needs-input', matureHistory: true },
      { id: 'mature-at-cap-selected-evidence', prompt: 'Give me an update, then fix reconnect cleanup from src/reconnect.ts.', association: 'matureAtCap', status: 'needs-input', matureHistory: true, actionCap: true },
      { id: 'same-turn-steering', prompt: 'Before continuing, explain remaining reconnect settlement, then fix src/reconnect.ts.', association: 'matureAtCap', status: 'needs-input', matureHistory: true, actionCap: true, steeringAnchor: 'mature-at-cap-selected-evidence' },
      { id: 'same-turn-steering-replay', prompt: 'Before continuing, explain remaining reconnect settlement, then fix src/reconnect.ts.', association: 'matureAtCap', status: 'needs-input', matureHistory: true, actionCap: true, steeringAnchor: 'mature-at-cap-selected-evidence', replay: true },
      { id: 'same-turn-earlier-prompt', prompt: 'Give me an update, then fix reconnect cleanup from src/reconnect.ts.', association: 'matureAtCap', status: 'needs-input', matureHistory: true, actionCap: true, steeringAnchor: 'mature-at-cap-selected-evidence' },
      { id: 'same-turn-earlier-prompt-replay', prompt: 'Give me an update, then fix reconnect cleanup from src/reconnect.ts.', association: 'matureAtCap', status: 'needs-input', matureHistory: true, actionCap: true, steeringAnchor: 'mature-at-cap-selected-evidence', replay: true },
    ], limits: { externalCalls: 0, actualNativeHost: 'synthetic-parent-only', consumed: 'unknown', acceptedDevelopmentOutcome: 'unknown', savings: 'unqualified' } };
  return { ...body, definitionDigest: digest(body) };
}

export function assessSteeringIdentity(entry, anchor, marker, predecessor = marker) {
  assert.notEqual(entry.entryId, anchor.entryId, 'Changed native input was collapsed into its original entry');
  for (const field of ['workspace', 'worktreeLocator', 'session', 'turn']) assert.equal(entry[field], anchor[field], `Steering changed ${field}`);
  assert.equal(entry.predecessor.entryId, predecessor.entryId); assert.equal(entry.predecessor.claimDigest, digest(predecessor));
  assert.equal(entry.entryId, digest({ provider: entry.provider, workspace: entry.workspace, session: entry.session, turn: entry.turn,
    worktreeLocator: entry.worktreeLocator, promptDigest: entry.promptDigest, predecessor: entry.predecessor }).slice(7));
  assert.equal(entry.familyId, anchor.entryId); assert.equal(entry.accountingAnchor.entryId, anchor.entryId);
  assert.equal(marker.entryId, anchor.entryId); assert.equal(entry.accountingAnchor.reservationDigest, digest(marker));
  assert.equal(entry.accountingAnchor.entryDigest, digest(anchor)); assert.equal(entry.accountingAnchor.ready, true);
  assert.equal(entry.contextFamily.familyId, anchor.entryId); assert.equal(entry.contextFamily.entry, entry.entryId);
  assert.equal(entry.contextFamily.sharedAllowance, true);
  return { accountingFamily: anchor.entryId, currentEntry: entry.entryId, nativeTurn: anchor.turn, originalReservationDigest: digest(marker) };
}

export function readDeliveredFacts(output) {
  const text = output?.hookSpecificOutput?.additionalContext;
  assert.equal(typeof text, 'string', 'Generated native hook did not return additionalContext');
  const start = text.indexOf(FACTS_MARKER);
  assert.ok(start >= 0, 'Actual native additionalContext omitted the facts snapshot');
  assert.equal(text.indexOf(FACTS_MARKER, start + FACTS_MARKER.length), -1, 'Native facts marker repeated');
  const line = text.slice(start + FACTS_MARKER.length).split('\n')[0];
  const facts = JSON.parse(line);
  assert.equal(facts.version, 1); assert.ok(Number.isFinite(Date.parse(facts.observed_at)), 'Facts need an observation time');
  assert.ok(Array.isArray(facts.unavailable) && Array.isArray(facts.omitted));
  return { text, facts };
}

/** Qualify the exact installed hook boundary without claiming that a real host consumed it. */
export function assessNativeFactsIdentity({ entry, packet, output, workspace, session, turn, prompt, reduced = false }) {
  const { text, facts } = readDeliveredFacts(output);
  assert.equal(entry.status, 'prepared'); assert.equal(entry.workspace, workspace); assert.equal(entry.session, session);
  assert.equal(entry.turn, turn); assert.equal(entry.currentPromptComplete, true); assert.equal(entry.promptDigest, digest(prompt));
  assert.equal(packet.text, text); assert.equal(packet.entryId, entry.entryId);
  assert.equal(entry.packetDigest, digest(text)); assert.equal(entry.packetBytes, Buffer.byteLength(text));
  assert.ok(entry.packetBytes <= entry.packetLimitBytes, 'Final facts packet exceeded its declared limit');
  assert.equal(entry.taskFacts?.digest, digest(packet.taskFacts), 'Original facts identity changed');
  if (reduced) {
    assert.equal(entry.factsRendering?.detail, 'reduced', 'The mature task must retain meaningful compact facts');
    const renderedText = FACTS_MARKER + JSON.stringify(facts) + '\n';
    assert.equal(entry.factsRendering.digest, digest(renderedText)); assert.equal(entry.factsRendering.bytes, Buffer.byteLength(renderedText));
    assert.deepEqual(facts.association, packet.taskFacts.association);
    for (const key of ['status', 'mode', 'acceptance_authority', 'execution_permission']) assert.equal(facts.task?.[key], packet.taskFacts.task?.[key]);
    for (const group of ['plan', 'checkpoint']) if (facts[group])
      for (const [key, value] of Object.entries(facts[group])) assert.deepEqual(value, packet.taskFacts[group]?.[key], `Reduced ${group} ${key} differs from the original`);
    assert.ok(facts.unavailable.includes('task-facts-packet-space')); assert.ok(facts.omitted.some(value => value.includes('required guidance and selected evidence')));
    if (facts.unavailable_summary) {
      const unavailable = packet.taskFacts.unavailable, workflowUnknown = unavailable.filter(reason => reason.startsWith('workflow-not-observed-in-window:')).length;
      assert.deepEqual(facts.unavailable_summary, { original_count: unavailable.length, original_digest: digest(unavailable),
        workflow_not_observed_actions: workflowUnknown, other_count: unavailable.length - workflowUnknown });
      assert.deepEqual(facts.omitted_summary, { original_count: packet.taskFacts.omitted.length, original_digest: digest(packet.taskFacts.omitted) });
      assert.equal(facts.unavailable.includes('unavailable-details-in-original-snapshot'), unavailable.length > 0);
    }
    assert.equal(facts.actions, undefined, 'The reduction must not invent a partial action history');
  } else assert.deepEqual(packet.taskFacts, facts, 'Retained packet and hook facts differ');
  assert.equal(entry.acceptedOutcome, 'unknown'); assert.equal(entry.nativeUsage, null);
  return { session, workspace, turn, entryId: entry.entryId, packetBytes: entry.packetBytes, packetLimitBytes: entry.packetLimitBytes,
    factsDigest: digest(facts), hostConsumption: 'unknown' };
}

/** Observe native workspace custody; the fixture itself must not reattach or rewrite a checkout. */
export function workspaceCustodySnapshot(workspace, environment = process.env) {
  const git = (...args) => execFileSync('git', args, { cwd: workspace, env: environment, stdio: 'pipe', timeout: 30000 });
  const head = spawnSync('git', ['rev-parse', '--verify', 'HEAD'], { cwd: workspace, env: environment, encoding: 'utf8', timeout: 30000 });
  assert.ok([0, 128].includes(head.status), 'Git HEAD observation failed');
  const files = ['AGENTS.md', 'src/reconnect.ts', PLAN_PATH, 'config/governance/profile.yaml', 'config/governance/facts.lock.yaml',
    'config/governance/runtime.lock.yaml', '.codex/hooks.json', '.governance/runtime/bin/project-governance'];
  return { workspace: realpathSync(workspace), topLevel: realpathSync(git('rev-parse', '--show-toplevel').toString().trim()),
    commonDirectory: realpathSync(git('rev-parse', '--path-format=absolute', '--git-common-dir').toString().trim()),
    gitDirectory: realpathSync(git('rev-parse', '--absolute-git-dir').toString().trim()),
    branch: git('branch', '--show-current').toString().trim(), head: head.status === 0 ? head.stdout.trim() : null,
    stagedDigest: hash(git('diff', '--cached', '--binary')), status: git('status', '--porcelain=v1', '-z').toString(),
    files: Object.fromEntries(files.map(path => [path, existsSync(join(workspace, path)) ? hash(readFileSync(join(workspace, path))) : null])) };
}

/** Grade delivered originals, never a fabricated summary or prepared-only route proxy. */
export function assessConversationalFacts(expected, output, originals) {
  const { text, facts } = readDeliveredFacts(output);
  assert.equal(text.includes('Required current guidance:'), true, 'Required native guidance framing missing');
  assert.ok(Array.isArray(originals.requiredGuidance), 'Freeze the configured required-packet guidance set');
  for (const guidance of originals.requiredGuidance) {
    assert.ok(typeof guidance === 'string' && guidance.length > 0, 'Required originals must be nonempty');
    assert.ok(text.includes(guidance), 'Required original guidance did not survive delivery');
  }
  if (expected.association === 'unbound') {
    assert.ok(['task-store-unavailable', 'workspace-unbound', 'session-unbound'].includes(facts.association.status));
    assert.equal(facts.task, undefined, 'An unbound chat borrowed another task');
    assert.equal(facts.association.taskId, undefined);
  } else {
    assert.ok(['associated', 'historical-bound-revision'].includes(facts.association.status));
    assert.equal(facts.association.taskId, originals.task.taskId);
    assert.equal(facts.association.observedRevision, originals.task.version);
    if (!expected.matureHistory) assert.equal(facts.task.outcome, originals.task.outcome);
    assert.equal(facts.task.status, expected.status ?? 'open');
    assert.equal(facts.task.execution_permission, 'not granted by this snapshot');
    if (originals.checkpoint) {
      for (const key of expected.matureHistory ? ['checkpointId', 'taskVersion', 'attemptId'] : ['checkpointId', 'taskId', 'taskVersion', 'attemptId', 'summary', 'next', 'createdAt'])
        assert.equal(facts.checkpoint?.[key], originals.checkpoint[key], `Original checkpoint ${key} differs`);
      assert.equal(facts.checkpoint.provenance, 'caller-declared summary and next action; not executed proof');
    }
    if (expected.plan === 'pending-proof') {
      assert.equal(facts.plan.status, 'linked');
      const items = facts.plan.progress.items;
      assert.equal(items.find(item => item.id === 'B1.I').completed, true);
      assert.equal(items.find(item => item.id === 'B1.V').completed, false);
      assert.equal(items.find(item => item.id === 'B1.C').completed, false);
      assert.deepEqual(facts.checks, []);
    }
    if (expected.plan === 'linked-verified') {
      assert.equal(facts.plan.status, 'linked');
      assert.equal(facts.plan.recorded_definition_digest, originals.definitionDigest);
      assert.equal(facts.plan.observed_definition_digest, originals.definitionDigest);
      assert.notEqual(facts.plan.observed_file_digest, originals.initialFileDigest, 'Bookkeeping should change whole-file identity');
      assert.equal(facts.plan.progress.items.find(item => item.id === 'B1.V').completed, true);
      assert.ok(facts.checks.some(check => check.original_outcome === 'passed' && check.reference.run_id === originals.check.run_id));
    }
    if (expected.plan === 'definition-stale') {
      assert.equal(facts.plan.status, 'definition-stale');
      assert.notEqual(facts.plan.observed_definition_digest, facts.plan.recorded_definition_digest);
      assert.ok(facts.unavailable.includes('plan-definition-stale'));
      assert.equal(facts.plan.progress, undefined, 'Stale plan definition received current progress credit');
    }
    if (expected.plan === 'not-linked') {
      assert.equal(facts.plan, undefined); assert.ok(facts.unavailable.includes('plan-not-linked'));
    }
    if (expected.failedAction) {
      const action = facts.actions.find(item => item.actionId === originals.failedAction.actionId);
      assert.ok(action, 'Original failed check action missing');
      assert.equal(action.workflowRun?.runId, originals.failedWorkflow.run.id);
      assert.equal(action.workflowRun?.state, 'failed');
      for (const original of originals.failedWorkflow.stages) {
        const stage = action.workflowRun.stages.find(item => item.id === original.id);
        assert.ok(stage, 'Original failed workflow stage missing');
        assert.equal(stage.state, original.state);
        assert.equal(stage.resultDigest, original.result ? digest(original.result) : null);
        if (original.result) for (const key of ['exitCode', 'cleanup', 'log']) assert.equal(stage[key], original.result[key]);
      }
      assert.equal(action.resultProvenance, 'recorded original only; no collection or cleanup action');
    }
    if (expected.refusedAction) {
      const action = facts.actions.find(item => item.actionId === originals.refusedAction.actionId);
      assert.equal(action?.status, 'refused'); assert.equal(action.refusedReason, originals.refusedAction.refusedReason);
    }
  }
  assert.equal(text.includes('declarations are not proof'), true);
  return { case: expected.id, factsDigest: digest(facts), association: facts.association, planStatus: facts.plan?.status ?? null,
    taskStatus: facts.task?.status ?? null, checkpointId: facts.checkpoint?.checkpointId ?? null,
    actualAdditionalContext: true, prepared: true, consumed: 'unknown', acceptedDevelopmentOutcome: 'unknown' };
}

/** Compare actual assessor rows; their stable label is `case`, not a task identity. */
export function assessMatureFactsGrowth(rows, currentBytes) {
  const earlier = rows.find(row => row.case === 'mature-selected-evidence');
  assert.ok(earlier, 'The independently retained 15-action result is missing');
  assert.equal(currentBytes, earlier.factsRenderingBytes, 'Reduced facts grew from 15 to 64 real action originals');
}

/** Capture every logical core row; read-only CLI proof is separate from normal prompt analytics. */
export function continuitySnapshot(database) {
  if (!existsSync(database)) return { present: false };
  const store = new DatabaseSync(database, { readOnly: true });
  try {
    store.exec('BEGIN');
    const tables = store.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(row => row.name);
    const rows = Object.fromEntries(tables.map(name => [name, store.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}"`).all()
      .map(row => JSON.stringify(row)).sort()]));
    return { present: true, digest: digest(rows), tableCounts: Object.fromEntries(tables.map(name => [name, rows[name].length])) };
  } finally { store.close(); }
}

/** A pending observation resumes waiting on the same owner; it never resubmits the check. */
export function observeFixtureFailure(observe, database, runId) {
  for (let observation = 0; observation < 2; observation++) {
    const result = observe(['workflow-wait', '--database', database, '--run', runId,
      '--wait-ms', String(CONVERSATIONAL_WORKFLOW_WAIT_MS)], [1, 2]);
    assert.equal(result.run?.id, runId, 'Workflow observation returned another run');
    if (result.run.state === 'failed') return result;
    assert.ok(['queued', 'running', 'reconciling'].includes(result.run.state), 'Unexpected fixture workflow outcome');
    assert.equal(result.reason, 'timeout', 'Pending workflow must retain its observation reason');
  }
  throw new Error('Original fixture workflow still pending after bounded observations; do not redispatch');
}

/** A linked checkout adopts its exact tracked pin explicitly; fresh projects have no existing pin. */
export function conversationalInitRequest(workspace, registry, archive, lock, plan, lockedCheckout = false) {
  return { mode: 'init', workspace, registry, archive, lock, expectedRevision: 0, inputs: plan.inputs, hostPlan: plan.hostPlan,
    ...(lockedCheckout ? { lockedCheckout: true } : {}) };
}

/** Install/control evidence stays outside every synthetic source worktree. */
export function conversationalInstallationPaths(directory, label) {
  const root = join(directory, 'installations', label);
  return { root, plan: join(root, 'host-plan.json'), registry: join(root, 'installation.sqlite'),
    request: join(root, 'init-request.json'), operation: join(root, 'operation') };
}

function planText() {
  const declaration = { version: 1, specifications: [], batches: [{ id: 'B1', depends_on: [], items: [
    { id: 'B1.I', kind: 'implementation' }, { id: 'B1.V', kind: 'verification', requires: ['B1.I'], check: { stage: 'batch', packs: ['fixture-progress'] } },
    { id: 'B1.C', kind: 'closeout', requires: ['B1.I', 'B1.V'] } ] }] };
  return '# Reconnect implementation\n\nPreserve verification separately from declared implementation.\n\n```governance-plan\n' + JSON.stringify(declaration) + '\n```\n\n' +
    ['I', 'V', 'C'].map(id => `<!-- governance:item B1.${id} -->\n- [ ] ${id === 'I' ? 'Implement reconnect' : id === 'V' ? 'Verify reconnect' : 'Close out reconnect'}.\n<!-- governance:evidence B1.${id} -->[]<!-- /governance:evidence -->`).join('\n') +
    '\n\n<!-- governance:notes reconnect-progress -->\nCurrent/next: implementation pending.\n<!-- /governance:notes reconnect-progress -->\n';
}
function profile(mode = 'off') {
  return { profile_id: 'synthetic-conversational-facts', runtime_updates: { policy: 'manual' }, continuity: { decisions: { mode,
    allowed_data_classes: ['metadata', 'source'], allowed_metadata_paths: ['docs/**', 'src/**'], allowed_source_paths: ['docs/**', 'src/**'],
    consumers: { DL03: { mode, questions: ['context.metadata-relevance/1', 'context.passage-evidence/1', 'context.passage-role/1'] } } } },
    context_router: { default_route: 'project', routes: [{ id: 'project', primary_context: ['AGENTS.md'],
      token_budget: { primary_context_tokens: 3000, active_plan_context_tokens: 1000, expansion_context_tokens: 10000, total_context_tokens: 16000 } }] } };
}
function externalOutput(output) {
  const checkout = realpathSync(fileURLToPath(new URL('../../..', import.meta.url))), requested = resolve(output);
  let ancestor = requested; while (!existsSync(ancestor)) ancestor = dirname(ancestor);
  const path = resolve(realpathSync(ancestor), relative(ancestor, requested)), rel = relative(checkout, path);
  assert.ok(rel && (rel.startsWith('..') || isAbsolute(rel)), 'Keep proof evidence outside source');
  mkdirSync(path, { recursive: true }); return realpathSync(path);
}

/** Installed public entry journey. No model or external transport is used or claimed. */
export async function verifyConversationalFacts({ packageRoot, archive, archiveDigest, output, freezeOnly = false }) {
  const directory = externalOutput(output), definition = conversationalFactsDefinition();
  const definitionPath = join(directory, 'definition.json'); assert.equal(existsSync(definitionPath), false, 'Use a fresh proof directory'); save(definitionPath, definition);
  if (freezeOnly) return { status: 'frozen', definitionDigest: definition.definitionDigest, rows: [], reportPath: definitionPath };
  assert.ok(archive, 'Supply the exact candidate archive');
  const staged = await stageContextQualityArchive({ packageRoot, archive, archiveDigest, stagingRoot: join(directory, 'runtime-stage') });
  const load = name => import(pathToFileURL(join(staged.identity.root, `dist/engine/src/${name}.js`)).href);
  const [{ runtimeMigrationPlan }, { RuntimeGenerations }, { inspectRuntimeGeneration }, { parseImplementationPlan, normalizedPlanContent, planBytesDigest }] =
    await Promise.all(['runtime-migration-plan', 'runtime-generations', 'runtime-inspection', 'implementation-plan'].map(load));
  const hostApi = await import(pathToFileURL(join(staged.identity.root, 'dist/engine/src/host-api-v1.js')).href);
  const { processLiveFingerprint } = await load('process-owner'), { renderPromptContext } = await load('prompt-context');
  const lock = JSON.parse(readFileSync(staged.identity.stage.receiptPath, 'utf8')).lock;
  const workspace = join(directory, 'repo'), state = join(directory, 'state'), session = 'synthetic-conversational-facts'; mkdirSync(workspace, { recursive: true });
  const environment = { ...process.env, XDG_STATE_HOME: state, HARNESS_SESSION: session, JEV_TOKEN: '', PATH: `/Library/Developer/CommandLineTools/usr/bin:${process.env.PATH ?? ''}` };
  for (const key of Object.keys(environment)) if (/^(?:GOVERNANCE_|GIT_)/u.test(key) || ['NODE_OPTIONS', 'HARNESS_AGENT_ANCESTRY', 'HARNESS_TASK', 'CODEX_THREAD_ID', 'GH_TOKEN', 'GITHUB_TOKEN'].includes(key)) delete environment[key];
  const callsPath = join(directory, 'transport.jsonl'), preload = join(directory, 'deny-network.mjs');
  writeFileSync(preload, `import{appendFileSync}from'node:fs';globalThis.fetch=async()=>{appendFileSync(${JSON.stringify(callsPath)},'attempt\\n');throw Error('External transport forbidden in conversational facts proof');};\n`);
  environment.NODE_OPTIONS = `--import ${pathToFileURL(preload).href}`;
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, env: environment, stdio: 'pipe', timeout: 30000 });
  let sequence = 0;
  const invoke = (cwd, command, args, expected = 0, env = environment) => {
    const response = spawnSync(command, args, { cwd, env, encoding: 'utf8', timeout: 60000, maxBuffer: 4 * 1024 * 1024 });
    save(join(directory, 'commands', `${sequence++}.json`), { command, args, status: response.status, stdout: response.stdout, stderr: response.stderr,
      timedOut: response.error?.code === 'ETIMEDOUT', signal: response.signal, errorCode: response.error?.code ?? null });
    if (Array.isArray(expected)) assert.ok(expected.includes(response.status), 'Installed public command failed; original command receipt retained');
    else assert.equal(response.status, expected, 'Installed public command failed; original command receipt retained');
    return JSON.parse(response.stdout);
  };
  const init = (cwd, label, lockedCheckout = false) => {
    const evidence = conversationalInstallationPaths(directory, label);
    const initPlan = runtimeMigrationPlan(cwd), planPath = save(evidence.plan, initPlan), registry = evidence.registry;
    const request = save(evidence.request, conversationalInitRequest(cwd, registry,
      staged.identity.archive.retainedPath, lock, initPlan, lockedCheckout));
    invoke(cwd, process.execPath, [staged.identity.launcher, 'init', '--request-file', request, '--project-plan', planPath, '--operation-directory', evidence.operation]);
    const generations = new RuntimeGenerations(registry); let generation; try { generation = generations.state(); } finally { generations.close(); }
    return { workspace: cwd, registry, launcher: join(cwd, '.governance/runtime/bin/project-governance'), hooks: JSON.parse(readFileSync(join(cwd, '.codex/hooks.json'), 'utf8')).hooks,
      hostGuidance: { path: 'AGENTS.md', digest: hash(readFileSync(join(cwd, 'AGENTS.md'))), consumption: 'unknown' },
      packageRoot: join(generation.directory, 'node_modules/@organta/project-governance'), generation, inspection: inspectRuntimeGeneration(generation.directory) };
  };
  git(workspace, 'init', '-q');
  const requiredGuidance = '# Required instructions\nImplementation declarations do not establish verification or task acceptance.\nKeep failure and cleanup uncertainty visible.\n';
  writeFileSync(join(workspace, 'AGENTS.md'), requiredGuidance); mkdirSync(join(workspace, 'src')); writeFileSync(join(workspace, 'src/reconnect.ts'), 'export const reconnect = false;\n');
  mkdirSync(dirname(join(workspace, PLAN_PATH)), { recursive: true }); writeFileSync(join(workspace, PLAN_PATH), planText());
  save(join(workspace, 'config/governance/profile.yaml'), profile()); save(join(workspace, 'config/governance/facts.lock.yaml'), { profile_id: 'synthetic-conversational-facts', facts: {} });
  const checker = join(workspace, 'tools/progress-check.mjs'); mkdirSync(dirname(checker), { recursive: true });
  writeFileSync(checker, `import{readFileSync}from'node:fs';import{createHash}from'node:crypto';const p=JSON.parse(readFileSync(process.env.PROJECT_GOVERNANCE_CHANGE_PACKET));const rows=p.records.filter(r=>r.after_file_type==='regular'&&r.after_path);const files=rows.map(r=>({path:r.path,sha256:createHash('sha256').update(readFileSync(r.after_path)).digest('hex')}));const source=rows.find(r=>r.path==='src/reconnect.ts');const passed=!!source&&readFileSync(source.after_path,'utf8').includes('reconnect = true');console.log(JSON.stringify({status:passed?'passed':'failed',findings:passed?[]:[{rule_id:'fixture.reconnect-proof',severity:'blocking',message:'Reconnect is not enabled in captured source'}],input_manifest:{version:1,status:'complete',files}}));\n`);
  save(join(workspace, 'config/validation/packs/fixture-progress.yaml'), { id: 'fixture-progress', enforcement: 'blocking', stages: ['batch'], path_globs: ['src/reconnect.ts', PLAN_PATH], change_packet_contract: 1, commands: [{ run: [process.execPath, checker] }] });
  const installedLauncher = join(workspace, '.governance/runtime/bin/project-governance');
  const batchCode = `const{spawnSync}=require('node:child_process'),{join}=require('node:path');const r=spawnSync(${JSON.stringify(installedLauncher)},['check','--stage','batch','--pack','fixture-progress','--base-ref','HEAD','--summary','--trigger','test','--json-output',join(process.env.PROJECT_GOVERNANCE_WORKFLOW_ARTIFACT_DIR,'batch-result.json')],{encoding:'utf8',timeout:30000});process.stdout.write(r.stdout??'');process.stderr.write(r.stderr??'');process.exitCode=r.status??2;`;
  save(join(workspace, 'config/governance/operations.json'), { version: 1, operations: { batch: {
    argv: [process.execPath, '-e', batchCode], cwd: workspace, env: { XDG_STATE_HOME: state }, effect: 'local' } } });
  const main = init(workspace, 'main'); git(workspace, 'add', '.'); git(workspace, '-c', 'core.hooksPath=/dev/null', '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'Freeze synthetic facts fixture');
  const database = join(workspace, '.git/harness/harness.db'), rows = [], hosts = [], installations = [main], tasks = {};
  const location = await import(pathToFileURL(join(staged.identity.root, 'dist/harness/src/store/location.js')).href);
  const loadedPlan = () => parseImplementationPlan(PLAN_PATH, readFileSync(join(workspace, PLAN_PATH), 'utf8'));
  const initialPlan = loadedPlan(), definitionDigest = planBytesDigest(normalizedPlanContent(initialPlan));
  const originals = { requiredGuidance: [requiredGuidance], definitionDigest, initialFileDigest: initialPlan.digest };
  let currentCheckpoint, failedAction, refusedAction, failedWorkflow, completedCheck, previousPacket;
  const newHost = async (item, env) => { const host = await nativeFixture({ ...item, environment: env, log: join(directory, `${hosts.length}-native.jsonl`) }); hosts.push({ host, item, env }); return host; };
  const factsOnly = (item, env) => {
    const localDatabase = location.defaultDbPath(item.workspace);
    const before = continuitySnapshot(localDatabase), result = invoke(item.workspace, item.launcher, ['task-facts', '--session', env.HARNESS_SESSION], 0, env), after = continuitySnapshot(localDatabase);
    assert.deepEqual(after, before, 'Facts-only reader mutated core task state'); return { result, before, after };
  };
  const hook = async (id, host, item, env, turn = id) => {
    const expected = definition.cases.find(row => row.id === id), task = tasks[expected.association];
    const frozenExpected = { expected, originals: { ...originals, requiredGuidance: item.requiredGuidance ?? originals.requiredGuidance, hostGuidance: item.hostGuidance,
      task, checkpoint: currentCheckpoint, failedAction, refusedAction, failedWorkflow, check: completedCheck } };
    save(join(directory, 'expectations', `${id}.json`), frozenExpected);
    const event = { session_id: env.HARNESS_SESSION, turn_id: turn, hook_event_name: 'UserPromptSubmit', cwd: item.workspace, prompt: expected.prompt };
    save(join(directory, 'events', `${id}.json`), event);
    const handler = item.hooks.UserPromptSubmit[0].hooks[0];
    const custody = workspaceCustodySnapshot(item.workspace, env);
    assert.equal(custody.files[item.hostGuidance.path], item.hostGuidance.digest, 'Installed host guidance changed before the prompt');
    const otherCustody = installations.filter(other => other !== item).map(other => ({ workspace: other.workspace, snapshot: workspaceCustodySnapshot(other.workspace, environment) }));
    const output = await host.run('/bin/sh', ['-c', handler.command], JSON.stringify(event), handler.timeout * 1000);
    assert.deepEqual(workspaceCustodySnapshot(item.workspace, env), custody, 'Prompt hook changed native workspace custody');
    for (const other of otherCustody) assert.deepEqual(workspaceCustodySnapshot(other.workspace, environment), other.snapshot, 'Prompt hook changed another worktree');
    save(join(directory, 'hooks', `${id}.json`), output);
    const assessed = assessConversationalFacts(expected, output, frozenExpected.originals), delivered = readDeliveredFacts(output);
    const entryId = /Native entry reference \(for --entry\): ([a-f0-9]{64})\./u.exec(delivered.text)?.[1]; assert.ok(entryId, 'Missing exact native entry identity');
    const contextRoot = join(state, 'project-governance/context', digest(realpathSync(item.workspace)).slice(7));
    const packetPath = join(contextRoot, 'prompt-packets', `${entryId}.json`), entryPath = join(contextRoot, 'prompt-entries', `${entryId}.json`);
    const packet = JSON.parse(readFileSync(packetPath, 'utf8')), entry = JSON.parse(readFileSync(entryPath, 'utf8'));
    let matureEvidence;
    if (expected.matureHistory) {
      const geometry = expected.actionCap ? definition.matureHistoryAtCap : definition.matureHistory;
      const selected = packet.route.optional?.entries.find(row => row.id === geometry.sourcePath);
      assert.ok(selected?.excerpt.includes(geometry.decisiveText), 'The installed selection lost the independently declared decisive original');
      assert.equal(selected.sourceDigest, hash(readFileSync(join(item.workspace, geometry.sourcePath))));
      assert.equal(packet.taskFacts.actions.length, geometry.actionCount, 'Original mature history was not retained');
      const factsOnlyPacket = { ...packet.route, optional: { ...packet.route.optional, entries: [] } };
      const alone = renderPromptContext(factsOnlyPacket, { state: 'unavailable', candidates: [], inspected: 0, omissions: [] }, entryId, '', packet.taskFacts);
      if (!expected.actionCap) assert.deepEqual(readDeliveredFacts({ hookSpecificOutput: { additionalContext: alone.text } }).facts, packet.taskFacts,
        'This history must fit without optional evidence; do not hide an inherently oversized snapshot');
      matureEvidence = { selectedPath: selected.id, sourceDigest: selected.sourceDigest, originalFactsDigest: digest(packet.taskFacts),
        originalActionCount: packet.taskFacts.actions.length, factsAloneBytes: Buffer.byteLength(alone.text), nativePacketLimitBytes: entry.packetLimitBytes };
      save(join(directory, expected.steeringAnchor ? `${id}-render-originals.json` : expected.actionCap ? 'mature-at-cap-render-originals.json' : 'mature-render-originals.json'), { ...matureEvidence, entryPath, packetPath, selected });
      assert.ok(entry.deliveredSources.includes(selected.id) && delivered.text.includes(JSON.stringify(selected.excerpt)),
        'Mature task history displaced the exact already-selected decisive original');
      if (expected.actionCap) {
        assert.equal(delivered.facts.unavailable_summary?.workflow_not_observed_actions, geometry.actionCount,
          'The compact facts must explicitly count the real workflow-unknown originals');
        assessMatureFactsGrowth(rows, entry.factsRendering.bytes);
      }
    }
    const nativeIdentity = assessNativeFactsIdentity({ entry, packet, output, workspace: item.workspace, session: env.HARNESS_SESSION, turn, prompt: expected.prompt, reduced: expected.matureHistory === true });
    let steeringEvidence;
    if (expected.steeringAnchor) {
      const anchorRow = rows.find(row => row.case === expected.steeringAnchor); assert.ok(anchorRow, 'Missing independently retained original native entry');
      const anchor = JSON.parse(readFileSync(anchorRow.entryPath, 'utf8'));
      assert.equal(hash(readFileSync(anchorRow.packetPath)), anchorRow.packetDigest, 'Steering replaced its original packet');
      const key = digest({ provider: anchor.provider, workspace: anchor.workspace, worktreeLocator: anchor.worktreeLocator, session: anchor.session, turn: anchor.turn }).slice(7);
      const marker = JSON.parse(readFileSync(join(contextRoot, 'prompt-preparations', digest(anchor.session).slice(7), `${key}.json`), 'utf8'));
      const predecessor = entry.predecessor.entryId === anchor.entryId ? marker : JSON.parse(readFileSync(join(contextRoot, 'prompt-preparations', digest(anchor.session).slice(7), `${key}-${entry.predecessor.entryId}.json`), 'utf8'));
      steeringEvidence = assessSteeringIdentity(entry, anchor, marker, predecessor);
      assert.equal(packet.route.execution.entryId, entryId); assert.equal(packet.route.execution.familyId, anchor.entryId);
      assert.notEqual(packet.taskFacts.checkpoint.checkpointId, JSON.parse(readFileSync(anchorRow.packetPath, 'utf8')).taskFacts.checkpoint.checkpointId,
        'Steering reused outdated status instead of the current task snapshot');
    }
    if (expected.replay) { assert.equal(entryId, previousPacket.entryId); assert.deepEqual(delivered.facts, previousPacket.facts, 'Same-turn replay must retain original captured facts'); }
    if (expected.mixed) { const receipt = JSON.parse(readFileSync(join(contextRoot, 'routes', `${entry.routeReceiptId}.json`), 'utf8'));
      assert.ok(receipt.metadata?.catalog?.candidates?.some(row => row.path === 'src/reconnect.ts') || receipt.optionalSources?.some(row => row.id === 'src/reconnect.ts'), 'Mixed request lost available reconnect source'); }
    if (expected.missingToken) {
      assert.equal(entry.coverage?.reason, 'missing-token', 'Missing token must be visible as local fallback');
      assert.equal(entry.coverage?.attempted, false); assert.equal(entry.assessedCount, 0);
      assert.ok(delivered.text.includes('Local fallback is shown'), 'Provider fallback was not labelled for the main model');
    }
    const row = { ...assessed, entryId, hookOutput: join(directory, 'hooks', `${id}.json`), entryPath, packetPath, packetDigest: hash(readFileSync(packetPath)),
      nativeIdentity, custody, otherCustody, factsOnly: factsOnly(item, env), ...(matureEvidence ? { matureEvidence, factsRenderingBytes: entry.factsRendering.bytes } : {}), ...(steeringEvidence ? { steeringEvidence } : {}) };
    rows.push(row); previousPacket = { entryId, facts: delivered.facts }; return row;
  };
  let failure;
  try {
    const native = await newHost(main, environment);
    await hook('unbound', native, main, environment);
    tasks.taskA = invoke(workspace, main.launcher, ['harness', 'task', 'create', '--outcome', definition.taskA.outcome, '--scope', workspace,
      '--acceptance', definition.taskA.acceptance, '--plan-path', PLAN_PATH, '--plan-batch', 'B1']).task;
    save(join(workspace, 'tools/progress.json'), { version: 1, expected_digest: loadedPlan().digest, batch: 'B1', updates: [{ id: 'B1.I', completed: true }] });
    invoke(workspace, main.launcher, ['implementation-plan', 'update', '--path', PLAN_PATH, '--request', 'tools/progress.json']);
    currentCheckpoint = invoke(workspace, main.launcher, ['harness', 'checkpoint', '--summary', definition.checkpointA.summary, '--next', definition.checkpointA.next]).checkpoint;
    for (const id of ['initial-bound', 'alternative-progress', 'unrelated-wording']) await hook(id, native, main, environment);
    writeFileSync(join(workspace, 'src/reconnect.ts'), 'export const reconnect = false; // reconnect proof remains incomplete\n');
    const ownerForCheck = new hostApi.Store(database), workflowOwner = new hostApi.WorkflowStore(database);
    let rawRecipe;
    try {
      const policy = hostApi.defaultPolicy(), req = { operation: 'check', scope: [workspace], destination: null, policyRevision: policy.revision, targets: [] };
      failedAction = hostApi.authorizeAction(ownerForCheck, hostApi.proposeAction(ownerForCheck, tasks.taskA.taskId, req), req, policy, workspace);
      assert.equal(failedAction.status, 'authorized');
      rawRecipe = { version: 1, id: 'original-reconnect-failure', workspace,
        inputs: [{ path: 'src/reconnect.ts', digest: hostApi.fileDigest(join(workspace, 'src/reconnect.ts')) }], resources: [],
        stages: [{ id: 'batch', operation: 'batch', deadlineMs: 40000 }], deadlineMs: 45000,
        policyRevision: policy.revision, claims: ['Retain the original failing reconnect proof; task declarations are not verification.'] };
      const recipe = hostApi.resolveWorkflowRecipe(rawRecipe);
      workflowOwner.authorizeWorkflow({ taskId: tasks.taskA.taskId, taskVersion: tasks.taskA.version, actionId: failedAction.actionId,
        authorityRef: 'host:synthetic-fixture', recipe, recipeDigest: hostApi.recipeDigest(recipe), operationId: 'original-reconnect-failure' });
    } finally { workflowOwner.close(); ownerForCheck.close(); }
    const recipePath = save(join(directory, 'failed-workflow-recipe.json'), rawRecipe);
    const submitted = invoke(workspace, main.launcher, ['workflow-submit', '--database', database, '--task', tasks.taskA.taskId,
      '--task-version', String(tasks.taskA.version), '--action', failedAction.actionId, '--recipe', recipePath,
      '--authority', 'host:synthetic-fixture', '--operation-id', 'original-reconnect-failure'], 2);
    failedWorkflow = observeFixtureFailure((args, expected) => invoke(workspace, main.launcher, args, expected), database, submitted.run.id);
    assert.equal(failedWorkflow.run.state, 'failed'); assert.equal(failedWorkflow.stages[0].result?.exitCode, 1);
    const originalCheck = JSON.parse(readFileSync(join(submitted.workerDirectory, 'commands', `${submitted.run.id}-0-artifacts/batch-result.json`), 'utf8'));
    assert.equal(originalCheck.status, 'failed');
    assert.equal(originalCheck.results[0].commands[0].findings[0].rule_id, 'fixture.reconnect-proof');
    save(join(directory, 'failed-workflow-originals.json'), { action: failedAction, workflow: failedWorkflow, originalCheck });
    const owner = new hostApi.Store(database); try { const policy = hostApi.defaultPolicy(), req = { operation: 'check', scope: [dirname(workspace)], destination: null, policyRevision: policy.revision, targets: [dirname(workspace)] };
      refusedAction = hostApi.authorizeAction(owner, hostApi.proposeAction(owner, tasks.taskA.taskId, req), req, policy, workspace); assert.equal(refusedAction.status, 'refused'); } finally { owner.close(); }
    currentCheckpoint = invoke(workspace, main.launcher, ['harness', 'checkpoint', '--summary', definition.checkpointLater.summary, '--next', definition.checkpointLater.next]).checkpoint;
    await hook('failed-check', native, main, environment);
    const oldCheckpoint = currentCheckpoint;
    currentCheckpoint = invoke(workspace, main.launcher, ['harness', 'checkpoint', '--summary', 'The failure is being repaired; no acceptance was recorded.', '--next', 'Repeat the focused check after correcting reconnect.']).checkpoint;
    const newest = currentCheckpoint; currentCheckpoint = oldCheckpoint;
    await hook('unchanged-turn-replay', native, main, environment, 'failed-check'); currentCheckpoint = newest;
    await hook('new-turn-checkpoint', native, main, environment); await hook('mixed-request', native, main, environment);
    writeFileSync(join(workspace, 'src/reconnect.ts'), 'export const reconnect = true;\n');
    completedCheck = invoke(workspace, main.launcher, ['check', '--stage', 'batch', '--pack', 'fixture-progress', '--base-ref', 'HEAD', '--summary', '--trigger', 'test', '--implementation-plan', PLAN_PATH, '--batch', 'B1']);
    await hook('bookkeeping-stable', native, main, environment);
    writeFileSync(join(workspace, PLAN_PATH), readFileSync(join(workspace, PLAN_PATH), 'utf8').replace('Current/next: implementation pending.', 'Current/next: focused proof passed; review remains pending.'));
    await hook('commentary-stable', native, main, environment);
    writeFileSync(join(workspace, PLAN_PATH), readFileSync(join(workspace, PLAN_PATH), 'utf8').replace('Preserve verification separately', 'Require updated requirements separately'));
    await hook('definition-drift', native, main, environment);
    tasks.taskB = invoke(workspace, main.launcher, ['harness', 'task', 'create', '--outcome', definition.taskB.outcome, '--scope', workspace, '--acceptance', definition.taskB.acceptance]).task; currentCheckpoint = null;
    await hook('explicit-task-switch', native, main, environment);
    for (const status of ['needs-input', 'accepted', 'cancelled']) {
      tasks.taskB = invoke(workspace, main.launcher, ['harness', 'task', 'revise', '--task', tasks.taskB.taskId, '--expected-version', String(tasks.taskB.version), '--status', status, '--authority-ref', 'host:synthetic-fixture']).task;
      await hook(status, native, main, environment);
    }
    const sibling = join(directory, 'sibling'); git(workspace, 'worktree', 'add', '-qb', 'fixture-sibling', sibling, 'HEAD');
    const siblingItem = init(sibling, 'sibling', true), siblingEnv = { ...environment, HARNESS_SESSION: 'synthetic-conversational-fork' }; installations.push(siblingItem);
    tasks.child = invoke(sibling, siblingItem.launcher, ['harness', 'task', 'fork', '--task', tasks.taskA.taskId], 0, siblingEnv).task;
    const siblingHost = await newHost(siblingItem, siblingEnv); currentCheckpoint = null;
    await hook('fork-isolation', siblingHost, siblingItem, siblingEnv);
    const unboundEnv = { ...siblingEnv, HARNESS_SESSION: session }, unboundHost = await newHost(siblingItem, unboundEnv);
    await hook('sibling-unbound', unboundHost, siblingItem, unboundEnv);
    invoke(workspace, main.launcher, ['harness', 'resume', '--task', tasks.taskA.taskId]);
    currentCheckpoint = newest; save(join(workspace, 'config/governance/profile.yaml'), profile('auto'));
    await hook('missing-token', native, main, environment);
    const greenfield = join(directory, 'greenfield'); mkdirSync(greenfield); git(greenfield, 'init', '-q');
    const greenfieldItem = init(greenfield, 'greenfield'), greenfieldEnv = { ...environment, HARNESS_SESSION: 'synthetic-greenfield-conversation' };
    // Stock configuration leaves host-loaded AGENTS outside required packet duplication.
    // Custody still verifies its exact installed bytes on every prompt.
    greenfieldItem.requiredGuidance = []; installations.push(greenfieldItem);
    const greenfieldHost = await newHost(greenfieldItem, greenfieldEnv); currentCheckpoint = null;
    await hook('greenfield-unbound', greenfieldHost, greenfieldItem, greenfieldEnv);
    tasks.greenfield = invoke(greenfield, greenfieldItem.launcher, ['harness', 'task', 'create', '--outcome', 'Create the first local project plan.',
      '--scope', greenfield, '--acceptance', 'The first plan has a declared next step.'], 0, greenfieldEnv).task;
    await hook('greenfield-first-task', greenfieldHost, greenfieldItem, greenfieldEnv);
    currentCheckpoint = invoke(greenfield, greenfieldItem.launcher, ['harness', 'checkpoint', '--summary', 'The first task is bound; no implementation is accepted.',
      '--next', 'Write the first implementation plan.'], 0, greenfieldEnv).checkpoint;
    await hook('greenfield-progress', greenfieldHost, greenfieldItem, greenfieldEnv);
    const matureProfile = profile(); matureProfile.context_router.routes[0].token_budget = {
      primary_context_tokens: 1500, active_plan_context_tokens: 500, expansion_context_tokens: 1500, total_context_tokens: 3500 };
    save(join(workspace, 'config/governance/profile.yaml'), matureProfile);
    const decisiveSource = 'export function reconnectCleanup() {\n  const decisive = ' + JSON.stringify(definition.matureHistory.decisiveText) + ';\n  const originals = [\n' +
      Array.from({ length: 64 }, (_, index) => `    "Reconnect original ${index}: retain the exact cleanup identity and current owner before returning",`).join('\n') +
      '\n  ];\n  return { decisive, originals };\n}\n';
    writeFileSync(join(workspace, definition.matureHistory.sourcePath), decisiveSource);
    for (const { taskKey, definitionKey, id, originalsPath } of [
      { taskKey: 'mature', definitionKey: 'matureHistory', id: 'mature-selected-evidence', originalsPath: 'mature-action-originals.json' },
      { taskKey: 'matureAtCap', definitionKey: 'matureHistoryAtCap', id: 'mature-at-cap-selected-evidence', originalsPath: 'mature-at-cap-action-originals.json' },
    ]) {
      tasks[taskKey] = invoke(workspace, main.launcher, ['harness', 'task', 'create', '--outcome', 'Repair reconnect cleanup from the original source after the owner responds.',
        '--scope', workspace, '--acceptance', 'The owner confirms the original reconnect cleanup proof.']).task;
      currentCheckpoint = invoke(workspace, main.launcher, ['harness', 'checkpoint', '--summary', 'A mature task is waiting for its cleanup owner; earlier authorization is not execution proof.',
        '--next', 'Inspect src/reconnect.ts and retain the exact cleanup condition.']).checkpoint;
      const matureOwner = new hostApi.Store(database);
      try {
        const policy = hostApi.defaultPolicy(), req = { operation: 'check', scope: [workspace], destination: null, policyRevision: policy.revision, targets: [] };
        const actions = Array.from({ length: definition[definitionKey].actionCount }, () => hostApi.authorizeAction(matureOwner,
          hostApi.proposeAction(matureOwner, tasks[taskKey].taskId, req), req, policy, workspace));
        assert.ok(actions.every(action => action.status === 'authorized'));
        save(join(directory, originalsPath), actions);
      } finally { matureOwner.close(); }
      tasks[taskKey] = invoke(workspace, main.launcher, ['harness', 'task', 'revise', '--task', tasks[taskKey].taskId, '--expected-version', String(tasks[taskKey].version),
        '--status', 'needs-input', '--authority-ref', 'host:synthetic-fixture']).task;
      await hook(id, native, main, environment);
    }
    const waitingCheckpoint = (summary, next) => {
      tasks.matureAtCap = invoke(workspace, main.launcher, ['harness', 'task', 'revise', '--task', tasks.matureAtCap.taskId,
        '--expected-version', String(tasks.matureAtCap.version), '--status', 'open', '--authority-ref', 'host:synthetic-fixture']).task;
      const checkpoint = invoke(workspace, main.launcher, ['harness', 'checkpoint', '--summary', summary, '--next', next]).checkpoint;
      tasks.matureAtCap = invoke(workspace, main.launcher, ['harness', 'task', 'revise', '--task', tasks.matureAtCap.taskId,
        '--expected-version', String(tasks.matureAtCap.version), '--status', 'needs-input', '--authority-ref', 'host:synthetic-fixture']).task;
      return checkpoint;
    };
    currentCheckpoint = waitingCheckpoint('The current operator input asks for settlement status before the reconnect correction.',
      'Retain settlement ownership and qualify only the affected reconnect correction.');
    writeFileSync(join(workspace, definition.matureHistoryAtCap.sourcePath), readFileSync(join(workspace, definition.matureHistoryAtCap.sourcePath), 'utf8') + '// Current steering preserves the settlement owner.\n');
    await hook('same-turn-steering', native, main, environment, 'mature-at-cap-selected-evidence');
    await hook('same-turn-steering-replay', native, main, environment, 'mature-at-cap-selected-evidence');
    currentCheckpoint = waitingCheckpoint('The operator returned to the earlier exact request after the settlement update.',
      'Use the current settlement facts and retain all original input receipts.');
    await hook('same-turn-earlier-prompt', native, main, environment, 'mature-at-cap-selected-evidence');
    await hook('same-turn-earlier-prompt-replay', native, main, environment, 'mature-at-cap-selected-evidence');
    assert.equal(existsSync(callsPath), false, 'Task facts dispatched external transport');
  } catch (error) { failure = error instanceof Error ? error.message : 'Unknown installed proof failure'; }
  finally {
    const cleanup = [];
    for (const { host, item, env } of hosts.reverse()) {
      let end = 'unconfirmed', error = null;
      try { const handler = item.hooks.SessionEnd[0].hooks[0]; await host.run('/bin/sh', ['-c', handler.command], JSON.stringify({ session_id: env.HARNESS_SESSION, hook_event_name: 'SessionEnd', cwd: item.workspace }), handler.timeout * 1000); end = 'completed'; } catch (e) { error = e.message; }
      const parent = await host.stop(); cleanup.push({ workspace: item.workspace, session: env.HARNESS_SESSION, sessionEnd: end, parent, error });
    }
    const generationsReadback = installations.map(item => {
      const generations = new RuntimeGenerations(item.registry); let current; try { current = generations.state(); } finally { generations.close(); }
      const inspection = inspectRuntimeGeneration(current.directory);
      return { workspace: item.workspace, readersRemaining: current.readers.length, generationUnchanged: digest(inspection) === digest(item.inspection) };
    });
    const owners = [];
    const collectOwners = root => {
      if (!existsSync(root)) return;
      for (const item of readdirSync(root, { withFileTypes: true })) {
        const path = join(root, item.name);
        if (item.isDirectory()) collectOwners(path);
        else if (['owner.json', 'guardian.json', 'run.json'].includes(item.name)) {
          const value = JSON.parse(readFileSync(path, 'utf8')), owner = item.name === 'run.json' ? value.owner : value;
          if (owner?.pid && owner.fingerprint) owners.push({ path, pid: owner.pid, fingerprint: owner.fingerprint });
        }
      }
    };
    collectOwners(state);
    const live = () => owners.some(owner => processLiveFingerprint(owner.pid) === owner.fingerprint), closeDeadline = Date.now() + 5000;
    while (live() && Date.now() < closeDeadline) await new Promise(resolve => setTimeout(resolve, 100));
    const workerCleanup = { confirmed: !live(), owners: owners.map(owner => ({ ...owner, live: processLiveFingerprint(owner.pid) === owner.fingerprint })) };
    const receipt = { cleanup, workerCleanup, generations: generationsReadback, externalCalls: existsSync(callsPath) ? readFileSync(callsPath, 'utf8').split('\n').filter(Boolean).length : 0 };
    save(join(directory, 'cleanup.json'), receipt);
    if (!workerCleanup.confirmed || generationsReadback.some(row => row.readersRemaining || !row.generationUnchanged) || receipt.externalCalls || cleanup.some(row => row.sessionEnd !== 'completed' || row.parent.status !== 'closed')) failure ??= 'Native cleanup or no-provider proof failed';
  }
  const report = { version: 1, status: !failure && rows.length === definition.cases.length ? 'passed' : 'failed', definitionDigest: definition.definitionDigest,
    definitionPath, runtime: staged.identity, finalStageInspection: staged.inspect(), rows, failure: failure ?? null,
    claims: { generatedNativeAdditionalContext: 'per-case', factsReaderMutation: 'logical-core-snapshot-per-case', syntheticHostOnly: true,
      nativeWorkspaceCustody: 'per-case-current-and-sibling', installationConditions: ['existing-repository', 'concurrent-linked-worktree', 'empty-greenfield'],
      hostConsumption: 'unknown', acceptedDevelopmentOutcome: 'unknown', savingsQualified: false, liveCalls: 0 } };
  const reportPath = save(join(directory, 'conversational-facts.json'), report); return { ...report, reportPath };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2), value = key => args.find(item => item.startsWith(`--${key}=`))?.slice(key.length + 3);
  assert.ok(args.every(arg => arg === '--freeze-only' || /^--(?:package|archive|archive-digest|output)=.+$/u.test(arg)), 'Unknown proof argument');
  assert.ok(value('output'), 'Supply --output=<external-proof-directory>');
  const result = await verifyConversationalFacts({ packageRoot: value('package') ?? process.cwd(), archive: value('archive'), archiveDigest: value('archive-digest'), output: value('output'), freezeOnly: args.includes('--freeze-only') });
  console.log(JSON.stringify({ status: result.status, reportPath: result.reportPath, rows: result.rows.length, failure: result.failure ?? null }));
  process.exitCode = ['passed', 'frozen'].includes(result.status) ? 0 : 1;
}
