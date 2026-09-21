import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePackageManifest, parseRequirements, npmDefect } from "../src/checkers/dependency-manifests.ts";

test("npm extraction retains exact coordinates and independently repairable defects", () => {
  const result = parsePackageManifest("package.json", JSON.stringify({ dependencies: { good: "1.2.3", debt: "^2.0.0" }, devDependencies: { tool: "4.5.6-beta.1" }, overrides: { legacy: { ".": "1.0.0" } }, packageManager: "npm@11.0.0" }));
  assert.deepEqual(result.values.map(value => [value.name, value.version, value.artifact_type]), [["good", "1.2.3", "direct"], ["tool", "4.5.6-beta.1", "development"], ["npm", "11.0.0", "toolchain"]]);
  assert.deepEqual(result.defects.map(value => value.repair_key), [["manifest", "dependencies", "debt"], ["manifest", "overrides", "legacy"]]);
  assert.throws(() => parsePackageManifest("package.json", '{"pnpm":{"patchedDependencies":{}}}'), /unsupported/u);
  assert.throws(() => parsePackageManifest("package.json", '{"dependencies":[]}'), /object/u);
  assert.equal(npmDefect("manifest", "x", "dependencies", "é😀", "invalid").identity[3], '"\\u00e9\\ud83d\\ude00"');
});

test("Python requirements normalize names and accept exact hash-bound continuations only", () => {
  const source = `# dependencies\nSome_Package[extra]==1.2.3 \\\n --hash=sha256:${"a".repeat(64)}\nOther==2.0; python_version >= '3.9'\n`;
  assert.deepEqual(parseRequirements("requirements.txt", source).map(value => [value.name, value.version]), [["some-package", "1.2.3"], ["other", "2.0"]]);
  for (const source of ["pkg>=1.0", "pkg==1.*", "-r other.txt", "pkg==1.2.3 \\"]) assert.throws(() => parseRequirements("requirements.txt", source));
});
