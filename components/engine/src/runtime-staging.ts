import { runtimeTree } from "./runtime-tree.ts";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { compiledRuntimeLock, compatibleNodeVersion, type CompiledRuntimeLock } from "./runtime-lock.ts";
import { verifyRuntimeArchive } from "./runtime-artifact.ts";
import { digest, durableJson } from "./core.ts";
import { verifyRuntimeDependencies } from "./runtime-dependencies.ts";
import type { OperationDeadline } from "./operation-deadline.ts";

/** Prepare an inactive generation from verified bytes. Activation and target-lock replacement are separate operations. */
export function stageRuntimeArchive(archive: string, input: CompiledRuntimeLock, stagingRoot: string, deadline?: OperationDeadline) {
  deadline?.remaining();
  const lock = compiledRuntimeLock(input);
  if (!compatibleNodeVersion(process.versions.node)) throw new Error("Unsupported Node runtime");
  verifyRuntimeArchive(archive, lock);
  mkdirSync(stagingRoot, { recursive: true, mode: 0o700 });
  const directory = mkdtempSync(join(realpathSync(stagingRoot), "candidate-"));
  const copy = join(directory, "runtime.tgz"), receipt = join(directory, "installation.json");
  durableJson(receipt, { version: 1, state: "preparing", lockDigest: digest(lock), lock });
  try {
    copyFileSync(archive, copy); chmodSync(copy, 0o400);
    const verified = verifyRuntimeArchive(copy, lock);
    execFileSync("npm", ["install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund", "--omit=dev", "--cache", join(directory, "cache"), copy], {
      cwd: directory, timeout: deadline?.remaining(60000) ?? 60000, maxBuffer: 1024 * 1024, stdio: ["ignore", "pipe", "pipe"],
    });
    const packageRoot = join(directory, "node_modules", "@organta", "project-governance");
    const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
    if (manifest.name !== lock.package || manifest.version !== lock.version || manifest.engines?.node !== lock.node ||
        manifest.bin?.["project-governance"] !== "dist/engine/src/cli.js") throw new Error("Installed package identity differs from lock");
    const executable = join(packageRoot, "dist/engine/src/cli.js");
    const dependencies = verifyRuntimeDependencies(packageRoot);
    const version = execFileSync(process.execPath, [executable, "--version"], {
      cwd: directory, timeout: deadline?.remaining(10000) ?? 10000, maxBuffer: 16384, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    if (version !== `project-governance ${lock.version}`) throw new Error("Installed runtime version readback differs from lock");
    const result = { version: 1, state: "staged", directory, executable, lockDigest: digest(lock), lock,
      archive: verified, dependencies, installedTree: runtimeTree(packageRoot), nodeVersion: process.versions.node, activation: "not-performed" };
    deadline?.remaining();
    durableJson(receipt, result);
    return result;
  } catch {
    durableJson(receipt, { version: 1, state: "failed", lockDigest: digest(lock), lock,
      reason: "Candidate installation or readback failed; active runtime unchanged" });
    throw new Error(`Candidate installation failed; inspect ${receipt}`);
  }
}
