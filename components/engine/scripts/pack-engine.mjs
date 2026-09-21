import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, copyFileSync, constants, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';

// Bundle the canonical dependency graph without a second checked-in lock authority.
const root = fileURLToPath(new URL('../../../', import.meta.url));
const destination = process.argv[2] && resolve(process.argv[2]);
if (!destination || !statSync(destination).isDirectory()) throw new Error('An existing archive destination directory is required');
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const lockText = readFileSync(join(root, 'package-lock.json'), 'utf8');
const lock = JSON.parse(lockText), lockedRoot = lock.packages?.[''];
if (lock.lockfileVersion !== 3 || lock.name !== manifest.name || lock.version !== manifest.version ||
    !isDeepStrictEqual(lockedRoot?.dependencies, manifest.dependencies) || !isDeepStrictEqual(lockedRoot?.engines, manifest.engines) ||
    !isDeepStrictEqual(lockedRoot?.bin, manifest.bin)) throw new Error('Package metadata and canonical dependency lock differ');
const stage = mkdtempSync(join(tmpdir(), 'governance-package-'));
try {
  // Old wheel builds may share dist; ship only this product's compiled owners.
  mkdirSync(join(stage, 'dist'));
  for (const path of ['dist/engine', 'dist/harness', 'LICENSE', 'README.md']) cpSync(join(root, path), join(stage, path), { recursive: true, dereference: false });
  writeFileSync(join(stage, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
  writeFileSync(join(stage, 'package-lock.json'), lockText);
  execFileSync('npm', ['ci', '--offline', '--ignore-scripts', '--omit=dev', '--no-audit', '--no-fund'], {
    cwd: stage, encoding: 'utf8', timeout: 60000, maxBuffer: 1024 * 1024,
  });
  writeFileSync(join(stage, 'package.json'), JSON.stringify({ ...manifest, bundleDependencies: Object.keys(manifest.dependencies) }, null, 2) + '\n');
  const dependencyLock = 'dist/engine/assets/runtime-dependencies.lock.json';
  writeFileSync(join(stage, dependencyLock), lockText);
  const packed = JSON.parse(execFileSync('npm', ['pack', '--json', '--ignore-scripts'], {
    cwd: stage, encoding: 'utf8', timeout: 60000, maxBuffer: 4 * 1024 * 1024,
  }));
  const entry = Array.isArray(packed) ? packed[0] : Object.values(packed)[0];
  if (!entry?.filename || entry.filename.includes('/')) throw new Error(`Invalid archive metadata: ${JSON.stringify(packed)}`);
  const members = execFileSync('tar', ['-tzf', join(stage, entry.filename)], { encoding: 'utf8', timeout: 10000, maxBuffer: 4 * 1024 * 1024 }).split('\n');
  if (!members.includes(`package/${dependencyLock}`) || !Object.keys(manifest.dependencies).every(name => members.includes(`package/node_modules/${name}/package.json`))) throw new Error('Packed archive omitted pinned dependencies');
  const archive = join(destination, entry.filename);
  copyFileSync(join(stage, entry.filename), archive, constants.COPYFILE_EXCL);
  console.log(JSON.stringify({ archive, integrity: entry.integrity, name: entry.name, version: entry.version, dependencyLock, bundledDependencies: Object.keys(manifest.dependencies) }));
} finally { rmSync(stage, { recursive: true, force: true }); }
