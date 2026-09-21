import ts from "typescript";
import { extname } from "node:path";
import type { StructuralAnalysis } from "./source-units.ts";

export class SourceSyntaxError extends Error {
  readonly line: number;
  constructor(message: string, line: number) {
    super(message);
    this.name = "SourceSyntaxError";
    this.line = line;
  }
}

/** Parse the captured source, never a later working-tree image or host compiler installation. */
export function analyzeTypeScript(path: string, source: string): StructuralAnalysis {
  const suffix = extname(path).toLowerCase();
  const kind = suffix === ".tsx" ? ts.ScriptKind.TSX : suffix === ".jsx" ? ts.ScriptKind.JSX :
    [".js", ".mjs", ".cjs"].includes(suffix) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, kind);
  // The compiler exposes syntactic parse diagnostics on SourceFile at runtime.
  const diagnostics = (file as ts.SourceFile & { parseDiagnostics: readonly ts.DiagnosticWithLocation[] }).parseDiagnostics;
  const diagnostic = diagnostics[0];
  if (diagnostic) throw new SourceSyntaxError(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
    file.getLineAndCharacterOfPosition(diagnostic.start ?? 0).line + 1);
  const analysis: StructuralAnalysis = { extents: [], metrics: new Map(), capabilities: new Set(["type-extents", "function-extents"]) };
  function visit(node: ts.Node, scope: string[]): void {
    const declarationKind = ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node) ||
      ts.isTypeAliasDeclaration(node) || ts.isEnumDeclaration(node) || ts.isModuleDeclaration(node) ? "type" :
      ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isConstructorDeclaration(node) ? "function" : null;
    let nextScope = scope;
    if (declarationKind) {
      const name = "name" in node && node.name ? (node.name as ts.Node).getText(file) : "<anonymous>";
      nextScope = [...scope, name];
      analysis.extents.push({ kind: declarationKind, name: nextScope.join("."),
        start: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1,
        end: file.getLineAndCharacterOfPosition(node.end).line + 1 });
    }
    ts.forEachChild(node, child => visit(child, nextScope));
  }
  visit(file, []);
  return analysis;
}
