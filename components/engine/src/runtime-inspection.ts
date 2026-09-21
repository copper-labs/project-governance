import { realpathSync } from "node:fs";
import { join } from "node:path";
import { narrativeFile } from "./narrative-inputs.ts";
import { compiledRuntimeLock, compatibleNodeVersion } from "./runtime-lock.ts";
import { verifyRuntimeArchive } from "./runtime-artifact.ts";
import { verifyRuntimeDependencies } from "./runtime-dependencies.ts";
import { runtimeTree } from "./runtime-tree.ts";
import { digest, object } from "./core.ts";

/** Read-only preactivation inspection; never executes or activates a changed candidate. */
export function inspectRuntimeGeneration(directory: string) {
  directory = realpathSync(directory);
  const receipt = object(JSON.parse(narrativeFile(directory, "installation.json")));
  const lock = compiledRuntimeLock(receipt.lock);
  if (receipt.version !== 1 || receipt.state !== "staged" || receipt.directory !== directory || receipt.lockDigest !== digest(lock)) throw new Error("Invalid staged runtime receipt");
  if (!compatibleNodeVersion(process.versions.node)) throw new Error("Unsupported Node runtime");
  const packageRoot = join(directory, "node_modules", "@organta", "project-governance");
  if (realpathSync(packageRoot) !== packageRoot || receipt.executable !== join(packageRoot, "dist/engine/src/cli.js")) throw new Error("Staged runtime path changed");
  verifyRuntimeArchive(join(directory, "runtime.tgz"), lock);
  const dependencies = verifyRuntimeDependencies(packageRoot), installedTree = runtimeTree(packageRoot);
  if (digest(dependencies) !== digest(receipt.dependencies) || digest(installedTree) !== digest(receipt.installedTree)) throw new Error("Installed runtime payload differs from staging receipt");
  return { state: "verified", directory, executable: receipt.executable, lockDigest: receipt.lockDigest,
    installedTree, activation: "not-performed" };
}
