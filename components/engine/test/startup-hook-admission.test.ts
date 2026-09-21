import {test} from "node:test";
import assert from "node:assert/strict";
import {realpathSync} from "node:fs";
import {startupHookAdmission} from "../src/startup-hook-admission.ts";

test("startup maintenance admits only scoped commit hooks with exact ownership",()=>{
 const root=realpathSync(process.cwd()),token="fixture",owner="startup-update:sha256:"+"a".repeat(64),maintenance={token,owner};
 const env={GOVERNANCE_STARTUP_TOKEN:token,GOVERNANCE_STARTUP_OWNER:owner,GOVERNANCE_STARTUP_WORKSPACE:root,GOVERNANCE_STARTUP_REGISTRY:root};
 assert.equal(startupHookAdmission(["hook","pre-commit"],root,root,maintenance,env),token);
 assert.equal(startupHookAdmission(["hook","commit-msg",".git/COMMIT_EDITMSG"],root,root,maintenance,env),token);
 assert.equal(startupHookAdmission(["check"],root,root,maintenance,{}),undefined);
 for(const args of [["check"],["--version"],["hook","pre-push"],["hook","pre-commit","extra"],["hook","commit-msg"]])
  assert.throws(()=>startupHookAdmission(args,root,root,maintenance,env),/commit validation hooks only/);
 assert.throws(()=>startupHookAdmission(["hook","pre-commit"],root,root,null,env),/ownership differs/);
 assert.throws(()=>startupHookAdmission(["hook","pre-commit"],root,root,{token:"other",owner},env),/ownership differs/);
 assert.throws(()=>startupHookAdmission(["hook","pre-commit"],root,root,maintenance,{...env,GOVERNANCE_STARTUP_WORKSPACE:"/"}),/scope differs/);
 assert.throws(()=>startupHookAdmission(["hook","pre-commit"],root,root,maintenance,{GOVERNANCE_STARTUP_TOKEN:token}),/Incomplete/);
 assert.throws(()=>startupHookAdmission(["hook","pre-commit"],root,root,maintenance,{...env,GOVERNANCE_MAINTENANCE_PROBE:token}),/version-probe/);
});
