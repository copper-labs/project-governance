import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { join, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import type { AnySchema } from "ajv";
import type { CheckerAssets } from "./builtin-checks.ts";

/** Package-owned schemas and conformance fixtures never resolve through target configuration. */
export class PackagedCheckerAssets implements CheckerAssets {
  readonly root: string;
  constructor(root = fileURLToPath(new URL("../assets/defaults/", import.meta.url))) { this.root = realpathSync(root); }
  private read(path: string): string {
    const full = join(this.root, path), stat = lstatSync(full), resolved = realpathSync(full), child = relative(this.root, resolved);
    if (!stat.isFile() || stat.isSymbolicLink() || child.startsWith("..") || isAbsolute(child) || stat.size > 4 * 1024 * 1024) throw new Error("Invalid packaged checker asset");
    return new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(full));
  }
  policy(name: string): Record<string, unknown> {
    if (!/^[a-z][a-z0-9-]*$/u.test(name)) throw new Error("Invalid policy name");
    const value: unknown = parse(this.read(`policies/${name}.yaml`));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid packaged policy");
    return value as Record<string, unknown>;
  }
  schema(name: string): AnySchema {
    if (!/^[a-z][a-z0-9-]*$/u.test(name)) throw new Error("Invalid schema name");
    const value: unknown = JSON.parse(this.read(`schemas/${name}.schema.json`));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid packaged schema");
    return value as AnySchema;
  }
  fixture(path: string): string | null {
    const match = /^config\/validation\/fixtures\/comment-quality\/([A-Za-z0-9][A-Za-z0-9._-]*)$/u.exec(path);
    if (!match) return null;
    try { return this.read(`fixtures/comment-quality/${match[1]}`); } catch { return null; }
  }
}
