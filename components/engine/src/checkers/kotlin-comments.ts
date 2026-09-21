import { glob } from "../planning.ts";
import type { Finding } from "../checker-results.ts";
import { kotlinDeclarations } from "./kotlin-parser.ts";
import { commentBefore, normalizedComment, overviewFindings, declarationFindings, type CommentPolicy } from "./comment-rules.ts";
import type { CommentSelection } from "./python-comments.ts";
const modifiers = new Set("abstract actual annotation companion const crossinline data enum expect external final fun infix inline inner internal lateinit noinline open operator override private protected public reified sealed suspend tailrec value vararg".split(" "));
function attachedKdoc(text: string, offset: number): string {
  const matches = [...text.slice(0, offset).matchAll(/\/\*\*[\s\S]*?\*\//gu)], last = matches.at(-1);
  if (!last) return "";
  const between = text.slice(last.index + last[0].length, offset).replace(/@[A-Za-z_]\w*(?:\s*\([^)]*\))?/gu, "")
    .replace(/\b[A-Za-z_]\w*\b/gu, word => modifiers.has(word) ? "" : word);
  return between.trim() ? "" : normalizedComment(last[0]);
}
function records(text: string) {
  const parsed = kotlinDeclarations(text), types = parsed.filter(item => item.kind === "type");
  return parsed.map(declaration => {
    const owners = types.filter(item => item !== declaration && item.line <= declaration.line && declaration.line <= item.endLine)
      .sort((a, b) => a.line - b.line || b.endLine - a.endLine);
    return { declaration, identity: [...owners.map(item => item.name), declaration.signature].join("."), public: declaration.public && owners.every(item => item.public) };
  });
}
/** Preserve KDoc attachment, enclosing visibility and signature-based change ratcheting. */
export function kotlinCommentFindings(path: string, source: string, before: string | null,
  policy: CommentPolicy & { require_type_context_paragraph?: boolean }, selection: CommentSelection): Finding[] {
  const lines = source.split(/\r\n|[\n\r\v\f\x1c-\x1e\x85\u2028\u2029]/u);
  const firstCode = lines.findIndex(line => line.trim() && !/^\s*(?:\/\/|\/\*|\*)/u.test(line));
  const findings = overviewFindings(commentBefore(lines, firstCode < 0 ? lines.length + 1 : firstCode + 1), path, policy, "kotlin", selection.overviewBlocking);
  const includePrivate = (policy.boundary_globs ?? []).some(pattern => glob(path, pattern));
  const previous = before === null ? null : new Set(records(before).filter(item => includePrivate || item.public).map(item => item.identity));
  for (const item of records(source)) {
    if (!includePrivate && !item.public) continue;
    const declaration = item.declaration;
    const blocking = selection.enforceAll || (previous !== null && !previous.has(item.identity)) || selection.ranges.some(([start, end]) => declaration.line <= end && declaration.headerEndLine >= start);
    findings.push(...declarationFindings(attachedKdoc(source, declaration.offset), { path, line: declaration.line, adapter: "kotlin", declaration: item.identity },
      declaration.kind, declaration.name, declaration.kind === "type", blocking, policy.require_type_context_paragraph ?? false));
  }
  return findings;
}
