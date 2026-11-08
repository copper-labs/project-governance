/** Native API signoff adapter. Production input cannot supply identity or answer confirmation. */
import { readFileSync, realpathSync, statSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { userInfo } from 'node:os';
import { randomUUID, createHash } from 'node:crypto';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { loadHost, save, takeReceiptLock } from './workflow-host-binding.mjs';

const hash = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const exact = (value, keys) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length ||
      keys.some(key => !Object.hasOwn(value, key))) throw new Error('Invalid API signoff request fields');
};
const locatorFor = record => ({ kind: 'api-signoff-v1', id: record.id, repositoryId: record.repositoryId });
const adapterPath = fileURLToPath(import.meta.url);

/** Resolve the existing repository ledger and selected runtime, never a model-selected database. */
function identity(host, workspace) {
  workspace = realpathSync(workspace);
  const git = (...args) => execFileSync('/usr/bin/git', ['-C', workspace, ...args], { encoding: 'utf8', timeout: 5000 }).trim();
  if (git('rev-parse', '--show-toplevel') !== workspace) throw new Error('Exact worktree root required');
  const database = realpathSync(join(git('rev-parse', '--path-format=absolute', '--git-common-dir'), 'harness/harness.db'));
  const pin = join(workspace, 'config/governance/runtime.lock.yaml'), lock = read(pin);
  if (lock.package !== '@organta/project-governance' || lock.version !== host.version ||
      !readFileSync(join(workspace, '.governance/runtime/bin/project-governance'), 'utf8').includes(join(host.root, 'dist/engine/src/cli.js')))
    throw new Error('Selected runtime differs from worktree installation');
  return { workspace, database, packageVersion: host.version, packageDigest: host.api.fileDigest(join(host.root, 'package.json')),
    hostExportDigest: host.api.fileDigest(host.module), adapterDigest: hash(readFileSync(adapterPath)), lockDigest: host.api.fileDigest(pin) };
}

function subjectSnapshot(host, request) {
  const subject = host.api.apiSignoffSubject(request.subject);
  if (typeof request.reviewFile !== 'string' || !request.reviewFile.startsWith('/')) throw new Error('Absolute readable review file required');
  const path = realpathSync(request.reviewFile), stat = statSync(path);
  if (!stat.isFile() || stat.size < 1 || stat.size > 8000) throw new Error('API review must be a nonempty UTF-8 file of at most 8000 bytes');
  const bytes = readFileSync(path);
  if (bytes.length > 8000 || hash(bytes) !== subject.reviewDigest) throw new Error('API review artifact changed');
  const review = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (!review.trim() || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(review))
    throw new Error('API review contains unsupported control characters');
  return { subject, review, reviewFile: path };
}

function observation(snapshot) {
  const user = userInfo();
  return { kind: 'local-native-confirmation', eventId: randomUUID(), observedAt: new Date().toISOString(),
    uid: user.uid, username: user.username, executable: realpathSync(process.execPath), nodeVersion: process.version,
    ...Object.fromEntries(['packageVersion', 'packageDigest', 'hostExportDigest', 'adapterDigest', 'lockDigest'].map(key => [key, snapshot[key]])) };
}

/** The whole frozen review is visible; no --yes, stdin response or environment approval switch exists. */
async function nativeConfirmation(message) {
  if (process.platform !== 'darwin') throw new Error('API signoff confirmation is supported only on macOS');
  const script = 'on run argv\nset choice to display dialog (item 1 of argv) with title "API contract signoff" buttons {"Cancel", "Confirm API decision"} default button "Cancel" cancel button "Cancel" giving up after 300\nif gave up of choice then error "Confirmation timed out"\nreturn button returned of choice\nend run';
  try {
    const result = await promisify(execFile)('/usr/bin/osascript', ['-e', script, message], { timeout: 310000, maxBuffer: 16384 });
    return result.stdout.trim() === 'Confirm API decision';
  } catch { return false; }
}

function approvalMessage(snapshot, request) {
  const { subject, review } = snapshot;
  const message = `Approve this exact API contract?\nContract: ${subject.contractId}\nDigest: ${subject.contractDigest}\nCells:\n${subject.cells.map(c => `${c.product} / ${c.language} / ${c.platform}`).join('\n')}\nSections:\n${Object.entries(subject.sections).map(([id, d]) => `${id}: ${d}`).join('\n')}\nReview digest: ${subject.reviewDigest}\nSupersedes: ${request.supersedes ? `${request.supersedes.id} revision ${request.supersedes.revision}` : 'none'}\n\nExact review:\n${review}\n\nThis records API approval only. It does not approve a build, publication or native feature parity. Attribution is to this local OS execution context, not an authenticated chat user or independently identified clicker.`;
  if (message.length > 12000) throw new Error('API review exceeds native dialog size; use a smaller coherent contract');
  return message;
}

/** Shipped callers always use native confirmation; fixture transport belongs outside this module. */
export async function approveApiSignoff(host, workspace, request, receiptPath) {
  if (arguments.length !== 4) throw new Error('API approval does not accept a confirmation callback');
  request = structuredClone(request);
  exact(request, ['requestId', 'subject', 'reviewFile', 'supersedes']);
  const predecessor = host.api.apiSignoffPredecessor(request.supersedes);
  const initial = { ...identity(host, workspace), ...subjectSnapshot(host, request) };
  const message = approvalMessage(initial, { ...request, supersedes: predecessor });
  receiptPath = resolve(receiptPath);
  if (!statSync(dirname(receiptPath)).isDirectory()) throw new Error('Receipt parent must exist');
  const release = takeReceiptLock(receiptPath);
  let store;
  try {
    store = new host.api.ApiSignoffStore(initial.database, { readOnly: false });
    const replay = store.replay(request.requestId, initial.subject, predecessor);
    if (replay) {
      const locator = locatorFor(replay);
      if (existsSync(receiptPath) && host.api.digest(read(receiptPath)) !== host.api.digest(locator)) throw new Error('Receipt path contains different data');
      save(receiptPath, locator); return { status: 'approved', replayed: true, locator, revision: replay.revision };
    }
    if (existsSync(receiptPath)) throw new Error('Receipt path already exists without matching signoff');
    if (await nativeConfirmation(message) !== true) throw new Error('Operator did not approve API contract');
    const current = { ...identity(host, workspace), ...subjectSnapshot(host, request) };
    if (host.api.digest(initial) !== host.api.digest(current)) throw new Error('API review or runtime changed during confirmation');
    if (existsSync(receiptPath)) throw new Error('Receipt path appeared during confirmation');
    const record = store.recordConfirmation(request.requestId, initial.subject, observation(current), predecessor);
    const locator = locatorFor(record); save(receiptPath, locator);
    return { status: 'approved', replayed: false, locator, revision: record.revision };
  } finally { try { store?.close(); } finally { release(); } }
}

/** Ordinary SDK gates use only this read-only route, with no callback or prompt. */
export function verifyApiSignoff(host, workspace, request) {
  exact(request, ['locator', 'subject', 'reviewFile']);
  const initial = identity(host, workspace), snapshot = subjectSnapshot(host, request);
  const store = new host.api.ApiSignoffStore(initial.database);
  try {
    const record = store.verify(request.locator, snapshot.subject);
    return { status: 'approved', locator: locatorFor(record), revision: record.revision,
      subject: record.subject, hostObservation: record.host, verifiedAt: new Date().toISOString(),
      proof: 'local-host-execution-context; point-in-time ledger read; not authenticated chat or clicker identity' };
  } finally { store.close(); }
}

export async function revokeApiSignoff(host, workspace, request) {
  if (arguments.length !== 3) throw new Error('API revocation does not accept a confirmation callback');
  request = structuredClone(request);
  exact(request, ['locator', 'expectedRevision']);
  exact(request.locator, ['kind', 'id', 'repositoryId']);
  if (request.locator.kind !== 'api-signoff-v1' || !/^[a-zA-Z0-9-]{1,160}$/.test(request.locator.id) ||
      !Number.isSafeInteger(request.expectedRevision) || request.expectedRevision < 1) throw new Error('Invalid API revocation request');
  const initial = identity(host, workspace);
  if (await nativeConfirmation(`Revoke API signoff ${request.locator.id} revision ${request.expectedRevision}?\nRepository: ${initial.workspace}\nThis withdraws API approval only; it does not stop existing processes.`) !== true)
    throw new Error('Operator did not confirm API revocation');
  const current = identity(host, workspace);
  if (host.api.digest(current) !== host.api.digest(initial)) throw new Error('Runtime changed during revocation');
  const store = new host.api.ApiSignoffStore(initial.database, { readOnly: false });
  try {
    const record = store.revoke(request.locator, request.expectedRevision, observation(current));
    return { status: 'revoked', locator: locatorFor(record), revision: record.revision };
  } finally { store.close(); }
}

if (process.argv[1] && realpathSync(process.argv[1]) === adapterPath) {
  try {
    const args = process.argv.slice(2);
    if (args.length === 1 && args[0] === '--help') {
      console.log('api-signoff.mjs approve --workspace ROOT --request FILE --receipt FILE\napi-signoff.mjs verify|revoke --workspace ROOT --request FILE');
    } else {
      const [mode, w, workspace, r, file, receipt, receiptPath] = args;
      if (!['approve', 'verify', 'revoke'].includes(mode) || w !== '--workspace' || r !== '--request' ||
          args.length !== (mode === 'approve' ? 7 : 5) || mode === 'approve' && receipt !== '--receipt') throw new Error('Invalid API signoff command; use --help');
      const host = await loadHost(fileURLToPath(new URL('../../../../', import.meta.url)));
      const request = read(file);
      const result = mode === 'approve' ? await approveApiSignoff(host, workspace, request, receiptPath) :
        mode === 'verify' ? verifyApiSignoff(host, workspace, request) : await revokeApiSignoff(host, workspace, request);
      console.log(JSON.stringify(result));
    }
  } catch (error) { console.error(JSON.stringify({ status: 'refused', error: error.message })); process.exitCode = 1; }
}
