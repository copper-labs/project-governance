import { createHash } from "node:crypto";
import { posix } from "node:path";
import { safeSubjectPath, worktreeBytes } from "../change-subject.ts";
import { SOURCE_CAPTURE_BATCH_MAX_BYTES, SOURCE_CAPTURE_MAX_BYTES } from "../source-capture-limits.ts";
import { dependency, npmExact, npmName, objectValue } from "./dependency-manifests.ts";
import { npmUrlMatches, safeRegistryBase, type NpmRegistries } from "./dependency-registry.ts";
import { dependencyMoment } from "./dependency-time.ts";
import type { readNpmRangeTargets } from "./dependency-range-selections.ts";

const sha256 = /^sha256:[0-9a-f]{64}$/u;
function shape(value: unknown, keys: string[]) {
  if (!objectValue(value) || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key)))
    throw new Error("Invalid signed npm lock approval");
  return value;
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value || value.length > 4096) throw new Error("Invalid signed npm lock field");
  return value;
}

/** The comparison-base policy records the inventory from the already verified signed selection. */
export function readSignedLockTargets(value: unknown, expected: ReturnType<typeof readNpmRangeTargets>) {
  if (!Array.isArray(value) || !value.length || value.length > 512) throw new Error("Invalid signed lock target set");
  const byLock = new Map<string, ReturnType<typeof signedTarget>>();
  for (const raw of value) {
    const row = signedTarget(raw, expected);
    if (byLock.has(row.lock)) throw new Error("Duplicate signed lock target");
    byLock.set(row.lock, row);
  }
  return byLock;
}

function signedTarget(raw: unknown, expected: ReturnType<typeof readNpmRangeTargets>) {
  const row = shape(raw, ["target", "selection_id", "proof_sha256", "consumer_path", "lock_sha256", "expires_at", "artifacts"]);
  const consumer = safeSubjectPath(text(row["consumer_path"])), lockDigest = text(row["lock_sha256"]);
  const target = [...expected.values()].find(item => item.target === row["target"] && item.selection_id === row["selection_id"] &&
    item.proof_sha256 === row["proof_sha256"] && item.consumer_path === consumer);
  if (!target || !sha256.test(lockDigest) || !Array.isArray(row["artifacts"]) ||
      !row["artifacts"].length || row["artifacts"].length > 512)
    throw new Error("Signed lock lacks an independently accepted selection or inventory");
  const scope = target.name.split("/")[0]!, names = new Set<string>();
  const artifacts = row["artifacts"].map(rawArtifact => {
    const item = shape(rawArtifact, ["name", "version", "artifact_id", "archive_sha256", "size_bytes"]);
    const name = text(item["name"]), version = text(item["version"]), artifactId = text(item["artifact_id"]);
    const digest = text(item["archive_sha256"]), size = item["size_bytes"];
    if (!name.startsWith(scope + "/") || !npmName.test(name) || !npmExact.test(version) || !sha256.test(digest) ||
        typeof size !== "number" || !Number.isSafeInteger(size) || size < 1 || size > SOURCE_CAPTURE_MAX_BYTES || names.has(name))
      throw new Error("Invalid or duplicate signed npm artifact");
    names.add(name);
    return { name, version, artifactId, digest, size };
  });
  if (!artifacts.some(a => a.name === target.name && a.version === target.version && a.artifactId === target.artifact_id && a.digest === target.archive_sha256))
    throw new Error("Signed inventory omits the accepted edge artifact");
  return { consumer, consumerDigest: target.consumer_sha256, lock: posix.join(posix.dirname(consumer), "package-lock.json"),
    lockDigest, registry: target.origin, target: target.target, selectionId: target.selection_id, proofDigest: target.proof_sha256, scope, expires: dependencyMoment(row["expires_at"], "signed lock expires_at", true), artifacts };
}

/** Rehash complete local archives from the retained store before authorizing individual lock nodes. */
export function retainedArchiveIntegrities(root: string | undefined) {
  const cache = new Map<string, { size: number; integrity: string }>();
  let remaining = SOURCE_CAPTURE_BATCH_MAX_BYTES;
  return (digest: string, size: number): string => {
    const known = cache.get(digest);
    if (known?.size === size) return known.integrity;
    if (!root || size > remaining) throw new Error("Signed archive absent or exceeds the proof budget");
    const content = worktreeBytes(root, digest.slice(7) + ".tgz", size);
    remaining -= size;
    if (content.type !== "regular" || content.bytes.length !== size) throw new Error("Archive size differs from the signed selection");
    const hash = createHash("sha256").update(content.bytes).digest();
    if ("sha256:" + hash.toString("hex") !== digest) throw new Error("Archive digest differs from the signed selection");
    const integrity = "sha256-" + hash.toString("base64");
    cache.set(digest, { size, integrity });
    return integrity;
  };
}

export function verifySignedLock(target: ReturnType<typeof signedTarget>, registries: NpmRegistries, asOf: bigint,
  load: (path: string) => { digest: string; document: Record<string, unknown> }, archive: ReturnType<typeof retainedArchiveIntegrities>) {
  const consumer = load(target.consumer), lock = load(target.lock);
  const packages = lock.document["packages"], lockVersion = lock.document["lockfileVersion"];
  if (target.expires < asOf || consumer.digest !== target.consumerDigest || lock.digest !== target.lockDigest ||
      (lockVersion !== 2 && lockVersion !== 3) || !objectValue(packages) || !Object.hasOwn(registries, target.scope))
    throw new Error("Signed lock approval expired or differs from the captured inputs");
  const root = packages[""], direct = consumer.document["dependencies"];
  if (!objectValue(root) || typeof consumer.document["name"] !== "string" || root["name"] !== consumer.document["name"] ||
      root["version"] !== consumer.document["version"] || !objectValue(root["dependencies"]) || !objectValue(direct))
    throw new Error("Signed lock differs from its approved consumer");
  const integrities = new Map<string, string>();
  const coordinates = [];
  for (const row of target.artifacts) {
    const location = `node_modules/${row.name}`, node = packages[location];
    const suffix = `/-/${row.name.split("/").at(-1)}-${row.version}.tgz`;
    if (!objectValue(node) || (node["link"] !== undefined && node["link"] !== false) ||
        (node["name"] !== undefined && node["name"] !== row.name) || node["version"] !== row.version ||
        direct[row.name] !== row.version || root["dependencies"][row.name] !== row.version ||
        !npmUrlMatches(row.name, suffix, node["resolved"], { [target.scope]: target.registry }) ||
        !npmUrlMatches(row.name, suffix, node["resolved"], registries))
      throw new Error("Signed artifact differs from the exact consumer lock node");
    const integrity = archive(row.digest, row.size);
    if (node["integrity"] !== integrity) throw new Error("Lock SHA-256 does not match the whole signed archive");
    integrities.set(location, integrity);
    const coordinate = dependency(row.name, "npm", row.version, node["dev"] === true ? "development" : node["optional"] === true ? "optional" : "transitive");
    coordinates.push({ coordinate, registry: target.registry.replace(/\/+$/u, "") });
  }
  const admission = { path: target.lock, lock_sha256: target.lockDigest, consumer_path: target.consumer,
    consumer_sha256: target.consumerDigest, target: target.target, selection_id: target.selectionId, proof_sha256: target.proofDigest,
    registry: target.registry, artifacts: target.artifacts.map(row => ({ name: row.name, version: row.version, artifact_id: row.artifactId,
      archive_sha256: row.digest, size_bytes: row.size })) };
  return { integrities, coordinates, admission };
}
