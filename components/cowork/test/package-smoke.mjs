import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
const child = spawn(process.execPath, [process.argv[2]], { stdio: ['pipe', 'pipe', 'pipe'] });
const pending = new Map(); let errors = '';
child.stderr.on('data', bytes => { errors = (errors + bytes).slice(-4000); });
const lines = createInterface({ input: child.stdout });
lines.on('line', line => { const response = JSON.parse(line); pending.get(response.id)?.(response); });
const call = (id, method, params) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`No MCP response: ${errors}`)), 10000);
  pending.set(id, value => { clearTimeout(timer); pending.delete(id); resolve(value); });
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
});
try {
  const initialized = await call(1, 'initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'governance-fixture', version: '1' } });
  assert.ok(initialized.result);
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  const listed = await call(2, 'tools/list', {});
  const expected = ['projects','task_start','task_resume','task_show','task_checkpoint','context','skill_read','file_read','file_apply','check_start','check_status','check_output','check_cancel','commit','commit_status'].map(name => `governance_${name}`).sort();
  assert.deepEqual(listed.result.tools.map(tool => tool.name).sort(), expected);
  assert.ok(listed.result.tools.find(tool => tool.name === 'governance_file_apply').inputSchema.required.includes('expected_version'));
  const rejected = await call(3, 'tools/call', { name: 'governance_file_apply', arguments: { argv: ['sh'] } });
  assert.ok(rejected.error || rejected.result?.isError);
  console.log(JSON.stringify({ initialized: true, tools: expected.length, malformed_mutation_rejected: true }));
} finally { child.kill('SIGTERM'); lines.close(); }
