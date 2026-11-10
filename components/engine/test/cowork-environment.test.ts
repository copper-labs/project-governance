import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, symlinkSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, delimiter } from "node:path";
import { coworkHostPath } from "../src/cowork-environment.ts";

test("host PATH excludes relative, missing, project and aliased project executables", t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "cowork-path-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const project = join(root, "project"), external = join(root, "host"), alias = join(root, "alias");
  mkdirSync(project); mkdirSync(external); symlinkSync(project, alias);
  assert.equal(coworkHostPath(["", ".", "bin", project, alias, join(root, "missing"), external].join(delimiter), [project]), external);
});
