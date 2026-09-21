import { posix } from "node:path";
import type { ValidationSubject } from "./change-subject.ts";
import { digest } from "./core.ts";

export interface RepositoryPackage {
  root: string; manifest: string; identity: string; name: string | null;
  targets: string[]; dependencies: string[];
}

/** A disposable structural projection, never dependency closure or execution authority. */
export function repositoryMap(subject: ValidationSubject) {
  const paths = subject.paths().sort();
  if (paths.length > 100000) throw new Error("Repository map exceeds its path budget");
  const packages: RepositoryPackage[] = [], issues: string[] = [];
  const manifests = paths.filter(path => /(?:^|\/)(?:package\.json|pubspec\.yaml|Cargo\.toml|Package\.swift|build\.gradle(?:\.kts)?|pyproject\.toml)$/u.test(path));
  if (manifests.length > 1000) throw new Error("Repository map exceeds its manifest budget");
  for (const manifest of manifests) {
    const source = subject.source(manifest);
    if (!source || source.file_type !== "regular") { issues.push(`${manifest}: ordinary manifest unavailable`); continue; }
    const entry: RepositoryPackage = { root: posix.dirname(manifest), manifest, identity: source.identity, name: null, targets: [], dependencies: [] };
    if (posix.basename(manifest) === "package.json") {
      try {
        const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(subject.read(manifest, 1024 * 1024)));
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
        const object = value as Record<string, unknown>;
        entry.name = typeof object.name === "string" ? object.name : null;
        const keys = (field: string) => {
          const item = object[field];
          if (item === undefined) return [];
          if (!item || typeof item !== "object" || Array.isArray(item) || Object.values(item).some(v => typeof v !== "string")) throw new Error();
          return Object.keys(item);
        };
        entry.targets = keys("scripts").sort();
        entry.dependencies = [...new Set([ ...keys("dependencies"), ...keys("devDependencies"), ...keys("peerDependencies"), ...keys("optionalDependencies") ])].sort();
      } catch { issues.push(`${manifest}: unreadable or invalid package metadata`); }
    }
    packages.push(entry);
  }
  const owners = paths.filter(path => /(?:^|\/)(?:AGENTS\.md|CODEOWNERS)$/u.test(path));
  const documents = paths.filter(path => /\.md$/iu.test(path));
  const tests = paths.filter(path => /(?:^|\/)(?:tests?|__tests__)\/|\.(?:test|spec)\.[^/]+$/u.test(path));
  const map = { version: 1, workspace: subject.root, packages, owners, documents, tests, pathDigest: digest(paths), issues,
    limits: "Path and manifest discovery only; non-npm targets and relationships are not parsed; ownership files are references, not interpreted grants." };
  return { ...map, mapDigest: digest(map) };
}
