import { createHash } from "node:crypto";
import { posix } from "node:path";
import { safeSubjectPath } from "../change-subject.ts";
import { canonical } from "../core.ts";
import { validSha512Integrity } from "./dependency-lock.ts";
import { dependency, npmExact, npmName, objectValue, type DependencyCoordinate, type DependencyDefect } from "./dependency-manifests.ts";
import { npmUrlMatches, safeRegistryBase, type NpmRegistries } from "./dependency-registry.ts";
import { dependencyMoment } from "./dependency-time.ts";

function sha256(bytes: Buffer): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function fields<Key extends string>(value: unknown, names: Key[]): Record<Key, string> {
  if (!objectValue(value) || Object.keys(value).length !== names.length ||
      names.some(name => !Object.hasOwn(value, name) || typeof value[name] !== "string" || !value[name] || value[name].length > 4096))
    throw new Error("Invalid npm range selection fields");
  return value as Record<Key, string>;
}

const numeric = /^(0|[1-9][0-9]*)$/u;
function versionParts(value: string) {
  if (value.length > 128 || !npmExact.test(value)) return null;
  const [core, ...suffix] = value.split("+")[0]!.split("-");
  const prerelease = suffix.length ? suffix.join("-").split(".") : [];
  if (prerelease.some(part => /^\d+$/u.test(part) && !numeric.test(part))) return null;
  return { core: core!.split(".").map(BigInt), prerelease };
}

/** Support prerelease caret constraints for positive major versions, the authorized surface. */
export function compatibleNpmPrereleaseRange(range: string, exact: string): boolean {
  if (!range.startsWith("^")) return false;
  const lower = versionParts(range.slice(1)), upper = versionParts(exact);
  if (!lower || !upper || !lower.prerelease.length || lower.core[0] === 0n || upper.core[0] !== lower.core[0]) return false;
  const difference = upper.core.findIndex((part, i) => part !== lower.core[i]);
  if (difference >= 0) return !upper.prerelease.length && upper.core[difference]! > lower.core[difference]!;
  if (!upper.prerelease.length) return true;
  for (const [i, part] of lower.prerelease.entries()) {
    const selected = upper.prerelease[i];
    if (selected === undefined) return false;
    if (selected === part) continue;
    const left = numeric.test(part), right = numeric.test(selected);
    if (left && right) return BigInt(selected) > BigInt(part);
    if (left !== right) return left;
    return selected > part;
  }
  return true;
}

const edgeFields = ["path", "field", "name", "range"] as const;
const targetFields = ["target", "selection_id"] as const;
const digestPattern = /^sha256:[a-f0-9]{64}$/u;
type EdgeTarget = Record<(typeof edgeFields | typeof targetFields)[number], string>;
const expectationFields = ["artifact_id", "proof_sha256", "version", "origin", "archive_sha256", "consumer_path", "consumer_sha256"] as const;
type ExpectedTarget = EdgeTarget & Record<typeof expectationFields[number], string>;
const targetKey = (row: EdgeTarget) => canonical([...edgeFields, ...targetFields].map(field => row[field]));

/** Expected coverage comes from the accepted signed-selection inventory, separately from the proof rows. */
export function readNpmRangeTargets(value: unknown) {
  if (!Array.isArray(value) || !value.length || value.length > 512) throw new Error("Expected npm range targets are missing or oversized");
  const targets = new Map<string, ExpectedTarget>();
  for (const raw of value) {
    const target = fields(raw, [...edgeFields, ...targetFields, ...expectationFields]);
    safeSubjectPath(target.path);
    safeSubjectPath(target.consumer_path);
    const id = targetKey(target);
    if (targets.has(id) || posix.basename(target.path) !== "package.json" || target.field !== "dependencies" ||
        !target.name.startsWith("@") || !npmName.test(target.name) || !compatibleNpmPrereleaseRange(target.range, target.version) ||
        !safeRegistryBase(target.origin) || posix.basename(target.consumer_path) !== "package.json" ||
        ![target.proof_sha256, target.archive_sha256, target.consumer_sha256].every(value => digestPattern.test(value)))
      throw new Error("Invalid or duplicate expected npm range target");
    targets.set(id, target);
  }
  return targets;
}

interface Selection {
  identity: string;
  manifestDigest: string;
  expires: bigint;
  coordinate: DependencyCoordinate;
  registry: string;
  consumer: { path: string; sha256: string };
  lock: { path: string; sha256: string; resolved: string; integrity: string };
}

/** The base-pinned receipt must prove exactly the independently expected targets and consumers. */
export function readNpmRangeSelections(bytes: Buffer, approvedDigest: string, registries: NpmRegistries,
  targets: ReturnType<typeof readNpmRangeTargets>) {
  if (sha256(bytes) !== approvedDigest) throw new Error("Npm range selection receipt differs from its approved digest");
  const document: unknown = JSON.parse(new TextDecoder("utf8", { fatal: true }).decode(bytes));
  if (!objectValue(document) || Object.keys(document).length !== 2 || document["version"] !== 2 ||
      !Array.isArray(document["selections"]) || document["selections"].length !== targets.size)
    throw new Error("Npm range selection receipt does not cover the expected targets");
  const byPath = new Map<string, Selection[]>(), seen = new Set<string>();
  for (const row of document["selections"]) {
    if (!objectValue(row) || Object.keys(row).length !== 4) throw new Error("Invalid npm range selection row");
    const edge = fields(row["edge"], [...edgeFields, "manifest_sha256", "expires_at"]);
    const selected = fields(row["selected"], [...targetFields, "artifact_id", "proof_sha256", "version", "resolved", "archive_sha256"]);
    const archive = fields(row["archive"], ["sha256", "integrity"]);
    const lock = fields(row["lock"], ["path", "sha256", "name", "version", "resolved", "integrity"]);
    const id = targetKey({ ...edge, ...selected });
    const target = targets.get(id);
    const { path, field, name, range, manifest_sha256: manifestDigest } = edge;
    const scope = name.split("/")[0]!;
    const suffix = `/-/${name.split("/").at(-1)}-${lock.version}.tgz`;
    const selectedIntegrity = "sha256-" + Buffer.from(selected.archive_sha256.slice(7), "hex").toString("base64");
    if (!target || seen.has(id) || selected.artifact_id !== target.artifact_id || selected.proof_sha256 !== target.proof_sha256 ||
        selected.version !== target.version || selected.archive_sha256 !== target.archive_sha256 || !Object.hasOwn(registries, scope) ||
        lock.path !== posix.join(posix.dirname(target.consumer_path), "package-lock.json") ||
        ![manifestDigest, selected.archive_sha256, lock.sha256].every(value => digestPattern.test(value)) ||
        archive.sha256 !== selected.archive_sha256 || (!validSha512Integrity(archive.integrity) && archive.integrity !== selectedIntegrity) ||
        lock.name !== name || lock.version !== selected.version || lock.resolved !== selected.resolved || lock.integrity !== archive.integrity ||
        !npmUrlMatches(name, suffix, lock.resolved, { [scope]: target.origin }) ||
        !npmUrlMatches(name, suffix, lock.resolved, registries))
      throw new Error("Npm range selection has incompatible range, target, variant, origin or archive identity");
    seen.add(id);
    const selections = byPath.get(path) ?? [];
    selections.push({ identity: canonical(["manifest", field, name, canonical(range)]), manifestDigest,
      expires: dependencyMoment(edge.expires_at, "npm range selection expires_at", true),
      coordinate: dependency(name, "npm", selected.version, "direct"), registry: target.origin.replace(/\/+$/u, ""),
      consumer: { path: target.consumer_path, sha256: target.consumer_sha256 }, lock });
    byPath.set(path, selections);
  }
  return byPath;
}

/** Prove every expected target against its immutable consumer, lock and range declaration. */
export function resolveNpmRanges(selections: Selection[], manifest: Buffer, defects: DependencyDefect[], asOf: bigint,
  load: (path: string) => { digest: string; document: Record<string, unknown> },
  signedIntegrity: (path: string, name: string) => string | undefined) {
  const identities = new Set(defects.map(defect => canonical(defect.identity))), manifestDigest = sha256(manifest);
  for (const row of selections) {
    if (row.manifestDigest !== manifestDigest || !identities.has(row.identity) || row.expires < asOf)
      throw new Error("Npm range selection expired or does not cover the captured manifest");
    const { name, version } = row.coordinate;
    const consumer = load(row.consumer.path), lock = load(row.lock.path);
    const packages = lock.document["packages"], lockVersion = lock.document["lockfileVersion"];
    if ((lockVersion !== 2 && lockVersion !== 3) || !objectValue(packages)) throw new Error("Npm range selection needs a modern consumer lock");
    const root = packages[""], node = packages[`node_modules/${name}`];
    if (consumer.digest !== row.consumer.sha256 || lock.digest !== row.lock.sha256 ||
        typeof consumer.document["name"] !== "string" || !objectValue(consumer.document["dependencies"]) || consumer.document["dependencies"][name] !== version ||
        !objectValue(root) || root["name"] !== consumer.document["name"] || root["version"] !== consumer.document["version"] ||
        !objectValue(root["dependencies"]) || root["dependencies"][name] !== version ||
        !objectValue(node) || (node["link"] !== undefined && node["link"] !== false) ||
        (node["name"] !== undefined && node["name"] !== name) || node["version"] !== version ||
        node["resolved"] !== row.lock.resolved || node["integrity"] !== row.lock.integrity ||
        (!validSha512Integrity(row.lock.integrity) && signedIntegrity(row.lock.path, name) !== row.lock.integrity))
      throw new Error("Npm range selection differs from its captured consumer or resolved lock");
  }
  return { admitted: new Set(selections.map(row => row.identity)), coordinates: selections.map(({ coordinate, registry }) => ({ coordinate, registry })) };
}

/** Preserve the literal bytes of each immutable consumer manifest and lock. */
export function npmSelectionInput(bytes: Buffer) {
  const document: unknown = JSON.parse(new TextDecoder("utf8", { fatal: true }).decode(bytes));
  if (!objectValue(document)) throw new Error("Npm range selection needs an object input");
  return { digest: sha256(bytes), document };
}
