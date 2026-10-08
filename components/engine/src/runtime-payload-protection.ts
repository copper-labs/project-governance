import { chmodSync, lstatSync, readdirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { runtimeTree } from "./runtime-tree.ts";

/** Only staging calls this on its freshly installed, inactive package. Integrity remains authoritative. */
export function protectRuntimePayload(root: string) {
  root = realpathSync(root);
  // Validate the complete tree before chmod: an escaping link must not change an outside target.
  const before = runtimeTree(root);
  const paths: string[] = [];
  const collect = (path: string) => {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) return;
    if (stat.isDirectory()) for (const name of readdirSync(path)) collect(join(path, name));
    else if (stat.nlink !== 1 || (process.geteuid && stat.uid !== process.geteuid()))
      throw new Error("Runtime protection requires exclusively owned files");
    paths.push(path);
  };
  collect(root);
  for (const path of paths) {
    const stat = lstatSync(path);
    // Preserve read and executable bits; the owner can still deliberately restore write access.
    chmodSync(path, stat.mode & 0o777 & ~0o222);
  }
  const after = runtimeTree(root);
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("Runtime payload changed during protection");
  return after;
}
