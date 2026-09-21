import { digest } from "../src/core.ts";
import { requireLegacyMigrationOwnership } from "../src/legacy-migration-ownership.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync,realpathSync,mkdirSync,writeFileSync,rmSync,existsSync,readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync,spawnSync,spawn } from "node:child_process";
import { once } from "node:events";
import { legacyMigrationInvocation } from "../src/legacy-migration-launch.ts";

test("legacy migration rechecks selected identity under the OS lock before executing Node",async()=>{
  const root=realpathSync(mkdtempSync(join(tmpdir(),"legacy-migration-")));
  try {
    mkdirSync(join(root,".governance"));mkdirSync(join(root,"config/governance"),{recursive:true});
    execFileSync("python3",["-m","venv","--without-pip",join(root,".governance/runtime")],{timeout:15000,stdio:"pipe"});
    const lock=join(root,"config/governance/runtime.lock.yaml"), runtimeLock=join(root,".governance/runtime-use.lock");
    const identity={schema_version:1,package:"project-governance-runtime",version:"2.8.2",wheel:"runtime.whl",sha256:"a".repeat(64),source_commit:"b".repeat(40),python:">=3.9",configuration_schema:2,release_base_url:"https://example.invalid/releases"};
    writeFileSync(lock,JSON.stringify(identity));writeFileSync(runtimeLock,"");
    const script=join(root,"migration.cjs"), marker=join(root,"executed");
    writeFileSync(script,`const fs=require('node:fs');
const {spawnSync}=require('node:child_process');
const fd=Number(process.env.GOVERNANCE_LEGACY_LOCK_FD);
if(!Number.isInteger(fd)||fd<3||!fs.fstatSync(fd).isFile())process.exit(9);
const held=fs.fstatSync(fd), current=fs.statSync('.governance/runtime-use.lock');
if(held.dev!==current.dev||held.ino!==current.ino)process.exit(10);
// Both ordinary readers and another migrator must remain excluded after exec into Node.
for(const mode of ['LOCK_SH','LOCK_EX']) {
 const probe=spawnSync('python3',['-c',
  'import os,fcntl,sys; fd=os.open(sys.argv[1],os.O_RDWR); fcntl.flock(fd,getattr(fcntl,sys.argv[2])|fcntl.LOCK_NB)',
  '.governance/runtime-use.lock',mode],{encoding:'utf8',timeout:5000});
 if(probe.status===0||!probe.stderr?.includes('BlockingIOError'))process.exit(11);
}
import(${JSON.stringify(new URL("../src/legacy-migration-ownership.ts",import.meta.url).href)}).then(({requireLegacyMigrationOwnership})=>{
 requireLegacyMigrationOwnership(process.cwd(),true);fs.writeFileSync(process.argv[2],'done');
}).catch(error=>{console.error(error);process.exitCode=12;});`);
    assert.throws(()=>requireLegacyMigrationOwnership(root),/locked launcher handoff/);
    writeFileSync(lock,JSON.stringify({schema_version:2}));
    assert.equal(requireLegacyMigrationOwnership(root),false);
    assert.throws(()=>requireLegacyMigrationOwnership(root,true),/locked launcher handoff/);
    writeFileSync(lock,JSON.stringify(identity));
    const invocation=legacyMigrationInvocation(root,script,[marker]);
    const invoke=()=>spawnSync(invocation.argv[0]!,invocation.argv.slice(1),{cwd:root,encoding:"utf8",timeout:10000});
    writeFileSync(lock,JSON.stringify({...identity,version:"2.8.3"}));
    const changed=invoke();assert.notEqual(changed.status,0);assert.match(changed.stderr,/package lock changed/);assert.equal(existsSync(marker),false);
    writeFileSync(lock,JSON.stringify(identity));
    mkdirSync(join(root,".governance/startup"));writeFileSync(join(root,".governance/startup/transaction.json"),"{}");
    const pending=invoke();assert.notEqual(pending.status,0);assert.match(pending.stderr,/update requires recovery/);assert.equal(existsSync(marker),false);
    rmSync(join(root,".governance/startup/transaction.json"));
    const originalScript=readFileSync(script);
    writeFileSync(script,"throw new Error('changed script must not execute');");
    const changedScript=invoke();assert.notEqual(changedScript.status,0);assert.match(changedScript.stderr,/Migration script changed/);assert.equal(existsSync(marker),false);
    writeFileSync(script,originalScript);
    const reader=spawn("python3",["-u","-c","import os,fcntl,sys; fd=os.open(sys.argv[1],os.O_RDWR); fcntl.flock(fd,fcntl.LOCK_SH); print('ready',flush=True); sys.stdin.read(); os.close(fd)",runtimeLock],{stdio:["pipe","pipe","pipe"]});
    const readerClosed=once(reader,"close");
    try {
      const [ready]=await once(reader.stdout,"data",{signal:AbortSignal.timeout(5000)});
      assert.equal(ready.toString().trim(),"ready");
      const busy=invoke();assert.notEqual(busy.status,0);assert.match(busy.stderr,/BlockingIOError/);assert.equal(existsSync(marker),false);
    } finally {
      reader.stdin.end();
      await readerClosed;
    }
    const completed=invoke();assert.equal(completed.status,0,completed.stderr);assert.equal(existsSync(marker),true);
    writeFileSync(lock,JSON.stringify({schema_version:2,package:"@organta/project-governance",version:"3.0.0",
      artifact:{url:"file:///runtime.tgz",integrity:"sha512-"+Buffer.alloc(64).toString("base64")},
      source_commit:"a".repeat(40),node:">=24.16.0 <25",configuration_schema:1}));
    assert.throws(()=>legacyMigrationInvocation(root,script,[marker]),/saved legacy recovery/);
    const recoveryDirectory=join(root,"recovery");mkdirSync(recoveryDirectory);
    const request={workspace:root};
    writeFileSync(join(recoveryDirectory,"operation.json"),JSON.stringify({request,requestDigest:digest(request),
      owner:`installation:${recoveryDirectory}`,legacyLockRequired:true}));
    const recovered=legacyMigrationInvocation(root,script,[marker],recoveryDirectory);
    const recovery=spawnSync(recovered.argv[0]!,recovered.argv.slice(1),{cwd:root,encoding:"utf8",timeout:10000});
    assert.equal(recovery.status,0,recovery.stderr);
    writeFileSync(join(recoveryDirectory,"operation.json"),JSON.stringify({request,requestDigest:digest(request),
      owner:`installation:${recoveryDirectory}`,legacyLockRequired:false}));
    assert.throws(()=>legacyMigrationInvocation(root,script,[marker],recoveryDirectory),/binding differs/);

    execFileSync("python3",["-c","import os,fcntl,sys; fd=os.open(sys.argv[1],os.O_RDWR); fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB); os.close(fd)",runtimeLock],{timeout:5000,stdio:"pipe"});
  } finally {rmSync(root,{recursive:true,force:true});}
});
