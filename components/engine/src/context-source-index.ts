import { extname } from "node:path";
import { sourceFamilies } from "./checkers/comment-registry.ts";

const bounded = (text: string, bytes: number) => Buffer.from(text).subarray(0, bytes).toString("utf8").replace(/\uFFFD$/u, "");
function firstMatches(text: string, expression: RegExp, count: number, bytes: number): string[] {
  const values: string[] = [];
  for (const match of text.matchAll(expression)) { values.push(bounded(match[1]!, bytes)); if (values.length === count) break; }
  return values;
}
/** Inspect a small preamble, not arbitrary comments or executable string literals in the file body. */
function leadingDocumentation(path: string, text: string): string {
  const python = /\.py$/iu.test(path);
  let rest = text.slice(0, 4096).replace(/^\uFEFF/u, "");
  const useful = (comment: string) => comment.replace(/^\s*\*\s?/gmu, " ").split("\n")
    .filter(line => !/^\s*(?:copyright|SPDX|licensed under|eslint[- ]|@ts-|noinspection|noqa\b|type:\s*ignore|pylint|ruff:|flake8|coding\s*[:=]|-\*-|region\b|endregion\b|swiftlint|sourceMappingURL)/iu.test(line))
    .join(" ").replace(/\s+/gu, " ").trim();
  for (let step = 0; step < 64 && rest; step++) {
    rest = rest.trimStart();
    const block = rest.match(/^\/\*\*?([\s\S]*?)\*\//u);
    const docstring = python ? rest.match(/^(?:[ru])?(?:"""([\s\S]*?)"""|'''([\s\S]*?)''')/iu) : null;
    if (block || docstring) {
      const match = (block ?? docstring)!;
      const raw = match.slice(1).find(value => value !== undefined) ?? "";
      rest = rest.slice(match[0].length);
      if (/copyright|SPDX|licensed under/iu.test(raw)) continue;
      const value = useful(raw); if (value) return value; continue;
    }
    const shebang = rest.match(/^#!\s*\/[^\n]*(?:\n|$)/u);
    if (shebang) { rest = rest.slice(shebang[0].length); continue; }
    const lines = rest.match(python ? /^(?:#[^\n]*(?:\n|$))+/u : /^(?:\/\/[^\n]*(?:\n|$))+/u);
    if (lines) {
      rest = rest.slice(lines[0].length);
      if (/copyright|SPDX|licensed under|permission is hereby granted/iu.test(lines[0])) continue;
      const value = useful(lines[0].replace(python ? /^#\s?/gmu : /^\/\/[/!]?\s?/gmu, ""));
      if (value) return value; continue;
    }
    // Preamble declarations/directives are not prose. A later literal doc comment may still be useful.
    const preamble = rest.match(/^(?:(?:import|from|package|using|use)\b[^\n]*|#(?:include|pragma|if\w*|elif|else|endif|define|undef|import)\b[^\n]*|#!?\[[^\n]*|["']use (?:strict|client|server)["'];?[^\n]*)(?:\n|$)/u);
    if (preamble) { rest = rest.slice(preamble[0].length); continue; }
    break;
  }
  return "";
}

/** Literal source clues improve misleading filenames without inventing a second description owner. */
export function sourceDescription(path: string, bytes: Buffer): string | null {
  return sourceClues(path, bytes)?.text ?? null;
}

export function sourceClues(path: string, bytes: Buffer) {
  if (bytes.includes(0)) return null;
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { return null; }
  const markdown = /\.mdx?$/iu.test(path);
  const headings = markdown ? firstMatches(text, /^#{1,4}\s+(.+)$/gmu, 6, 96) : [];
  const symbols = firstMatches(text, /(?:^|[;{}]\s*)\s*(?:(?:export|public|private|protected|static|async|abstract|open|final|internal)\s+)*(?:default\s+)?(?:function\s*\*?|class|interface|type|enum|struct|protocol|func|fun|def|fn|const|let|var)\s+([\p{L}_$][\p{L}\p{N}_$]*)/gmu, 12, 64);
  const frontmatter = markdown ? text.slice(0, 8192).match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u)?.[1] : undefined;
  const summary = frontmatter?.match(/^summary:\s*(.+)$/mu)?.[1];
  const documentation = bounded(summary ?? (markdown ? "" : leadingDocumentation(path, text)), 320);
  // All text remains untrusted quoted source. It is never promoted to policy or factual proof.
  return { text: headings.length || symbols.length || documentation
    ? JSON.stringify({ path, headings, symbols: [...new Set(symbols)], documentation }) : null,
    overviewObserved: Boolean(documentation.trim() && !/^(?:["']?\s*["']?|["']?(?:todo|tbd|null)["']?)$/iu.test(documentation)),
    documentationApplicable: markdown || Boolean(sourceFamilies[extname(path).toLowerCase()]) };
}
