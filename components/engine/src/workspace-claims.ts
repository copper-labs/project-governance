import { realpathSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { canonical, object, text } from "./core.ts";

const PREFIX = "workspace-v1:";
interface Root { path: string; ancestry: string[] }
interface Claim { id: string; access: "reader" | "writer" | "exclusive"; roots: Root[]; session: string | null }

/** Filesystem identities detect aliases and parent/child overlap without locking unrelated siblings. */
export function workspaceClaim(roots: string[], access: Claim["access"], id: string, session?: { provider: string; conversationId: string }): string {
  if (!Array.isArray(roots) || !roots.length || roots.length > 64) throw new Error("Workspace claim needs 1..64 roots");
  if (!["reader", "writer", "exclusive"].includes(access)) throw new Error("Invalid workspace access");
  const resolved = [...new Set(roots.map(root => realpathSync(text(root, "workspace root"))))].sort();
  const entries = resolved.map(path => {
    const ancestry: string[] = [];
    for (let current = path;; current = dirname(current)) {
      const stat = statSync(current, { bigint: true });
      if (!stat.isDirectory()) throw new Error("Workspace root must be a directory");
      ancestry.push(`${stat.dev}:${stat.ino}`);
      if (dirname(current) === current) break;
    }
    return { path, ancestry };
  });
  const value: Claim = { id: text(id, "workspace claim id", 256), access, roots: entries, session: session ? canonical({ provider: text(session.provider, "provider", 64), conversationId: text(session.conversationId, "conversation", 256) }) : null };
  const encoded = PREFIX + canonical(value);
  if (encoded.length > 65536) throw new Error("Workspace claim exceeds 64 KiB");
  return encoded;
}

function parse(resource: string): Claim | null {
  if (!resource.startsWith(PREFIX)) return null;
  const raw = object(JSON.parse(resource.slice(PREFIX.length)), "workspace claim");
  text(raw.id, "workspace claim id", 256);
  if (!["reader", "writer", "exclusive"].includes(String(raw.access)) || !Array.isArray(raw.roots) || !raw.roots.length || raw.roots.length > 64 ||
      (raw.session !== null && typeof raw.session !== "string")) throw new Error("Invalid workspace claim");
  for (const entry of raw.roots) {
    const root = object(entry);
    text(root.path, "workspace path");
    if (!Array.isArray(root.ancestry) || !root.ancestry.length || root.ancestry.some(value => typeof value !== "string" || !/^\d+:\d+$/u.test(value))) throw new Error("Invalid workspace ancestry");
  }
  return raw as unknown as Claim;
}

/** Reader/writer coexistence is explicit; exclusive access and matching sessions always serialize. */
export function workspaceClaimsConflict(left: string, right: string): boolean {
  const a = parse(left), b = parse(right);
  if (!a || !b) return false;
  if (a.session !== null && a.session === b.session) return true;
  if (a.access !== "exclusive" && b.access !== "exclusive" && !(a.access === "writer" && b.access === "writer")) return false;
  return a.roots.some(root => b.roots.some(other => root.ancestry.includes(other.ancestry[0]!) || other.ancestry.includes(root.ancestry[0]!)));
}
