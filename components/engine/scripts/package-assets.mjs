import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
const source = new URL('../../../src/project_governance_runtime/', import.meta.url);
const destination = new URL('../../../dist/engine/assets/', import.meta.url);
// Generated packaging only: the authored assets retain one canonical source owner.
rmSync(destination, { recursive: true, force: true });
mkdirSync(destination, { recursive: true });
cpSync(new URL('./bootstrap-runtime.mjs', import.meta.url), new URL('bootstrap-runtime.mjs', destination));
for (const directory of ['defaults', 'packs']) cpSync(new URL(directory, source), new URL(directory, destination), { recursive: true, dereference: false });
cpSync(new URL('assets/skills/', source), new URL('skills/', destination), { recursive: true, dereference: false });
// Runtime-specific execution guidance must match the owner shipped in this package.
cpSync(new URL('../assets/test-execution.md', import.meta.url), new URL('skills/test-execution/SKILL.md', destination));
cpSync(new URL('../assets/install.md', import.meta.url), new URL('skills/install/SKILL.md', destination));
for (const name of ['harness-delegation', 'harness-agent-operation', 'test-batch-contract', 'startup-runtime-updates']) {
  cpSync(new URL(`../assets/${name}.md`, import.meta.url), new URL(`skills/resources/${name}.md`, destination));
}
const providerSkill = readFileSync(new URL('../assets/provider-skill.md', import.meta.url), 'utf8');
for (const provider of ['claude', 'codex', 'gemini']) {
  writeFileSync(new URL(`skills/harness-${provider}-agent/SKILL.md`, destination), providerSkill.replaceAll('{{provider}}', provider));
}

for (const name of ["compiled-provider-commands", "compiled-startup-updates"]) {
  cpSync(new URL(`../assets/${name}.md`, import.meta.url), new URL(`skills/resources/${name}.md`, destination));
}
