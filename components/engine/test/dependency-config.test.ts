import { test } from "node:test";
import assert from "node:assert/strict";
import { validateNpmrc, validateYarnrc } from "../src/checkers/dependency-config.ts";

test("npm config permits exact scoped trust while rejecting credentials and weakened TLS", () => {
  validateNpmrc(".npmrc", "registry=https://registry.npmjs.org/\n@example:registry=https://packages.example.invalid/npm\nstrict-ssl=true", { "@example": "https://packages.example.invalid/npm" });
  for (const source of ["strict-ssl=false", "ca[]=custom", "//registry.npmjs.org/:_authToken=secret-value", "https-proxy=http://example.invalid", "registry=https://example.invalid", "registryAlias=x", "invalid syntax"])
    assert.throws(() => validateNpmrc(".npmrc", source), error => error instanceof Error && !error.message.includes("secret-value"));
});

test("Yarn recursively validates registry and transport settings", () => {
  validateYarnrc(".yarnrc.yml", "npmRegistryServer: https://registry.npmjs.org\nenableStrictSsl: true");
  for (const source of ["enableStrictSsl: false", "npmScopes: {example: {npmAuthToken: secret-value}}", "npmRegistries: {https://example.invalid: {}}", "npmScopes: {example: {npmRegistryServer: https://example.invalid}}", "networkSettings: {host: {httpsCaFilePath: custom}}"])
    assert.throws(() => validateYarnrc(".yarnrc.yml", source), error => error instanceof Error && !error.message.includes("secret-value"));
});
