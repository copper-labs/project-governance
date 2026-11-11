import { spawn } from "node:child_process";
import { scanSecretChunks, type SecretScan } from "./secrets.ts";

const OBJECT_ID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;

/** Consume one bounded header or body slice without buffering an entire Git blob. */
class BatchBytes {
  #chunks: AsyncIterator<Uint8Array>;
  #chunk = Buffer.alloc(0);
  #offset = 0;
  constructor(chunks: AsyncIterable<Uint8Array>) { this.#chunks = chunks[Symbol.asyncIterator](); }
  async #fill(): Promise<boolean> {
    while (this.#offset === this.#chunk.length) {
      const next = await this.#chunks.next();
      if (next.done) return false;
      this.#chunk = Buffer.from(next.value); this.#offset = 0;
    }
    return true;
  }
  async header(): Promise<string> {
    const pieces: Buffer[] = []; let size = 0;
    while (await this.#fill()) {
      const end = this.#chunk.indexOf(10, this.#offset);
      const stop = end < 0 ? this.#chunk.length : end;
      const piece = this.#chunk.subarray(this.#offset, stop);
      size += piece.length;
      if (size > 128) throw new Error("Git blob header exceeds bound");
      pieces.push(piece); this.#offset = stop + Number(end >= 0);
      if (end >= 0) return Buffer.concat(pieces, size).toString("utf8");
    }
    throw new Error("Git blob header is incomplete");
  }
  async *body(size: number): AsyncGenerator<Buffer> {
    while (size) {
      if (!await this.#fill()) throw new Error("Git blob body is incomplete");
      const length = Math.min(size, this.#chunk.length - this.#offset);
      const bytes = this.#chunk.subarray(this.#offset, this.#offset + length);
      this.#offset += length; size -= length;
      yield bytes;
    }
  }
  async delimiter(): Promise<void> {
    if (!await this.#fill() || this.#chunk[this.#offset++] !== 10) throw new Error("Git blob delimiter differs");
  }
  async end(): Promise<void> {
    if (await this.#fill()) throw new Error("Unexpected Git blob output");
  }
}

/** Match each pinned identity and exact frame; return findings only after the complete stream validates. */
export async function parseSecretBlobBatch(chunks: AsyncIterable<Uint8Array>, ids: readonly string[],
  progress: () => void = () => {}): Promise<Map<string, SecretScan>> {
  const bytes = new BatchBytes(chunks), scans = new Map<string, SecretScan>();
  for (const id of ids) {
    if (!OBJECT_ID.test(id)) throw new Error("Invalid Git blob identity");
    progress();
    const header = await bytes.header(), match = /^([a-f0-9]{40}|[a-f0-9]{64}) blob (0|[1-9][0-9]*)$/u.exec(header);
    const size = match ? Number(match[2]) : NaN;
    if (!match || match[1] !== id || !Number.isSafeInteger(size)) throw new Error("Git blob frame identity differs");
    const scan = await scanSecretChunks(bytes.body(size));
    await bytes.delimiter(); scans.set(id, scan);
  }
  await bytes.end();
  return scans;
}

/** One owned Git process streams a bounded group; failures never preserve partial batch acceptance. */
export async function scanSecretBlobBatch(root: string, ids: readonly string[], timeoutMs = 30_000): Promise<Map<string, SecretScan>> {
  if (!ids.length) return new Map();
  if (ids.length > 128 || ids.some(id => !OBJECT_ID.test(id)) ||
    !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) throw new Error("Invalid Git blob batch");
  const child = spawn("git", ["cat-file", "--batch"], { cwd: root,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_NO_REPLACE_OBJECTS: "1" }, stdio: ["pipe", "pipe", "ignore"] });
  const exit = new Promise<void>((resolve, reject) => {
    child.once("error", () => reject(new Error("Git blob process failed to start")));
    child.once("close", code => code === 0 ? resolve() : reject(new Error("Git blob process did not complete")));
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const progress = () => {
    clearTimeout(timer);
    timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
  };
  let inputFailed = false;
  // A closed input pipe must fail the owned process, without an unhandled stream error.
  child.stdin.on("error", () => { inputFailed = true; child.kill("SIGKILL"); });
  try {
    progress();
    const parsed = parseSecretBlobBatch(child.stdout, ids, progress);
    child.stdin.end(ids.join("\n") + "\n");
    const [scans] = await Promise.all([parsed, exit]);
    if (inputFailed) throw new Error("Git blob input did not complete");
    return scans;
  } catch (error) {
    child.kill("SIGKILL"); child.stdout.destroy();
    await exit.catch(() => {});
    throw error;
  } finally { clearTimeout(timer); }
}
