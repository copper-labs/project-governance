/** Explicit commentary is mutable; unmarked prose and machine declarations remain definition-bearing. */
export function normalizedDeliveryNotes(content: string): string {
  const regions: Array<{ start: number; end: number }> = [], ids = new Set<string>();
  let notes: { id: string; start: number } | null = null;
  let fence: { marker: string; length: number } | null = null;
  for (const line of content.matchAll(/([^\r\n]*)(?:\r\n|\n|\r|$)/gu)) {
    const start = line.index!, end = start + line[0].length;
    const source = start === 0 ? line[1]!.replace(/^\ufeff/u, "") : line[1]!;
    if (fence) {
      const close = /^[ ]{0,3}(`{3,}|~{3,})[ \t]*$/u.exec(source);
      if (close && close[1]![0] === fence.marker && close[1]!.length >= fence.length) fence = null;
      continue;
    }
    const open = /^[ ]{0,3}(`{3,}|~{3,})(.*)$/u.exec(source);
    if (open) {
      if (notes && /^governance-(?:plan|spec)(?:\s|$)/u.test(open[2]!.trim())) throw new Error("Delivery notes cannot contain machine declarations");
      fence = { marker: open[1]![0]!, length: open[1]!.length }; continue;
    }
    const marker = /^<!-- (\/?)governance:notes ([A-Za-z][A-Za-z0-9._-]*) -->$/u.exec(source);
    if (marker) {
      const id = marker[2]!;
      if (!marker[1]) {
        if (notes || ids.has(id)) throw new Error("Nested or duplicate delivery notes");
        ids.add(id); notes = { id, start: end };
      } else {
        if (!notes || notes.id !== id) throw new Error("Unmatched delivery notes");
        regions.push({ start: notes.start, end: start }); notes = null;
      }
    } else if (/<!--\s*\/?governance:notes\b/u.test(source)) throw new Error("Malformed delivery notes marker");
    else if (notes && /<!--\s*\/?governance:(?:item|evidence)\b/u.test(source)) throw new Error("Delivery notes cannot contain progress slots");
  }
  if (notes) throw new Error("Unclosed delivery notes");
  return regions.reverse().reduce((text, region) => text.slice(0, region.start) + text.slice(region.end), content);
}
