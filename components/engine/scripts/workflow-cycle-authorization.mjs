/** One operator-approved iteration envelope; exact runs still use the installed workflow authority. */
import { readFileSync, realpathSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { loadHost, inspectRequest, bindReviewedWorkflow, save, takeReceiptLock } from './workflow-host-binding.mjs';
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const inside = (root, path) => { const p = relative(root, path); return p === '' || (!p.startsWith('../') && p !== '..' && !isAbsolute(p)); };
const kind = 'operator-workflow-cycle-authorized';

function events(store, taskId) {
  const all = []; let after = 0;
  for (;;) {
    const page = store.events(taskId, after, 100); all.push(...page);
    if (page.length < 100) return all;
    after = page.at(-1).seq;
  }
}
async function locked(path, fn) {
  const release = takeReceiptLock(path);
  try { return await fn(); } finally { release(); }
}

/** Enrollment captures fixed commands, guards, resources and clocks, not mutable source-file hashes. */
function envelope(host, input, receiptPath, workspaceMode = false) {
  const s = inspectRequest(host, input.request), b = input.bounds;
  if (!input.enrollmentId || !b || !Number.isFinite(Date.parse(b.expiresAt)) || Date.parse(b.expiresAt) <= Date.now()
      || Date.parse(b.expiresAt) - Date.now() > 24 * 3600_000) throw new Error('A bounded, future cycle expiry is required');
  if (!Number.isSafeInteger(b.maxRunMs) || b.maxRunMs < 1 || !Number.isSafeInteger(b.maxStageMs) || b.maxStageMs < 1
      || !Array.isArray(b.inputRoots) || !b.inputRoots.length || !Array.isArray(b.immutableInputs) || !b.immutableInputs.length)
    throw new Error('Explicit paths, immutable guards and time limits are required');
  const roots = b.inputRoots.map(p => realpathSync(resolve(s.workspace, p)));
  if (roots.some(p => !inside(s.workspace, p))) throw new Error('Cycle input root escapes worktree');
  const immutableInputs = b.immutableInputs.map(p => {
    const absolute = realpathSync(resolve(s.workspace, p));
    if (!inside(s.workspace, absolute)) throw new Error('Cycle guard escapes worktree');
    return { path: relative(s.workspace, absolute), digest: host.api.fileDigest(absolute) };
  });
  const operations = s.recipe.operations;
  for (const [id, op] of Object.entries(operations)) {
    if (!workspaceMode && (!['read', 'local'].includes(op.effect) || /(?:^|\/)(?:ba|z|fi|da)?sh$/.test(op.argv[0])
        || op.argv.slice(1).some(arg => ['-c', '--eval', '-e', '-Command'].includes(arg)))) throw new Error('Unrestricted shell/eval is not a cycle operation');
    if (!Array.isArray(b.requiredResources?.[id]) || b.requiredResources[id].some(r => !s.recipe.resources.includes(r)))
      throw new Error('Declare each operation resource requirement');
  }
  const grant = { enrollmentId: input.enrollmentId, taskId: s.taskId, taskVersion: s.taskVersion, sessionId: s.sessionId,
    workspace: s.workspace, database: s.database, identity: s.identity, policyRevision: s.policy.revision,
    operations, resources: s.recipe.resources, inputRoots: roots, immutableInputs,
    requiredResources: b.requiredResources, maxRunMs: b.maxRunMs, maxStageMs: b.maxStageMs,
    expiresAt: b.expiresAt, receiptPath: resolve(receiptPath) };
  checkSnapshot(host, grant, s);
  return grant;
}

/** Check every successor against the recorded envelope; changed source bytes get a new exact binding. */
function checkSnapshot(host, grant, s) {
  for (const key of ['taskId', 'taskVersion', 'sessionId', 'workspace', 'database']) if (grant[key] !== s[key]) throw new Error('Cycle task/session/worktree changed');
  if (Date.parse(grant.expiresAt) <= Date.now()) throw new Error('Cycle expired');
  if (host.api.digest(grant.identity) !== host.api.digest(s.identity) || grant.policyRevision !== s.policy.revision) throw new Error('Cycle runtime identity changed');
  if (s.recipe.deadlineMs > grant.maxRunMs || s.recipe.stages.some(stage => stage.deadlineMs > grant.maxStageMs)) throw new Error('Cycle time limit exceeded');
  for (const [id, operation] of Object.entries(s.recipe.operations)) {
    if (!grant.operations[id] || host.api.digest(grant.operations[id]) !== host.api.digest(operation)) throw new Error('Operation is outside cycle');
    if (grant.requiredResources[id].some(resource => !s.recipe.resources.includes(resource))) throw new Error('Required cycle resource is absent');
  }
  if (s.recipe.resources.some(resource => !grant.resources.includes(resource))) throw new Error('Device/resource is outside cycle');
  for (const input of s.recipe.inputs) {
    const path = realpathSync(join(s.workspace, input.path));
    if (!grant.inputRoots.some(root => inside(root, path))) throw new Error('Input is outside cycle');
  }
  for (const input of grant.immutableInputs) {
    if (host.api.fileDigest(join(s.workspace, input.path)) !== input.digest
        || !s.recipe.inputs.some(row => row.path === input.path && row.digest === input.digest)) throw new Error('Cycle resource/custody guard changed or omitted');
  }
}

/** A receipt locates a durable host event. Editing the receipt cannot widen the ledger's grant. */
function readGrant(host, locator, request) {
  const s = inspectRequest(host, request), store = new host.api.Store(s.database, { readOnly: true });
  try {
    const rows = events(store, s.taskId).filter(e => e.kind === kind && e.eventId === locator.eventId);
    if (rows.length !== 1) throw new Error('No recorded operator cycle grant');
    const grant = rows[0].detail;
    checkSnapshot(host, grant, s);
    return { grant, eventId: rows[0].eventId };
  } finally { store.close(); }
}

/** Trusted confirmation seam; the production entry enrolls only through a visible native operator dialog. */
export async function enrollCycle(host, input, receiptPath, confirm) {
  receiptPath = resolve(receiptPath);
  return locked(receiptPath, async () => {
    const grant = envelope(host, input, receiptPath), store = new host.api.Store(grant.database);
    try {
      const previous = events(store, grant.taskId).filter(e => e.kind === kind && e.detail.enrollmentId === grant.enrollmentId);
      if (previous.length > 1) throw new Error('Ambiguous cycle enrollment');
      let event = previous[0];
      if (event && host.api.digest(event.detail) !== host.api.digest(grant)) throw new Error('Enrollment identity already has different bounds');
      if (!event) {
        if (await confirm(grant) !== true) throw new Error('Operator did not approve cycle');
        if (host.api.digest(envelope(host, input, receiptPath)) !== host.api.digest(grant)) throw new Error('Cycle changed during enrollment');
        event = store.atomic(() => {
          const existing = events(store, grant.taskId).find(e => e.kind === kind && e.detail.enrollmentId === grant.enrollmentId);
          if (existing) {
            if (host.api.digest(existing.detail) !== host.api.digest(grant)) throw new Error('Conflicting cycle enrollment');
            return existing;
          }
          return store.appendEvent(grant.taskId, kind, grant);
        });
      }
      const receipt = { status: 'enrolled', eventId: event.eventId, taskId: grant.taskId, bounds: grant };
      save(receiptPath, receipt); return receipt;
    } finally { store.close(); }
  });
}

/** No prompt on permitted iterations; the existing host binder still journals each exact action and recipe. */
export async function bindCycle(host, request, grantPath) {
  const locator = read(grantPath), first = readGrant(host, locator, request);
  return locked(first.grant.receiptPath, async () => {
    const current = readGrant(host, locator, request);
    const directory = current.grant.receiptPath + '.runs'; mkdirSync(directory, { recursive: true, mode: 0o700 });
    const receiptPath = join(directory, host.api.digest(request.operationId).replace('sha256:', '') + '.json');
    const receipt = await bindReviewedWorkflow(host, request, receiptPath, async () => {
      const fresh = readGrant(host, locator, request);
      return { route: 'operator-cycle', authorityRef: `operator-cycle:${fresh.eventId}` };
    }, `operator-cycle:${current.eventId}`);
    return { ...receipt, receiptPath, cycleEventId: current.eventId };
  });
}

/** Revocation advances the task revision, so even already-bound but undispatched runs are stale. */
export async function revokeCycle(host, request, grantPath) {
  const locator = read(grantPath), { grant, eventId } = readGrant(host, locator, request);
  return locked(grant.receiptPath, async () => {
    const store = new host.api.Store(grant.database);
    try {
      return store.atomic(() => {
        const task = store.reviseTask(grant.taskId, [{ kind: 'handoff', provenance: 'operator', body: 'Bounded workflow cycle revoked: ' + eventId }],
          { expectedVersion: grant.taskVersion, authorityRef: 'operator-cycle-revocation:' + eventId });
        store.appendEvent(grant.taskId, 'operator-workflow-cycle-revoked', { eventId, taskVersion: task.version });
        return { status: 'revoked', taskVersion: task.version };
      });
    } finally { store.close(); }
  });
}

/** Explicit workspace enrollment is a new review, never conversion of an existing cycle receipt. */
export async function enrollWorkspace(host, input, receiptPath, confirm) {
  if (!host.api.WorkflowStore.prototype.authorizeWorkflowGrant) throw new Error('Selected runtime does not support workspace workflow grants');
  receiptPath = resolve(receiptPath);
  return locked(receiptPath, async () => {
    const { taskId, taskVersion, ...grant } = envelope(host, input, receiptPath, true);
    host.api.validateWorkflowGrant(grant);
    const workflows = new host.api.WorkflowStore(grant.database);
    try {
      const id = host.api.digest({ workspace: grant.workspace, enrollmentId: grant.enrollmentId });
      const prior = workflows.readWorkflowGrant(id);
      if (prior && (prior.grantDigest !== host.api.digest(grant) || prior.revokedAt)) throw new Error('Workspace enrollment already differs or is revoked');
      if (!prior && await confirm({ ...grant, scope: 'workspace' }) !== true) throw new Error('Operator did not approve workspace workflow');
      const { taskId: currentTask, taskVersion: currentVersion, ...current } = envelope(host, input, receiptPath, true);
      if (currentTask !== taskId || currentVersion !== taskVersion || host.api.digest(current) !== host.api.digest(grant)) throw new Error('Workspace enrollment changed during review');
      const record = workflows.authorizeWorkflowGrant(grant, { taskId, taskVersion });
      const receipt = { status: 'enrolled', grantId: record.id, scope: 'workspace', bounds: record.grant };
      save(receiptPath, receipt); return receipt;
    } finally { workflows.close(); }
  });
}

function workspaceGrant(host, request, locator) {
  if (typeof locator.grantId !== 'string' || !locator.grantId) throw new Error('No matching workspace workflow grant');
  const snapshot = inspectRequest(host, request), workflows = new host.api.WorkflowStore(snapshot.database);
  try {
    const record = workflows.readWorkflowGrant(locator.grantId);
    if (!record || record.grant.workspace !== snapshot.workspace || record.grant.sessionId !== snapshot.sessionId) throw new Error('No matching workspace workflow grant');
    if (host.api.digest(record.grant.identity) !== host.api.digest(snapshot.identity)) throw new Error('Workspace workflow runtime identity changed');
    host.api.validateWorkflowGrantUse(record, snapshot.recipe, snapshot.sessionId);
    return record;
  } finally { workflows.close(); }
}

/** Reuse the reviewed workflow, but authorize a new action against the current task's own rules. */
export async function bindWorkspace(host, request, grantPath) {
  const locator = read(grantPath), record = workspaceGrant(host, request, locator);
  return locked(record.grant.receiptPath, async () => {
    const directory = join(record.grant.receiptPath + '.workspace-runs', host.api.digest(record.id).replace('sha256:', ''));
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const receiptPath = join(directory, host.api.digest(request.operationId).replace('sha256:', '') + '.json');
    const receipt = await bindReviewedWorkflow(host, request, receiptPath, async () => {
      const current = workspaceGrant(host, request, locator);
      return { route: 'workspace-workflow', authorityRef: `workspace-workflow:${current.id}` };
    }, `workspace-workflow:${record.id}`);
    if (receipt.binding.authorityRef !== `workspace-workflow:${record.id}`) throw new Error('Workspace receipt authority mismatch');
    return { ...receipt, receiptPath, grantId: record.id };
  });
}

/** The grant itself is revoked, including actions already bound in other tasks. */
export async function revokeWorkspace(host, request, grantPath) {
  const locator = read(grantPath), workspace = realpathSync(request.workspace);
  const git = (...args) => execFileSync('/usr/bin/git', ['-C', workspace, ...args], {encoding:'utf8',timeout:5000}).trim();
  if (git('rev-parse','--show-toplevel') !== workspace) throw new Error('Exact worktree root required');
  const database = realpathSync(join(git('rev-parse','--path-format=absolute','--git-common-dir'),'harness/harness.db'));
  if (typeof locator.grantId !== 'string' || !request.sessionId) throw new Error('Grant locator and host session required');
  const workflows = new host.api.WorkflowStore(database);
  try {
    const record = workflows.readWorkflowGrant(locator.grantId);
    if (!record || record.grant.workspace !== workspace || record.grant.sessionId !== request.sessionId || record.grant.database !== database)
      throw new Error('No matching workspace workflow grant');
    workflows.revokeWorkflowGrant(record.id, `operator-workspace-revocation:${record.id}`);
    return { status: 'revoked', grantId: record.id };
  } finally { workflows.close(); }
}

async function confirmCycle(grant) {
  if (process.platform !== 'darwin') throw new Error('Cycle enrollment is qualified only for macOS');
  const scope = grant.scope === 'workspace' ? 'Workspace workflow: reusable by current authorized tasks in this session. Every run gets a fresh task-bound action.' : `Task ${grant.taskId} v${grant.taskVersion}`;
  const message = `Authorize this bounded local build/fix/retest workflow?\n\n${grant.workspace}\n${scope}\nSession ${grant.sessionId}\nUntil ${grant.expiresAt}\n\nCommands:\n${Object.entries(grant.operations).map(([id, op]) => id + ': ' + JSON.stringify(op.argv)).join('\n')}\n\nResources: ${grant.resources.join(', ') || 'none'}\nMaximum run: ${grant.maxRunMs} ms; stage: ${grant.maxStageMs} ms\nFrozen guards: ${grant.immutableInputs.map(x => x.path).join(', ')}\n\nSource/test edits inside the named worktree may be rebuilt without another prompt. Commands, guards, resources, runtime and limits cannot change. No publish, push, release or unrestricted shell. Each run retains fresh exact inputs and results.`;
  if (message.length > 12000) throw new Error('Cycle review is too large');
  const script = 'on run argv\nset choice to display dialog (item 1 of argv) with title "Authorize bounded local workflow" buttons {"Cancel", "Authorize cycle"} default button "Cancel" cancel button "Cancel" giving up after 120\nif gave up of choice then error "Enrollment timed out"\nreturn button returned of choice\nend run';
  try { return (await promisify(execFile)('/usr/bin/osascript', ['-e', script, message], { timeout: 130000 })).stdout.trim() === 'Authorize cycle'; }
  catch { return false; }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [mode, flag, requestPath, outputFlag, path] = process.argv.slice(2);
    const enrolling = mode?.startsWith('enroll');
    if (!['enroll', 'bind', 'revoke', 'enroll-workspace', 'bind-workspace', 'revoke-workspace'].includes(mode) || flag !== '--request' || outputFlag !== (enrolling ? '--receipt' : '--grant') || !path || process.argv.length !== 7) throw new Error('Use enroll[-workspace] --request FILE --receipt FILE, or bind/revoke[-workspace] --request FILE --grant FILE');
    const input = read(requestPath), request = enrolling ? input.request : input, host = await loadHost(request.runtimePackage);
    const run = { enroll: () => enrollCycle(host, input, path, confirmCycle), bind: () => bindCycle(host, request, path), revoke: () => revokeCycle(host, request, path),
      'enroll-workspace': () => enrollWorkspace(host, input, path, confirmCycle), 'bind-workspace': () => bindWorkspace(host, request, path), 'revoke-workspace': () => revokeWorkspace(host, request, path) };
    const result = await run[mode]();
    console.log(JSON.stringify({ status: result.status, eventId: result.eventId ?? result.cycleEventId, grantId: result.grantId, receipt: result.receiptPath ?? resolve(path), actionId: result.binding?.actionId, authorityRef: result.binding?.authorityRef, taskVersion: result.taskVersion }));
  } catch (error) { console.error(JSON.stringify({ status: 'refused', error: error.message })); process.exitCode = 1; }
}
