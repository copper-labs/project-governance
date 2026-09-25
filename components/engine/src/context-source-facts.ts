/** Literal syntax facts for the disposable index. No build, type resolution or generated prose. */
import ts from "typescript";
import { extname, posix } from "node:path";
import { createHash } from "node:crypto";
import { sourceClues } from "./context-source-index.ts";
import { localDocumentLinks } from "./checkers/document-links.ts";

export const SOURCE_EXTRACTOR = "literal-syntax-2";
export interface SourceSpan { kind: string; name: string; signature: string; start: number; end: number }
export interface SourceLink { kind: "import" | "export" | "require" | "reference" | "dynamic-import" | "document"; target: string; line: number }
export interface SourceFacts {
  digest: string; language: string; bytes: number; descriptor: string | null;
  coverage: "syntax" | "syntax-partial" | "markdown" | "heuristic" | "unavailable";
  spans: SourceSpan[]; links: SourceLink[]; documentationApplicable: boolean; overviewObserved: boolean;
}
const bounded = (value: string, size: number) => Buffer.from(value).subarray(0, size).toString("utf8").replace(/\uFFFD$/u, "");
export function extractSourceFacts(path: string, bytes: Buffer): SourceFacts {
  const extension = extname(path).toLowerCase(), clues = sourceClues(path, bytes);
  const facts: SourceFacts = { digest: "sha256:" + createHash("sha256").update(bytes).digest("hex"), language: extension.slice(1), bytes: bytes.length,
    descriptor: clues?.text ?? null, coverage: clues ? "heuristic" : "unavailable", spans: [], links: [],
    documentationApplicable: clues?.documentationApplicable ?? false, overviewObserved: clues?.overviewObserved ?? false };
  if (!clues) return facts;
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (/^\.(?:[cm]?[jt]s|[jt]sx)$/u.test(extension)) {
    const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
    let nodes = 0, limited = false;
    const line = (offset: number) => file.getLineAndCharacterOfPosition(offset).line + 1;
    const declaration = (node: ts.Node) => {
      if (facts.spans.length >= 96) { limited = true; return; }
      if (!(ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node) ||
          ts.isTypeAliasDeclaration(node) || ts.isEnumDeclaration(node) || ts.isVariableDeclaration(node) || ts.isMethodDeclaration(node))) return;
      if (!node.name || !ts.isIdentifier(node.name)) return;
      const name = node.name.text, start = node.getStart(file);
      const parameters = ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) ? "(" + node.parameters.map(parameter =>
        (ts.isIdentifier(parameter.name) ? parameter.name.text : "<destructured>") + (parameter.type ? `: ${parameter.type.getText(file)}` : "")).join(", ") + ")" : "";
      const type = !ts.isTypeAliasDeclaration(node) && "type" in node && node.type ? `: ${node.type.getText(file)}` : "";
      facts.spans.push({ kind: ts.SyntaxKind[node.kind], name: bounded(name, 96), signature: bounded(name + parameters + type, 256), start: line(start), end: line(node.end) });
    };
    // Top-level declarations first. Function locals can neither crowd them out nor seed retrieval.
    const containers: Array<ts.SourceFile | ts.ModuleBlock> = [file], classes: Array<ts.ClassDeclaration | ts.InterfaceDeclaration> = [];
    while (containers.length) for (const statement of containers.pop()!.statements) {
      if (ts.isVariableStatement(statement)) for (const item of statement.declarationList.declarations) declaration(item);
      else declaration(statement);
      if (ts.isClassDeclaration(statement) || ts.isInterfaceDeclaration(statement)) classes.push(statement);
      if (ts.isModuleDeclaration(statement)) {
        let body = statement.body;
        while (body && ts.isModuleDeclaration(body)) body = body.body;
        if (body && ts.isModuleBlock(body)) containers.push(body);
      }
    }
    for (const statement of classes) for (const member of statement.members) declaration(member);
    const visit = (node: ts.Node) => {
      if (++nodes > 20000 || facts.links.length >= 128) { limited = true; return; }
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        if (node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) facts.links.push({ kind: ts.isImportDeclaration(node) ? "import" : "export",
          target: node.moduleSpecifier.text, line: line(node.getStart(file)) });
      } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        facts.links.push({ kind: "dynamic-import", target: node.arguments[0] && ts.isStringLiteralLike(node.arguments[0]) ? node.arguments[0].text : "<expression>", line: line(node.getStart(file)) });
      } else if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "require") {
        const literal = node.arguments[0] && ts.isStringLiteralLike(node.arguments[0]);
        facts.links.push({ kind: literal ? "require" : "dynamic-import", target: literal ? (node.arguments[0] as ts.StringLiteralLike).text : "<expression>", line: line(node.getStart(file)) });
      } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
        const expression = node.moduleReference.expression;
        facts.links.push({ kind: "require", target: expression && ts.isStringLiteralLike(expression) ? expression.text : "<expression>", line: line(node.getStart(file)) });
      } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteralLike(node.argument.literal)) {
        facts.links.push({ kind: "import", target: node.argument.literal.text, line: line(node.getStart(file)) });
      }
    };
    const pending: ts.Node[] = [file];
    while (pending.length && nodes <= 20000 && facts.links.length < 128) {
      const node = pending.pop()!; visit(node); const children: ts.Node[] = [];
      ts.forEachChild(node, child => { children.push(child); }); pending.push(...children.reverse());
    }
    if (pending.length) limited = true;
    for (const reference of file.referencedFiles.slice(0, 32)) facts.links.push({ kind: "reference", target: reference.fileName, line: line(reference.pos) });
    facts.coverage = limited || (file as ts.SourceFile & { parseDiagnostics?: unknown[] }).parseDiagnostics?.length ? "syntax-partial" : "syntax";
    const old = facts.descriptor ? JSON.parse(facts.descriptor) : {};
    facts.descriptor = JSON.stringify({ path, documentation: old.documentation ?? "", symbols: facts.spans.slice(0, 12).map(span => span.name),
      signatures: facts.spans.slice(0, 4).map(span => span.signature) });
  } else if (/^\.mdx?$/u.test(extension)) {
    let fence: string | null = null;
    for (const [index, value] of text.split(/\r?\n/u).entries()) {
      const marker = value.match(/^\s*(`{3,}|~{3,})/u)?.[1];
      if (marker) { if (!fence) fence = marker; else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null; continue; }
      const heading = !fence && value.match(/^#{1,6}\s+(.+)$/u);
      if (heading && facts.spans.length < 96) facts.spans.push({ kind: "heading", name: bounded(heading[1]!, 128), signature: "", start: index + 1, end: index + 1 });
    }
    facts.links = localDocumentLinks(text).slice(0, 128).map(link => ({ kind: "document", ...link }));
    facts.coverage = "markdown";
  }
  return facts;
}

export interface ResolvedSourceLink extends SourceLink { source: string; resolved: string | null; reason: string; sourceDigest: string; targetDigest: string | null }
/** A deliberately small, build-independent resolution policy. Ambiguity remains unresolved. */
export function resolveSourceLink(source: string, link: SourceLink, inventory: Set<string>): Pick<ResolvedSourceLink, "resolved" | "reason"> {
  const target = link.target;
  if (link.kind === "dynamic-import") return { resolved: null, reason: "dynamic" };
  if (/[\x00-\x1f\\]/u.test(target) || target.startsWith("/") || target.includes("://")) return { resolved: null, reason: "nonlocal" };
  if (link.kind !== "document" && link.kind !== "reference" && !target.startsWith(".")) return { resolved: null, reason: "package-or-alias" };
  const base = posix.normalize(posix.join(posix.dirname(source), target));
  if (base === ".." || base.startsWith("../")) return { resolved: null, reason: "outside-repository" };
  let candidates: string[];
  if (link.kind === "document") candidates = [base];
  else if (extname(base)) {
    candidates = [base];
    if (/\.[cm]?js$/u.test(base)) candidates.push(base.replace(/js$/u, "ts"), base.replace(/js$/u, "tsx"));
  } else candidates = [base, ...[".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", "/index.ts", "/index.tsx", "/index.js", "/index.jsx"].map(suffix => base + suffix)];
  const matches = [...new Set(candidates.filter(path => inventory.has(path)))];
  return { resolved: matches.length === 1 ? matches[0]! : null, reason: matches.length === 1 ? "resolved" : matches.length ? "ambiguous" : "missing-or-ineligible" };
}
