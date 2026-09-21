import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePackageLock, validSha512Integrity } from "../src/checkers/dependency-lock.ts";
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
