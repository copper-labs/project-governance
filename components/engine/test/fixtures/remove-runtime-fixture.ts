import { chmodSync, lstatSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

/** Test-only disposal of an owned synthetic root; never follows links or alters a real generation. */
export function removeRuntimeFixture(root: string) {
  const visit = (path: string) => {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) return;
    if (stat.isDirectory()) { chmodSync(path, stat.mode | 0o700); for (const name of readdirSync(path)) visit(join(path, name)); }
  };
  visit(root); rmSync(root, { recursive: true, force: true });
}
