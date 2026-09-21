import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import { capabilityDescriptor, externalObservation, type ExternalCapabilityProbe, requireCapability, requireCapabilityAuthority } from '../src/capability-contract.ts';

const descriptor = () => capabilityDescriptor({ id: 'fixture-release', contractVersion: 1,
  engineMajor: 3, implementationDigest: 'sha256:' + 'a'.repeat(64), operations: ['deploy'] });
test('explicit capability identity refuses incompatible or ambiguous registrations', () => {
  assert.equal(descriptor().operations[0], 'deploy');
  for (const patch of [{ contractVersion: 2 }, { engineMajor: 4 }, { operations: ['deploy', 'deploy'] }, { implementationDigest: 'latest' }])
    assert.throws(() => capabilityDescriptor({ ...descriptor(), ...patch }));
});
test('lost external reply is observed by original identity and cancellation does not erase outstanding effects', async () => {
  let submissions = 0, cancellationRequested = false, pending = true;
  // Fake remote acceptance precedes reply loss. The core is not granted dispatch authority.
  const acceptThenLoseReply = () => { submissions++; throw new Error('lost reply'); };
  assert.throws(acceptThenLoseReply, /lost reply/);
  const provider: ExternalCapabilityProbe = { descriptor: descriptor(),
    observe: async operationId => ({ operationId, state: pending ? 'unknown' : 'cancelled', outstandingEffects: pending }),
    requestCancel: async operationId => { assert.equal(operationId, 'original-operation'); cancellationRequested = true; } };
  assert.equal(externalObservation(await provider.observe('original-operation'), 'original-operation').state, 'unknown');
  await provider.requestCancel('original-operation'); assert.equal(cancellationRequested, true);
  assert.equal(externalObservation(await provider.observe('original-operation'), 'original-operation').outstandingEffects, true);
  assert.throws(() => externalObservation({ operationId: 'original-operation', state: 'cancelled', outstandingEffects: true }, 'original-operation'));
  assert.throws(() => externalObservation(awaitableWrongIdentity(), 'original-operation'));
  pending = false;
  assert.equal(externalObservation(await provider.observe('original-operation'), 'original-operation').state, 'cancelled');
  assert.equal(submissions, 1);
});
function awaitableWrongIdentity() { return { operationId: 'other', state: 'succeeded', outstandingEffects: false }; }

test('missing, unsupported and ungranted capabilities cannot pass admission', () => {
  assert.throws(() => requireCapability(null, 'deploy'), /unavailable/);
  assert.throws(() => requireCapability(descriptor(), 'erase'), /Unsupported/);
  const grant = { authorityRef: 'operator:approved', implementationDigest: descriptor().implementationDigest, grantedOperations: ['deploy'] };
  assert.equal(requireCapabilityAuthority(descriptor(), 'deploy', grant.authorityRef, grant).id, 'fixture-release');
  assert.throws(() => requireCapabilityAuthority(descriptor(), 'deploy', grant.authorityRef, null), /authority/);
  assert.throws(() => requireCapabilityAuthority(descriptor(), 'deploy', 'other', grant), /authority/);
  assert.throws(() => requireCapabilityAuthority(descriptor(), 'deploy', grant.authorityRef, {...grant, grantedOperations: []}), /authority/);
  assert.throws(() => requireCapabilityAuthority(descriptor(), 'deploy', grant.authorityRef, {...grant, implementationDigest: 'sha256:' + 'b'.repeat(64)}), /authority/);
});

test('a fresh observer reads unresolved external evidence without the original provider instance', () => {
 const root = mkdtempSync(join(tmpdir(), 'external-observer-'));
 try {
  const path = join(root, 'observation.json');
  writeFileSync(path, JSON.stringify(externalObservation({operationId:'retained-operation',state:'unknown',outstandingEffects:true}, 'retained-operation')));
  const moduleUrl = new URL('../src/capability-contract.ts', import.meta.url).href;
  const code = `import {readFileSync} from 'node:fs'; import {externalObservation} from ${JSON.stringify(moduleUrl)}; console.log(JSON.stringify(externalObservation(JSON.parse(readFileSync(process.argv[1],'utf8')),'retained-operation')));`;
  const observed = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', code, path], {encoding:'utf8',timeout:10000}));
  assert.deepEqual(observed, {operationId:'retained-operation',state:'unknown',outstandingEffects:true});
 } finally { rmSync(root, {recursive:true,force:true}); }
});
