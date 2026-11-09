/** Fixture confirmations only; a real native human decision remains a separate acceptance gate. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import childProcess, { execFileSync, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import { syncBuiltinESMExports } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { loadHost } from './workflow-host-binding.mjs';
const root = process.env.GOVERNANCE_HOST_TEST_PACKAGE ?? fileURLToPath(new URL('../../../', import.meta.url));
const host = await loadHost(root);
const adapter = process.env.GOVERNANCE_HOST_TEST_PACKAGE ? join(root, 'dist/engine/assets/host/api-signoff.mjs') : fileURLToPath(new URL('./api-signoff.mjs', import.meta.url));
const { approveApiSignoff, verifyApiSignoff, revokeApiSignoff } = await import(pathToFileURL(adapter).href);
const generation = process.env.GOVERNANCE_HOST_TEST_GENERATION;
const generationApi = generation ? await import(pathToFileURL(join(root, 'dist/engine/src/runtime-generations.js')).href) : null;
const launcherApi = generation ? await import(pathToFileURL(join(root, 'dist/engine/src/runtime-launcher.js')).href) : null;
const nativeTest = (name, run) => test(name, { skip: process.platform !== 'darwin' }, run);

/** Test-only OS transport: production code receives no callback and no fixture switch is shipped. */
async function withFixtureDialog(confirm, operation, expected = '/usr/bin/swift') {
  const original = childProcess.execFile;
  const fake = () => { throw new Error('Fixture expects the promisified native transport'); };
  fake[promisify.custom] = async (file, args) => {
    assert.equal(file, expected);
    const message = file === '/usr/bin/swift' ? readFileSync(args[1], 'utf8') : args[2];
    const answer=await confirm(message);
    return { stdout: typeof answer === 'string' ? answer : answer === true ? 'Confirm API decision\n' : 'Cancel\n', stderr: '' };
  };
  childProcess.execFile = fake; syncBuiltinESMExports();
  try { return await operation(); }
  finally { childProcess.execFile = original; syncBuiltinESMExports(); }
}
const fixtureApproval = (host, workspace, request, receipt, confirm) =>
  withFixtureDialog(confirm, () => approveApiSignoff(host, workspace, request, receipt));
const fixtureRevocation = (host, workspace, request, confirm) =>
  withFixtureDialog(confirm, () => revokeApiSignoff(host, workspace, request), '/usr/bin/osascript');


function fixture() {
  const workspace = mkdtempSync(join(tmpdir(), 'api-signoff-host-'));
  execFileSync('/usr/bin/git', ['init', '-q', '-b', 'main', workspace]);
  for (const dir of ['config/governance', '.governance/runtime/bin', '.git/harness']) mkdirSync(join(workspace, dir), { recursive: true });
  writeFileSync(join(workspace, 'config/governance/runtime.lock.yaml'), JSON.stringify({ package: '@organta/project-governance', version: host.version }));
  writeFileSync(join(workspace, '.governance/runtime/bin/project-governance'), `#!/bin/sh\nexec '${process.execPath}' '${host.root}/dist/engine/src/cli.js' "$@"\n`);
  const database = join(workspace, '.git/harness/harness.db'), store = new host.api.Store(database); store.close();
  if (generation) {
    const registry = join(workspace, '.governance/generations.sqlite'), generations = new generationApi.RuntimeGenerations(registry);
    try { generations.activate(generation, 0); } finally { generations.close(); }
    const installation = JSON.parse(readFileSync(join(generation, 'installation.json'), 'utf8'));
    writeFileSync(join(workspace, 'config/governance/runtime.lock.yaml'), JSON.stringify(installation.lock));
    writeFileSync(join(workspace, '.governance/runtime/bin/project-governance'),
      launcherApi.runtimeLauncher(process.execPath, join(root, 'dist/engine/src/cli.js'), registry, workspace), { mode: 0o755 });
  }

  const reviewFile = join(workspace, 'review.txt'); writeFileSync(reviewFile, 'Sample API: operation fetch() returns a value. Explicit iOS support.\n');
  const subject = { version: 1, contractId: 'sample-api', contractDigest: host.api.digest('contract'),
    cells: [{ product: 'sample', language: 'typescript', platform: 'ios' }], sections: { methods: host.api.digest('methods') }, reviewDigest: host.api.fileDigest(reviewFile) };
  return { workspace, database, reviewFile, subject, request: { requestId: 'review-1', subject, reviewFile, supersedes: null }, receipt: join(workspace, 'receipt.json') };
}

nativeTest('fixture click binds exact review and host-observed provenance; normal verification and acknowledgement replay never prompt', async () => {
  const f = fixture(); let prompts = 0;
  const result = await fixtureApproval(host, f.workspace, f.request, f.receipt, async message => {
    prompts++; assert.ok(message.includes(readFileSync(f.reviewFile, 'utf8').trim())); assert.ok(message.includes(f.subject.contractDigest));
    assert.ok(message.includes('sample') && message.includes('typescript') && message.includes('ios')); return true;
  });
  const expected = { locator: result.locator, subject: f.subject, reviewFile: f.reviewFile };
  const verified = verifyApiSignoff(host, f.workspace, expected);
  assert.equal(verified.hostObservation.uid, process.getuid()); assert.equal(verified.hostObservation.packageVersion, host.version);
  assert.equal(verified.hostObservation.kind, 'local-page-confirmation'); assert.equal('messageId' in verified.hostObservation, false);
  unlinkSync(f.receipt);
  const replay = await fixtureApproval(host, f.workspace, f.request, f.receipt, async () => { throw new Error('must not prompt'); });
  assert.equal(replay.locator.id, result.locator.id); assert.equal(prompts, 1); assert.equal(replay.replayed, true);
  const request = join(f.workspace, 'verify.json'); writeFileSync(request, JSON.stringify(expected));
  const packaged = join(root, 'dist/engine/assets/host/api-signoff.mjs');
  const cli = spawnSync(process.execPath, [packaged, 'verify', '--workspace', f.workspace, '--request', request], { encoding: 'utf8', timeout: 10000 });
  assert.equal(cli.status, 0, cli.stderr); assert.equal(JSON.parse(cli.stdout).status, 'approved');
});

nativeTest('cancelled, malformed and changed-during-confirmation requests cannot create signoff', async () => {
  for (const mode of ['cancel', 'review', 'runtime', 'actor']) {
    const f = fixture(); let prompts = 0;
    const request = mode === 'actor' ? { ...f.request, operator: 'fake' } : f.request;
    await assert.rejects(fixtureApproval(host, f.workspace, request, f.receipt, async () => {
      prompts++;
      if (mode === 'review') writeFileSync(f.reviewFile, 'Changed review');
      if (mode === 'runtime') writeFileSync(join(f.workspace, 'config/governance/runtime.lock.yaml'), '{}');
      return mode !== 'cancel';
    }));
    assert.equal(existsSync(f.receipt), false); if (mode === 'actor') assert.equal(prompts, 0);
    const store = new host.api.ApiSignoffStore(f.database, { readOnly: false });
    try { assert.equal(store.replay('review-1', f.subject, null), null); } finally { store.close(); }
  }
});

nativeTest('edited receipt or review and wrong installation cannot authorize a gate', async () => {
  const f = fixture(), result = await fixtureApproval(host, f.workspace, f.request, f.receipt, async () => true);
  const request = { locator: { ...result.locator, id: 'fake' }, subject: f.subject, reviewFile: f.reviewFile };
  assert.throws(() => verifyApiSignoff(host, f.workspace, request), /not found/);
  writeFileSync(f.reviewFile, 'Edited content');
  assert.throws(() => verifyApiSignoff(host, f.workspace, { ...request, locator: result.locator }), /artifact changed/);
  writeFileSync(join(f.workspace, '.governance/runtime/bin/project-governance'), 'other installation');
  await assert.rejects(fixtureApproval(host, f.workspace, f.request, f.receipt, async () => { throw new Error('must not prompt'); }), /differs/);
});

test('CLI refuses incomplete and otherwise complete approval requests with --yes on every platform', () => {
  const f = fixture();
  const cli = spawnSync(process.execPath, [join(root, 'dist/engine/assets/host/api-signoff.mjs'), 'approve', '--yes'], { encoding: 'utf8', timeout: 10000 });
  assert.equal(cli.status, 1); assert.match(cli.stderr, /Invalid API signoff command/);
  const complete = join(f.workspace, 'approval-request.json'); writeFileSync(complete, JSON.stringify(f.request));
  const extra = spawnSync(process.execPath, [join(root, 'dist/engine/assets/host/api-signoff.mjs'), 'approve', '--workspace',
    f.workspace, '--request', complete, '--receipt', f.receipt + '.extra', '--yes'], { encoding: 'utf8', timeout: 10000 });
  assert.equal(extra.status, 1); assert.match(extra.stderr, /Invalid API signoff command/);
});

nativeTest('host supersession and revocation reject stale approval while retaining the old receipt', async () => {
  const f = fixture(), first = await fixtureApproval(host, f.workspace, f.request, f.receipt, async () => true);
  const changed = { ...f.subject, contractDigest: host.api.digest('new-contract') };
  const second = await fixtureApproval(host, f.workspace, { ...f.request, requestId: 'review-2', subject: changed,
    supersedes: { id: first.locator.id, revision: first.revision } }, f.receipt + '.next', async () => true);
  assert.throws(() => verifyApiSignoff(host, f.workspace, { locator: first.locator, subject: f.subject, reviewFile: f.reviewFile }), /superseded/);
  await assert.rejects(fixtureRevocation(host, f.workspace, { locator: second.locator, expectedRevision: 1 }, async () => false), /did not confirm/);
  assert.equal(verifyApiSignoff(host, f.workspace, { locator: second.locator, subject: changed, reviewFile: f.reviewFile }).status, 'approved');
  unlinkSync(f.reviewFile);
  await fixtureRevocation(host, f.workspace, { locator: second.locator, expectedRevision: 1 }, async () => true);
  const store = new host.api.ApiSignoffStore(f.database);
  try { assert.throws(() => store.verify(second.locator, changed), /revoked/); } finally { store.close(); }
  assert.equal(existsSync(f.receipt), true);
});

nativeTest('confirmation cannot retarget a frozen request or overwrite an occupied receipt', async () => {
  const f = fixture();
  const result = await fixtureApproval(host, f.workspace, f.request, f.receipt, async () => {
    f.request.requestId = 'changed-during-dialog'; return true;
  });
  const store = new host.api.ApiSignoffStore(f.database);
  try {
    assert.equal(store.replay('review-1', f.subject, null).id, result.locator.id);
    assert.equal(store.replay('changed-during-dialog', f.subject, null), null);
  } finally { store.close(); }
  const revocation = { locator: result.locator, expectedRevision: 1 };
  await fixtureRevocation(host, f.workspace, revocation, async () => { revocation.locator = { ...result.locator, id: 'different' }; return true; });
  const other = fixture();
  await assert.rejects(fixtureApproval(host, other.workspace, other.request, other.receipt, async () => {
    await assert.rejects(fixtureApproval(host, other.workspace, other.request, other.receipt, async () => true), /lock retained/);
    writeFileSync(other.receipt, 'concurrent writer'); return true;
  }), /appeared/);
  assert.equal(readFileSync(other.receipt, 'utf8'), 'concurrent writer');
  assert.equal(existsSync(other.receipt + '.lock'), false);
});

test('shipped approval rejects an injected confirmation callback before recording native provenance', async () => {
  const f = fixture();
  await assert.rejects(approveApiSignoff(host, f.workspace, f.request, f.receipt, async () => true), /does not accept a confirmation callback/);
  assert.equal(existsSync(f.receipt), false);
});

nativeTest('shipped revocation rejects an injected callback and leaves the approval current', async () => {
  const f = fixture();
  const approved = await fixtureApproval(host, f.workspace, f.request, f.receipt, async () => true);
  await assert.rejects(revokeApiSignoff(host, f.workspace, { locator: approved.locator, expectedRevision: 1 }, async () => true),
    /does not accept a confirmation callback/);
  assert.equal(verifyApiSignoff(host, f.workspace, { locator: approved.locator, subject: f.subject, reviewFile: f.reviewFile }).status, 'approved');
});

nativeTest('the normal packaged approval command reaches native transport without a shipped answer seam', async () => {
  const f = fixture(), requestFile = join(f.workspace, 'approve.json'), transportFile = join(f.workspace, 'native-transport.json');
  writeFileSync(requestFile, JSON.stringify(f.request));
  // This shim is generated only inside the synthetic test workspace. It is never packaged.
  const preload = join(f.workspace, 'fixture-native-transport.mjs');
  writeFileSync(preload, `import childProcess from 'node:child_process';
import {promisify} from 'node:util';
import {syncBuiltinESMExports} from 'node:module';
import {writeFileSync,readFileSync} from 'node:fs';
const fake=()=>{throw Error('Expected promisified transport')};
fake[promisify.custom]=async (file,args)=>{
  if(file!=='/usr/bin/swift'||!args[0].endsWith('api-review-window.swift')) throw Error('Unexpected native transport');
  writeFileSync(${JSON.stringify(transportFile)},JSON.stringify({kind:'synthetic-native-transport',file,completeReview:readFileSync(args[1],'utf8').includes('Sample API: operation fetch()')}));
  return {stdout:'Confirm API decision\\n',stderr:''};
};
childProcess.execFile=fake;syncBuiltinESMExports();
`);
  const packaged = join(root, 'dist/engine/assets/host/api-signoff.mjs');
  const result = spawnSync(process.execPath, ['--import', preload, packaged, 'approve', '--workspace', f.workspace,
    '--request', requestFile, '--receipt', f.receipt], { encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 0, result.stderr);
  const approved = JSON.parse(result.stdout), transported = JSON.parse(readFileSync(transportFile, 'utf8'));
  assert.equal(transported.kind, 'synthetic-native-transport'); assert.equal(transported.completeReview, true);
  const verified = verifyApiSignoff(host, f.workspace, { locator: approved.locator, subject: f.subject, reviewFile: f.reviewFile });
  assert.equal(verified.hostObservation.kind, 'local-page-confirmation');
  assert.equal(verified.hostObservation.adapterDigest, host.api.digest([packaged, join(root,'dist/engine/assets/host/api-review-page.mjs'), join(root,'dist/engine/assets/host/api-review-window.swift')].map(p=>host.api.fileDigest(p))));
  assert.equal(verified.hostObservation.packageVersion, host.version);
});

// Frozen old-writer rows keep compatibility independent from the restored writer's behavior.
test('packaged verification reads frozen preview records and rejects changed, missing, superseded and revoked decisions', () => {
  const f = fixture();
  const frozen = JSON.parse(readFileSync(new URL('../test/fixtures/api-signoff-preview3.json', import.meta.url), 'utf8'));
  const database = new DatabaseSync(f.database);
  database.prepare("UPDATE meta SET value=? WHERE key='repository_id'").run(frozen.repositoryId);
  for (const sql of frozen.schemas) database.exec(sql);
  for (const row of frozen.rows) database.prepare('INSERT INTO engine_api_signoff_v1 VALUES(?,?,?)').run(row.id, row.request_id, row.record);
  for (const row of frozen.heads) database.prepare('INSERT INTO engine_api_signoff_head_v1 VALUES(?,?)').run(row.contract_id, row.receipt_id);
  database.close();
  const requestFile = join(f.workspace, 'verification.json'), before = readFileSync(f.database);
  const verify = request => {
    writeFileSync(requestFile, JSON.stringify(request));
    return spawnSync(process.execPath, [join(root, 'dist/engine/assets/host/api-signoff.mjs'), 'verify',
      '--workspace', f.workspace, '--request', requestFile], { encoding: 'utf8', timeout: 10000 });
  };
  for (const row of frozen.rows) {
    const record = JSON.parse(row.record), locator = { kind: record.kind, id: record.id, repositoryId: record.repositoryId };
    const request = { locator, subject: record.subject, reviewFile: f.reviewFile }, result = verify(request);
    if (['active', 'successor'].includes(row.request_id)) {
      assert.equal(result.status, 0, result.stderr);
      const accepted = JSON.parse(result.stdout);
      assert.deepEqual(accepted.subject, record.subject); assert.deepEqual(accepted.hostObservation, record.host);
      assert.equal(accepted.revision, record.revision); assert.deepEqual(accepted.locator, locator);
      assert.equal(verify({ ...request, subject: { ...record.subject, contractDigest: host.api.digest('changed') } }).status, 1);
      assert.equal(verify({ ...request, locator: { ...locator, id: 'missing' } }).status, 1);
    } else {
      assert.equal(result.status, 1); assert.match(result.stderr, /revoked|superseded/);
    }
  }
  assert.deepEqual(readFileSync(f.database), before);
});

 nativeTest('full large review is displayed without truncation and page provenance remains distinct', async () => {
 const f=fixture(); const review='## Paired APIs\n'+('old → new declaration\n'.repeat(1500))+'END_OF_REVIEW';
 writeFileSync(f.reviewFile,review); f.subject.reviewDigest=host.api.fileDigest(f.reviewFile);
 const result=await fixtureApproval(host,f.workspace,f.request,f.receipt,async html=>{assert.ok(html.includes('END_OF_REVIEW'));return true;});
 assert.equal(verifyApiSignoff(host,f.workspace,{locator:result.locator,subject:f.subject,reviewFile:f.reviewFile}).hostObservation.kind,'local-page-confirmation');
 });

nativeTest('packaged Swift window typechecks on the actual host',()=>{
 execFileSync('/usr/bin/swiftc',['-typecheck',join(root,'dist/engine/assets/host/api-review-window.swift')],{timeout:60000,stdio:'pipe'});
});
nativeTest('transport faults are not attributed to a human cancellation',async()=>{
 const f=fixture();await assert.rejects(fixtureApproval(host,f.workspace,f.request,f.receipt,async()=>{throw Error('synthetic host failure');}),/Local review window failed/);
 assert.equal(existsSync(f.receipt),false);
});

nativeTest('only explicit Cancel is a cancellation; unknown output is a host fault',async()=>{
 for(const output of ['Load failed\n','', 'approved']) {
  const f=fixture();await assert.rejects(fixtureApproval(host,f.workspace,f.request,f.receipt,async()=>output),/Local review window failed/);assert.equal(existsSync(f.receipt),false);
 }
 const f=fixture();await assert.rejects(fixtureApproval(host,f.workspace,f.request,f.receipt,async()=>false),/Operator did not approve/);
});
