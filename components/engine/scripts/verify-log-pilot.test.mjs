import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LOG_PILOT_REQUIRED, logPilotTaskContext, verifyLogPilotOutput } from './verify-log-pilot.mjs';
import { packLongLog, renderLogSelection } from '../src/decision-log-filter.ts';
import { decisionTaskContext } from '../src/decision-task-context.ts';
import { resolveDecisionScope } from '../src/decision-scope.ts';

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
