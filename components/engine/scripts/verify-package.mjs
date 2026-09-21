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
  console.log(JSON.stringify({ version: manifest.version, installedCommand: 'passed', scope: 'offline installation and public help, not full semantic qualification' }));
} finally { rmSync(root, { recursive: true, force: true }); }
