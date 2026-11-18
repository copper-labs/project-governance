import { createHash } from "node:crypto";
import { posix } from "node:path";
import { parse } from "yaml";
import { readSubjectSource, safeSubjectPath, SOURCE_RANGE_TRANSITION_PATH, type ChangeScope, type SubjectSource, type ValidationSubject } from "../change-subject.ts";
import { canonical, digest } from "../core.ts";
import { npmExact, npmName, objectValue, type DependencyDefect } from "./dependency-manifests.ts";
import { compatibleNpmPrereleaseRange } from "./dependency-range-selections.ts";

const edgeFields = ["path", "field", "name", "range"] as const;
const targetFields = [...edgeFields, "recipe", "framework", "os"] as const;
const providerFields = ["provider_path", "component_id", "artifact_id", "version"] as const;
const expectationFields = [...targetFields, ...providerFields] as const;
type Expected = Record<typeof expectationFields[number], string>;
type Binding = Expected & Record<"source_name" | "source_version", string>;
const hashPattern = /^sha256:[a-f0-9]{64}$/u;
const hash = (bytes: Buffer) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const targetKey = (row: Expected) => canonical(targetFields.map(field => row[field]));
function inputPath(path: unknown): string {
  if (typeof path !== "string" || /[*?\[\]]/u.test(path)) throw new Error("Invalid literal producer input path");
  return safeSubjectPath(path);
}

function strings<Key extends string>(value: unknown, keys: readonly Key[]): Record<Key, string> {
  if (!objectValue(value) || Object.keys(value).length !== keys.length ||
      keys.some(key => typeof value[key] !== "string" || !value[key] || value[key].length > 4096))
    throw new Error("Invalid source range proof fields");
  return value as Record<Key, string>;
}

/** The base policy owns the exhaustive per-recipe and per-OS expectation independently of its producer projection. */
export function readSourceRangeAuthority(value: unknown) {
  if (!objectValue(value) || Object.keys(value).length !== 3 ||
      typeof value["projection_sha256"] !== "string" || !hashPattern.test(value["projection_sha256"]) ||
      !Array.isArray(value["targets"]) || value["targets"].length < 1 || value["targets"].length > 512 ||
      !Array.isArray(value["inputs"]) || value["inputs"].length < 1 || value["inputs"].length > 512)
    throw new Error("Invalid source range authority");
  const inputs = new Set(value["inputs"].map(inputPath));
  if (inputs.size !== value["inputs"].length) throw new Error("Duplicate expected producer input");
  const targets = new Map<string, Expected>();
  for (const raw of value["targets"]) {
    const row = strings(raw, expectationFields);
    safeSubjectPath(row.path); safeSubjectPath(row.provider_path);
    const id = targetKey(row);
    if (targets.has(id) || row.path === row.provider_path || posix.basename(row.path) !== "package.json" ||
        posix.basename(row.provider_path) !== "package.json" || !inputs.has(row.provider_path) || row.field !== "dependencies" ||
        !row.name.startsWith("@") || !npmName.test(row.name) ||
        !compatibleNpmPrereleaseRange(row.range, row.version))
      throw new Error("Invalid or duplicate source range target");
    targets.set(id, row);
  }
  return { digest: value["projection_sha256"], targets, inputs };
}

/** Compare the pinned producer output to every independent expected binding before reading any source inputs. */
export function readSourceRangeProjection(bytes: Buffer, authority: ReturnType<typeof readSourceRangeAuthority>) {
  if (hash(bytes) !== authority.digest) throw new Error("Source range projection differs from the accepted bytes");
  const document: unknown = JSON.parse(new TextDecoder("utf8", { fatal: true }).decode(bytes));
  if (!objectValue(document) || Object.keys(document).length !== 3 || document["version"] !== 1 ||
      !Array.isArray(document["inputs"]) || document["inputs"].length !== authority.inputs.size ||
      !Array.isArray(document["bindings"]) || document["bindings"].length !== authority.targets.size)
    throw new Error("Source range projection does not cover the expected targets");
  const inputs = new Map<string, string>();
  for (const raw of document["inputs"]) {
    const input = strings(raw, ["path", "sha256"]);
    if (!authority.inputs.has(input.path) || !hashPattern.test(input.sha256) || inputs.has(input.path)) throw new Error("Invalid or duplicate producer input");
    inputs.set(input.path, input.sha256);
  }
  const byPath = new Map<string, Binding[]>(), seen = new Set<string>();
  for (const raw of document["bindings"]) {
    const row = strings(raw, [...expectationFields, "source_name", "source_version"]);
    const id = targetKey(row), expected = authority.targets.get(id);
    if (!expected || seen.has(id) || providerFields.some(field => row[field] !== expected[field]) ||
        !inputs.has(row.provider_path) || !npmName.test(row.source_name) || !npmExact.test(row.source_version))
      throw new Error("Source range projection differs from the accepted target or owner");
    seen.add(id);
    const bindings = byPath.get(row.path) ?? [];
    bindings.push(row);
    byPath.set(row.path, bindings);
  }
  return { inputs, byPath };
}

type SourceRangeProjection = ReturnType<typeof readSourceRangeProjection>;
const bindingRows = (projection: SourceRangeProjection) => [...projection.byPath.values()].flat();
const sameInputPaths = (prior: SourceRangeProjection, next: SourceRangeProjection) =>
  canonical([...prior.inputs.keys()].sort()) === canonical([...next.inputs.keys()].sort());

export function sameSourceRangeScope(prior: SourceRangeProjection, next: SourceRangeProjection) {
  return sameInputPaths(prior, next) && canonical(bindingRows(prior)) === canonical(bindingRows(next));
}

/** Pair exact rows on the original consumer and target identity, which cannot change. */
function bindingChanges(prior: SourceRangeProjection, next: SourceRangeProjection) {
  const identityFields = ["path", "field", "name", "recipe", "framework", "os"] as const;
  const key = (row: Binding) => canonical(identityFields.map(field => row[field]));
  const previousRows = bindingRows(prior), nextRows = bindingRows(next);
  const before = new Map(previousRows.map(row => [key(row), row]));
  const after = new Map(nextRows.map(row => [key(row), row]));
  if (before.size !== previousRows.length || after.size !== nextRows.length || before.size !== after.size)
    throw new Error("Source binding transition changed or duplicated its approved targets");
  return [...before.keys()].sort().flatMap(id => {
    const oldRow = before.get(id)!, newRow = after.get(id);
    if (!newRow || (["provider_path", "component_id", "artifact_id", "source_name"] as const).some(field => oldRow[field] !== newRow[field]))
      throw new Error("Source binding transition changed the approved package or producer owner");
    return canonical(oldRow) === canonical(newRow) ? [] : [{ before: oldRow, after: newRow }];
  });
}

function policyOutsideBindingChanges(bytes: string) {
  const policy: unknown = parse(bytes);
  if (!objectValue(policy) || !objectValue(policy.npm_source_ranges)) throw new Error("Invalid source binding policy");
  const { projection_sha256: _digest, targets: _targets, ...unchanged } = policy.npm_source_ranges;
  return canonical({ ...policy, npm_source_ranges: unchanged });
}

/** The comparison base binds both one-use routes to the exact tree that consumes its receipt. */
export function verifySourceRangeTransition(subject: ValidationSubject, scope: ChangeScope, receipt: SubjectSource,
  policyPath: string, priorDigest: string, nextDigest: string,
  prior: SourceRangeProjection, next: SourceRangeProjection): "hashes" | "bindings" {
  if (receipt.file_type !== "regular") throw new Error("Source projection approval must be a regular base file");
  const approval = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(readSubjectSource(subject.root, receipt, 4096))) as unknown;
  if (!objectValue(approval) || (approval.version !== 1 && approval.version !== 2)) throw new Error("Invalid source projection approval");
  const { version, ...fields } = approval;
  const common = ["prior_base", "candidate_tree", "previous_projection_sha256", "successor_projection_sha256"] as const;
  const row = version === 1 ? strings(fields, common)
    : strings(fields, [...common, "workspace_sha256", "binding_changes_sha256"] as const);
  if (priorDigest === nextDigest || row.previous_projection_sha256 !== priorDigest || row.successor_projection_sha256 !== nextDigest ||
      row.candidate_tree !== scope.candidate_tree || subject.source(SOURCE_RANGE_TRANSITION_PATH) ||
      !subject.isAdditionOnlyBase(row.prior_base, SOURCE_RANGE_TRANSITION_PATH))
    throw new Error("Source projection approval does not bind this base and candidate");
  const basePolicy = subject.baseSource(policyPath);
  if (!basePolicy) throw new Error("Original source range policy is missing");
  const oldPolicy = readSubjectSource(subject.root, basePolicy, 4 * 1024 * 1024).toString("utf8");
  const newPolicy = subject.read(policyPath, 4 * 1024 * 1024).toString("utf8");
  if (version === 2) {
    if (fields.workspace_sha256 !== hash(Buffer.from(subject.root, "utf8")) || !sameInputPaths(prior, next))
      throw new Error("Source binding transition changed the approved workspace or input paths");
    const changes = bindingChanges(prior, next);
    if (!changes.length || fields.binding_changes_sha256 !== digest(changes))
      throw new Error("Source binding transition differs from the approved old and new rows");
    if (policyOutsideBindingChanges(oldPolicy) !== policyOutsideBindingChanges(newPolicy))
      throw new Error("Source binding transition changed unrelated dependency policy");
    return "bindings";
  }
  if (!sameSourceRangeScope(prior, next)) throw new Error("Source projection refresh changed the approved paths or bindings");
  if (oldPolicy.replace(priorDigest, nextDigest) !== newPolicy)
    throw new Error("Source projection refresh changed the dependency policy outside the digest");
  return "hashes";
}

export function verifySourceRangeInputs(projection: ReturnType<typeof readSourceRangeProjection>, read: (path: string) => Buffer) {
  const providers = new Map<string, { name: unknown; version: unknown }>();
  const manifests = new Set([...projection.byPath.values()].flat().map(row => row.provider_path));
  for (const [path, expected] of projection.inputs) {
    const bytes = read(path);
    if (hash(bytes) !== expected) throw new Error("Captured producer input differs from the reviewed bytes");
    if (manifests.has(path)) {
      const value: unknown = JSON.parse(new TextDecoder("utf8", { fatal: true }).decode(bytes));
      if (!objectValue(value)) throw new Error("Invalid captured provider manifest");
      providers.set(path, { name: value["name"], version: value["version"] });
    }
  }
  for (const rows of projection.byPath.values()) for (const row of rows) {
    const provider = providers.get(row.provider_path);
    if (provider?.name !== row.source_name || provider.version !== row.source_version)
      throw new Error("Captured provider package differs from the producer projection");
  }
}

/** A binding change must describe the literal range in the captured consumer manifest. */
export function verifySourceRangeConsumers(projection: SourceRangeProjection, read: (path: string) => Buffer) {
  for (const [path, rows] of projection.byPath) {
    const manifest: unknown = JSON.parse(new TextDecoder("utf8", { fatal: true }).decode(read(path)));
    if (!objectValue(manifest) || !objectValue(manifest.dependencies)) throw new Error("Invalid captured consumer manifest");
    const dependencies = manifest.dependencies;
    if (rows.some(row => dependencies[row.name] !== row.range))
      throw new Error("Captured consumer range differs from the reviewed binding");
  }
}

/** A source receipt clears only its exact manifest format defects. It creates no published coordinate. */
export function admitSourceRanges(bindings: Binding[], defects: DependencyDefect[]) {
  const identities = new Set(defects.map(defect => canonical(defect.identity)));
  const admitted = new Set<string>(), rows: Expected[] = [];
  for (const row of bindings) {
    const identity = canonical(["manifest", row.field, row.name, canonical(row.range)]);
    if (!identities.has(identity)) continue;
    admitted.add(identity);
    const { source_name, source_version, ...binding } = row;
    rows.push(binding);
  }
  return { admitted, rows };
}


/** Select the existing dependency owner when an accepted producer input changes. */
export function approvedSourceRangeInputs(subject: ValidationSubject): string[] {
  const policy = subject.baseSource("config/policies/dependency-freshness.yaml");
  if (policy?.file_type !== "regular") return [];
  let document: unknown;
  try { document = parse(readSubjectSource(subject.root, policy, 4 * 1024 * 1024).toString("utf8")); }
  catch { return []; } // A malformed historical policy never grants authority.
  if (!objectValue(document) || !Object.hasOwn(document, "npm_source_ranges")) return [];
  const authority = readSourceRangeAuthority(document["npm_source_ranges"]);
  const proof = subject.baseSource("config/policies/dependency-source-ranges.yaml");
  if (proof?.file_type !== "regular") throw new Error("Accepted source range projection is absent");
  return [...readSourceRangeProjection(readSubjectSource(subject.root, proof, 4 * 1024 * 1024), authority).inputs.keys()];
}
