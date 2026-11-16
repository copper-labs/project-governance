/** Compare reference blocks, including their heading context, rather than reviving old plan history. */
export function introducedPlanReferences(before: string, after: string, terms: readonly string[]): boolean {
  const prior = new Map<string, number>();
  for (const block of referenceBlocks(before, terms)) prior.set(block, (prior.get(block) ?? 0) + 1);
  for (const block of referenceBlocks(after, terms)) {
    const remaining = prior.get(block) ?? 0;
    if (!remaining) return true;
    prior.set(block, remaining - 1);
  }
  return false;
}

/** No history heading or code fence can exempt a newly introduced dependency statement. */
function referenceBlocks(source: string, terms: readonly string[]): string[] {
  const blocks: string[] = [], headings: string[] = [];
  let paragraph: string[] = [], fence: { marker: string; length: number } | null = null;
  const flush = () => {
    const body = paragraph.join("\n");
    if (terms.some(term => body.toLowerCase().includes(term))) blocks.push(JSON.stringify([headings, body]));
    paragraph = [];
  };
  for (const line of source.split(/\r\n|\n|\r/u)) {
    const marker = /^[ ]{0,3}(`{3,}|~{3,})(.*)$/u.exec(line);
    if (fence) {
      paragraph.push(line);
      if (marker && marker[1]![0] === fence.marker && marker[1]!.length >= fence.length && !marker[2]!.trim()) {
        fence = null; flush();
      }
    } else if (marker) {
      flush(); fence = { marker: marker[1]![0]!, length: marker[1]!.length }; paragraph.push(line);
    } else {
      const heading = /^[ ]{0,3}(#{1,6})[ \t]+(.+)$/u.exec(line);
      const underline = /^[ ]{0,3}(=+|-+)[ \t]*$/u.exec(line);
      if (underline && paragraph.length === 1) {
        const level = underline[1]![0] === "=" ? 1 : 2;
        headings.length = level; headings[level - 1] = paragraph[0]!;
        paragraph.push(line); flush();
      } else if (heading) {
        flush(); headings.length = heading[1]!.length; headings[heading[1]!.length - 1] = heading[2]!;
        paragraph.push(line); flush();
      } else if (!line.trim()) flush();
      else paragraph.push(line);
    }
  }
  flush();
  return blocks;
}
