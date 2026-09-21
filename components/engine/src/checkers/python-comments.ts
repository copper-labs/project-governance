import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { glob } from "../planning.ts";
import type { Finding } from "../checker-results.ts";
import { parsePythonAst, type AstNode } from "./python-analysis.ts";
import { SourceSyntaxError } from "./typescript-analysis.ts";
import { overviewFindings, declarationFindings, type CommentPolicy } from "./comment-rules.ts";
import { runParser, type ParserRunner } from "./native-parser-process.ts";
export interface CommentSelection { enforceAll: boolean; overviewBlocking: boolean; ranges: ReadonlyArray<readonly [number, number]> }
const declaration = (node: AstNode) => ["ClassDef", "FunctionDef", "AsyncFunctionDef"].includes(node.kind);
function governed(tree: AstNode, includePrivate: boolean): Array<{ node: AstNode; owner: string }> {
  const result: Array<{ node: AstNode; owner: string }> = [];
  for (const index of tree.body) {
    const node = tree.children[index]!;
    if (!includePrivate && node.name.startsWith("_")) continue;
    if (declaration(node)) result.push({ node, owner: "" });
    if (node.kind === "ClassDef") for (const memberIndex of node.body) {
      const member = node.children[memberIndex]!;
      if (["FunctionDef", "AsyncFunctionDef"].includes(member.kind) && (includePrivate || !member.name.startsWith("_"))) result.push({ node: member, owner: node.name });
    }
  }
  return result;
}
const identity = (node: AstNode, owner: string) => owner ? `${owner}.${node.name}` : node.name;

/** Body-only edits keep old API documentation advisory; new symbols and changed headers are enforced. */
export async function pythonCommentFindings(path: string, source: string, before: string | null,
  policy: CommentPolicy & { require_type_context_paragraph?: boolean }, selection: CommentSelection, runner: ParserRunner = runParser): Promise<Finding[]> {
  const directory = await mkdtemp(join(tmpdir(), "governance-python-comments-"));
  try {
    const input = join(directory, "source.py"); await writeFile(input, source, { mode: 0o600 });
    let tree: AstNode | null;
    try { tree = await parsePythonAst(input, runner); if (!tree) throw new Error("Python AST unavailable"); }
    catch (error) { return [{ rule_id: "SC010", path, line: error instanceof SourceSyntaxError ? error.line : 1, severity: "blocking", message: "Python comment adapter could not analyze the captured source." }]; }
    const includePrivate = (policy.boundary_globs ?? []).some(pattern => glob(path, pattern));
    let prior: Set<string> | null = null;
    if (before !== null) {
      const previous = join(directory, "before.py"); await writeFile(previous, before, { mode: 0o600 });
      try {
        const old = await parsePythonAst(previous, runner);
        if (!old) throw new Error("Python AST unavailable");
        prior = new Set(governed(old, includePrivate).map(({ node, owner }) => identity(node, owner)));
      } catch (error) {
        // Invalid historical syntax gives no symbol comparison; infrastructure loss is still a failure.
        if (!(error instanceof SourceSyntaxError)) return [{ rule_id: "SC010", path, line: 1, severity: "blocking", message: "Python comment adapter could not analyze the captured before-image." }];
      }
    }
    const findings = overviewFindings(tree.doc, path, policy, "python", selection.overviewBlocking);
    for (const { node, owner } of governed(tree, includePrivate)) {
      const name = identity(node, owner), start = Math.min(node.start, ...node.decorators);
      const firstBody = node.body.length ? node.children[node.body[0]!]!.start : node.end;
      const end = Math.max(node.start, firstBody - 1);
      const blocking = selection.enforceAll || (prior !== null && !prior.has(name)) || selection.ranges.some(([left, right]) => start <= right && end >= left);
      findings.push(...declarationFindings(node.doc, { path, line: node.start, adapter: "python", declaration: name },
        node.kind === "ClassDef" ? "type" : owner ? "method" : "function", node.name, node.kind === "ClassDef", blocking, policy.require_type_context_paragraph ?? false));
    }
    return findings;
  } finally { await rm(directory, { recursive: true, force: true }); }
}
