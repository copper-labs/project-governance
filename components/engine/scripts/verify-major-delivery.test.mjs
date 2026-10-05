import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deliveryChecker } from './verify-major-delivery.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');

test('the controlled delivery check retains its exact captured input closure and refuses source corruption', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'major-delivery-checker-'));
  try {
    const checker = join(temporary, 'checker.fixture'), journal = join(temporary, 'dispatches.jsonl'), packetPath = join(temporary, 'packet.json');
    mkdirSync(join(temporary, 'src')); writeFileSync(join(temporary, 'src/DeliveryOwner.kt'), 'class DeliveryOwner { val owner = "live-only" }\n');
    writeFileSync(checker, deliveryChecker(journal));
    const paths = ['src/DeliveryOwner.kt', 'tools/lint-delivery.fixture', 'config/governance/profile.yaml', 'config/validation/packs/lint-delivery.yaml', 'docs/specs/delivery.md'];
    const snapshots = paths.map((path, index) => {
      const bytes = Buffer.from(index === 0 ? 'class DeliveryOwner { val owner = "retained" }\n' : 'synthetic declared input\n'), snapshot = join(temporary, `${index}.source`);
      writeFileSync(snapshot, bytes); return { path, after_path: snapshot, after_sha256: hash(bytes), after_file_type: 'regular' };
    });
    const packet = { subject_digest: 'sha256:' + 'a'.repeat(64), records: snapshots };
    const run = value => {
      const bytes = JSON.stringify(value); writeFileSync(packetPath, bytes);
      const result = spawnSync(process.execPath, [checker], { cwd: temporary, encoding: 'utf8', timeout: 3000, env: { ...process.env,
        PROJECT_GOVERNANCE_CHANGE_PACKET: packetPath, PROJECT_GOVERNANCE_CHANGE_PACKET_SHA256: hash(bytes),
        PROJECT_GOVERNANCE_SUBJECT_DIGEST: packet.subject_digest, PROJECT_GOVERNANCE_RUN_ID: 'synthetic-run' } });
      assert.equal(result.error, undefined); assert.equal(result.signal, null);
      return { exit: result.status, output: JSON.parse(result.stdout) };
    };
    const success = run(packet); assert.equal(success.exit, 0); assert.equal(success.output.status, 'passed');
    assert.deepEqual(success.output.input_manifest.files, snapshots.map(record => ({ path: record.path, sha256: record.after_sha256 })));
    writeFileSync(snapshots[0].after_path, 'class DeliveryOwner { val owner = "corrupted" }\n');
    const corrupt = run(packet); assert.equal(corrupt.exit, 2); assert.equal(corrupt.output.status, 'failed');
    assert.match(corrupt.output.findings[0].message, /Snapshot changed/); assert.equal(corrupt.output.input_manifest, undefined);
    const changedPacket = structuredClone(packet); changedPacket.records[0].after_sha256 = hash(readFileSync(snapshots[0].after_path));
    const fault = run(changedPacket); assert.equal(fault.exit, 0); assert.equal(fault.output.status, 'failed');
    assert.equal(fault.output.findings[0].rule_id, 'fixture.delivery-owner'); assert.equal(fault.output.input_manifest.status, 'complete');
    const missing = run({ ...packet, records: snapshots.slice(1) }); assert.equal(missing.exit, 2);
    assert.match(missing.output.findings[0].message, /Captured input missing/);
    assert.equal(readFileSync(journal, 'utf8').trim().split('\n').length, 4);
  } finally { rmSync(temporary, { recursive: true, force: true }); }
});
