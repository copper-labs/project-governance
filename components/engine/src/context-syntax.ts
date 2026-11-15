/** Local syntax over captured bytes; grammar output never establishes runtime relationships. */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { extname } from "node:path";
import { Parser, Language, type Node } from "web-tree-sitter";
import type { SourceFacts, SourceSpan } from "./context-source-facts.ts";

// Initialize only the small common runtime. Grammars load synchronously on their first use,
// preserving the existing captured-source API and avoiding a second asynchronous index owner.
let ready = false;
try { await Parser.init(); ready = true; } catch { /* Files remain visible with unavailable syntax. */ }
const require = createRequire(import.meta.url);
const languages = new Map<string, Language>();
const unavailableLanguages = new Set<string>();
export const SYNTAX_VERSION = "wasm-5:web-0.27.1:rust-kotlin-0.26.5:swift-java-0.26.3:dart-0.26.6:objc-0.26.2";
const extensions: Record<string, string> = { ".rs": "rust", ".kt": "kotlin", ".kts": "kotlin", ".swift": "swift", ".dart": "dart", ".m": "objc", ".mm": "objc", ".h": "objc", ".java": "java" };
const kinds: Record<string, Set<string>> = Object.fromEntries(Object.entries({
  rust: ["struct_item", "trait_item", "enum_item", "type_item", "function_item", "function_signature_item", "mod_item", "const_item", "static_item", "macro_definition"],
  kotlin: ["class_declaration", "object_declaration", "function_declaration", "property_declaration", "type_alias", "secondary_constructor"],
  swift: ["class_declaration", "protocol_declaration", "function_declaration", "protocol_function_declaration", "property_declaration", "init_declaration", "typealias_declaration", "macro_declaration"],
  dart: ["class_definition", "mixin_declaration", "enum_declaration", "extension_declaration", "extension_type_declaration", "type_alias", "function_signature", "constructor_signature", "factory_constructor_signature", "constant_constructor_signature", "operator_signature", "getter_signature", "setter_signature"],
  objc: ["protocol_declaration", "class_interface", "class_implementation", "method_definition", "method_declaration"],
  java: ["class_declaration", "record_declaration", "interface_declaration", "enum_declaration", "method_declaration", "constructor_declaration", "annotation_type_declaration"],
}).map(([key, value]) => [key, new Set(value)]));
const bound = (text: string, maximum: number) => Buffer.from(text).subarray(0, maximum).toString("utf8").replace(/\uFFFD$/u, "");
const endLine = (node: Node) => node.endPosition.row + (node.endPosition.column ? 1 : 0);

function grammar(name: string): Language {
  if (unavailableLanguages.has(name)) throw new Error("Grammar unavailable");
  let value = languages.get(name);
  if (!value) try {
    const prefix = `@lumis-sh/wasm-${name}`;
    const bytes = readFileSync(require.resolve(`${prefix}/tree-sitter-${name}.wasm`));
    const metadata = JSON.parse(readFileSync(require.resolve(`${prefix}/lumis.json`), "utf8"));
    if (createHash("sha256").update(bytes).digest("hex") !== metadata.parser.sha256) throw new Error("Grammar integrity mismatch");
    value = Language.loadSync(new WebAssembly.Module(bytes)); languages.set(name, value);
  } catch (error) { unavailableLanguages.add(name); throw error; }
  return value;
}

function declarationName(node: Node, language: string): string | undefined {
  if (language === "kotlin") {
    if (node.type === "secondary_constructor") return "constructor";
    const type = node.type === "function_declaration" ? "simple_identifier" : "type_identifier";
    return node.namedChildren.find(child => child.type === type)?.text ??
      node.namedChildren.find(child => child.type === "variable_declaration")?.namedChildren.find(child => child.type === "simple_identifier")?.text;
  }
  if (language === "objc") {
    if (node.type.startsWith("method_")) return node.namedChildren.flatMap((child, index, all) =>
      child.type === "identifier" ? [child.text + (all[index + 1]?.type === "method_parameter" ? ":" : "")] : []).join("");
    const name = node.namedChildren.find(child => child.type === "identifier")?.text, category = node.childForFieldName("category");
    return name && name + (category ? `(${category.text})` : "");
  }
  if (language === "dart") {
    if (node.type.endsWith("constructor_signature")) return node.namedChildren.filter(child => child.type === "identifier").map(child => child.text).join(".");
    if (node.type === "mixin_declaration") return node.namedChildren.find(child => child.type === "identifier")?.text;
    if (node.type === "operator_signature") return "operator " + (node.namedChildren.find(child => /operator$/u.test(child.type))?.text ?? "");
  }
  return node.childForFieldName("name")?.text ??
    (node.type === "type_alias" ? node.namedChildren.find(child => child.type === "type_identifier")?.text : undefined) ??
    (node.type === "init_declaration" ? "init" : undefined);
}

function spanFor(node: Node, language: string, name: string, lines: string[]): SourceSpan {
  const parent = node.parent;
  const anchor = parent && (language === "dart" && ["method_signature", "declaration"].includes(parent.type) ||
    language === "objc" && parent.type === "implementation_definition") ? parent : node;
  let start = anchor.startPosition.row + 1, end = endLine(anchor);
  let prior = anchor.previousNamedSibling;
  // Kotlin attaches trailing KDoc to its preceding package/import node.
  if (language === "kotlin") while (prior && ["package_header", "import_list", "import_header"].includes(prior.type)) prior = prior.lastNamedChild;
  // A parser's declaration may exclude adjacent documentation and Rust attributes.
  for (; prior && (/comment/u.test(prior.type) || ["attribute_item", "annotation"].includes(prior.type)) &&
      start - endLine(prior) <= 1; prior = prior.previousNamedSibling) {
    if (/comment/u.test(prior.type) && lines[prior.startPosition.row]?.slice(0, prior.startPosition.column).trim()) continue;
    start = prior.startPosition.row + 1;
  }
  if (language === "dart" && node.type.endsWith("_signature")) {
    if (anchor.nextNamedSibling?.type === "function_body") end = endLine(anchor.nextNamedSibling);
  }
  if (language === "kotlin" && node.type === "property_declaration") {
    for (let next = node.nextNamedSibling; next && (/comment/u.test(next.type) || ["getter", "setter"].includes(next.type)); next = next.nextNamedSibling)
      if (["getter", "setter"].includes(next.type)) end = endLine(next);
  }
  const modifiers = language === "kotlin" ? node.namedChildren.find(child => child.type === "modifiers")?.namedChildren
    .filter(child => child.type === "platform_modifier" && ["expect", "actual"].includes(child.text)).map(child => child.text) ?? [] : [];
  // Compact signatures exclude defaults, annotation arguments and arbitrary executable literals.
  return { kind: node.type, name: bound(name, 96), signature: bound([...modifiers, name].join(" "), 256), start, end,
    ...(modifiers.length ? { modifiers } : {}) };
}

/** Read literal module references only; non-TS resolution is handled separately and conservatively. */
function literalLink(node: Node, language: string): string | undefined {
  if (language === "rust" && node.type === "use_declaration") return node.childForFieldName("argument")?.text;
  if (language === "rust" && node.type === "mod_item" && !node.childForFieldName("body")) return node.childForFieldName("name")?.text;
  if (["import_declaration", "import_header", "package_header", "package_declaration"].includes(node.type))
    return node.namedChildren.find(child => ["identifier", "scoped_identifier"].includes(child.type))?.text;
  if (language === "objc" && node.type === "preproc_include") return node.childForFieldName("path")?.text;
  if (language === "dart" && ["import_or_export", "part_directive", "part_of_directive"].includes(node.type))
    return node.descendantsOfType("uri")[0]?.namedChildren.find(child => child.type === "string_literal")?.text.match(/^r?(['"])([\s\S]*)\1$/u)?.[2];
  return undefined;
}

/** Syntax failures retain original file discovery, never guessed complete declaration ranges. */
export function extractNativeSyntax(path: string, text: string, facts: SourceFacts, deadlineAt: number): boolean {
  const extension = extname(path).toLowerCase(), language = extensions[extension];
  if (!language) return false;
  if (extension === ".h" && !/^\s*@(?:interface|protocol|implementation)\b/mu.test(text)) return false;
  const original = { ...facts };
  const previous = JSON.parse(facts.descriptor ?? "{}");
  facts.language = extension === ".mm" ? "objc++" : extension === ".h" ? "objc-header" : extension === ".kts" ? "kotlin-script" : language;
  facts.coverage = "syntax-partial"; facts.spans = []; facts.links = [];
  let limitation: string | undefined, parser: Parser | undefined, tree: ReturnType<Parser["parse"]> = null;
  try {
    if (extension === ".mm") throw new Error("Objective-C++ unsupported");
    if (!ready) throw new Error("Parser runtime unavailable");
    if (performance.now() >= deadlineAt) throw new Error("Syntax deadline");
    const loaded = grammar(language);
    parser = new Parser(); parser.setLanguage(loaded);
    tree = parser.parse(text, null, { progressCallback: () => performance.now() >= deadlineAt });
    if (!tree || performance.now() >= deadlineAt) limitation = "syntax-deadline";
    else if (tree.rootNode.hasError) limitation = "syntax-errors";
    // This grammar silently accepts detached annotations/context receivers as illegal top-level expressions.
    else if (extension === ".kt" && tree.rootNode.namedChildren.some(node => ["prefix_expression", "call_expression"].includes(node.type))) limitation = "kotlin-top-level-expression";
    else {
      facts.coverage = "syntax";
      const pending = [tree.rootNode], lines = text.split("\n"); let visited = 0;
      while (pending.length) {
        if (performance.now() >= deadlineAt) { limitation = "syntax-deadline"; break; }
        if (++visited > 20000) { limitation = "syntax-walk-limit"; break; }
        const node = pending.pop()!;
        if (extension === ".kts" && node.type === "call_expression" && node.namedChildren.some(child => /lambda|call_suffix/.test(child.type))) {
          const callee = node.firstNamedChild?.text;
          if (callee && /^[A-Za-z_][A-Za-z0-9_.]*$/u.test(callee) && node.text.includes("{")) {
            if (facts.spans.length === 96) { limitation = "syntax-span-limit"; break; }
            facts.spans.push({ kind: "build-script-block", name: bound(callee, 96), signature: bound(callee, 96), start: node.startPosition.row + 1, end: endLine(node) });
          }
        }
        const name = kinds[language]!.has(node.type) ? declarationName(node, language) : undefined;
        if (name) {
          if (facts.spans.length === 96) { limitation = "syntax-span-limit"; break; }
          facts.spans.push(spanFor(node, language, name, lines));
        }
        const target = literalLink(node, language);
        if (target) {
          if (facts.links.length === 128) limitation ??= "syntax-link-limit";
          else facts.links.push({ kind: "module", target: bound(target, 512), line: node.startPosition.row + 1 });
        }
        // Keep members and nested types, but do not let function locals displace declarations.
        if (!["function_body", "block", "compound_statement", "constructor_body", "array_initializer", "array_expression", "list_literal"].includes(node.type))
          for (const child of node.namedChildren.toReversed()) pending.push(child);
      }
    }
  } catch (error) { limitation = extension === ".mm" ? "objective-cpp-partial" : error instanceof Error && error.message === "Syntax deadline" ? "syntax-deadline" : "syntax-unavailable"; }
  finally { tree?.delete(); parser?.delete(); }
  if (extension === ".h" && !limitation && !facts.spans.length) { Object.assign(facts, original); return false; }
  if (limitation) facts.coverage = "syntax-partial";
  if (limitation === "syntax-deadline" || limitation === "syntax-unavailable") facts.retryable = true;
  facts.descriptor = JSON.stringify({ path, documentation: previous.documentation ?? "", symbols: facts.spans.slice(0, 12).map(span => span.name),
    signatures: facts.spans.slice(0, 4).map(span => span.signature), extraction: facts.coverage,
    ...(limitation && previous.symbols?.length ? { heuristicSymbols: previous.symbols } : {}),
    symbolsOmitted: Math.max(0, facts.spans.length - 12), ...(limitation ? { limitation, spanLimitReached: limitation === "syntax-span-limit" } : {}) });
  return true;
}
