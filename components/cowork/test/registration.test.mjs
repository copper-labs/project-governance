import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

test('malformed and nonprivate registrations are isolated without exposing their contents', t => {
  const home = mkdtempSync(join(tmpdir(), 'cowork registrations '));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const directory = join(home, 'Library/Application Support/Project Governance/cowork'); mkdirSync(directory, { recursive: true });
  const good = '11111111-1111-1111-1111-111111111111';
  const value = { version: 1, project_id: good, label: 'Fixture', workspace: '/fixture', node: '/node', coordinator: '/cli', registry: '/registry', directory: '/runtime', locator: 'fixture', runtime_version: '1', revision: 1, lock_digest: 'lock', tree_digest: 'tree' };
  writeFileSync(join(directory, good + '.json'), JSON.stringify(value), { mode: 0o600 });
  writeFileSync(join(directory, '22222222-2222-2222-2222-222222222222.json'), 'private broken content', { mode: 0o600 });
  writeFileSync(join(directory, '33333333-3333-3333-3333-333333333333.json'), JSON.stringify(value), { mode: 0o644 });
  const module = new URL('../src/transport.ts', import.meta.url).href;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `import {registrationInventory} from ${JSON.stringify(module)}; console.log(JSON.stringify(registrationInventory()));`], { env: { ...process.env, HOME: home }, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const inventory = JSON.parse(result.stdout);
  assert.equal(inventory.valid.length, 1); assert.equal(inventory.problems.length, 2);
  assert.equal(result.stdout.includes('private broken content'), false);
});
