import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

// Exercise the shipped command outside the source checkout with only bundled dependencies.
const archive = resolve(process.argv[2] || '');
if (!archive.endsWith('.tgz')) throw new Error('Expected compiled package archive');
const root = mkdtempSync(join(tmpdir(), 'governance-release-proof-'));
try {
  execFileSync('npm', ['install', '--prefix', root, '--offline', '--ignore-scripts', '--no-audit', '--no-fund', archive], { stdio: 'pipe', timeout: 60000 });
  const pkg = join(root, 'node_modules/@organta/project-governance');
  const manifest = JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8'));
  if (manifest.name !== '@organta/project-governance' || !manifest.version.startsWith('3.')) throw new Error('Unexpected product identity');
  const output = execFileSync(process.execPath, [join(pkg, 'dist/engine/src/cli.js'), '--help'], { cwd: root, encoding: 'utf8', timeout: 10000 });
  if (!output.includes('workflow-wait') || !output.includes('context-packet')) throw new Error('Installed command surface missing');
  for (const [command, marker] of [['provider-help','provider-submit'], ['startup-help','startup']]) {
    const guide = execFileSync(process.execPath, [join(pkg, 'dist/engine/src/cli.js'), command], { cwd: root, encoding: 'utf8', timeout: 10000 });
    if (!guide.includes(marker)) throw new Error('Installed guide missing: ' + command);
  }
  const host = execFileSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import * as host from '@organta/project-governance/host/v1';
    assert.equal(host.HOST_API_VERSION, 1);
    for (const name of ['Store','proposeAction','authorizeAction','defaultPolicy','WorkflowStore','resolveWorkflowRecipe','recipeDigest','digest','fileDigest','ResourceRegistry','resourceRegistryPath']) assert.equal(typeof host[name], 'function', name);
    const store = new host.Store(':memory:');
    assert.ok(store.createTask('installed host API', []).taskId);
    store.close();
    console.log('passed');
  `], { cwd: root, encoding: 'utf8', timeout: 10000 });
  if (host.trim() !== 'passed') throw new Error('Installed host API missing');
  if (!readFileSync(join(pkg, manifest.exports['./host/v1'].types), 'utf8').includes('HOST_API_VERSION')) throw new Error('Host API declarations missing');
  console.log(JSON.stringify({ hostApi: 'passed', version: manifest.version, installedCommand: 'passed', scope: 'offline installation, public help and declared host API import, not full semantic qualification' }));
} finally { rmSync(root, { recursive: true, force: true }); }
