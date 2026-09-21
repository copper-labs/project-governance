import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { main } from "../src/cli.ts";

test("documentation CLI preserves exact routing, envelopes and nonfailure ambiguity", async () => {
  const root = mkdtempSync(join(tmpdir(), "docs-cli-")), previous = process.cwd();
  const log = console.log, error = console.error;
  let output: string[] = [];
  try {
    execFileSync("git", ["init", "-q"], { cwd: root });
    process.chdir(root); console.log = value => output.push(String(value)); console.error = () => {};
    const call = async (args: string[]) => { output = []; const code = await main(["docs", "route", ...args]); return { code, output: output.join("\n") }; };
    const disabled = await call(["--capability", "read", "--json"]);
    assert.equal(disabled.code, 0); assert.equal(JSON.parse(disabled.output).status, "disabled");
    mkdirSync(join(root, "config/governance"), { recursive: true }); mkdirSync(join(root, "docs/developer"), { recursive: true });
    writeFileSync(join(root, "config/governance/profile.yaml"), "documentation: {enabled: true, research: disabled}\n");
    const record = { id: "read", title: "Read records", reference: "docs/reference.md", aliases: ["lookup"], symbols: ["Store.read"] };
    const catalog = (records: unknown[]) => writeFileSync(join(root, "docs/developer/catalog.yaml"), JSON.stringify({ version: 1, capabilities: records }));
    catalog([record]);
    const matched = await call(["--symbol", "Store.read", "--json"]);
    assert.equal(matched.code, 0); assert.equal(JSON.parse(matched.output).research, "disabled");
    assert.deepEqual(JSON.parse(matched.output).context_paths, ["docs/reference.md"]);
    assert.equal((await call(["--capability", "lookup"])).output, "status=matched query_kind=capability match_count=1");
    assert.equal(JSON.parse((await call(["--capability", "look", "--json"])).output).status, "not-found");
    catalog([record, { ...record, id: "other" }]);
    const ambiguous = await call(["--symbol", "Store.read", "--json"]);
    assert.equal(ambiguous.code, 0); assert.equal(JSON.parse(ambiguous.output).status, "ambiguous");
    catalog([{ ...record, reference: "../outside" }]);
    assert.equal((await call(["--capability", "read", "--json"])).code, 1);
    assert.notEqual((await call(["--capability", "read", "--symbol", "Store.read"])).code, 0);
    assert.notEqual((await call([])).code, 0);
  } finally { console.log = log; console.error = error; process.chdir(previous); rmSync(root, { recursive: true, force: true }); }
});
