import { extname } from "node:path";
import { sourceFamilies } from "./checkers/comment-registry.ts";
import { structuredDocument } from "./structured-document.ts";
import { isMap, isScalar, parseDocument } from "yaml";

const bounded = (text: string, bytes: number) => Buffer.from(text).subarray(0, bytes).toString("utf8").replace(/\uFFFD$/u, "");
function firstMatches(text: string, expression: RegExp, count: number, bytes: number): string[] {
  const values: string[] = [];
  for (const match of text.matchAll(expression)) { values.push(bounded(match[1]!, bytes)); if (values.length === count) break; }
  return values;
}
/** Inspect a small preamble, not arbitrary comments or executable string literals in the file body. */
function leadingDocumentation(path: string, text: string): string {
  const python = /\.py$/iu.test(path);
  const hashComments = python || /\.(?:sh|bash|zsh|ya?ml|toml)$/iu.test(path) || /(?:^|\/)(?:Makefile|Dockerfile|Gemfile|Podfile|justfile)$/iu.test(path);
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
    const lines = rest.match(hashComments ? /^(?:#[^\n]*(?:\n|$))+/u : /^(?:\/\/[^\n]*(?:\n|$))+/u);
    if (lines) {
      rest = rest.slice(lines[0].length);
      if (/copyright|SPDX|licensed under|permission is hereby granted/iu.test(lines[0])) continue;
      const value = useful(lines[0].replace(hashComments ? /^#\s?/gmu : /^\/\/[/!]?\s?/gmu, ""));
      if (value) return value; continue;
    }
    // Preamble declarations/directives are not prose. A later literal doc comment may still be useful.
    const preamble = rest.match(/^(?:(?:import|from|package|using|use)\b[^\n]*|#(?:include|pragma|if\w*|elif|else|endif|define|undef|import)\b[^\n]*|#!?\[[^\n]*|["']use (?:strict|client|server)["'];?[^\n]*)(?:\n|$)/u);
    if (preamble) { rest = rest.slice(preamble[0].length); continue; }
    break;
  }
  return "";
}

/** Read literal configuration labels without resolving aliases or exposing arbitrary field values. */
function configurationClues(path: string, text: string) {
  const keys: string[] = [], purpose: string[] = [];
  const keepKey = (key: string) => /^[A-Za-z_][A-Za-z0-9_.-]{0,63}$/u.test(key);
  if (/\.(?:json|ya?ml)$/iu.test(path)) {
    try {
    if (/\.json$/iu.test(path)) JSON.parse(text);
    const document = parseDocument(text, { schema: "core", uniqueKeys: true });
    if (document.errors.length || document.warnings.length || !isMap(document.contents)) return { keys, purpose };
    for (const pair of document.contents.items) {
      if (!isScalar(pair.key) || typeof pair.key.value !== "string") continue;
      const key = pair.key.value;
      if (keys.length < 16 && keepKey(key)) keys.push(key);
      if (["name", "title", "description", "summary"].includes(key) && isScalar(pair.value) && typeof pair.value.value === "string")
        purpose.push(bounded(pair.value.value.replace(/\s+/gu, " ").trim(), 320));
    }
    } catch { /* Invalid or unsupported configuration remains a path, never invented prose. */ }
  } else if (/\.toml$/iu.test(path)) {
    for (const match of text.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_.-]{0,63})\s*=/gmu)) {
      if (keys.length === 16) break;
      keys.push(match[1]!);
    }
  }
  return { keys: [...new Set(keys)], purpose };
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
  const headings: string[] = [];
  let fence: string | null = null;
  if (markdown) for (const line of text.split(/\r?\n/u)) {
    const marker = line.match(/^\s*(`{3,}|~{3,})/u)?.[1];
    if (marker) { if (!fence) fence = marker; else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null; continue; }
    const heading = !fence && line.match(/^#{1,6}\s+(.+)$/u)?.[1];
    if (heading) headings.push(bounded(heading, 96));
    if (headings.length === 12) break;
  }
  const symbols = firstMatches(text, /(?:^|[;{}]\s*)\s*(?:(?:export|public|private|protected|static|async|abstract|open|final|internal)\s+)*(?:default\s+)?(?:function\s*\*?|class|interface|type|enum|struct|protocol|func|fun|def|fn|const|let|var)\s+([\p{L}_$][\p{L}\p{N}_$]*)/gmu, 12, 64);
  const frontmatter = markdown ? text.slice(0, 8192).match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u)?.[1] : undefined;
  let metadata: Record<string, unknown> = {}, metadataStatus = frontmatter === undefined ? "absent" : "parsed";
  if (frontmatter !== undefined) try {
    const parsed = structuredDocument(Buffer.from(frontmatter), "yaml");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Frontmatter is not a mapping");
    metadata = parsed as Record<string, unknown>;
  } catch { metadataStatus = "invalid"; }
  if (markdown && text.startsWith("---\n") && frontmatter === undefined) metadataStatus = "incomplete-or-over-limit";
  const summary = typeof metadata.summary === "string" ? metadata.summary.replace(/\s+/gu, " ").trim() : undefined;
  const configuration = configurationClues(path, text);
  const documentation = bounded(summary ?? (markdown ? "" : leadingDocumentation(path, text) || configuration.purpose.join("; ")), 320);
  const lifecycle: Record<string, string | string[]> = {};
  for (const key of ["status", "supersedes", "superseded_by", "replaced_by"]) {
    const value = metadata[key];
    if (typeof value === "string") lifecycle[key] = bounded(value, 256);
    else if (Array.isArray(value)) lifecycle[key] = value.filter((item): item is string => typeof item === "string").slice(0, 8).map(item => bounded(item, 256));
  }
  // All text remains untrusted quoted source. It is never promoted to policy or factual proof.
  return { text: headings.length || symbols.length || documentation || configuration.keys.length || Object.keys(lifecycle).length
    ? JSON.stringify({ path, headings, symbols: [...new Set(symbols)], documentation,
      ...(configuration.keys.length ? { configurationKeys: configuration.keys } : {}), ...(markdown ? { lifecycle, metadataStatus } : {}) }) : null,
    overviewObserved: Boolean(documentation.trim() && !/^(?:["']?\s*["']?|[|>][+-]?|["']?(?:todo|tbd|null)["']?)$/iu.test(documentation)),
    documentationApplicable: markdown || Boolean(sourceFamilies[extname(path).toLowerCase()]) };
}
