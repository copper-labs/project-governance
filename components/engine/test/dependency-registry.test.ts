import { test } from "node:test";
import assert from "node:assert/strict";
import { safeRegistryBase, registryPolicyErrors, npmUrlMatches, npmConfigRegistryMatches } from "../src/checkers/dependency-registry.ts";

test("trusted scoped npm registry binds complete origin and decoded package path", () => {
  const registries = { "@example": "https://packages.example.invalid/npm" };
  assert.deepEqual(registryPolicyErrors(registries), []);
  assert.equal(npmUrlMatches("@example/pkg", "/1.2.3", "https://packages.example.invalid/npm/@example%2Fpkg/1.2.3", registries), true);
  for (const url of ["https://registry.npmjs.org/@example/pkg/1.2.3", "https://packages.example.invalid/npm-other/@example/pkg/1.2.3", "https://packages.example.invalid:443/npm/@example/pkg/1.2.3", "https://user@packages.example.invalid/npm/@example/pkg/1.2.3", "https://packages.example.invalid/npm/@example/pkg/1.2.3?token=hidden"])
    assert.equal(npmUrlMatches("@example/pkg", "/1.2.3", url, registries), false);
  assert.equal(npmConfigRegistryMatches("@example", "https://packages.example.invalid/npm/", registries), true);
  assert.equal(npmConfigRegistryMatches("", "https://packages.example.invalid/npm/", registries), false);
});

test("registry trust rejects URL rewriting and ambiguous scope configuration", () => {
  for (const value of ["http://registry.npmjs.org", "https://registry.npmjs.org:443", "https://registry.npmjs.org/a/../b", "https://registry.npmjs.org/%2e", "https://registry.npmjs.org//", "https://REGISTRY.npmjs.org", "https://registry.npmjs.org/a;b"])
    assert.equal(safeRegistryBase(value), false, value);
  assert.equal(registryPolicyErrors({ "@Example": "https://registry.npmjs.org" }).length, 1);
  assert.equal(npmUrlMatches("pkg", "", "https://registry.npmjs.org/pkg/", {}, true), true);
  assert.equal(npmUrlMatches("pkg", "", "https://registry.npmjs.org/%ZZ"), false);
});

test("two explicit routes retain exact scope and URL checks", () => {
  const legacy = "https://packages.example.invalid/registry/npm/";
  const current = "https://packages.example.invalid/sdk/registry/npm/";
  const registries = { "@example": [legacy, current] };
  assert.deepEqual(registryPolicyErrors(registries), []);
  for (const base of registries["@example"]) {
    assert.equal(npmUrlMatches("@example/pkg", "/1.2.3", base + "@example/pkg/1.2.3", registries), true);
    assert.equal(npmUrlMatches("@example/pkg", "/1.2.3", base + "@example/pkg/1.2.4", registries), false);
    assert.equal(npmUrlMatches("@other/pkg", "/1.2.3", base + "@other/pkg/1.2.3", registries), false);
  }
  assert.equal(npmUrlMatches("@example/pkg", "/1.2.3", current + "shadow/@example/pkg/1.2.3", registries), false);
  assert.ok(registryPolicyErrors({ "@example": [legacy, legacy.slice(0, -1)] }).length);
});
