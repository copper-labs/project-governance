import { spawn, execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const MAX_HEADERS = 32 * 1024 * 1024;
const MAX_LINE = 16 * 1024;

/** Keep only path and hunk headers; changed source bodies never accumulate in memory. */
export class DiffHeaderFilter {
  #prefix = "";
  #discard = false;
  #bytes = 0;
  push(text: string): string[] {
    const output: string[] = [];
    for (const part of text.split(/(?<=\n)/u)) {
      const ended = part.endsWith("\n"), content = ended ? part.slice(0, -1) : part;
      if (!this.#discard) {
        // Three characters distinguish every header used by the existing subject parser.
        const needed = Math.max(0, 4 - this.#prefix.length);
        this.#prefix += content.slice(0, needed);
        if (this.#prefix.length >= 4 && !this.#prefix.startsWith("+++ ") && !this.#prefix.startsWith("@@")) {
          this.#discard = true; this.#prefix = "";
        } else {
          this.#prefix += content.slice(needed);
          if (Buffer.byteLength(this.#prefix) > MAX_LINE) throw new Error("Diff header exceeds capture bound");
        }
      }
      if (ended) {
        if (!this.#discard && (this.#prefix.startsWith("+++ ") || this.#prefix.startsWith("@@"))) {
          this.#bytes += Buffer.byteLength(this.#prefix) + 1;
          if (this.#bytes > MAX_HEADERS) throw new Error("Diff headers exceed capture bound");
          output.push(this.#prefix + "\n");
        }
        this.#prefix = ""; this.#discard = false;
      }
    }
    return output;
  }
}

/** Isolate async pipe draining behind the existing synchronous subject-capture interface. */
export function gitDiffHeaders(root: string, args: string[]): string {
  const worker = fileURLToPath(import.meta.url);
  try {
    return execFileSync(process.execPath, [worker, "--capture", root, JSON.stringify(args)], {
      timeout: 35_000, maxBuffer: MAX_HEADERS, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    if (String((error as { stderr?: Buffer }).stderr ?? "").includes("diff-header-bound"))
      throw new Error("Diff headers exceed capture bound");
    if (String((error as { stderr?: Buffer }).stderr ?? "").includes("diff-header-encoding"))
      throw new Error("Git diff is not valid UTF-8");
    throw new Error("Git comparison failed: streamed diff; the requested subject is unavailable or exceeds its budget");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href && process.argv[2] === "--capture") {
  const child = spawn("git", JSON.parse(process.argv[4]!), { cwd: process.argv[3],
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_NO_REPLACE_OBJECTS: "1" }, stdio: ["ignore", "pipe", "ignore"] });
  const filter = new DiffHeaderFilter(), decoder = new TextDecoder("utf-8", { fatal: true });
  let failed = false;
  const fail = (bound = false) => { failed = true; if (bound) process.stderr.write("diff-header-bound\n"); child.kill("SIGKILL"); };
  process.once("SIGTERM", () => fail());
  process.once("SIGINT", () => fail());
  const timer = setTimeout(() => fail(), 30_000);
  child.on("error", () => { failed = true; });
  child.stdout.on("data", (chunk: Buffer) => {
    if (failed) return;
    try { for (const line of filter.push(decoder.decode(chunk, { stream: true }))) process.stdout.write(line); }
    catch (error) {
      if (error instanceof TypeError) process.stderr.write("diff-header-encoding\n");
      fail(error instanceof Error && error.message.includes("capture bound"));
    }
  });
  child.on("close", code => {
    clearTimeout(timer);
    if (!failed) {
      try { for (const line of filter.push(decoder.decode() + "\n")) process.stdout.write(line); }
      catch { process.stderr.write("diff-header-encoding\n"); failed = true; }
    }
    process.exitCode = failed || code !== 0 ? 1 : 0;
  });
}
