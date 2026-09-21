const START = "<!-- harness-delegation:start -->";
const END = "<!-- harness-delegation:end -->";

/** Preserve authored text byte-for-byte around one owned section; never activate an empty override. */
export function mergeManagedInstructions(content: string, block: string, override = false): string {
  if (override && !content.trim()) return content;
  const occurrences = (text: string, marker: string) => text.split(marker).length - 1;
  if (occurrences(block, START) !== 1 || occurrences(block, END) !== 1 || !block.startsWith(START) || !block.endsWith(END)) {
    throw new Error("Managed instruction block must contain exactly one enclosing marker pair");
  }
  const starts = occurrences(content, START), ends = occurrences(content, END);
  if (!starts && !ends) return block + (content ? "\n\n" + content : "\n");
  if (starts !== 1 || ends !== 1 || content.indexOf(END) < content.indexOf(START)) throw new Error("Malformed harness delegation markers; repair the managed section before setup");
  return content.slice(0, content.indexOf(START)) + block + content.slice(content.indexOf(END) + END.length);
}
