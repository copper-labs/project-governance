import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveChangeScope, ValidationSubject } from "../src/change-subject.ts";
import { checkContextRouter, contextBudget } from "../src/checkers/context-router.ts";

test("router checks optional configuration, bounded references and captured staged facts", () => {
  const root = mkdtempSync(join(tmpdir(), "context-router-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root });
  try {
    git("init", "-q"); git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-qm", "Initial"); mkdirSync(join(root, "config/governance"), { recursive: true });
    const write = (path: string, value: unknown) => writeFileSync(join(root, path), JSON.stringify(value));
    const check = () => checkContextRouter(new ValidationSubject(root, resolveChangeScope(root, { all: true })), new Set(["format"]));
    assert.equal(check().status, "passed");
    write("config/governance/profile.yaml", { continuity: { decisions: { mode: "automatic" } } });
    assert.equal(check().status, "failed");
    write("config/governance/profile.yaml", { continuity: { decisions: { mode: "off" } } });
    assert.equal(check().status, "passed");
    write("config/governance/facts.lock.yaml", { facts: { skill_context: { ecosystems: ["React Native"] } } });
    assert.equal(check().status, "failed");
    write("config/governance/facts.lock.yaml", { profile_id: "example", facts: { skill_context: { ecosystems: ["react-native"] } } });
    writeFileSync(join(root, "README.md"), "Context\n");
    const route = { id: "dev", primary_context: ["./README.md"], skills: ["test-execution"], validations: ["format"] };
    const profile = (routes: unknown) => ({ profile_id: "example", context_router: { routes } });
    write("config/governance/profile.yaml", profile([route]));
    assert.equal(check().status, "passed");
    git("add", ".");
    const scope = resolveChangeScope(root, { staged: true });
    write("config/governance/profile.yaml", profile([{ ...route, primary_context: ["../outside.md"], validations: ["unknown"] }]));
    assert.equal(checkContextRouter(new ValidationSubject(root, scope), new Set(["format"])).status, "passed");
    assert.equal(check().finding_count, 2);
    write("config/governance/profile.yaml", profile([route, route])); assert.equal(check().status, "failed");
    write("config/governance/profile.yaml", profile(null)); assert.equal(check().status, "failed");
    writeFileSync(join(root, "config/governance/profile.yaml"), "context_router: {}\ncontext_router: {}\n");
    assert.equal(check().status, "failed");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test("context budget cannot silently weaken bounds with malformed values", () => {
  assert.equal(contextBudget(undefined).total_context_tokens, 10000);
  for (const value of [null, [], false, { total_context_tokens: 100000 }, { primary_context_tokens: 11000 }, { expansion_context_tokens: null }, { primary_context_tokens: 0 }, { total_context_tokens: true }]) assert.throws(() => contextBudget(value));
});
