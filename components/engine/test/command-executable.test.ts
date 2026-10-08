import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { commandExecutable, runNativeCheckCommand } from "../src/native-check-command.ts";
import { processLiveFingerprint } from "../src/process-owner.ts";

test("explicit executable aliases preserve the declared absolute launch path", { skip: process.platform === "win32" }, () => {
  const root = mkdtempSync(join(tmpdir(), "checker-alias-"));
  try {
    const link = join(root, "checker"); symlinkSync(process.execPath, link);
    assert.equal(realpathSync(link), realpathSync(process.execPath));
    assert.equal(commandExecutable("./checker", root), link);
    assert.equal(commandExecutable(link, root), link);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("PATH lookup preserves an executable alias and ignores implicit lookup directories", { skip: process.platform === "win32" }, () => {
  const root = mkdtempSync(join(tmpdir(), "checker-path-"));
  try {
    const bin = join(root, "bin"), link = join(bin, "fixture-checker"); mkdirSync(bin); symlinkSync(process.execPath, link);
    assert.equal(commandExecutable("fixture-checker", root, `:relative:${bin}`), link);
    assert.throws(() => commandExecutable("fixture-checker", root, ":relative:"), /unavailable/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("broken aliases, non-executable files and directories cannot dispatch", { skip: process.platform === "win32" }, () => {
  const root = mkdtempSync(join(tmpdir(), "checker-refusal-"));
  try {
    const broken = join(root, "broken"), file = join(root, "file"); symlinkSync(join(root, "absent"), broken);
    writeFileSync(file, "fixture"); chmodSync(file, 0o600);
    for (const path of [broken, file, root]) assert.throws(() => commandExecutable(path, root), /unavailable/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("native checker uses its declared Python environment and observes replay without execution", { skip: process.platform === "win32" }, async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "checker-venv-"))), directory = join(root, "command"), venv = join(root, ".venv");
  try {
    const python = commandExecutable(process.env["GOVERNANCE_TEST_PYTHON"] ?? "python3", root);
    const created = spawnSync(python, ["-m", "venv", "--without-pip", venv], { encoding: "utf8", env: { PATH: process.env["PATH"] ?? "", PYTHONDONTWRITEBYTECODE: "1" }, timeout: 15000 });
    assert.equal(created.status, 0, "The qualified fixture Python must create an offline venv");
    const lib = join(venv, "lib", readdirSync(join(venv, "lib")).find(name => name.startsWith("python"))!, "site-packages");
    mkdirSync(lib, { recursive: true }); writeFileSync(join(lib, "governance_fixture_dependency.py"), 'VALUE = "venv-only"\n');
    const executions = join(root, "executions"), interpreter = join(venv, "bin", "python");
    const code = `import json, sys\nfrom pathlib import Path\ntry:\n import governance_fixture_dependency as dependency\n valid = sys.prefix == ${JSON.stringify(venv)} and dependency.VALUE == "venv-only"\nexcept ImportError:\n valid = False\nwith Path(${JSON.stringify(executions)}).open("a") as f: f.write("once\\n")\nprint(json.dumps({"status": "passed" if valid else "failed", "findings": [] if valid else [{"rule_id": "fixture.environment-unavailable", "severity": "blocking", "message": "Declared environment was bypassed"}]}))\nsys.exit(0 if valid else 1)`;
    const options = { id: "venv-checker", root, directory, argv: [interpreter, "-c", code], deadlineMs: 5000, env: { PYTHONDONTWRITEBYTECODE: "1" } };
    const result = await runNativeCheckCommand(options);
    assert.equal(result.status, "passed", JSON.stringify({ exit: result.exit_code, reason: result.termination_reason, stdout: result.stdout, stderr: result.stderr }));
    assert.equal(result.argv[0], interpreter);
    assert.ok("command_receipt" in result); assert.equal(result.command_receipt.cleanup, "confirmed");
    const replay = await runNativeCheckCommand(options);
    assert.ok("command_receipt" in replay); assert.deepEqual(replay.command_receipt, result.command_receipt);
    assert.equal(readFileSync(executions, "utf8"), "once\n");
    const request = JSON.parse(readFileSync(join(directory, "request.json"), "utf8"));
    assert.equal(request.operation.argv[0], interpreter, "Durable evidence retains the launched path");
  } finally {
    const owners = ["owner.json", "guardian.json"].flatMap(name => { const path = join(directory, name); return existsSync(path) ? [JSON.parse(readFileSync(path, "utf8"))] : []; });
    const deadline = Date.now() + 5000;
    while (owners.some(owner => processLiveFingerprint(owner.pid) === owner.fingerprint) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
    assert.ok(owners.every(owner => processLiveFingerprint(owner.pid) !== owner.fingerprint), "Only finished fixture evidence may be removed");
    rmSync(root, { recursive: true, force: true });
  }
});
