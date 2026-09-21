import { realpathSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { narrativeFile } from "./narrative-inputs.ts";
import { digest, object } from "./core.ts";

/** Read back every production dependency from the installed package's own bundled graph. */
export function verifyRuntimeDependencies(packageRoot: string) {
  const root = realpathSync(packageRoot);
  const read = (path: string) => {
    const full = join(root, path);
    if (realpathSync(full) !== full) throw new Error("Runtime dependency uses an unexpected symlink");
    return object(JSON.parse(narrativeFile(root, path)));
  };
  const manifest = read("package.json"), lock = read("dist/engine/assets/runtime-dependencies.lock.json");
  const packages = object(lock["packages"]), lockedRoot = object(packages[""]);
  if (lock["lockfileVersion"] !== 3 || lock["name"] !== manifest["name"] || lock["version"] !== manifest["version"] ||
      !isDeepStrictEqual(lockedRoot["dependencies"] ?? {}, manifest["dependencies"] ?? {})) throw new Error("Bundled graph does not identify this runtime");
  const verified: Array<{ path: string; version: string }> = [];
  for (const name of Object.keys(object(manifest["dependencies"] ?? {}))) {
    const entry = object(packages[`node_modules/${name}`]);
    if (entry["dev"] === true) throw new Error("Production dependency marked development-only");
  }
  for (const [path, raw] of Object.entries(packages)) {
    if (!path) continue;
    const expected = object(raw);
    if (expected["dev"] === true) continue;
    if (!/^node_modules\/(?:@[A-Za-z0-9._-]+\/)?[A-Za-z0-9._-]+(?:\/node_modules\/(?:@[A-Za-z0-9._-]+\/)?[A-Za-z0-9._-]+)*$/u.test(path) ||
        path.split("/").some(part => part === "." || part === "..") || typeof expected["version"] !== "string" || expected["link"] === true) throw new Error("Invalid pinned dependency path or version");
    const installed = read(`${path}/package.json`);
    if (installed["version"] !== expected["version"]) throw new Error("Bundled dependency version mismatch");
    verified.push({ path, version: expected["version"] });
  }
  return { graphDigest: digest(lock), verified };
}
