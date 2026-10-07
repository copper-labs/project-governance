import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { inspectInstalledLintCase } from './verify-installed-lint.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');
const subject = 'sha256:' + 'a'.repeat(64);

function fixture(status = 'passed') {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'installed-lint-receipt-test-'))), run = join(root, 'run'), pack = join(run, 'pack'), evidence = join(pack, 'evidence');
  mkdirSync(join(evidence, 'candidate/src'), { recursive: true }); mkdirSync(join(pack, 'command-0'));
  const sourcePath = 'src/example.py', configPath = 'src/ruff.toml', sourceBytes = status === 'passed' ? 'value=1\n' : 'undefined_name\n', configBytes = '[lint]\nselect=["F82"]\n';
  const write = (path, value) => writeFileSync(path, JSON.stringify(value) + '\n');
  const snapshots = [[sourcePath, sourceBytes], [configPath, configBytes]].map(([path, bytes]) => {
    const snapshot = join(evidence, 'candidate', path); writeFileSync(snapshot, bytes); return { path, snapshot, sha256: hash(bytes), role: path === sourcePath ? 'source' : 'input' };
  });
  const input_manifest = { version: 1, status: 'complete', input_mode: 'staged', files: snapshots.map(({ path, sha256 }) => ({ path, sha256 })), tool: { backend: 'ruff', version: '0.15.14' } };
  const native_results = [{ argv: ['ruff', '--version'], exit_code: 0, stdout: 'ruff 0.15.14\n', stderr: '' }, { argv: ['ruff', 'check'], exit_code: status === 'passed' ? 0 : 1, stdout: '[]', stderr: '' }];
  native_results.forEach((value, index) => write(join(evidence, `lint-native-${index + 1}.json`), value));
  write(join(evidence, 'lint-inputs.json'), { version: 1, snapshots });
  const detail = { backend: 'ruff', backend_version: '0.15.14', input_mode: 'staged', subject_digest: subject, checked_count: 1, selected_count: 1, selected_paths: [sourcePath], native_results, input_manifest };
  write(join(evidence, 'lint-result.json'), detail); write(join(evidence, 'evidence-manifest.json'), { subject_digest: subject, claims: [{ artifact_digests: ['sha256:' + hash(readFileSync(join(evidence, 'lint-result.json')))] }] });
  const receipt = { requestDigest: 'fixture', cleanup: 'confirmed', state: 'succeeded' };
  write(join(pack, 'command-0/result.json'), receipt); write(join(pack, 'command-0/request.json'), { fixture: true }); write(join(run, 'run.json'), { scope: { subject_digest: subject } });
  const result = { kind: 'project-governance-check-run', status, run_id: 'fixture', run_directory: run, termination_reason: 'completed', plan: { selected_packs: ['lint-ruff-src'] }, results: [{ pack_id: 'lint-ruff-src', evidence_manifest: { status: 'valid' }, commands: [{ exit_code: 0, process_failure: false, integrity_failure: false, command_receipt: receipt, request_digest: 'fixture', input_manifest, lint_evidence: { path: join(evidence, 'lint-result.json') },
    findings: status === 'passed' ? [] : [{ rule_id: 'lint.ruff.F821', severity: 'blocking', path: sourcePath }] }] }] };
  const resultPath = join(run, 'result.json'); write(resultPath, result);
  const request = { resultPath, packId: 'lint-ruff-src', backend: 'ruff', expected: status, sourcePath, sourceBytes, configPath, configBytes };
  return { root, run, pack, evidence, resultPath, result, request, write, clean: () => rmSync(root, { recursive: true, force: true }) };
}
test('installed lint inspection keeps native and captured-input originals and distinguishes known lint rejection', () => {
  for (const status of ['passed', 'failed']) {
    const f = fixture(status);
    try {
      const bytes = readFileSync(f.resultPath), result = inspectInstalledLintCase(f.request);
      assert.equal(result.status, status); assert.equal(result.cleanup, 'confirmed'); assert.equal(result.native_results.length, 2);
      assert.equal(result.original_result.path, f.resultPath); assert.equal(result.input_manifest.path, join(f.evidence, 'lint-inputs.json'));
      assert.deepEqual(readFileSync(f.resultPath), bytes);
    } finally { f.clean(); }
  }
});
test('the same receipt inspector rejects seeded cleanup and captured-byte faults, then accepts correction', () => {
  const f = fixture();
  try {
    const command = f.result.results[0].commands[0]; command.command_receipt.cleanup = 'unknown'; f.write(f.resultPath, f.result);
    assert.throws(() => inspectInstalledLintCase(f.request), /unknown|confirmed/);
    command.command_receipt.cleanup = 'confirmed'; f.write(f.resultPath, f.result); assert.equal(inspectInstalledLintCase(f.request).status, 'passed');
    const snapshot = join(f.evidence, 'candidate', f.request.sourcePath); writeFileSync(snapshot, 'seeded hidden source change\n');
    assert.throws(() => inspectInstalledLintCase(f.request), /Expected|equal/);
    writeFileSync(snapshot, f.request.sourceBytes); assert.equal(inspectInstalledLintCase(f.request).status, 'passed');
  } finally { f.clean(); }
});
