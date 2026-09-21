import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";
import { analyzeTypeScript, SourceSyntaxError } from "./typescript-analysis.ts";
import { analyzePython } from "./python-analysis.ts";
import { runParser, type ParserRunner } from "./native-parser-process.ts";
import type { NativeAnalysis } from "./source-analysis.ts";

export const adapterCapabilities: Readonly<Record<string, readonly string[]>> = {
  "python-ast": ["type-extents", "function-extents", "cyclomatic-complexity", "cognitive-complexity", "nesting-depth"],
  "typescript-compiler": ["type-extents", "function-extents"], "swift-compiler": [], "kotlin-compiler": [], shellcheck: [],
};
/** Isolate captured source from the host checkout and remove compiler scratch output after observation. */
export async function analyzeNativeSource(path: string, source: string, runner: ParserRunner = runParser): Promise<NativeAnalysis | null> {
  const suffix = extname(path).toLowerCase();
  if ([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"].includes(suffix)) return { ...analyzeTypeScript(path, source), adapter: "typescript-compiler" };
  if (![".py", ".swift", ".kt", ".kts", ".sh"].includes(suffix)) return null;
  const directory = await mkdtemp(join(tmpdir(), "governance-parser-"));
  try {
    const input = join(directory, `source${suffix}`);
    await writeFile(input, source, { mode: 0o600 });
    if (suffix === ".py") return await analyzePython(input, runner);
    const adapter = suffix === ".swift" ? "swift-compiler" : suffix === ".sh" ? "shellcheck" : "kotlin-compiler";
    const result = adapter === "swift-compiler" ? await runner("swiftc", ["-frontend", "-parse", input]) :
      adapter === "shellcheck" ? await runner("shellcheck", ["-f", "json", input]) : await runner("kotlinc", [input, "-d", join(directory, "output")]);
    if (!result) return null;
    if (adapter === "shellcheck") {
      const diagnostics: unknown = JSON.parse(result.stdout);
      if (!Array.isArray(diagnostics) || diagnostics.some(d => !d || typeof d !== "object" || !Number.isInteger(d.code))) throw new Error("Invalid ShellCheck diagnostics");
      const syntax = diagnostics.find(d => [1072, 1073, 1074].includes(d.code));
      if (syntax) throw new SourceSyntaxError("Shell syntax rejected", Number.isInteger(syntax.line) && syntax.line > 0 ? syntax.line : 1);
      if (![0, 1].includes(result.code)) throw new Error("ShellCheck execution failed");
    } else if (result.code !== 0) {
      const diagnostic = `${result.stderr}\n${result.stdout}`.toLowerCase();
      // Kotlin may report unresolved dependencies without a syntax error; these are not parser findings.
      if (adapter !== "kotlin-compiler" || ["expecting", "unexpected tokens", "syntax error"].some(marker => diagnostic.includes(marker)))
        throw new SourceSyntaxError("Native compiler syntax rejected", 1);
      if (!diagnostic.includes("unresolved reference")) throw new Error("Kotlin compiler failed without a recognized syntax or dependency diagnostic");
    }
    return { adapter, extents: [], metrics: new Map(), capabilities: new Set() };
  } finally { await rm(directory, { recursive: true, force: true }); }
}
