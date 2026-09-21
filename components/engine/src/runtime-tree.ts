import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, lstatSync, openSync, readdirSync, readlinkSync, readSync, realpathSync } from "node:fs";
import { join, relative, isAbsolute } from "node:path";
import { digest } from "./core.ts";

/** Bind the installed payload, including internal symlinks and executable bits, without following outside links. */
export function runtimeTree(root: string) {
  root = realpathSync(root);
  const entries: Array<{ path: string; kind: string; identity: string; executable: number }> = [];
  let bytes = 0;
  const visit = (directory: string, depth: number) => {
    if (depth > 64) throw new Error("Runtime tree nesting exceeds budget");
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name), stat = lstatSync(path), child = relative(root, path).split("\\").join("/");
      if (entries.length >= 20000) throw new Error("Runtime tree exceeds entry budget");
      if (stat.isDirectory()) {
        entries.push({ path: child, kind: "directory", identity: "", executable: stat.mode & 0o111 });
        visit(path, depth + 1);
      } else if (stat.isSymbolicLink()) {
        const target = relative(root, realpathSync(path));
        if (target === ".." || target.startsWith("../") || isAbsolute(target)) throw new Error("Runtime link escapes installation");
        entries.push({ path: child, kind: "symlink", identity: readlinkSync(path), executable: 0 });
      } else {
        if (!stat.isFile() || stat.size > 64 * 1024 * 1024 || bytes + stat.size > 512 * 1024 * 1024) throw new Error("Runtime payload exceeds file budget");
        const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
        try {
          const before = fstatSync(fd, { bigint: true }), hash = createHash("sha256"), buffer = Buffer.alloc(65536);
          if (!before.isFile()) throw new Error("Runtime payload changed type");
          let length = 0, count;
          while ((count = readSync(fd, buffer, 0, buffer.length, null)) > 0) {
            length += count;
            if (length > 64 * 1024 * 1024 || bytes + length > 512 * 1024 * 1024) throw new Error("Runtime payload exceeds read budget");
            hash.update(buffer.subarray(0, count));
          }
          const after = fstatSync(fd, { bigint: true });
          if (before.size !== BigInt(length) || before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs) throw new Error("Runtime payload changed during inspection");
          bytes += length;
          entries.push({ path: child, kind: "file", identity: hash.digest("hex"), executable: Number(before.mode) & 0o111 });
        } finally { closeSync(fd); }
      }
    }
  };
  visit(root, 0);
  return { digest: digest(entries), entries: entries.length, bytes };
}
