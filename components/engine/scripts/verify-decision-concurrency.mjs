import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Two public callers compete for the same last allowance; native checking still finishes. */
export async function verifyDecisionConcurrency({ repo, cli, preload, environment, common, callsPath, run, git }) {
  const path = join(repo, 'config/governance/profile.yaml'), original = readFileSync(path);
  const profile = JSON.parse(original);
  profile.continuity.decisions = { mode: 'auto', allowed_data_classes: ['source'], allowed_source_paths: ['**'],
    budget: { max_calls: 1, max_request_bytes: 131072 },
    consumers: { DL01: { mode: 'auto' }, DL02: { mode: 'auto' }, DL07: { mode: 'auto' } } };
  writeFileSync(path, JSON.stringify(profile));
  git('add', 'config/governance/profile.yaml'); git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'Capture concurrency policy');
  const args = common.map(value => value === 'pilot-task' ? 'concurrent-task' : value);
  const count = () => readFileSync(callsPath, 'utf8').trim().split('\n').filter(Boolean).length;
  const child = command => new Promise((resolve, reject) => {
    const worker = spawn(process.execPath, ['--import', preload, cli, command, ...args], { cwd: repo, env: environment, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => { worker.kill('SIGTERM'); reject(new Error('Concurrent caller deadline')); }, 30000);
    worker.stdout.on('data', chunk => { stdout += chunk; }); worker.stderr.on('data', chunk => { stderr += chunk; });
    worker.once('error', error => { clearTimeout(timer); reject(error); });
    worker.once('close', code => { clearTimeout(timer); try { assert.equal(code, 0, stderr || stdout); resolve(JSON.parse(stdout)); } catch (error) { reject(error); } });
  });
  try {
    const before = count();
    const results = await Promise.all([child('plan'), child('check')]);
    assert.equal(count() - before, 1, 'Only one caller can spend the last allowance');
    assert.match(JSON.stringify(results), /budget-(exhausted|unavailable)/, 'Losing caller must retain a no-call budget fallback');
    assert.equal(results[1].status, 'passed');
    run(['plan', ...args]); run(['check', ...args]);
    assert.equal(count() - before, 1, 'Restarted public observations cannot reset spending');
  } finally { writeFileSync(path, original); git('add', 'config/governance/profile.yaml'); git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'Restore observer policy'); }
}
