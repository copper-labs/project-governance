/** Existing governance-v6 token contract; this supplies declarations, not compiler validity. */
export const kotlinParserVersion = "governance-v6";
export interface KotlinDeclaration { kind: "type" | "function"; name: string; line: number; headerEndLine: number; endLine: number; offset: number; public: boolean; signature: string }
interface Token { value: string; offset: number; line: number }
const identifier = /^[A-Za-z_]\w*$/u;
const declarationWords = new Set(["class", "interface", "object", "fun", "typealias"]);
function sanitized(text: string): string {
  const chars = text.split("");
  let index = 0;
  while (index < text.length) {
    const pair = text.slice(index, index + 2), quote = text[index]!;
    let end: number;
    if (pair === "//") { end = text.indexOf("\n", index); if (end < 0) end = text.length; }
    else if (pair === "/*") { end = text.indexOf("*/", index + 2); end = end < 0 ? text.length : end + 2; }
    else if (quote === '"' || quote === "'") {
      const width = quote === '"' && text.slice(index, index + 3) === '"""' ? 3 : 1;
      end = text.indexOf(quote.repeat(width), index + width); end = end < 0 ? text.length : end + width;
    } else { index++; continue; }
    for (let position = index; position < end; position++) if (chars[position] !== "\n") chars[position] = " ";
    index = end;
  }
  return chars.join("");
}
function tokens(text: string): Token[] {
  const clean = sanitized(text), result: Token[] = [];
  let line = 1, previous = 0;
  for (const match of clean.matchAll(/[A-Za-z_]\w*|[^\s]/gu)) {
    for (let i = previous; i < match.index; i++) if (clean[i] === "\n") line++;
    result.push({ value: match[0], offset: match.index, line }); previous = match.index;
  }
  return result;
}
function bodyExtent(stream: Token[], start: number, fallback: number): [number, number] {
  let delimiter = -1;
  for (let i = start; i < stream.length; i++) {
    const value = stream[i]!.value;
    if (["{", "=", ";"].includes(value)) { delimiter = i; break; }
    if (value === "}" || declarationWords.has(value)) break;
  }
  if (delimiter < 0) return [fallback, fallback];
  const header = stream[delimiter]!.line;
  if (stream[delimiter]!.value !== "{") return [header, header];
  let depth = 0, end = header;
  for (let i = delimiter; i < stream.length; i++) {
    const token = stream[i]!;
    if (token.value === "{") depth++;
    if (token.value === "}") depth--;
    end = token.line; if (depth === 0) break;
  }
  return [header, end];
}
export function kotlinDeclarations(text: string): KotlinDeclaration[] {
  const stream = tokens(text), result: KotlinDeclaration[] = [];
  for (let index = 0; index < stream.length; index++) {
    const token = stream[index]!;
    if (!["class", "interface", "object", "fun"].includes(token.value)) continue;
    let boundary = index - 1;
    while (boundary >= 0 && !["{", "}", ";", "val", "var"].includes(stream[boundary]!.value) && !declarationWords.has(stream[boundary]!.value)) boundary--;
    const visible = !stream.slice(boundary + 1, index).some(item => ["private", "internal", "protected"].includes(item.value));
    let name: Token | undefined, after: number, signature: string;
    if (token.value === "fun") {
      let cursor = index + 1, angles = 0;
      while (cursor < stream.length) {
        const current = stream[cursor]!, value = current.value;
        if (value === "<") angles++;
        else if (value === ">" && angles) angles--;
        else if (value === "(" && angles === 0) break;
        else if (identifier.test(value)) name = current;
        if (["{", "}", ";", "="].includes(value) && angles === 0) break;
        cursor++;
      }
      if (!name || stream[cursor]?.value !== "(") continue;
      let depth = 0, close = cursor;
      for (; close < stream.length; close++) {
        if (stream[close]!.value === "(") depth++;
        if (stream[close]!.value === ")") depth--;
        if (depth === 0) break;
      }
      close = Math.min(close, stream.length - 1);
      signature = stream.slice(index + 1, close + 1).map(item => item.value).join(" "); after = close + 1;
    } else {
      name = stream[index + 1]; if (!name || !identifier.test(name.value)) continue;
      signature = name.value; after = index + 2;
    }
    const [headerEndLine, endLine] = bodyExtent(stream, after, token.line);
    result.push({ kind: token.value === "fun" ? "function" : "type", name: name.value, line: token.line, headerEndLine, endLine, offset: token.offset, public: visible, signature });
  }
  return result;
}
