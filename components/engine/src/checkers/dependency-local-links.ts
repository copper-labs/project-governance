import { posix } from "node:path";
import { readSubjectSource, type ChangeScope, type SubjectSource, type ValidationSubject } from "../change-subject.ts";
import { npmExact, npmName, objectValue, parsePackageManifest, type DependencyDefect } from "./dependency-manifests.ts";
import { workspaceMatches } from "./dependency-workspaces.ts";

const jsonLimit = 4 * 1024 * 1024;
const localFields = new Set(["dependencies", "devDependencies", "optionalDependencies"]);
const relativeDirectory = /^(?:\.\/|(?:\.\.\/)+)(?:[A-Za-z0-9_@-][A-Za-z0-9_@.-]*\/)*[A-Za-z0-9_@-][A-Za-z0-9_@.-]*$/u;
const manifestPath = (path: string) => posix.basename(path) === "package.json" && !path.split("/").includes("node_modules");

function localTarget(path: string, defect: DependencyDefect) {
  const [kind, field, name, literal] = defect.identity;
  if (kind !== "manifest" || !field || !localFields.has(field) || !name || !npmName.test(name) || !literal) return;
  const spec: unknown = JSON.parse(literal);
  if (typeof spec !== "string" || !spec.startsWith("file:")) return;
  const relative = spec.slice(5);
  if (!relativeDirectory.test(relative) || /[.](?:tgz|tar[.]gz|tar)$/iu.test(relative)) return;
  const consumer = posix.dirname(path), owner = posix.normalize(posix.join(consumer, relative));
  if (owner === "." || owner === consumer || owner === ".." || owner.startsWith("../") ||
      owner.split("/").some(part => part === "node_modules" || part.endsWith("."))) return;
  return { name, field, spec, ownerPath: posix.join(owner, "package.json"), ownerInLock: posix.relative(consumer, owner),
    lockPath: posix.join(consumer, "package-lock.json"), shrinkwrapPath: posix.join(consumer, "npm-shrinkwrap.json") };
}

function immutableJson(subject: ValidationSubject, source?: SubjectSource | null) {
  if (source?.file_type !== "regular" || source.kind === "worktree") return;
  try {
    const value: unknown = JSON.parse(readSubjectSource(subject.root, source, jsonLimit).toString("utf8"));
    if (objectValue(value)) return value;
  } catch { /* Unavailable or malformed inputs do not establish a local resolution. */ }
}

function hasWorkspaceOwner(directory: string, lookup: (path: string) => Record<string, unknown> | undefined): boolean {
  // An npm workspace is installed by its enclosing root lock, not by the sibling lock.
  const ancestors = directory.split("/");
  while (directory !== "." && ancestors.length) {
    ancestors.pop();
    const root = ancestors.join("/") || ".";
    const raw = lookup(posix.join(root, "package.json"))?.workspaces;
    if (raw === undefined) continue;
    const patterns = objectValue(raw) ? raw.packages : raw;
    if (!Array.isArray(patterns) || patterns.some(pattern => typeof pattern !== "string" ||
      /[!{}[\]()\\]/u.test(pattern) || workspaceMatches(posix.relative(root, directory), pattern))) return true;
  }
  return false;
}

export interface TrackedNpmLink {
  path: string; field: string; name: string; spec: string; version: string; consumer_blob: string;
  owner_path: string; owner_blob: string; lock_path: string; lock_blob: string;
}
export function admitTrackedNpmLinks(subject: ValidationSubject, manifest: SubjectSource, defects: DependencyDefect[], base: boolean) {
  const lookup = (path: string) => base ? subject.baseSource(path) : subject.source(path);
  const admitted = new Set<DependencyDefect>();
  const rows: TrackedNpmLink[] = [];
  if (manifest.kind === "worktree" || !manifestPath(manifest.path)) return { admitted, rows };
  for (const defect of defects) {
    const edge = localTarget(manifest.path, defect);
    if (!edge || lookup(edge.shrinkwrapPath) ||
        hasWorkspaceOwner(posix.dirname(manifest.path), path => immutableJson(subject, lookup(path)))) continue;
    const ownerSource = lookup(edge.ownerPath), lockSource = lookup(edge.lockPath);
    if (!ownerSource || !lockSource) continue;
    const owner = immutableJson(subject, ownerSource), lock = immutableJson(subject, lockSource);
    if (!owner || owner.name !== edge.name || typeof owner.version !== "string" || !npmExact.test(owner.version) ||
        lock?.lockfileVersion !== 3 || !objectValue(lock.packages)) continue;
    const consumer = lock.packages[""], link = lock.packages["node_modules/" + edge.name], target = lock.packages[edge.ownerInLock];
    const declaration = objectValue(consumer) ? consumer[edge.field] : null;
    if (!objectValue(declaration) || declaration[edge.name] !== edge.spec ||
        !objectValue(link) || link.link !== true || link.resolved !== edge.ownerInLock || Object.hasOwn(link, "integrity") ||
        Object.hasOwn(link, "version") || !objectValue(target) || target.name !== edge.name || target.version !== owner.version ||
        Object.hasOwn(target, "resolved") || Object.hasOwn(target, "link") || Object.hasOwn(target, "integrity")) continue;
    admitted.add(defect);
    rows.push({ path: manifest.path, field: edge.field, name: edge.name, spec: edge.spec, version: owner.version,
      consumer_blob: manifest.identity, owner_path: edge.ownerPath, owner_blob: ownerSource.identity,
      lock_path: edge.lockPath, lock_blob: lockSource.identity });
  }
  return { admitted, rows };
}

/** Compare a previously accepted link again when its independent lock or owner changes. */
export function trackedNpmLinkConsumers(subject: ValidationSubject, scope: ChangeScope, changedPaths: Set<string>) {
  if (scope.mode !== "staged" && !scope.candidate_ref) return [];
  if (![...changedPaths].some(path => ["package.json", "package-lock.json", "npm-shrinkwrap.json"].includes(posix.basename(path)))) return [];
  return subject.paths().filter(path => {
    if (!manifestPath(path) || changedPaths.has(path)) return false;
    const source = subject.source(path);
    if (source?.file_type !== "regular" || source.kind === "worktree") return false;
    try {
      const { defects } = parsePackageManifest(path, readSubjectSource(subject.root, source, jsonLimit).toString("utf8"));
      return defects.some(defect => {
        const edge = localTarget(path, defect);
        if (!edge) return false;
        if (changedPaths.has(edge.ownerPath) || changedPaths.has(edge.lockPath) || changedPaths.has(edge.shrinkwrapPath)) return true;
        return hasWorkspaceOwner(posix.dirname(path), ancestor => changedPaths.has(ancestor) ? immutableJson(subject, subject.source(ancestor)) : undefined);
      });
    } catch { return false; }
  });
}
