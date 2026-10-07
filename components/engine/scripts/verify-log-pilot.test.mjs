import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LOG_PILOT_REQUIRED, logPilotTaskContext, verifyLogPilotOutput, verifyJevProviderIdentity, verifyJevProviderDecision, verifyLogProviderProjection } from './verify-log-pilot.mjs';
import { packLongLog, renderLogSelection } from '../src/decision-log-filter.ts';
import { decisionTaskContext } from '../src/decision-task-context.ts';
import { resolveDecisionScope } from '../src/decision-scope.ts';
import { readDecisionOutcome } from '../src/decision-outcome-reader.ts';

const hash = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const original = ['Start', ...Array.from({ length: 30 }, (_, index) => `DEBUG progress ${index} ${'.'.repeat(160)}`), ...LOG_PILOT_REQUIRED, 'End'].join('\n\n') + '\n';
const receipt = { state: 'failed', exitCode: 1, signal: null, cleanup: 'confirmed', reason: 'exit', log: '/synthetic-proof/original.log' };
test('installed-log fixture supplies complete task context for an explicitly bound check', t => {
  const workspace = realpathSync(mkdtempSync(join(tmpdir(), 'log-task-binding-'))); t.after(() => rmSync(workspace, { recursive: true, force: true }));
  const context = logPilotTaskContext(workspace);
  assert.deepEqual(decisionTaskContext(context, workspace), context);
  assert.deepEqual(resolveDecisionScope(workspace, { taskId: context.taskId, revision: context.revision }, context),
    { workspace, taskId: 'installed-long-log', taskRevision: '1' });
  assert.match(context.requirement, /failure, result and cleanup evidence/);
  assert.deepEqual(context.sourcePaths, ['tools/long-log-native.mjs']);
});
function capturedFixture() {
  const plan = packLongLog(original, { failed: true, cleanupUnknown: false, truncated: false, limitBytes: 16_000,
    pilot: { purpose: 'long-log-filtering', arm: 'deterministic' } });
  const text = renderLogSelection(original, plan.blocks, plan.deterministicIds), selected = new Set(plan.deterministicIds);
  return { delivered: true, source: { path: receipt.log, digest: hash(original), totalBytes: Buffer.byteLength(original), capturedBytes: Buffer.byteLength(original),
    windowTruncated: false, blocksTruncated: false, ranges: plan.blocks.map(block => ({ id: block.id, firstLine: block.firstLine, lastLine: block.lastLine,
      rangeDigest: block.rangeDigest, protected: block.protected })) }, retrieval: { path: receipt.log, digest: hash(original) },
    native: { state: receipt.state, exitCode: receipt.exitCode, signal: receipt.signal, cleanup: receipt.cleanup, reason: receipt.reason },
    selection: { text, bytes: Buffer.byteLength(text), blockIds: plan.deterministicIds }, omitted: plan.blocks.filter(block => !selected.has(block.id))
      .map(block => ({ id: block.id, firstLine: block.firstLine, lastLine: block.lastLine, rangeDigest: block.rangeDigest, coordinateTextDigest: hash(original), within: 'log' })) };
}

test('installed-log proof validation accepts complete exact source-backed presentation without claiming semantic benefit', () => {
  const proof = verifyLogPilotOutput(capturedFixture(), original, receipt);
  assert.equal(proof.state, 'failed'); assert.equal(proof.cleanup, 'confirmed'); assert.equal(proof.source_digest, hash(original));
  assert.ok(proof.selected_bytes < proof.original_bytes); assert.equal(proof.omitted_ranges.length, 30);
});

test('installed-log proof rejects seeded evidence loss, false range identity, changed status and outcome claims', () => {
  const corruptions = [
    value => { value.selection.text = value.selection.text.replace(LOG_PILOT_REQUIRED[0], ''); value.selection.bytes = Buffer.byteLength(value.selection.text); },
    value => { value.source.ranges.find(range => (original.match(/[^\n]*\n|[^\n]+$/gu) ?? []).slice(range.firstLine - 1, range.lastLine).join('').includes(LOG_PILOT_REQUIRED[0])).protected = false; },
    value => { value.source.ranges[0].rangeDigest = hash('unrelated bytes'); },
    value => { value.omitted[0].coordinateTextDigest = hash('different original'); },
    value => { value.selection.blockIds = []; },
    value => { value.native.state = 'succeeded'; },
    value => { value.source.windowTruncated = true; },
    value => { value.acceptedOutcome = 'accepted'; },
  ];
  for (const corrupt of corruptions) {
    const value = capturedFixture(); corrupt(value);
    assert.throws(() => verifyLogPilotOutput(value, original, receipt));
  }
});

test('installed legacy consumers qualify current v3 provider identity and reject historical or changed projections', () => {
  const provider = { id: 'jev', adapterVersion: 'jev-text-1', requestedModel: 'jev-1.13.0', returnedModel: 'jev-1.13.0',
    modelIdentity: 'exact-version', configurationDigest: hash('frozen configuration') };
  const retained = { version: 3, outcome: { version: 3, method: 'provider', provider, model: 'jev-1.13.0', consumerId: 'DL13',
    providerCalled: true, delivered: true, requestIdentity: hash('original request'), payloadDigest: hash('native payload'), usage: { inputTokens: 100, outputTokens: 10 } } };
  const current = readDecisionOutcome(retained);
  assert.deepEqual(verifyJevProviderDecision(current, 'DL13'), provider);
  assert.deepEqual(verifyJevProviderIdentity({ ...current.provider }), provider, 'Thin presentations preserve the same exact identity');
  const historical = readDecisionOutcome({ version: 2, configDigest: hash('old configuration'),
    outcome: { version: 2, method: 'jev', model: 'jev-1.13.0', usage: { inputTokens: 100, outputTokens: 10 } } });
  assert.throws(() => verifyJevProviderDecision(historical, 'DL13'));
  assert.throws(() => verifyJevProviderIdentity(historical.provider));
  for (const corrupt of [
    value => { value.method = 'jev'; }, value => { value.provider.id = 'openai'; }, value => { value.provider.adapterVersion = null; },
    value => { value.provider.returnedModel = 'jev-1.14.0'; }, value => { value.provider.configurationDigest = null; },
    value => { value.providerCalled = false; }, value => { value.delivered = false; }, value => { value.payloadDigest = hash('unrelated payload').slice(7); },
    value => { value.usage.inputTokens = null; },
  ]) { const value = structuredClone(current); corrupt(value); assert.throws(() => verifyJevProviderDecision(value, 'DL13')); }
});

test('actual compact output shape binds to its separate full receipt without inventing receipt fields', () => {
  // Captured synthetic installed originals; retain only each owner's assessed fields here.
  const captured = {
  "first": {
    "version": 3,
    "effect": "advise",
    "decision": {
      "consumerId": "DL13",
      "requestId": "d7b5f51c-23e8-482f-aa35-324231e5f68c",
      "receiptId": "18ce1e5fff54446ceddf77d9efbb5834",
      "provider": {
        "id": "jev",
        "adapterVersion": "jev-text-1",
        "requestedModel": "jev-1.13.0",
        "returnedModel": "jev-1.13.0",
        "modelIdentity": "exact-version",
        "configurationDigest": "sha256:d50f73f6f28fdb88e82f8d1bbbd5e2e60f72feb21c506a8e9fcf67ec1b5ac9b2"
      },
      "method": "provider",
      "reason": "answered",
      "delivered": true,
      "providerCalled": true,
      "model": "jev-1.13.0",
      "usage": {
        "inputTokens": 100,
        "outputTokens": 10
      },
      "latencyMs": 15.514917000000025,
      "budget": {
        "state": "reserved",
        "reservationId": "a1911c7bed9ee7293966eb914ee5ceba",
        "calls": 1,
        "bytes": 11498,
        "limits": {
          "maxCalls": 16,
          "maxRequestBytes": 131072
        }
      },
      "scopeState": "bound"
    }
  },
  "replay": {
    "version": 3,
    "effect": "advise",
    "decision": {
      "consumerId": "DL13",
      "requestId": "f3bf3ecd-d64e-4313-9ecb-3a7487606e3f",
      "receiptId": "18ce1e5fff54446ceddf77d9efbb5834",
      "provider": {
        "adapterVersion": "jev-text-1",
        "configurationDigest": "sha256:d50f73f6f28fdb88e82f8d1bbbd5e2e60f72feb21c506a8e9fcf67ec1b5ac9b2",
        "id": "jev",
        "modelIdentity": "exact-version",
        "requestedModel": "jev-1.13.0",
        "returnedModel": "jev-1.13.0"
      },
      "method": "provider",
      "reason": "repeated-observation",
      "delivered": true,
      "providerCalled": true,
      "model": "jev-1.13.0",
      "usage": {
        "inputTokens": 100,
        "outputTokens": 10
      },
      "latencyMs": 1.320333000000005,
      "budget": {
        "bytes": 11498,
        "calls": 1,
        "limits": {
          "maxCalls": 16,
          "maxRequestBytes": 131072
        },
        "reservationId": "a1911c7bed9ee7293966eb914ee5ceba",
        "state": "reserved"
      },
      "scopeState": "bound"
    }
  },
  "receipt": {
    "version": 3,
    "configDigest": "sha256:d50f73f6f28fdb88e82f8d1bbbd5e2e60f72feb21c506a8e9fcf67ec1b5ac9b2",
    "receiptId": "18ce1e5fff54446ceddf77d9efbb5834",
    "outcome": {
      "version": 3,
      "consumerId": "DL13",
      "requestId": "d7b5f51c-23e8-482f-aa35-324231e5f68c",
      "receiptId": null,
      "effect": "advise",
      "provider": {
        "adapterVersion": "jev-text-1",
        "configurationDigest": "sha256:d50f73f6f28fdb88e82f8d1bbbd5e2e60f72feb21c506a8e9fcf67ec1b5ac9b2",
        "id": "jev",
        "modelIdentity": "exact-version",
        "requestedModel": "jev-1.13.0",
        "returnedModel": "jev-1.13.0"
      },
      "method": "provider",
      "reason": "answered",
      "delivered": true,
      "providerCalled": true,
      "model": "jev-1.13.0",
      "usage": {
        "inputTokens": 100,
        "outputTokens": 10
      },
      "latencyMs": 15.514917000000025,
      "budget": {
        "bytes": 11498,
        "calls": 1,
        "limits": {
          "maxCalls": 16,
          "maxRequestBytes": 131072
        },
        "reservationId": "a1911c7bed9ee7293966eb914ee5ceba",
        "state": "reserved"
      },
      "scopeState": "bound",
      "requestIdentity": "sha256:cc799ba89268c3812de3dbdbe2302c55a12b252e0512495a149d69b01cf81371",
      "payloadDigest": "sha256:cc3a8216710b41e3bb42850772525802aec048a873ed87192b1e55599cb98228"
    }
  }
};
  const { first, replay, receipt } = captured, compact = first.decision, provider = receipt.outcome.provider;
  assert.equal(compact.version, undefined); assert.equal(compact.payloadDigest, undefined); assert.equal(compact.effect, undefined);
  assert.deepEqual(verifyLogProviderProjection(first, receipt), provider);
  assert.throws(() => verifyLogProviderProjection({ ...first, decision: { ...compact, requestId: 'different-request' } }, receipt));
  assert.throws(() => verifyLogProviderProjection({ ...first, decision: { ...compact, receiptId: 'b'.repeat(32) } }, receipt));
  assert.throws(() => verifyLogProviderProjection(first, { ...receipt, outcome: { ...receipt.outcome, usage: { inputTokens: null, outputTokens: null } } }));
  assert.throws(() => verifyLogProviderProjection(first, { ...receipt, version: 2 }));
  assert.deepEqual(verifyLogProviderProjection(replay, receipt, { replay: true }), provider);
  assert.throws(() => verifyLogProviderProjection(replay, receipt));
  assert.throws(() => verifyLogProviderProjection({ ...replay, decision: { ...replay.decision, budget: { state: 'reserved', calls: 2 } } }, receipt, { replay: true }));
  assert.throws(() => verifyLogProviderProjection({ ...replay, decision: { ...replay.decision, reason: 'answered' } }, receipt, { replay: true }));
});
