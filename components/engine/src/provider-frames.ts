/** Incremental native JSON lines. A truncated final record never counts as a terminal event. */
export class ProviderFrames {
  readonly #accept: (value: unknown) => void;
  readonly #maximum: number;
  #pending: Buffer = Buffer.alloc(0);
  #terminal = false;
  constructor(accept: (value: unknown) => void, maximum = 16_000_000) {
    if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > 16_000_000) throw new Error("Invalid provider frame limit");
    this.#accept = accept; this.#maximum = maximum;
  }
  push(chunk: Uint8Array) {
    if (this.#terminal) throw new Error("Provider frame reader is closed");
    try {
      // Bound each frame, not the number of complete records coalesced into a pipe read.
      let start = 0;
      for (let index = 0; index < chunk.length; index++) {
        if (chunk[index] !== 10) continue;
        const part = chunk.subarray(start, index);
        if (this.#pending.length + part.length > this.#maximum) throw new Error("Provider frame exceeds limit");
        const line = this.#pending.length ? Buffer.concat([this.#pending, part]) : Buffer.from(part);
        this.#pending = Buffer.alloc(0);
        const text = new TextDecoder("utf-8", { fatal: true }).decode(line);
        if (text.trim()) this.#accept(JSON.parse(text));
        start = index + 1;
      }
      const rest = chunk.subarray(start);
      if (this.#pending.length + rest.length > this.#maximum) throw new Error("Provider frame exceeds limit");
      if (rest.length) this.#pending = Buffer.concat([this.#pending, rest]);
    } catch (error) { this.#terminal = true; this.#pending = Buffer.alloc(0); throw error; }
  }
  end() {
    if (this.#terminal) throw new Error("Provider frame reader is closed");
    this.#terminal = true;
    if (this.#pending.length) { this.#pending = Buffer.alloc(0); throw new Error("Provider ended with a truncated JSON frame"); }
  }
}
