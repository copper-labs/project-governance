import { lstatSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { object } from "./core.ts";
import { narrativeFile } from "./narrative-inputs.ts";
import { PackagedCheckerAssets } from "./checker-assets.ts";
import { validateCommentRegistry } from "./checkers/comment-registry.ts";
import { commentAnalyzerSupported } from "./checkers/comments.ts";
import { localContextPath } from "./context-path-policy.ts";

/** Observe the existing checker owner. A valid declaration does not prove a hook ran the pack. */
export function documentationReadiness(workspace: string, assetRoot?: string) {
  try {
    const assets = new PackagedCheckerAssets(assetRoot);
    const document = (name: string) => {
      const path = `config/policies/${name}.yaml`;
      const authored = lstatSync(join(workspace, path), { throwIfNoEntry: false });
      return { path, value: authored ? object(parse(narrativeFile(workspace, path))) : assets.policy(name), schema: assets.schema(name) };
    };
    const policy = document("source-comments"), registry = document("source-comment-adapters"), waivers = document("source-comment-waivers");
    const checked = validateCommentRegistry(policy, registry, waivers,
      { versionSupported: commentAnalyzerSupported, fixtureExists: path => assets.fixture(path) !== null }, new Date().toISOString().slice(0, 10));
    const invalid = checked.findings.some(finding => finding.severity === "blocking");
    return { status: invalid ? "invalid-configuration" : "configured", mode: policy.value.mode,
      activeLanguages: invalid ? [] : [...checked.adapters].filter(([, adapter]) => adapter.status === "active").map(([language]) => language),
      advisoryLanguages: [...checked.adapters].filter(([, adapter]) => adapter.status !== "active").map(([language]) => language),
      sourceRoots: policy.value.source_roots, testScope: policy.value.test_scope, findingCount: checked.findings.length,
      proof: "policy-and-adapter-readiness-only", next: "Inspect plan for the applicable stage; run the existing comments and documentation packs on changed work." };
  } catch {
    return { status: "unavailable", activeLanguages: [], proof: "unknown",
      next: "Inspect source-comments, source-comment-adapters and source-comment-waivers through the existing comment checker." };
  }
}

/** Derive a bounded backfill shortlist from existing observations; never create another debt store. */
export class DocumentationObservations {
  observedEntries = 0;
  truncated = false;
  private candidates = new Map<string, { path: string; sourceDigest: string; observations: number; lastObservedAt: string; entryId: string }>();
  add(item: Record<string, unknown>) {
    if (typeof item.entryId !== "string" || !/^[a-f0-9]{64}$/u.test(item.entryId) || typeof item.createdAt !== "string") return;
    const index = item.sourceIndex as Record<string, unknown> | undefined;
    const documentation = index?.documentation as Record<string, unknown> | undefined;
    if (documentation?.status !== "observed-subset" || !Array.isArray(documentation.candidates)) return;
    this.observedEntries++;
    this.truncated ||= documentation.candidatesTruncated === true;
    const seen = new Set<string>();
    for (const candidate of documentation.candidates.slice(0, 16)) {
      if (!candidate || typeof candidate.path !== "string" || !localContextPath(candidate.path) || typeof candidate.sourceDigest !== "string" ||
          !/^sha256:[a-f0-9]{64}$/u.test(candidate.sourceDigest) || candidate.reason !== "overview-not-observed") continue;
      const key = `${candidate.path}:${candidate.sourceDigest}`;
      if (seen.has(key)) continue; seen.add(key);
      const prior = this.candidates.get(key);
      if (prior) {
        prior.observations++;
        if (prior.lastObservedAt < item.createdAt) { prior.lastObservedAt = item.createdAt; prior.entryId = item.entryId; }
      } else if (this.candidates.size < 64) this.candidates.set(key,
        { path: candidate.path, sourceDigest: candidate.sourceDigest, observations: 1, lastObservedAt: item.createdAt, entryId: item.entryId });
      else this.truncated = true;
    }
  }
  result(receiptScanTruncated: boolean) {
    const all = [...this.candidates.values()].sort((a, b) => b.observations - a.observations || b.lastObservedAt.localeCompare(a.lastObservedAt));
    return { status: this.observedEntries ? "observed-subset" : "not-observed", observedEntries: this.observedEntries,
      candidates: all.slice(0, 16), truncated: receiptScanTruncated || this.truncated || all.length > 16,
      freshness: "historical-source-digests; revalidate before backfill", qualityVerdict: "not-established",
      next: "Prefer areas being changed or repeatedly expanded; inspect module documentation before adding a file overview." };
  }
}
