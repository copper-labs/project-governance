import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const packageRoot = process.env.GOVERNANCE_HOST_TEST_PACKAGE;
const ownerUrl = packageRoot ? pathToFileURL(join(packageRoot, "dist/engine/src/checkers/dependency-lock.js")) : new URL("../src/checkers/dependency-lock.ts", import.meta.url);
const { parsePackageLock, validSha512Integrity } = await import(ownerUrl.href) as typeof import("../src/checkers/dependency-lock.ts");
const integrity = `sha512-${Buffer.alloc(64, 1).toString("base64")}`;
const entry = { version: "1.2.3", resolved: "https://registry.npmjs.org/pkg/-/pkg-1.2.3.tgz", integrity };

test("modern and legacy lock graphs retain package coordinates and stable defects", () => {
  const modern = parsePackageLock("package-lock.json", JSON.stringify({ packages: { "": {}, "node_modules/pkg": entry, "packages/local": { version: "1.0.0" }, "node_modules/local": { link: true } } }));
  const legacy = parsePackageLock("package-lock.json", JSON.stringify({ dependencies: { pkg: entry } }));
  assert.deepEqual(modern, legacy); assert.equal(modern.values[0]?.name, "pkg"); assert.deepEqual(modern.defects, []);
  const bad = { ...entry, version: "^1.0.0", integrity: "sha512-invalid", resolved: "https://example.invalid/pkg.tgz" };
  const left = parsePackageLock("package-lock.json", JSON.stringify({ packages: { "node_modules/pkg": bad } }));
  const right = parsePackageLock("package-lock.json", JSON.stringify({ packages: { "node_modules/parent/node_modules/pkg": bad } }));
  assert.deepEqual(left, right); assert.equal(left.defects.length, 3); assert.equal(left.values.length, 0);
});

test("lock registry and integrity validation retain exact private scope trust", () => {
  const source = JSON.stringify({ packages: { "node_modules/@example/pkg": { ...entry, resolved: "https://packages.example.invalid/@example/pkg/-/pkg-1.2.3.tgz" } } });
  assert.equal(parsePackageLock("lock.json", source).defects.length, 1);
  assert.equal(parsePackageLock("lock.json", source, { "@example": "https://packages.example.invalid" }).values.length, 1);
  assert.equal(validSha512Integrity(integrity), true);
  for (const value of [integrity + "extra", "sha512-" + Buffer.alloc(63).toString("base64"), "sha1-abcdef"]) assert.equal(validSha512Integrity(value), false);
});

test("bundled dependency closure inherits only its verified enclosing archive", () => {
  const packages = {
    "node_modules/pkg": { ...entry, bundleDependencies: ["child"] },
    "node_modules/pkg/node_modules/child": { version: "2.0.0", inBundle: true, dependencies: { leaf: "^3.0.0" } },
    "node_modules/pkg/node_modules/leaf": { version: "3.0.0", inBundle: true },
  };
  const parsed = parsePackageLock("lock.json", JSON.stringify({ packages }));
  assert.deepEqual(parsed.defects, []);
  assert.deepEqual(parsed.values.map(x => x.name).sort(), ["child", "leaf", "pkg"]);
  for (const change of [
    (p: any) => { p["node_modules/pkg"].integrity = "sha512-bad"; },
    (p: any) => { p["node_modules/pkg"].resolved = "https://untrusted.invalid/pkg.tgz"; },
    (p: any) => { p["node_modules/pkg"].bundleDependencies = []; },
    (p: any) => { p["node_modules/pkg/node_modules/child"].inBundle = false; },
    (p: any) => { p["node_modules/pkg/node_modules/child"].resolved = "https://untrusted.invalid/child.tgz"; },
    (p: any) => { p["node_modules/pkg/node_modules/child"].integrity = "sha512-bad"; },
    (p: any) => { p["node_modules/pkg/node_modules/child"].version = "^2.0.0"; },
  ]) {
    const changed = structuredClone(packages); change(changed);
    assert.ok(parsePackageLock("lock.json", JSON.stringify({ packages: changed })).defects.length > 0);
  }
  const unlisted = { ...packages, "node_modules/pkg/node_modules/stranger": { version: "1.0.0", inBundle: true } };
  assert.equal(parsePackageLock("lock.json", JSON.stringify({ packages: unlisted })).defects.length, 2);
  const orphan = { "node_modules/child": { version: "2.0.0", inBundle: true } };
  assert.equal(parsePackageLock("lock.json", JSON.stringify({ packages: orphan })).defects.length, 2);
});

test("a linked enclosing package cannot supply archive trust to bundled children", () => {
  const parsed = parsePackageLock("lock.json", JSON.stringify({ packages: {
    "node_modules/pkg": { ...entry, link: true, bundleDependencies: ["child"] },
    "node_modules/pkg/node_modules/child": { version: "2.0.0", inBundle: true },
  } }));
  assert.deepEqual(parsed.defects.map(value => value.identity[2]).sort(), ["integrity", "source"]);
  assert.equal(parsed.values.length, 0);
});

for (const [reason, change] of Object.entries({
  "bad integrity": { integrity: "sha512-bad" },
  "missing integrity": { integrity: undefined },
  "untrusted source": { resolved: "https://untrusted.invalid/pkg.tgz" },
  "range version": { version: "^1.2.3", resolved: "https://registry.npmjs.org/pkg/-/pkg-^1.2.3.tgz" },
  "contradictory name": { name: "other" },
})) test("a rejected enclosing archive removes every child exemption: " + reason, () => {
  const parsed = parsePackageLock("lock.json", JSON.stringify({ packages: {
    "node_modules/pkg": { ...entry, ...change, bundleDependencies: ["child"] },
    "node_modules/pkg/node_modules/child": { version: "2.0.0", inBundle: true, dependencies: { leaf: "^3.0.0" } },
    "node_modules/pkg/node_modules/leaf": { version: "3.0.0", inBundle: true },
  } }));
  const children = parsed.defects.filter(value => ["child", "leaf"].includes(value.identity[1]!));
  assert.deepEqual(children.map(value => value.identity.slice(1, 3)), [
    ["child", "source"], ["child", "integrity"], ["leaf", "source"], ["leaf", "integrity"],
  ]);
  assert.ok(parsed.values.every(value => !["child", "leaf"].includes(value.name)));
});

for (const nested of [false, true]) test("bundle resolution never reaches an outer tree; nested=" + nested, () => {
  const owner = nested ? "node_modules/a/node_modules/pkg" : "node_modules/pkg";
  const outside = nested ? "node_modules/a/node_modules/leaf" : "node_modules/leaf";
  const parsed = parsePackageLock("lock.json", JSON.stringify({ packages: {
    ...(nested ? { "node_modules/a": { ...entry, resolved: "https://registry.npmjs.org/a/-/a-1.2.3.tgz" } } : {}),
    [owner]: { ...entry, bundleDependencies: ["child"] },
    [owner + "/node_modules/child"]: { version: "2.0.0", inBundle: true, dependencies: { leaf: "^3.0.0" } },
    [outside]: { version: "3.0.0", inBundle: true },
  } }));
  assert.deepEqual(parsed.defects.map(value => value.identity.slice(1, 3)), [["leaf", "source"], ["leaf", "integrity"]]);
});

test("scoped bundles retain the parent's exact private registry trust", () => {
  const parsed = parsePackageLock("lock.json", JSON.stringify({ packages: {
    "node_modules/@s/pkg": { ...entry, resolved: "https://packages.example.invalid/npm/@s/pkg/-/pkg-1.2.3.tgz", bundleDependencies: ["@s/child"] },
    "node_modules/@s/pkg/node_modules/@s/child": { version: "2.0.0", inBundle: true },
  } }), { "@s": "https://packages.example.invalid/npm" });
  assert.deepEqual(parsed.defects, []);
  assert.deepEqual(parsed.values.map(value => value.name), ["@s/pkg", "@s/child"]);
});

test("an enclosing alias uses the same actual package name as ordinary validation", () => {
  const parsed = parsePackageLock("lock.json", JSON.stringify({ packages: {
    "node_modules/alias": { ...entry, name: "pkg", bundleDependencies: ["child"] },
    "node_modules/alias/node_modules/child": { version: "2.0.0", inBundle: true },
  } }));
  assert.deepEqual(parsed.defects, []);
  assert.deepEqual(parsed.values.map(value => value.name), ["pkg", "child"]);
});

test("crafted legacy dependency keys cannot acquire a modern bundle exemption", () => {
  const parsed = parsePackageLock("lock.json", JSON.stringify({ dependencies: {
    pkg: { ...entry, bundleDependencies: ["child"] },
    "pkg/node_modules/child": { version: "2.0.0", inBundle: true },
  } }));
  assert.deepEqual(parsed.defects.map(value => value.identity.slice(1, 3)), [["child", "source"], ["child", "integrity"]]);
});
