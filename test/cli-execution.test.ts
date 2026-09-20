import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fixture } from './helpers.ts';
const cli = resolve('src/cli.ts');
test('CLI check run agrees with confirmed, refuted, unconfirmed and pending outcomes', () => {
    const f = fixture(), db = join(f.root, '.harness/harness.db');
    f.store.close();
    const executor = join(f.root, 'owner.mjs');
    writeFileSync(executor, `#!${process.execPath}
import fs from 'node:fs';import{createHash}from'node:crypto';const [op,id,...args]=process.argv.slice(2),root=process.env.HARNESS_AGENT_STATE;fs.mkdirSync(root,{recursive:true});const out=v=>console.log(JSON.stringify(v));
if(op==='batch'){fs.copyFileSync(args[0],root+'/request.json');out({job_id:'job-1',protocol_version:2});}
else if(op==='wait'){if(process.env.FIXTURE_RESULT==='wait-error'){out({error:'observer unavailable'});process.exit(1);}if(!args.includes('--until-terminal'))throw new Error('event wait is not completion wait');out({});}
else if(op==='status')out({job_id:'job-1',stage:'Awaiting project resource cleanup acknowledgment',elapsed_seconds:2});
else if(op==='cancel'){fs.writeFileSync(root+'/cancel','yes');out({job_id:'job-1'});}
else {const mode=process.env.FIXTURE_RESULT,r=JSON.parse(fs.readFileSync(root+'/request.json'));if(mode==='pending'||mode==='wait-error'){out({job_id:'job-1',ready:false,state:'running'});}else{const cancelled=fs.existsSync(root+'/cancel'),bad=mode==='invalid',fail=mode==='fail',timeout=mode==='timeout';const inputs={files:[],mode:'declared-roots',roots:r.inputs.roots};out({job_id:'job-1',protocol_version:1,ready:true,kind:'test-batch',workspace:r.workspace,state:cancelled?'cancelled':timeout?'timed_out':fail?'failed':'succeeded',cleanup_confirmed:true,assessment_allowed:!bad,input_binding:'declared-roots',input_fingerprint:createHash('sha256').update(JSON.stringify(inputs)).digest('hex'),input_validity:bad?'invalid-or-unverified':'declared-scope-only',cases:[{id:'check',outcome:fail||timeout?'failed':'passed',exit_code:fail?7:0,...(timeout?{reason:'deadline exceeded'}:{})}]});}}
`, { mode: 0o700 });
    for (const [mode, expected] of [['pass', 0], ['fail', 1], ['invalid', 2], ['pending', 3], ['timeout', 2], ['wait-error', 3]] as const) {
        const r = spawnSync(process.execPath, [cli, 'check', 'run', '--db', db, '--task', f.task.taskId, '--executor', executor, '--state-root', join(f.root, mode), '--authority-ref', 'fixture', '--wait', '2', '--', process.execPath, '-e', 'process.exit(0)'], { cwd: f.root, encoding: 'utf8', env: { ...process.env, FIXTURE_RESULT: mode } });
        const v = JSON.parse(r.stdout);
        assert.equal(r.status, expected, JSON.stringify(v));
        assert.equal(v.established, mode === 'pass' || mode === 'fail');
        if (mode === 'wait-error') {
            assert.match(v.waitError, /observer unavailable/);
            assert.ok(v.actionId && v.jobId);
        }
        if (mode === 'pending')
            assert.match(v.result.stage, /cleanup/);
    }
});
test('CLI cancellation delegates a running job and preserves its receipt', () => {
    const f = fixture(), db = join(f.root, '.harness/harness.db');
    f.store.close();
    const executor = join(f.root, 'cancel-owner.mjs');
    writeFileSync(executor, `#!${process.execPath}
import fs from 'node:fs';import{createHash}from'node:crypto';const[op,id,...args]=process.argv.slice(2),root=process.env.HARNESS_AGENT_STATE;fs.mkdirSync(root,{recursive:true});const out=v=>console.log(JSON.stringify(v));if(op==='batch'){fs.copyFileSync(args[0],root+'/request.json');out({job_id:'job-1',protocol_version:2});}else if(op==='cancel'){fs.writeFileSync(root+'/cancel','yes');out({job_id:'job-1'});}else if(op==='status')out({job_id:'job-1',stage:'running'});else if(!fs.existsSync(root+'/cancel'))out({job_id:'job-1',ready:false});else{const r=JSON.parse(fs.readFileSync(root+'/request.json'));out({job_id:'job-1',ready:true,protocol_version:1,kind:'test-batch',workspace:r.workspace,state:'cancelled',cleanup_confirmed:true,assessment_allowed:false,input_validity:'invalid-or-unverified',input_binding:'declared-roots',input_fingerprint:createHash('sha256').update(JSON.stringify({files:[],mode:'declared-roots',roots:r.inputs.roots})).digest('hex'),cases:[{id:'check',outcome:'not-run'}]});}
`, { mode: 0o700 });
    const invoke = (args: string[]) => { const r = spawnSync(process.execPath, [cli, '--db', db, ...args], { cwd: f.root, encoding: 'utf8' }); return { code: r.status, value: JSON.parse(r.stdout) }; };
    const r = invoke(['check', 'run', '--task', f.task.taskId, '--authority-ref', 'host', '--executor', executor, '--state-root', join(f.root, 'owner'), '--', process.execPath, '-e', 'process.exit(0)']);
    assert.equal(r.code, 3);
    const c = invoke(['check', 'cancel', '--action', r.value.actionId, '--authority-ref', 'host']);
    assert.equal(c.code, 0);
    assert.equal(c.value.action.status, 'cancelled');
    assert.equal(c.value.established, false);
});
