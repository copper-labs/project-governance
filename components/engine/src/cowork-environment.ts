import { realpathSync } from "node:fs";
import { isAbsolute, relative, delimiter } from "node:path";

/** Project scripts must not replace Git or other host executables through captured PATH. */
export function coworkHostPath(value: string, roots: string[]): string {
  return value.split(delimiter).filter(entry => {
    if (!isAbsolute(entry)) return false;
    try {
      const actual = realpathSync(entry);
      return roots.every(root => {
        const rel = relative(root, actual);
        return rel === ".." || rel.startsWith("../") || isAbsolute(rel);
      });
    } catch { return false; }
  }).join(delimiter);
}
