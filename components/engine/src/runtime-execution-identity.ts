import { dirname, join } from "node:path";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { RELEASE_VERSION } from "./release-version.ts";
import { inspectRuntimeGeneration } from "./runtime-inspection.ts";

export interface RuntimeExecutionIdentity { runtimeVersion: string; archiveDigest: string | null }
let captured: RuntimeExecutionIdentity | undefined;

/** Capture this executing package's original verified generation, never an adopter's current lock. */
export function runtimeExecutionIdentity(): RuntimeExecutionIdentity {
  if (!captured) {
    captured = { runtimeVersion: RELEASE_VERSION, archiveDigest: null };
    try {
      const module = realpathSync(fileURLToPath(import.meta.url));
      const packageRoot = realpathSync(fileURLToPath(new URL("../../../", import.meta.url)));
      const generation = dirname(dirname(dirname(packageRoot)));
      if (packageRoot !== join(generation, "node_modules/@organta/project-governance") ||
          ![join(packageRoot, "dist/engine/src/runtime-execution-identity.js"), join(packageRoot, "dist/engine/src/runtime-execution-identity.ts")].includes(module)) return { ...captured };
      const original = inspectRuntimeGeneration(generation);
      if (original.runtimeVersion === RELEASE_VERSION) captured = { runtimeVersion: original.runtimeVersion, archiveDigest: original.archiveDigest };
    } catch { /* Source, plain npm payloads and unverified generations keep exact archive identity unknown. */ }
  }
  return { ...captured };
}
