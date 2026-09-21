import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { loadSkillCatalog } from "../src/skill-catalog.ts";

const prefix = ".governance/runtime/skills/";
test("canonical packaged catalog retains declared skill and router ownership", () => {
  const skills = loadSkillCatalog(resolve("src/project_governance_runtime/assets/skills"));
  assert.ok(skills.size > 0);
  assert.equal(skills.get("test-execution")?.defaultLevel, "recommended");
  assert.ok([...skills.values()].some(skill => skill.routerFor.length > 0));
  for (const skill of skills.values()) {
    assert.match(skill.sourceDigest, /^sha256:[a-f0-9]{64}$/);
    assert.ok(skill.content.length > 0);
  }
});

test("catalog rejects escaped assets, duplicate ownership and missing references", () => {
  const root = mkdtempSync(join(tmpdir(), "engine-skills-"));
  const entry = { id: "example", path: `${prefix}skill.md` };
  const catalog = (entries: unknown[]) => writeFileSync(join(root, "catalog.yaml"), JSON.stringify({ standard_skills: entries }));
  try {
    writeFileSync(join(root, "skill.md"), "Example skill");
    catalog([entry]);
    assert.equal(loadSkillCatalog(root).size, 1);
    catalog([entry, entry]);
    assert.throws(() => loadSkillCatalog(root), /Duplicate/);
    catalog([{ ...entry, path: `${prefix}../outside.md` }]);
    assert.throws(() => loadSkillCatalog(root));
    catalog([{ ...entry, references: [`${prefix}missing.md`] }]);
    assert.throws(() => loadSkillCatalog(root));
    symlinkSync("skill.md", join(root, "alias.md"));
    catalog([{ ...entry, path: `${prefix}alias.md` }]);
    assert.throws(() => loadSkillCatalog(root), /symlink/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
