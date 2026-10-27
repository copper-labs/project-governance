/** Installed host binding entry: explicit project policy or native operator confirmation. */
import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, writeFileSync, realpathSync, existsSync, openSync, closeSync, fsyncSync, renameSync, unlinkSync, fstatSync, lstatSync } from 'node:fs';
import { join, dirname, relative, isAbsolute, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const read = path => JSON.parse(readFileSync(path, 'utf8'));
const git = (root, ...args) => execFileSync('/usr/bin/git', ['-C', root, ...args], { encoding: 'utf8', timeout: 5000 }).trim();
const inside = (root, path) => { const rel = relative(root, path); return rel === '' || (!rel.startsWith('../') && rel !== '..' && !isAbsolute(rel)); };

/** Use the declared installed export, not a private engine module or a copied implementation. */
export async function loadHost(packageDirectory) {
  const root = realpathSync(packageDirectory), manifest = read(join(root, 'package.json'));
  if (manifest.name !== '@organta/project-governance') throw new Error('Expected installed Governance package');
  const entry = manifest.exports?.['./host/v1']?.import;
  if (typeof entry !== 'string') throw new Error('Installed host/v1 export is unavailable');
  const module = realpathSync(resolve(root, entry));
  if (!inside(root, module)) throw new Error('Host export escapes selected package');
  const api = await import(pathToFileURL(module).href);
  if (api.HOST_API_VERSION !== 1) throw new Error('Unsupported host API');
  return { api, root, version: manifest.version, module };
}

/** Re-read task, Git, package pin and actual input bytes before granting or replaying a binding. */
export function inspectRequest(host, request) {
  const { api } = host, workspace = realpathSync(request.workspace);
  if (git(workspace, 'rev-parse', '--show-toplevel') !== workspace) throw new Error('Exact worktree root required');
  const common = git(workspace, 'rev-parse', '--path-format=absolute', '--git-common-dir');
  const database = realpathSync(join(common, 'harness/harness.db'));
  const pin = join(workspace, 'config/governance/runtime.lock.yaml');
  // Compiled installations write JSON, which is also valid YAML. Other lock encodings fail explicitly.
  const lock = read(pin);
  if (lock.package !== '@organta/project-governance' || lock.version !== host.version) throw new Error('Installed package differs from project pin');
  const launcher = join(workspace, '.governance/runtime/bin/project-governance');
  const launcherText = readFileSync(launcher, 'utf8');
  if (!launcherText.includes(join(host.root, 'dist/engine/src/cli.js'))) throw new Error('Package is not selected by this worktree launcher');
  const store = new api.Store(database, { readOnly: true });
  let task;
  try { task = store.readTask(request.taskId); } finally { store.close(); }
  if (!task || task.status !== 'open' || task.version !== request.taskVersion) throw new Error('Task is stale or closed');
  if (!request.sessionId || task.session !== request.sessionId || !task.worktree || realpathSync(task.worktree) !== workspace
      || task.branch !== git(workspace, 'branch', '--show-current')) throw new Error('Task session/worktree/branch mismatch');
  if (typeof request.operationId !== 'string' || !request.operationId.trim()) throw new Error('Stable operation ID required');
  const recipeFile = realpathSync(request.recipeFile), recipe = api.resolveWorkflowRecipe(read(recipeFile));
  if (recipe.workspace !== workspace) throw new Error('Recipe worktree mismatch');
  const policy = api.defaultPolicy();
  if (recipe.policyRevision !== policy.revision) throw new Error('Recipe policy differs from installed local-check policy');
  for (const input of recipe.inputs) {
    if (api.fileDigest(join(workspace, input.path)) !== input.digest) throw new Error(`Stale input: ${input.path}`);
  }
  const scopes = task.items.filter(item => item.kind === 'scope' && !item.revoked).map(item => { const path = resolve(workspace, item.body); return existsSync(path) ? realpathSync(path) : path; });
  if (!scopes.some(scope => inside(scope, workspace))) throw new Error('Workflow root exceeds task scope');
  return { workspace, database, taskId: task.taskId, taskVersion: task.version, sessionId: task.session,
    operationId: request.operationId, recipeFile, recipe, recipeDigest: api.recipeDigest(recipe), policy,
    identity: { gitDirectory: git(workspace, 'rev-parse', '--absolute-git-dir'), branch: task.branch,
      package: host.root, version: host.version, exportDigest: api.fileDigest(host.module),
      packageDigest: api.fileDigest(join(host.root, 'package.json')), lockDigest: api.fileDigest(pin), launcherDigest: api.fileDigest(launcher) } };
}

export function save(path, value) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  const fd = openSync(temporary, 'wx', 0o600);
  try { writeFileSync(fd, JSON.stringify(value, null, 2) + '\n'); fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(temporary, path);
}

/** Keep uncertain ownership closed; a dead PID alone cannot safely arbitrate racing lock reclaimers. */
export function takeReceiptLock(receiptPath) {
  const lockPath = receiptPath + '.lock'; let fd;
  try { fd = openSync(lockPath, 'wx', 0o600); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    let observation = 'owner unknown';
    try {
      const pid = Number(readFileSync(lockPath, 'utf8'));
      if (Number.isSafeInteger(pid) && pid > 1) {
        try { process.kill(pid, 0); observation = `recorded PID ${pid} exists (identity unverified)`; }
        catch (cause) { if (cause.code === 'ESRCH') observation = `recorded PID ${pid} is absent`; }
      }
    } catch { /* An unreadable or incomplete journal never authorizes taking ownership. */ }
    throw new Error(`EEXIST: approval receipt lock retained; ${observation}. Inspect the original owner and receipt journal before operator recovery. No lock was removed.`, {cause:error});
  }
  const identity = fstatSync(fd);
  try { writeFileSync(fd, String(process.pid)); fsyncSync(fd); } finally { closeSync(fd); }
  return () => {
    try { const current = lstatSync(lockPath); if (current.dev === identity.dev && current.ino === identity.ino) unlinkSync(lockPath); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  };
}

/** Trusted caller seam. Native confirmation and configured policy share exact action binding. */
export async function bindReviewedWorkflow(host, request, receiptPath, confirm, expectedAuthorityRef = null) {
  receiptPath = resolve(receiptPath);
  if (!existsSync(dirname(receiptPath))) throw new Error('Receipt parent must already exist');
  const release = takeReceiptLock(receiptPath);
  let store, workflows;
  try {
    const snapshot = inspectRequest(host, request), snapshotDigest = host.api.digest(snapshot);
    const prior = existsSync(receiptPath) ? read(receiptPath) : null;
    if (prior && prior.snapshotDigest !== snapshotDigest) throw new Error('Receipt belongs to changed workflow inputs or identity');
    if (prior?.binding && expectedAuthorityRef !== null && prior.binding.authorityRef !== expectedAuthorityRef)
      throw new Error('Receipt authority differs from the selected approval');
    if (prior?.binding) {
      workflows = new host.api.WorkflowStore(snapshot.database);
      try {
        // Readback only. A model-written receipt cannot create a previously missing binding.
        workflows.validateWorkflowBinding(prior.binding);
        if (host.api.digest({ ...prior.binding, actionId: '', authorityRef: '' }) !== host.api.digest({
          taskId: snapshot.taskId, taskVersion: snapshot.taskVersion, operationId: snapshot.operationId,
          recipe: snapshot.recipe, recipeDigest: snapshot.recipeDigest, actionId: '', authorityRef: '' })) throw new Error('Receipt binding mismatch');
        const replay = { ...prior, ...(prior.approvalRoute === 'task-policy' && !prior.boundAt ? { boundAt: new Date().toISOString() } : {}), status: 'bound', replayed: true };
        save(receiptPath, replay);
        return replay;
      } catch (error) {
        // A completed receipt must never silently become a new grant. Incomplete receipts require operator review again.
        if (prior.status === 'bound') throw error;
      }
    }
    if (prior && !prior.binding) throw new Error('Interrupted action creation requires reconciliation; refusing duplicate action');
    const accepted = await confirm(snapshot);
    if (accepted !== true && !(['operator-cycle', 'workspace-workflow', 'task-policy'].includes(accepted?.route) && typeof accepted.authorityRef === 'string')) throw new Error('Operator did not approve workflow');
    if (expectedAuthorityRef !== null && (accepted === true || accepted.authorityRef !== expectedAuthorityRef))
      throw new Error('Selected approval authority changed');
    if (prior?.binding && accepted !== true && prior.binding.authorityRef !== accepted.authorityRef)
      throw new Error('Pending receipt authority differs from the selected approval');
    if (host.api.digest(inspectRequest(host, request)) !== snapshotDigest) throw new Error('Workflow changed during operator review');
    store = new host.api.Store(snapshot.database);
    workflows ??= new host.api.WorkflowStore(snapshot.database);
    const authorityRef = prior?.binding.authorityRef ?? (accepted === true ? `operator-dialog:${randomUUID()}` : accepted.authorityRef);
    const provenance = { approvalRoute: accepted === true ? 'operator-dialog' : accepted.route,
      ...(accepted?.route === 'task-policy' ? { policyDigest: accepted.policyDigest } : {}) };
    const actionRequest = { operation: 'check', scope: [snapshot.workspace], targets: [snapshot.workspace], destination: null, policyRevision: snapshot.policy.revision };
    let binding = prior?.binding;
    if (!binding) {
      // Record an intent before creating an action. A crash here stops for reconciliation instead of minting another action.
      save(receiptPath, { status: 'creating-action', snapshotDigest, snapshot });
      store.atomic(() => {
        const current = store.readTask(snapshot.taskId);
        if (current?.version !== snapshot.taskVersion || current.status !== 'open') throw new Error('Task changed before action creation');
        const action = host.api.authorizeAction(store, host.api.proposeAction(store, snapshot.taskId, actionRequest), actionRequest, snapshot.policy, snapshot.workspace);
        if (action.status !== 'authorized') throw new Error(action.refusedReason ?? 'Action refused');
        binding = { taskId: snapshot.taskId, taskVersion: snapshot.taskVersion, actionId: action.actionId,
          authorityRef, operationId: snapshot.operationId, recipe: snapshot.recipe, recipeDigest: snapshot.recipeDigest };
        save(receiptPath, { status: 'binding-pending', snapshotDigest, snapshot, binding, ...provenance });
      });
    }
    if (host.api.digest(inspectRequest(host, request)) !== snapshotDigest) throw new Error('Workflow changed before binding');
    if (accepted !== true && host.api.digest(await confirm(snapshot)) !== host.api.digest(accepted)) throw new Error('Cycle authority changed before binding');
    workflows.authorizeWorkflow(binding);
    workflows.validateWorkflowBinding(binding);
    const receipt = { status: 'bound', snapshotDigest, snapshot, binding,
      ...(accepted?.route === 'task-policy' ? { boundAt: new Date().toISOString(), policyDigest: accepted.policyDigest } : { approvedAt: new Date().toISOString() }),
      approvalRoute: accepted === true ? 'operator-dialog' : accepted.route, replayed: false };
    save(receiptPath, receipt);
    return receipt;
  } finally {
    workflows?.close(); store?.close(); release();
  }
}

/** Reuse ordinary task/action bindings; policy selection never creates a reusable grant. */
export async function bindConfiguredWorkflow(host, request, receiptPath, confirm = confirmWithOperator) {
  if (host.api.workflowAuthorization === undefined && host.api.assertWorkflowAuthorization === undefined)
    return bindReviewedWorkflow(host, request, receiptPath, confirm);
  if (typeof host.api.workflowAuthorization !== 'function' || typeof host.api.assertWorkflowAuthorization !== 'function')
    throw new Error('Selected runtime does not support configured workflow authorization');
  const policy = host.api.workflowAuthorization(request.workspace);
  if (policy.mode === 'operator') return bindReviewedWorkflow(host, request, receiptPath, confirm);
  const snapshot = inspectRequest(host, request);
  host.api.assertWorkflowAuthorization(policy, snapshot.recipe);
  // The existing task is the provenance reference. No new authority prefix or execution format.
  const authorityRef = snapshot.taskId;
  return bindReviewedWorkflow(host, request, receiptPath, next => {
    const current = host.api.workflowAuthorization(next.workspace);
    if (current.digest !== policy.digest) throw new Error('Workflow authorization policy changed during binding');
    host.api.assertWorkflowAuthorization(current, next.recipe);
    return { route: 'task-policy', authorityRef, policyDigest: current.digest };
  }, authorityRef);
}

/** Public diagnostics contain fixed reasons, never source/JSON/YAML parser excerpts. */
export function workflowBindingRefusal(error) {
  const message = error instanceof Error ? error.message : '';
  const fixed = new Set([
    'Task is stale or closed', 'Task session/worktree/branch mismatch', 'Workflow root exceeds task scope',
    'Workflow resource is outside the configured task policy', 'Workflow credential is outside the configured task policy',
    'Workflow authorization policy changed during binding', 'Receipt authority differs from the selected approval',
    'Receipt belongs to changed workflow inputs or identity', 'Pending receipt authority differs from the selected approval',
    'Interrupted action creation requires reconciliation; refusing duplicate action', 'Task changed before action creation',
    'Workflow changed during operator review', 'Workflow changed before binding', 'Receipt binding mismatch',
    'Operator did not approve workflow', 'Exact worktree root required', 'Stable operation ID required',
    'Recipe worktree mismatch', 'Installed package differs from project pin', 'Package is not selected by this worktree launcher',
    'Recipe policy differs from installed local-check policy', 'Receipt parent must already exist',
    'Selected runtime does not support configured workflow authorization',
    'Workflow binding requires the current worktree root', 'Workflow binding must use the invoked runtime package',
    'Workflow binding requires a workspace path', 'Workflow binding requires --request and --receipt',
    'This operator entry is qualified only for macOS', 'Review exceeds native dialog size; reduce workflow scope',
    'Selected approval authority changed', 'Cycle authority changed before binding', 'Workflow profile must not use symlinks',
    'Expected installed Governance package', 'Installed host/v1 export is unavailable',
    'Host export escapes selected package', 'Unsupported host API',
    'Usage: workflow-host-binding.mjs --request REQUEST.json --receipt RECEIPT.json',
  ]);
  let reason = fixed.has(message) ? message : 'Workflow binding refused; inspect the local request, recipe and receipt. No workflow was dispatched.';
  if (error instanceof SyntaxError) reason = 'Invalid JSON in a local workflow input. Inspect the request, recipe, catalog, pin or receipt without changing existing authority.';
  else if (String(error?.code).startsWith('ERR_PARSE_ARGS_')) reason = 'Workflow binding requires --request and --receipt with valid paths and no extra flags.';
  else if (message.startsWith('EEXIST: approval receipt lock retained;')) reason = 'Approval receipt lock retained. Inspect the original owner and journal before recovery; no lock was removed.';
  else if (message.startsWith('Stale input:')) reason = 'Stale workflow input. Capture current input hashes for a fresh run; preserve the original receipt.';
  else if (/workflow authorization|workflow resource|Invalid credential environment references|Operator mode|project profile/iu.test(message)) reason = 'Invalid workflow authorization profile. Check mode, resources and credential_env; no policy was inferred.';
  else if (/structured constraint|exceeds the task|outside declared scope|explicit task and action scope/iu.test(message)) reason = 'Current task constraints or scope refuse this check. Preserve those restrictions.';
  else if (['ENOENT', 'EACCES', 'ELOOP'].includes(error?.code)) reason = 'Workflow input is missing, inaccessible or a forbidden symlink. Inspect the local paths and permissions.';
  // A specific fixed reason takes precedence over the broader malformed-profile category.
  return { status: 'refused', error: fixed.has(message) ? message : reason };
}

/** No stdin, environment switch or --yes flag can answer the operator's native dialog. */
export async function confirmWithOperator(snapshot) {
  if (process.platform !== 'darwin') throw new Error('This operator entry is qualified only for macOS');
  const commands = Object.entries(snapshot.recipe.operations).map(([id, op]) => `${id}: ${JSON.stringify(op, null, 2)}`).join('\n');
  const text = `Approve this exact local workflow?\n\n${snapshot.workspace}\nTask ${snapshot.taskId} v${snapshot.taskVersion}\nSession ${snapshot.sessionId}\nRuntime ${snapshot.identity.version}\nOperation ${snapshot.operationId}\n\n${commands}\n\nClaims: ${snapshot.recipe.claims.join(', ')}\nResources: ${snapshot.recipe.resources.join(', ') || 'none'}\nInput files: ${snapshot.recipe.inputs.length}\nDigest: ${snapshot.recipeDigest}\n\nThis records approval only. It does not start the workflow.`;
  if (text.length > 12000) throw new Error('Review exceeds native dialog size; reduce workflow scope');
  const script = 'on run argv\nset choice to display dialog (item 1 of argv) with title "Governance workflow approval" buttons {"Cancel", "Approve"} default button "Cancel" cancel button "Cancel" giving up after 300\nif gave up of choice then error "Approval timed out"\nreturn button returned of choice\nend run';
  try {
    const result = await promisify(execFile)('/usr/bin/osascript', ['-e', script, text], { timeout: 310000, maxBuffer: 16384 });
    return result.stdout.trim() === 'Approve';
  } catch { return false; }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 4 || args[0] !== '--request' || args[2] !== '--receipt') throw new Error('Usage: workflow-host-binding.mjs --request REQUEST.json --receipt RECEIPT.json');
    const request = read(args[1]), host = await loadHost(request.runtimePackage);
    const receipt = await bindConfiguredWorkflow(host, request, args[3]);
    console.log(JSON.stringify({ status: receipt.status, receipt: resolve(args[3]), actionId: receipt.binding.actionId,
      operationId: receipt.binding.operationId, authorityRef: receipt.binding.authorityRef, replayed: receipt.replayed }));
  } catch (error) { console.error(JSON.stringify(workflowBindingRefusal(error))); process.exitCode = 1; }
}
