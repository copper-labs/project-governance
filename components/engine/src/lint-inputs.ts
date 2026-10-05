import { createHash } from "node:crypto";
import { chmodSync, lstatSync, mkdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, extname, join, posix, relative, resolve } from "node:path";
import ts from "typescript";
import { isBuiltin } from "node:module";
import { safeSubjectPath, type ChangeScope, type ValidationSubject } from "./change-subject.ts";
import { durableJson, fileDigest } from "./core.ts";
import { glob } from "./planning.ts";
import { commandExecutable } from "./native-check-command.ts";
import { insideLintRoot, LINT_EXTENSIONS, LINT_PROFILE_PATH, lintProfileComparison, parseLintDeclaration, type LintDeclaration } from "./lint-configuration.ts";

export interface LintSnapshot { path: string; snapshot: string; sha256: string; role: "source" | "input" }
export interface PreparedLintInputs {
  version: 1; pack_id: string; declaration: LintDeclaration; input_mode: ChangeScope["mode"];
  subject_digest: string | null; candidate: string; selected: string[]; excluded: string[];
  snapshots: LintSnapshot[]; widening_reason: string | null;
}
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
function ignored(path: string, patterns: string[]): boolean { return patterns.some(pattern => glob(path, pattern) || pattern.startsWith("**/") && glob(path, pattern.slice(3))); }

/** Candidate configuration imports are finite declarations, never discovery through executing user code. */
export function validateLintConfigClosure(declaration: LintDeclaration, texts: Map<string, string>): void {
  const declared = new Set([declaration.config, ...declaration.inputs]);
  const requireInput = (owner: string, target: string) => {
    const path = posix.normalize(posix.join(posix.dirname(owner), target));
    if (path.startsWith("../") || !declared.has(path) || !texts.has(path)) throw new Error(`Undeclared lint configuration input: ${path}`);
  };
  for (const [path, source] of texts) {
    if (declaration.backend === "ruff" && [".toml"].includes(extname(path))) {
      for (const match of source.matchAll(/^\s*extend\s*=\s*["']([^"']+)["']/gmu)) requireInput(path, match[1]!);
    }
    if (declaration.backend !== "eslint" || !LINT_EXTENSIONS.eslint.has(extname(path))) continue;
    const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
    const inspectImport = (node: ts.Expression): void => {
      if (!ts.isStringLiteralLike(node)) throw new Error("Dynamic lint configuration imports are unsupported");
      const target = node.text;
      if (target.startsWith(".")) requireInput(path, target);
      else if (!declaration.dependency_roots.length || !/^(?:@[A-Za-z0-9_.-]+\/)?[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/u.test(target) || target.split("/").includes("..") || isBuiltin(target)) throw new Error("Undeclared executable lint configuration input");
    };
    // Flat declarative configs can be captured. Executable config discovery needs a separate contract.
    const declarative = (node: ts.Node): void => {
      const allowed = ts.isSourceFile(node) || ts.isImportDeclaration(node) || ts.isImportClause(node) || ts.isNamedImports(node) || ts.isImportSpecifier(node) || ts.isNamespaceImport(node) ||
        ts.isExportAssignment(node) || ts.isVariableStatement(node) || ts.isVariableDeclarationList(node) || ts.isVariableDeclaration(node) || ts.isIdentifier(node) ||
        ts.isArrayLiteralExpression(node) || ts.isObjectLiteralExpression(node) || ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node) ||
        ts.isSpreadAssignment(node) || ts.isSpreadElement(node) || ts.isPropertyAccessExpression(node) || ts.isParenthesizedExpression(node) ||
        ts.isStringLiteralLike(node) || ts.isNumericLiteral(node) || [ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword, ts.SyntaxKind.ExportKeyword, ts.SyntaxKind.DefaultKeyword, ts.SyntaxKind.ConstKeyword, ts.SyntaxKind.EndOfFileToken].includes(node.kind);
      if (!allowed || ts.isVariableDeclarationList(node) && !(node.flags & ts.NodeFlags.Const) || ts.isVariableDeclaration(node) && (!ts.isIdentifier(node.name) || !node.initializer)) throw new Error("Executable lint configuration is unsupported; declare a file-local configuration");
      ts.forEachChild(node, declarative);
    };
    declarative(file);
    const bindings = new Set<string>();
    for (const statement of file.statements) {
      if (ts.isImportDeclaration(statement) && statement.importClause) {
        if (statement.importClause.name) bindings.add(statement.importClause.name.text);
        const named = statement.importClause.namedBindings;
        if (named && ts.isNamespaceImport(named)) bindings.add(named.name.text);
        if (named && ts.isNamedImports(named)) for (const imported of named.elements) bindings.add(imported.name.text);
      }
      if (ts.isVariableStatement(statement)) for (const item of statement.declarationList.declarations) if (ts.isIdentifier(item.name)) bindings.add(item.name.text);
    }
    const visit = (node: ts.Node): void => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) inspectImport(node.moduleSpecifier as ts.Expression);
      if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === "require")) {
        if (node.arguments.length !== 1) throw new Error("Dynamic lint configuration imports are unsupported");
        inspectImport(node.arguments[0]!);
      }
      if (ts.isIdentifier(node) && ["process", "eval", "Function"].includes(node.text)) throw new Error("Environment-dependent lint configuration is unsupported");
      if (ts.isIdentifier(node)) {
        const parent = node.parent;
        const name = ts.isPropertyAssignment(parent) && parent.name === node || ts.isPropertyAccessExpression(parent) && parent.name === node || ts.isImportSpecifier(parent) || ts.isImportClause(parent) || ts.isNamespaceImport(parent) || ts.isVariableDeclaration(parent) && parent.name === node;
        if (!name && !bindings.has(node.text)) throw new Error("Undeclared lint configuration global is unsupported");
      }
      if ((ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node)) && ["project", "projectService", "tsconfigRootDir"].includes(node.name.getText(file).replace(/["']/g, ""))) throw new Error("Project-aware lint requires a separately qualified input contract");
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  if (declaration.backend === "eslint" && declaration.inputs.some(path => /suppressions?[^/]*\.json$/u.test(path))) throw new Error("Count-based lint suppressions require a separate reviewed debt policy");
}

/** The existing captured subject is the only source owner; the helper never reconstructs a Git scope. */
export function prepareLintInputs(subject: ValidationSubject, scope: ChangeScope, rawDeclaration: unknown, packId: string, evidence: string, packSource = `config/validation/packs/${packId}.yaml`) {
  evidence = realpathSync(evidence);
  const declaration = parseLintDeclaration(rawDeclaration), candidate = join(evidence, "candidate");
  declaration.tool.argv[0] = commandExecutable(declaration.tool.argv[0]!, subject.root);
  if (declaration.backend === "eslint" && declaration.tool.argv[1] && !declaration.tool.argv[1].startsWith("-")) declaration.tool.argv[1] = resolve(subject.root, declaration.tool.argv[1]);
  const ownerPaths = [packSource, LINT_PROFILE_PATH].filter(path => subject.source(path));
  const inputPaths = [...new Set([declaration.config, ...declaration.inputs, ...ownerPaths])].sort();
  const changed = scope.records.flatMap(record => record.previous_path ? [record.path, record.previous_path] : [record.path]);
  const widened = scope.mode === "all" || changed.some(path => inputPaths.includes(path) && (path !== LINT_PROFILE_PATH || lintProfileComparison(subject, scope).changed));
  const paths = widened ? subject.paths() : scope.records.filter(record => record.after).map(record => record.path);
  const eligible = [...new Set(paths)].filter(path => declaration.roots.some(root => insideLintRoot(path, root)) && LINT_EXTENSIONS[declaration.backend].has(extname(path))).sort();
  const excluded = eligible.filter(path => ignored(path, declaration.excludes)), selected = eligible.filter(path => !excluded.includes(path));
  if (selected.length > 4096) throw new Error("Lint candidate exceeds file bound");
  const texts = new Map<string, string>(), bytes = new Map<string, Buffer>();
  let remaining = 32 * 1024 * 1024;
  for (const path of [...new Set([...inputPaths, ...selected])]) {
    if (subject.source(path)?.file_type !== "regular") throw new Error(`Required lint input is absent or not regular: ${path}`);
    const content = subject.read(path, Math.min(4 * 1024 * 1024, remaining)); remaining -= content.length;
    if (remaining < 0) throw new Error("Lint candidate exceeds byte bound");
    bytes.set(path, content); if (inputPaths.includes(path)) texts.set(path, new TextDecoder("utf8", { fatal: true }).decode(content));
  }
  validateLintConfigClosure(declaration, texts);
  if (declaration.backend === "eslint" && declaration.dependency_roots.length && !declaration.inputs.some(path => /(?:package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/u.test(path))) throw new Error("Installed lint dependencies require a declared lock input");
  mkdirSync(candidate, { mode: 0o700 });
  const snapshots: LintSnapshot[] = [];
  for (const [path, content] of bytes) {
    const snapshot = join(candidate, path); mkdirSync(dirname(snapshot), { recursive: true, mode: 0o700 });
    writeFileSync(snapshot, content, { flag: "wx", mode: 0o400 });
    snapshots.push({ path, snapshot, sha256: hash(content), role: selected.includes(path) ? "source" : "input" });
  }
  for (const path of declaration.dependency_roots) {
    const target = realpathSync(join(subject.root, path)), local = relative(subject.root, target);
    if (local.startsWith("../") || local === ".." || !lstatSync(target).isDirectory()) throw new Error("Lint dependencies must be installed inside the declared project");
    const destination = join(candidate, path); mkdirSync(dirname(destination), { recursive: true, mode: 0o700 }); symlinkSync(target, destination, "dir");
  }
  const value: PreparedLintInputs = { version: 1, pack_id: packId, declaration, input_mode: scope.mode, subject_digest: scope.subject_digest,
    candidate, selected, excluded, snapshots, widening_reason: scope.mode === "all" ? "all-mode" : widened ? "configuration-or-toolchain-input" : null };
  const path = join(evidence, "lint-inputs.json"); durableJson(path, value); chmodSync(path, 0o400);
  return { value, env: { PROJECT_GOVERNANCE_LINT_INPUTS: path, PROJECT_GOVERNANCE_LINT_INPUTS_SHA256: fileDigest(path).slice(7) } };
}

/** Snapshot paths and bytes stay beneath the runner-owned evidence directory and retain their exact identity. */
export function verifyLintInputs(evidence: string, path: string, expected: string): PreparedLintInputs {
  if (resolve(path) !== join(realpathSync(evidence), "lint-inputs.json") || realpathSync(path) !== resolve(path) || lstatSync(path).isSymbolicLink() || fileDigest(path) !== `sha256:${expected}`) throw new Error("Lint input binding differs");
  const value = JSON.parse(readFileSync(path, "utf8")) as PreparedLintInputs;
  if (value.version !== 1 || value.candidate !== join(realpathSync(evidence), "candidate") || !Array.isArray(value.snapshots) || !Array.isArray(value.selected) || !Array.isArray(value.excluded) ||
      !["staged", "changed", "explicit", "all"].includes(value.input_mode) || typeof value.pack_id !== "string" ||
      value.subject_digest !== null && !/^sha256:[a-f0-9]{64}$/u.test(value.subject_digest)) throw new Error("Invalid lint snapshot descriptor");
  const declaration = parseLintDeclaration(value.declaration), paths = new Set<string>();
  if (value.snapshots.length > 4224 || value.selected.length > 4096 || new Set(value.selected).size !== value.selected.length) throw new Error("Invalid lint snapshot bounds");
  for (const entry of value.snapshots) {
    safeSubjectPath(entry.path);
    if (paths.has(entry.path) || !["source", "input"].includes(entry.role) || !/^[a-f0-9]{64}$/u.test(entry.sha256) || entry.snapshot !== join(value.candidate, entry.path) || relative(value.candidate, entry.snapshot).startsWith("../") || realpathSync(entry.snapshot) !== entry.snapshot || !lstatSync(entry.snapshot).isFile() || hash(readFileSync(entry.snapshot)) !== entry.sha256) throw new Error("Lint snapshot changed or escaped its owner");
    paths.add(entry.path);
  }
  for (const path of value.selected) {
    safeSubjectPath(path);
    if (!declaration.roots.some(root => insideLintRoot(path, root)) || !LINT_EXTENSIONS[declaration.backend].has(extname(path)) || ignored(path, declaration.excludes) || !value.snapshots.some(entry => entry.path === path && entry.role === "source")) throw new Error("Selected lint source has no qualified snapshot");
  }
  for (const path of [declaration.config, ...declaration.inputs]) if (!paths.has(path)) throw new Error("Declared lint configuration has no snapshot");
  return value;
}
