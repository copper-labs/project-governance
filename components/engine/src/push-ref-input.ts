import type { Readable } from "node:stream";

export interface PushRefUpdate { candidate: string; remote: string | null }
const MAX_PUSH_INPUT_BYTES = 65536;

/** Ref names are framing only. Exact object IDs bind the comparison without trusting remote text. */
export function parsePushRefUpdate(bytes: Buffer): PushRefUpdate {
  if (bytes.length > MAX_PUSH_INPUT_BYTES) throw new Error("Pre-push input exceeds byte limit");
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new Error("Pre-push ref input is malformed"); }
  const lines = text.replace(/\n$/u, "").split("\n");
  if (lines.length !== 1 || !lines[0]) throw new Error("Pre-push expects exactly one ref update");
  const fields = /^([^\s\0]+) ((?:[a-f0-9]{40}|[a-f0-9]{64})) ([^\s\0]+) ((?:[a-f0-9]{40}|[a-f0-9]{64}))$/u.exec(lines[0]);
  if (!fields || Buffer.byteLength(fields[1]!) > 4096 || Buffer.byteLength(fields[3]!) > 4096 || fields[2]!.length !== fields[4]!.length) throw new Error("Pre-push ref input is malformed");
  if (/^0+$/u.test(fields[2]!)) throw new Error("Pre-push deletion candidates are unsupported");
  return { candidate: fields[2]!, remote: /^0+$/u.test(fields[4]!) ? null : fields[4]! };
}

/** A hook cannot wait indefinitely for a caller or buffer an unbounded ref stream. */
export async function readPushRefUpdate(input: Readable, timeoutMs = 3000): Promise<PushRefUpdate> {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) throw new Error("Invalid pre-push input deadline");
  if (input.destroyed || input.readableEnded) throw new Error("Pre-push ref input is unavailable");
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []; let bytes = 0, finished = false;
    const finish = (error?: Error) => {
      if (finished) return; finished = true;
      clearTimeout(timer); input.removeListener("data", data); input.removeListener("end", end);
      input.removeListener("error", failed); input.removeListener("close", closed); input.pause();
      if (error) { reject(error); return; }
      try { resolve(parsePushRefUpdate(Buffer.concat(chunks))); } catch (error) { reject(error); }
    };
    const data = (chunk: Buffer | string) => {
      if (!Buffer.isBuffer(chunk) && typeof chunk !== "string") { finish(new Error("Pre-push ref input is malformed")); return; }
      const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); bytes += value.length;
      if (bytes > MAX_PUSH_INPUT_BYTES) { finish(new Error("Pre-push input exceeds byte limit")); return; }
      chunks.push(value);
    };
    const end = () => finish(), failed = () => finish(new Error("Cannot read pre-push ref input"));
    const closed = () => finish(new Error("Pre-push ref input closed before completion"));
    const timer = setTimeout(() => finish(new Error("Pre-push ref input deadline exceeded")), timeoutMs);
    input.on("data", data); input.once("end", end); input.once("error", failed); input.once("close", closed);
  });
}
