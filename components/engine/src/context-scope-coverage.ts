import { execFileSync } from "node:child_process";
import { localContextPath } from "./context-path-policy.ts";
import { matchesPackPath } from "./planning.ts";
import type { DecisionSettings } from "./decision-settings.ts";

/** Inventory names only; doctor must not capture source, rebuild an index or widen disclosure. */
export function contextScopeCoverage(workspace: string, settings: DecisionSettings) {
  try {
    const names = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
      { cwd: workspace, encoding: "utf8", timeout: 1000, maxBuffer: 16 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
    const paths = [...new Set(names.split("\0").filter(path => path && localContextPath(path)))].sort();
    if (paths.length > 100000) throw new Error("Inventory exceeds diagnostic bound");
    const metadata = paths.filter(path => settings.legacy.allowedDataClasses.includes("metadata") && matchesPackPath(path, settings.allowedMetadataPaths ?? []));
    const source = paths.filter(path => settings.legacy.allowedDataClasses.includes("source") && matchesPackPath(path, settings.legacy.allowedSourcePaths ?? []));
    const metadataSet = new Set(metadata), sourceSet = new Set(source);
    const metadataMissing = paths.filter(path => !metadataSet.has(path)), sourceMissing = paths.filter(path => !sourceSet.has(path));
    const enabled = settings.mode !== "off" && settings.consumers.DL03.mode !== "off";
    return { status: !paths.length ? "empty" : metadataMissing.length || sourceMissing.length ? "restricted" : "covered",
      enabled, eligibleCount: paths.length, metadataPermittedCount: metadata.length, sourcePermittedCount: source.length,
      metadataNotPermittedCount: metadataMissing.length, sourceNotPermittedCount: sourceMissing.length,
      metadataNotPermittedPreview: metadataMissing.slice(0, 16), sourceNotPermittedPreview: sourceMissing.slice(0, 16),
      previewTruncated: metadataMissing.length > 16 || sourceMissing.length > 16,
      next: "Review newly authored knowledge and skills against allowed_metadata_paths and allowed_source_paths. Approve intended paths explicitly; restricted disclosure can be intentional and is never widened automatically.",
      inventory: "local-git-paths-only", mutation: "none" };
  } catch { return { status: "unavailable", enabled: settings.mode !== "off", next: "Verify the Git worktree and ignore rules before claiming hosted inventory coverage.", mutation: "none" }; }
}
