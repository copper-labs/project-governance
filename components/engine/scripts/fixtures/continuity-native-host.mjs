import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';

// A live, identifiable fixture parent exercises the same ancestor check as a native hook.
process.title = 'codex';
const [workspace, ownerModule] = process.argv.slice(2);
const probe = spawnSync(process.execPath, ['--input-type=module', '-e',
  `import {captureStartupHostOwner} from ${JSON.stringify(ownerModule)}; console.log(JSON.stringify(captureStartupHostOwner('codex')));`],
{ cwd: workspace, env: process.env, encoding: 'utf8', timeout: 5000 });
process.stdout.write(JSON.stringify({ ready: true, pid: process.pid, status: probe.status,
  captured: probe.status === 0 ? JSON.parse(probe.stdout) : null, stderr: probe.stderr }) + '\n');

for await (const line of createInterface({ input: process.stdin })) {
  const request = JSON.parse(line);
  if (request.stop) break;
  const started = performance.now(), timeoutMs = request.timeoutMs ?? 50000;
  const result = spawnSync(request.command, request.args, { cwd: workspace, env: process.env,
    input: request.input, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 2 * 1024 * 1024 });
  process.stdout.write(JSON.stringify({ status: result.status, stdout: result.stdout,
    stderr: result.stderr, signal: result.signal, error: result.error?.message,
    errorCode: result.error?.code, timedOut: result.error?.code === 'ETIMEDOUT',
    timeoutMs, elapsedMs: Math.round(performance.now() - started) }) + '\n');
}
