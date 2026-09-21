import { test } from "node:test";
import assert from "node:assert/strict";
import { dependency } from "../src/checkers/dependency-manifests.ts";
import { authoritativeDependencySource } from "../src/checkers/dependency-sources.ts";

test("dependency evidence requires the authoritative exact release path", () => {
  const cases = [
    [dependency("Some_Package", "pypi", "1.2.3", "direct"), "https://pypi.org/pypi/some-package/1.2.3/json", "https://pypi.org/project/some-package/9.0.0"],
    [dependency("pkg", "npm", "1.2.3", "direct"), "https://registry.npmjs.org/pkg/1.2.3", "https://registry.npmjs.org/other/1.2.3"],
    [dependency("Owner/Repo/action", "github-actions", "a".repeat(40), "ci"), `https://github.com/owner/repo/commit/${"a".repeat(40)}`, `https://github.com/owner/other/commit/${"a".repeat(40)}`],
    [dependency("org.example:lib", "maven", "1.2.3", "direct"), "https://repo1.maven.org/maven2/org/example/lib/1.2.3/lib-1.2.3.pom", "https://repo1.maven.org/maven2/org/example/lib/1.2.30/lib.pom"],
  ] as const;
  for (const [coordinate, valid, wrong] of cases) {
    assert.equal(authoritativeDependencySource(coordinate, valid), true);
    for (const invalid of [wrong, valid + "?token=hidden", valid.replace("https://", "http://"), valid.replace("https://", "https://user@")]) assert.equal(authoritativeDependencySource(coordinate, invalid), false);
  }
  assert.equal(authoritativeDependencySource(dependency("org.example:lib", "maven", "1.2.3", "direct"), "https://repo1.maven.org/maven2/org/example/lib/1.2.3/../9.0.0/file"), false);
});
