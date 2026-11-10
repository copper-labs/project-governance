import { build } from 'esbuild';
import { readFileSync, existsSync, readdirSync, cpSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const component = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repository = resolve(component, '../..');
const destination = resolve(process.argv[2] ?? join(component, 'dist'));
// Refuse stale staging contents: zip updates otherwise retain removed package files.
if (existsSync(destination) && readdirSync(destination).length !== 0) {
  throw new Error('Package destination must be empty; choose a fresh output directory.');
}
const version = JSON.parse(readFileSync(join(repository, 'package.json'), 'utf8')).version;
const bundle = join(destination, 'bundle'), plugin = join(destination, 'plugin');
mkdirSync(bundle, { recursive: true }); mkdirSync(join(plugin, '.claude-plugin'), { recursive: true });
await build({ entryPoints: [join(component, 'src/server.ts')], outfile: join(bundle, 'server.mjs'), bundle: true,
  define: { GOVERNANCE_PLUGIN_VERSION: JSON.stringify(version) },
  platform: 'node', target: 'node20', format: 'esm', packages: 'bundle',
  banner: { js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);' },
});
writeFileSync(join(bundle, 'manifest.json'), JSON.stringify({ manifest_version: '0.3', name: 'project-governance', version,
  description: 'Use registered native Governance projects from Cowork.', author: { name: 'Project Governance' },
  server: { type: 'node', entry_point: 'server.mjs', mcp_config: { command: 'node', args: ['${__dirname}/server.mjs'] } },
  compatibility: { platforms: ['darwin'], runtimes: { node: '>=20' } } }, null, 2));
copyFileSync(join(repository, 'LICENSE'), join(bundle, 'LICENSE'));
const licenses = ['@modelcontextprotocol/server', '@modelcontextprotocol/core', 'zod'].map(name => {
  const base = join(component, 'node_modules', name);
  return `## ${name}\n\n${readFileSync(join(base, 'LICENSE'), 'utf8')}\n`;
});
for (const name of ['ajv', 'fast-uri', 'fast-deep-equal', 'json-schema-traverse', 'require-from-string']) {
  const base = join(repository, 'node_modules', name);
  const license = ['LICENSE', 'LICENSE.md'].find(file => existsSync(join(base, file)));
  if (!license) throw new Error(`Missing bundled dependency license: ${name}`);
  licenses.push(`## ${name}\n\n${readFileSync(join(base, license), 'utf8')}\n`);
}
writeFileSync(join(bundle, 'THIRD-PARTY-NOTICES.md'), licenses.join('\n'));
writeFileSync(join(plugin, '.claude-plugin/plugin.json'), JSON.stringify({ name: 'project-governance', version,
  description: 'Governed development through the native Mac runtime.', author: { name: 'Project Governance' }, mcpServers: './governance.mcpb' }, null, 2));
execFileSync('/usr/bin/zip', ['-q', '-r', join(plugin, 'governance.mcpb'), '.'], { cwd: bundle });
cpSync(join(component, 'skills'), join(plugin, 'skills'), { recursive: true });
const archive = join(destination, `project-governance-cowork-${version}.zip`);
execFileSync('/usr/bin/zip', ['-q', '-r', archive, '.'], { cwd: plugin });
console.log(JSON.stringify({ archive, sha256: createHash('sha256').update(readFileSync(archive)).digest('hex') }));
