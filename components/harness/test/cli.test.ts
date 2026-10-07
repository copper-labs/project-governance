import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fixture } from './helpers.ts';
const cli = resolve('src/cli.ts');
test('CLI resumes across processes, emits real contents and blocks missing mandatory context', () => {
    const f = fixture();
    const id = f.task.taskId;
    f.store.close();
    const run = (args: string[], input?: string) => { const r = spawnSync(process.execPath, [cli, ...args, '--db', join(f.root, '.harness/harness.db')], { cwd: f.root, encoding: 'utf8', input, env: { ...process.env, HARNESS_SESSION: 'fixture-session' } }); return { code: r.status, value: JSON.parse(r.stdout) }; };
    assert.equal(run(['resume', '--task', id]).code, 0);
    let r = run(['context', 'get', '--task', id, '--path', 'a.ts']);
    assert.equal(r.value.artifacts[0].inline, 'first\n');
    r = run(['context', 'get', '--task', id, '--path', 'a.ts', '--mandatory', 'missing']);
    assert.equal(r.code, 2);
    assert.equal(r.value.artifacts.length, 0);
    r = run(['host', 'hook'], JSON.stringify({ session_id: 'fixture-session', cwd: f.root }));
    assert.match(r.value.hookSpecificOutput.additionalContext, new RegExp(id));
    r = run(['check', 'run', '--task', id, '--wait', '31', '--authority-ref', 'test', '--', process.execPath, '-e', 'process.exit(0)']);
    assert.equal(r.code, 2);
    assert.match(r.value.error, /wait/);
    r = run(['usage', '--task', id]);
    assert.equal(r.value.usage.inputTokens, null);
});
test('large artifacts persist verified bytes and explicit identity cannot be overwritten', () => {
    const f = fixture();
    const text = 'a'.repeat(70000);
    const a = f.store.putArtifact({ kind: 'snapshot', subject: 'fixture', path: 'large', inline: text, bytes: text.length, provenance: 'observed' });
    assert.equal(a.inline, null);
    assert.equal(f.store.artifactContent(a.artifactId), text);
    assert.throws(() => f.store.putArtifact({ artifactId: a.artifactId, kind: 'snapshot', subject: 'fixture', path: 'other', inline: text, bytes: text.length, provenance: 'observed' }), /collision/);
    f.store.close();
});
test('v4 stores migrate without losing tasks and unknown schemas stay untouched', async () => {
    const { DatabaseSync } = await import('node:sqlite');
    const { SCHEMA } = await import('../src/store/schema.ts');
    const { Store } = await import('../src/store/store.ts');
    const f = fixture();
    f.store.close();
    const path = join(f.root, 'old.db');
    const db = new DatabaseSync(path);
    db.exec(SCHEMA);
    db.prepare("INSERT INTO meta VALUES('schema_version','4')").run();
    db.prepare("INSERT INTO task(task_id,version,outcome,status,created_at) VALUES('old',1,'legacy task','open','2026-09-19')").run();
    db.close();
    const migrated = new Store(path);
    assert.equal(migrated.readTask('old')!.outcome, 'legacy task');
    assert.equal(migrated.readTask('old')!.parentCheckpoint, null);
    migrated.close();
    const unknown = new DatabaseSync(path);
    unknown.prepare("UPDATE meta SET value='99' WHERE key='schema_version'").run();
    unknown.close();
    assert.throws(() => new Store(path), /unsupported schema/);
    const preserved = new DatabaseSync(path);
    assert.equal((preserved.prepare("SELECT value FROM meta WHERE key='schema_version'").get() as {
        value: string;
    }).value, '99');
    preserved.close();
});
test('CLI enforces read and record constraints, exposes attempts, and bounds event output', () => {
    const f = fixture(), db = join(f.root, '.harness/harness.db');
    f.store.reviseTask(f.task.taskId, [{ kind: 'constraint', body: 'deny:read', provenance: 'operator' }, { kind: 'constraint', body: 'deny:record', provenance: 'operator' }]);
    f.store.appendEvent(f.task.taskId, 'large', { payload: 'x'.repeat(100000) });
    f.store.close();
    const run = (args: string[]) => { const r = spawnSync(process.execPath, [cli, ...args, '--db', db, '--task', f.task.taskId, '--session', 'test'], { cwd: f.root, encoding: 'utf8' }); return { code: r.status, value: JSON.parse(r.stdout), text: r.stdout }; };
    assert.equal(run(['context', 'get', '--path', 'a.ts']).code, 2);
    assert.equal(run(['checkpoint', '--summary', 'denied']).code, 2);
    const r = run(['resume']);
    assert.ok(r.value.attempt.attemptId);
    assert.equal(r.value.workspace.withinTaskScope, true);
    assert.ok(run(['events']).text.length < 16000);
    const path = join(f.root, 'usage.json');
    writeFileSync(path, JSON.stringify({ kind: 'provider', source: 'fixture', measurementId: 'one', inputTokens: 5 }));
    assert.equal(run(['usage', 'record', '--file', path]).value.recorded, true);
});
test('schema5 migration adds item provenance without changing old history', async () => {
    const { DatabaseSync } = await import('node:sqlite');
    const { SCHEMA, V5 } = await import('../src/store/schema.ts');
    const { Store } = await import('../src/store/store.ts');
    const f = fixture();
    f.store.close();
    const path = join(f.root, 'v5.db');
    const db = new DatabaseSync(path);
    db.exec(SCHEMA);
    db.exec(V5);
    db.prepare("INSERT INTO meta VALUES('schema_version','5')").run();
    db.prepare("INSERT INTO task(task_id,version,outcome,status,created_at) VALUES('old',1,'retained','open','2026-09-19')").run();
    db.prepare("INSERT INTO task_item VALUES('old',1,0,'handoff','observed','legacy observation',0)").run();
    db.close();
    const s = new Store(path);
    assert.equal(s.readTask('old')!.items[0]!.origin, null);
    assert.equal(s.readTask('old')!.items[0]!.body, 'legacy observation');
    s.close();
});

test('CLI pairs plan flags and refuses standalone or unrelated operations before creating state', () => {
    const f = fixture(), db = join(f.root, 'uncreated.db');
    f.store.close();
    const run = (args: string[]) => {
        const result = spawnSync(process.execPath, [cli, ...args, '--db', db], { cwd: f.root, encoding: 'utf8' });
        return { code: result.status, value: JSON.parse(result.stdout) };
    };
    const path = 'docs/exec-plans/active/example.md';
    for (const flags of [['--plan-path', path], ['--plan-batch', 'F1'],
        ['--plan-path', path, '--plan-batch', 'F1', '--plan-batch', 'F2']]) {
        const result = run(['task', 'create', '--outcome', 'linked', ...flags]);
        assert.equal(result.code, 2); assert.match(result.value.error, /together exactly once/);
    }
    const missing = run(['task', 'create', '--outcome', 'linked', '--plan-path', path, '--plan-batch', 'F1']);
    assert.equal(missing.code, 2); assert.match(missing.value.error, /unified engine.*resolver/);
    const wrongOperation = run(['task', 'fork', '--plan-path', path, '--plan-batch', 'F1']);
    assert.equal(wrongOperation.code, 2); assert.match(wrongOperation.value.error, /only valid/);
    assert.equal(existsSync(db), false);
});

test('injected plan resolver supports create and explicit expected-version replacement', () => {
    const f = fixture(), db = join(f.root, '.harness/harness.db');
    f.store.close();
    const script = `import {continuityCommand} from ${JSON.stringify(pathToFileURL(cli).href)};
        process.exitCode=continuityCommand(JSON.parse(process.argv[1]),{resolvePlanReference(workspace,path,batch){
            if(workspace!==${JSON.stringify(f.root)})throw Error('wrong workspace');
            return {version:1,path,batch,definition_digest:'sha256:'+'a'.repeat(64)};}});`;
    const run = (args: string[]) => {
        const result = spawnSync(process.execPath, ['--input-type=module', '-e', script, JSON.stringify([...args, '--db', db, '--session', 'plan-session'])], { cwd: f.root, encoding: 'utf8' });
        return { code: result.status, value: JSON.parse(result.stdout) };
    };
    const flags = ['--plan-path', 'docs/exec-plans/active/example.md', '--plan-batch'];
    const created = run(['task', 'create', '--outcome', 'linked', ...flags, 'F1']);
    assert.equal(created.code, 0);
    const item = created.value.task.items.find((item: { kind: string }) => item.kind === 'plan-reference');
    assert.equal(JSON.parse(item.body).batch, 'F1');
    const id = created.value.task.taskId;
    const duplicate = run(['task', 'revise', '--task', id, '--expected-version', '1', ...flags, 'F2']);
    assert.equal(duplicate.code, 2); assert.match(duplicate.value.error, /one active plan reference/);
    const replacement = run(['task', 'revise', '--task', id, '--expected-version', '1', '--revoke', String(item.seq), '--authority-ref', 'host:change-batch', ...flags, 'F2']);
    assert.equal(replacement.code, 0);
    assert.equal(replacement.value.task.version, 2);
    assert.equal(replacement.value.task.items.filter((item: { kind: string; revoked: boolean }) => item.kind === 'plan-reference' && !item.revoked).length, 1);
    const stale = run(['task', 'revise', '--task', id, '--expected-version', '1', '--note', 'stale caller']);
    assert.equal(stale.code, 2); assert.match(stale.value.error, /expected revision 1, found 2/);
});

test('a resolver cannot substitute a different association or persist an invalid identity', () => {
    const f = fixture(), db = join(f.root, 'uncreated.db');
    f.store.close();
    for (const substitution of [{ path: 'docs/exec-plans/active/other.md', batch: 'F1', definition_digest: `sha256:${'a'.repeat(64)}` },
        { path: 'docs/exec-plans/active/example.md', batch: 'F1', definition_digest: 'unknown' }]) {
        const script = `import {continuityCommand} from ${JSON.stringify(pathToFileURL(cli).href)};
            process.exitCode=continuityCommand(JSON.parse(process.argv[1]),{resolvePlanReference(){return {version:1,...${JSON.stringify(substitution)}};}});`;
        const args = ['task', 'create', '--outcome', 'linked', '--plan-path', 'docs/exec-plans/active/example.md', '--plan-batch', 'F1', '--db', db];
        const result = spawnSync(process.execPath, ['--input-type=module', '-e', script, JSON.stringify(args)], { cwd: f.root, encoding: 'utf8' });
        assert.equal(result.status, 2); assert.equal(existsSync(db), false);
    }
});
