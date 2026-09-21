import { metricKey, type SourceExtent } from "./source-units.ts";
import type { NativeAnalysis } from "./source-analysis.ts";
import { SourceSyntaxError } from "./typescript-analysis.ts";
import { runParser, type ParserRunner } from "./native-parser-process.ts";

// Python supplies its maintained AST only. Governance decisions stay in TypeScript.
const bridge = `import ast,json,sys
try:
 tree=ast.parse(open(sys.argv[1],encoding='utf-8',errors='replace').read())
except SyntaxError as error:
 print(json.dumps({'syntaxLine':error.lineno or 1}))
 sys.exit(1)
def encode(node):
 return {'kind':type(node).__name__,'name':getattr(node,'name',''),
 'start':getattr(node,'lineno',1),'end':getattr(node,'end_lineno',1),
 'values':len(getattr(node,'values',[])),
 'doc':(ast.get_docstring(node,clean=False) or '') if isinstance(node,(ast.Module,ast.ClassDef,ast.FunctionDef,ast.AsyncFunctionDef)) else '',
 'decorators':[item.lineno for item in getattr(node,'decorator_list',[])],
 'body':[i for i,child in enumerate(ast.iter_child_nodes(node)) if child in getattr(node,'body',[])],
 'children':[encode(child) for child in ast.iter_child_nodes(node)]}
print(json.dumps(encode(tree)))
`;
export interface AstNode { kind: string; name: string; start: number; end: number; values: number; doc: string; decorators: number[]; body: number[]; children: AstNode[] }
const functions = new Set(["FunctionDef", "AsyncFunctionDef"]);
const controls = new Set(["If", "For", "AsyncFor", "While", "Try", "With", "AsyncWith", "Match"]);
function metrics(node: AstNode): readonly [number, number, number] {
  let cyclomatic = 1, cognitive = 0, nesting = 0;
  const visit = (current: AstNode, depth: number): void => {
    let next = depth;
    if (controls.has(current.kind)) { cyclomatic++; cognitive += 1 + depth; next++; nesting = Math.max(nesting, next); }
    else if (current.kind === "BoolOp") { const count = Math.max(1, current.values - 1); cyclomatic += count; cognitive += count; }
    for (const child of current.children) if (!functions.has(child.kind) && child.kind !== "Lambda") visit(child, next);
  };
  for (const index of node.body) visit(node.children[index]!, 0);
  return [cyclomatic, cognitive, nesting];
}
function validate(value: unknown): asserts value is AstNode {
  if (!value || typeof value !== "object") throw new Error("Invalid Python AST");
  const node = value as AstNode;
  if (typeof node.kind !== "string" || typeof node.name !== "string" || typeof node.doc !== "string" || !Array.isArray(node.decorators) || node.decorators.some(line => !Number.isInteger(line) || line < 1) || !Number.isInteger(node.start) || node.start < 1 ||
      !Number.isInteger(node.end) || node.end < node.start || !Number.isInteger(node.values) || node.values < 0 || !Array.isArray(node.children) || !Array.isArray(node.body) || node.body.some(i => !Number.isInteger(i) || i < 0 || i >= node.children.length)) throw new Error("Invalid Python AST");
  for (const child of node.children) validate(child);
}
export async function parsePythonAst(path: string, runner: ParserRunner = runParser): Promise<AstNode | null> {
  const result = await runner("python3", ["-I", "-c", bridge, path]);
  if (!result) return null;
  const decoded: unknown = JSON.parse(result.stdout);
  if (result.code === 1 && decoded && typeof decoded === "object" && "syntaxLine" in decoded && Number.isInteger(decoded.syntaxLine) && Number(decoded.syntaxLine) > 0)
    throw new SourceSyntaxError("Python syntax rejected", Number(decoded.syntaxLine));
  if (result.code !== 0) throw new Error("Python AST process failed");
  validate(decoded);
  return decoded;
}
export async function analyzePython(path: string, runner: ParserRunner = runParser): Promise<NativeAnalysis | null> {
  const decoded = await parsePythonAst(path, runner);
  if (!decoded) return null;
  const analysis: NativeAnalysis = { adapter: "python-ast", extents: [], metrics: new Map(),
    capabilities: new Set(["type-extents", "function-extents", "cyclomatic-complexity", "cognitive-complexity", "nesting-depth"]) };
  const visit = (node: AstNode, scope: string[]): void => {
    let next = scope;
    const kind: SourceExtent["kind"] | null = node.kind === "ClassDef" ? "type" : functions.has(node.kind) ? "function" : null;
    if (kind) {
      next = [...scope, node.name]; const name = next.join(".");
      analysis.extents.push({ kind, name, start: node.start, end: node.end });
      if (kind === "function") analysis.metrics.set(metricKey(name, node.start), metrics(node));
    }
    for (const child of node.children) visit(child, next);
  };
  visit(decoded, []);
  return analysis;
}
