import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePnpmWorkspace } from "../src/checkers/dependency-pnpm.ts";

test("pnpm catalogs and overrides produce exact governed coordinates", () => {
  const values = parsePnpmWorkspace("pnpm-workspace.yaml", "packages: ['apps/*']\ncatalog: {react: 19.1.0}\ncatalogs: {legacy: {react: 18.3.1}}\noverrides: {tool: 2.3.4}\n");
  assert.deepEqual(values.map(value => [value.name, value.version, value.artifact_type]), [["react", "19.1.0", "catalog"], ["react", "18.3.1", "catalog"], ["tool", "2.3.4", "override"]]);
  for (const source of ["catalog: {react: '^19.0.0'}", "catalogs: []", "overrides: {'react@*': 19.0.0}", "patchedDependencies: {}", "packageExtensions: {}", "catalog: {react: 'catalog:legacy'}"])
    assert.throws(() => parsePnpmWorkspace("pnpm-workspace.yaml", source));
});
