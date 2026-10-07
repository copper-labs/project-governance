import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, existsSync, readdirSync, realpathSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { credentialNames } from "../src/credential-environment.ts";
import { commandEnvironment, processLiveFingerprint, submitCommand, validateCommandRequest, waitCommand } from "../src/process-owner.ts";

test("only approved credential names reach native commands and values stay out of durable requests", async () => {
  const root = mkdtempSync(join(tmpdir(), "credential-env-"));
  const name = "ENGINE_FIXTURE_TOKEN", previous = process.env[name];
  process.env[name] = "fixture-only-private-value";
  try {
    const operation = { argv: [process.execPath, "-e", "process.exit(process.env.ENGINE_FIXTURE_TOKEN ? 0 : 7)"], cwd: root, env: {}, credentialEnv: [name], effect: "read" as const, expectedExitCodes: [0] };
    const submitted = submitCommand(join(root, "approved"), { id: "approved", operation, deadlineMs: 3000, outputLimit: 4096 });
    assert.equal((await waitCommand(submitted.directory, submitted.requestDigest, 5000)).receipt?.state, "succeeded");
    assert.ok(!readFileSync(join(submitted.directory, "request.json"), "utf8").includes(process.env[name]!));
    delete process.env[name];
    assert.equal(submitCommand(submitted.directory, { id: "approved", operation, deadlineMs: 3000, outputLimit: 4096 }).submitted, false,
      "reconnecting to existing work does not require credentials again");
    assert.throws(() => submitCommand(join(root, "missing"), { id: "missing", operation, deadlineMs: 3000, outputLimit: 4096 }), /credential unavailable/);
    assert.equal(existsSync(join(root, "missing")), false);
    assert.throws(() => credentialNames(["PATH"]), /Invalid/);
    assert.throws(() => credentialNames([name, name]), /Invalid/);
  } finally {
    if (previous === undefined) delete process.env[name]; else process.env[name] = previous;
    rmSync(root, { recursive: true });
  }
});

test("OPENAI_API_KEY is an exact declared process-only credential", async () => {
  const root = mkdtempSync(join(tmpdir(), "credential-openai-")), canary = randomUUID();
  const previous = { OPENAI_API_KEY: process.env.OPENAI_API_KEY, JEV_TOKEN: process.env.JEV_TOKEN };
  process.env.OPENAI_API_KEY = canary; process.env.JEV_TOKEN = randomUUID();
  try {
    assert.deepEqual(credentialNames(["OPENAI_API_KEY"]), ["OPENAI_API_KEY"]);
    for (const names of [["OTHER_API_KEY"], ["openai_api_key"], ["PATH"], ["OPENAI_API_KEY", "OPENAI_API_KEY"]])
      assert.throws(() => credentialNames(names), /Invalid credential/);
    const submitted = submitCommand(join(root, "command"), { id: "openai", deadlineMs: 3000, outputLimit: 4096,
      operation: { argv: [process.execPath, "-e", "process.exit(process.env.OPENAI_API_KEY && !process.env.JEV_TOKEN ? 0 : 7)"], cwd: root, env: {}, credentialEnv: ["OPENAI_API_KEY"], effect: "read", expectedExitCodes: [0] } });
    assert.equal((await waitCommand(submitted.directory, submitted.requestDigest, 5000)).receipt?.state, "succeeded");
    for (const entry of readdirSync(submitted.directory, { withFileTypes: true }).filter(entry => entry.isFile()))
      assert.ok(!readFileSync(join(submitted.directory, entry.name), "utf8").includes(canary), "credential must not appear in retained command evidence");
  } finally {
    for (const [name, value] of Object.entries(previous)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
    rmSync(root, { recursive: true, force: true });
  }
});

test("ordinary environment refuses embedded credentials before persistence", () => {
  const root = mkdtempSync(join(tmpdir(), "credential-embedded-")), canary = randomUUID();
  try {
    for (const name of ["OPENAI_API_KEY", "openai_api_key", "JEV_TOKEN"]) {
      const request = { version: 1 as const, ownerDigest: "fixture", id: "embedded", deadlineMs: 3000, outputLimit: 4096,
        operation: { argv: [process.execPath, "-e", "process.exit(0)"], cwd: root, env: { [name]: canary }, effect: "read" as const, expectedExitCodes: [0] } };
      assert.throws(() => validateCommandRequest(request), /credentials cannot be embedded/);
      assert.throws(() => commandEnvironment(request.operation.env), /credentials cannot be embedded/);
      assert.throws(() => submitCommand(join(root, name), request), /credentials cannot be embedded/);
      assert.equal(existsSync(join(root, name)), false);
    }
    assert.equal(commandEnvironment({ FIXTURE_MODE: "offline" }).FIXTURE_MODE, "offline");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("unregistered API-key overrides cannot persist or become credential references", () => {
  const root = mkdtempSync(join(tmpdir(), "credential-api-key-")), canary = randomUUID();
  try {
    for (const name of ["ANTHROPIC_API_KEY", "GOOGLE_API_KEY", "OTHER_API_KEY", "anthropic_api_key", "API_KEY"]) {
      assert.throws(() => credentialNames([name]), /Invalid credential/);
      const request = { version: 1 as const, ownerDigest: "fixture", id: "api-key-override", deadlineMs: 3000, outputLimit: 4096,
        operation: { argv: [process.execPath, "-e", "process.exit(0)"], cwd: root, env: { [name]: canary }, effect: "read" as const, expectedExitCodes: [0] } };
      assert.throws(() => commandEnvironment(request.operation.env), /credentials cannot be embedded/);
      assert.throws(() => validateCommandRequest(request), /credentials cannot be embedded/);
      assert.throws(() => submitCommand(join(root, `native-${name}`), request), /credentials cannot be embedded/);
      const provider = { ...request, provider: { kind: "claude" as const, model: "fixture", effort: "medium", requiredTools: [] } };
      assert.throws(() => submitCommand(join(root, `provider-${name}`), provider), /credentials cannot be embedded/);
      assert.equal(existsSync(join(root, `native-${name}`)), false);
      assert.equal(existsSync(join(root, `provider-${name}`)), false);
    }
    assert.deepEqual(Object.fromEntries(Object.entries(commandEnvironment({ ASSET_KEY: "fixture", API_KEY_COUNT: "2" }))
      .filter(([name]) => ["ASSET_KEY", "API_KEY_COUNT"].includes(name))), { ASSET_KEY: "fixture", API_KEY_COUNT: "2" });
    assert.deepEqual(credentialNames(["OPENAI_API_KEY", "ENGINE_FIXTURE_TOKEN"]), ["OPENAI_API_KEY", "ENGINE_FIXTURE_TOKEN"]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("native startup maintenance keeps its exact durable coordination identity", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "credential-startup-"))), token = randomUUID();
  const directory = join(root, "command"), tokenDigest = createHash("sha256").update(token).digest("hex");
  const environment = { GOVERNANCE_STARTUP_TOKEN: token, GOVERNANCE_STARTUP_OWNER: `startup-update:sha256:${"a".repeat(64)}`,
    GOVERNANCE_STARTUP_REGISTRY: root, GOVERNANCE_STARTUP_WORKSPACE: root };
  try {
    const submitted = submitCommand(directory, { id: "startup-maintenance", deadlineMs: 3000, outputLimit: 4096,
      operation: { argv: [process.execPath, "-e", `const {createHash}=require('node:crypto');
        const identity=createHash('sha256').update(process.env.GOVERNANCE_STARTUP_TOKEN||'').digest('hex');
        process.exit(identity===${JSON.stringify(tokenDigest)} &&
          process.env.GOVERNANCE_STARTUP_OWNER===${JSON.stringify(environment.GOVERNANCE_STARTUP_OWNER)} &&
          process.env.GOVERNANCE_STARTUP_REGISTRY===process.cwd() &&
          process.env.GOVERNANCE_STARTUP_WORKSPACE===process.cwd() ? 0 : 7);`],
        cwd: root, env: environment, effect: "local", expectedExitCodes: [0] } });
    assert.equal((await waitCommand(submitted.directory, submitted.requestDigest, 5000)).receipt?.state, "succeeded");
    assert.deepEqual(JSON.parse(readFileSync(join(directory, "request.json"), "utf8")).operation.env, environment,
      "the startup journal and native hooks share this existing coordination identity");
    assert.equal(submitCommand(directory, { id: "startup-maintenance", deadlineMs: 3000, outputLimit: 4096,
      operation: JSON.parse(readFileSync(join(directory, "request.json"), "utf8")).operation }).submitted, false);
  } finally {
    const owners = ["owner.json", "guardian.json"].flatMap(name => {
      const path = join(directory, name); return existsSync(path) ? [JSON.parse(readFileSync(path, "utf8"))] : [];
    });
    const deadline = Date.now() + 5000;
    while (owners.some(owner => processLiveFingerprint(owner.pid) === owner.fingerprint) && Date.now() < deadline)
      await new Promise(resolve => setTimeout(resolve, 50));
    assert.ok(owners.every(owner => processLiveFingerprint(owner.pid) !== owner.fingerprint));
    rmSync(root, { recursive: true, force: true });
  }
});

test("startup coordination cannot become a credential reference or ordinary override", () => {
  const root = mkdtempSync(join(tmpdir(), "credential-startup-boundary-")), token = randomUUID();
  const request = { version: 1 as const, ownerDigest: "fixture", id: "startup-boundary", deadlineMs: 3000, outputLimit: 4096,
    operation: { argv: [process.execPath, "-e", "process.exit(0)"], cwd: root,
      env: { GOVERNANCE_STARTUP_TOKEN: token }, effect: "local" as const, expectedExitCodes: [0] } };
  try {
    assert.throws(() => credentialNames(["GOVERNANCE_STARTUP_TOKEN"]), /Invalid credential/);
    assert.throws(() => commandEnvironment(request.operation.env), /credentials cannot be embedded/);
    assert.throws(() => validateCommandRequest({ ...request,
      provider: { kind: "claude", model: "fixture", effort: "medium", requiredTools: [] } }), /credentials cannot be embedded/);
    for (const name of ["OPENAI_API_KEY", "JEV_TOKEN", "governance_startup_token"]) {
      const embedded = { ...request, operation: { ...request.operation, env: { ...request.operation.env, [name]: randomUUID() } } };
      assert.throws(() => submitCommand(join(root, name), embedded), /credentials cannot be embedded/);
      assert.equal(existsSync(join(root, name)), false);
    }
    for (const invalid of [undefined, 7, "invalid\0identity"])
      assert.throws(() => validateCommandRequest({ ...request, operation: { ...request.operation,
        env: { GOVERNANCE_STARTUP_TOKEN: invalid as unknown as string } } }), /invalid environment entry/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
