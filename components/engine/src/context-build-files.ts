/** File roles are discovery clues, never resolved build graphs or executable instructions. */
import { posix } from "node:path";

/** Classify conventional authored build inputs, including text lockfiles and native bridge inputs. */
export function buildFileRole(path: string): string | undefined {
  const name = posix.basename(path).toLowerCase();
  if (/\.gradle(?:\.kts)?$/u.test(name)) return "gradle-script";
  if (name === "libs.versions.toml" || /(?:^|\/)gradle\/[^/]+\.versions\.toml$/u.test(path)) return "gradle-version-catalog";
  if (["gradle.properties", "gradle-wrapper.properties", "gradle.lockfile"].includes(name)) return "gradle-configuration";
  if (["cargo.toml", "cargo.lock", "rust-toolchain.toml", "build.rs"].includes(name) || /(?:^|\/)\.cargo\/config(?:\.toml)?$/u.test(path)) return "cargo-build";
  if (["package.swift", "package.resolved"].includes(name)) return "swift-package";
  if (/\.(?:pbxproj|xcconfig|xcscheme|xcworkspacedata|entitlements|plist)$/u.test(name)) return "apple-build-configuration";
  if (["podfile", "podfile.lock"].includes(name) || name.endsWith(".podspec")) return "cocoapods-build";
  if (["pubspec.yaml", "pubspec.lock", "analysis_options.yaml", "build.yaml"].includes(name)) return "dart-build";
  if (["gradlew", "gradlew.bat", "mvnw", "mvnw.cmd"].includes(name)) return "build-wrapper";
  if (name === "pom.xml" || /(?:^|\/)\.mvn\/(?:maven\.config|jvm\.config|wrapper\/maven-wrapper\.properties)$/u.test(path)) return "maven-build";
  if (["cmakelists.txt", "cmakepresets.json", "cmakeuserpresets.json"].includes(name) || name.endsWith(".cmake")) return "cmake-build";
  if (["makefile", "gnumakefile"].includes(name) || name.endsWith(".mk")) return "make-build";
  if (name === "androidmanifest.xml" || /^(?:proguard|consumer).*\.pro$/u.test(name)) return "android-build";
  if (name.endsWith(".def")) return "native-interop-definition";
  if (["package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "pnpm-workspace.yaml", "tsconfig.json"].includes(name)) return "node-build";
  if (["dockerfile", "justfile", "gemfile", "gemfile.lock", "requirements.txt", "pyproject.toml", "uv.lock"].includes(name)) return "build-support";
  return undefined;
}

/** Derive path-dependent hints at delivery, never in digest-reused content facts. */
export function buildPathClues(path: string): Record<string, string> {
  const buildRole = buildFileRole(path), sourceSet = /(?:^|\/)src\/([A-Za-z][A-Za-z0-9_]*(?:Main|Test))\//u.exec(path)?.[1];
  return { ...(buildRole ? { buildRole } : {}), ...(sourceSet && /\.(?:kt|kts|java)$/u.test(path) ? { sourceSetHint: sourceSet } : {}) };
}
