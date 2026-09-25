import { posix } from "node:path";
import { safeSubjectPath } from "./change-subject.ts";

/** Automatic retrieval never discovers credentials, dependencies or generated payloads. */
export function localContextPath(path: string): boolean {
  try { safeSubjectPath(path); } catch { return false; }
  if (path.length > 128 || /[\x00-\x1f\\]/u.test(path)) return false;
  const parts = path.toLowerCase().split("/"), name = parts.at(-1)!;
  if (path.startsWith("config/governance/")) return false;
  if (parts.some(part => [".git", ".governance", ".harness", ".codex", ".claude", ".agent-context", ".env", "node_modules", "vendor", "pods", "build", "dist", "coverage", ".next", ".gradle", "deriveddata", "generated", "secrets", "credentials"].includes(part))) return false;
  if (/^(?:\.env(?:\..*)?|credentials(?:\..*)?|secrets?(?:\..*)?|id_(?:rsa|ed25519)|\.npmrc|\.netrc)$/u.test(name) ||
      /(?:\.min\.[cm]?js|\.map|\.lock|\.pem|\.key|\.p12|\.pfx|\.keystore|\.sqlite|\.db)$/u.test(name)) return false;
  return [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".kt", ".kts", ".swift", ".m", ".mm", ".h", ".c", ".cpp", ".rs", ".go", ".java", ".dart", ".rb", ".sh", ".bash", ".zsh", ".md", ".mdx", ".txt", ".json", ".yaml", ".yml", ".toml", ".xml", ".html", ".css", ".scss", ".sql", ".graphql", ".proto"].includes(posix.extname(name)) ||
    ["makefile", "dockerfile", "gemfile", "podfile", "justfile"].includes(name);
}
