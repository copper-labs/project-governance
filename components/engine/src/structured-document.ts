import { isAlias, isMap, isScalar, isSeq, parseDocument } from "yaml";

/** Bounded YAML 1.1/JSON authorities reject duplicates even after merge expansion. */
export function structuredDocument(bytes: Uint8Array, format: "yaml" | "json"): unknown {
  if (bytes.byteLength > 256 * 1024) throw new Error("Document exceeds byte limit");
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (format === "json") JSON.parse(text);
  const document = parseDocument(text, { schema: format === "json" ? "json" : "yaml-1.1", uniqueKeys: true });
  if (document.errors.length || document.warnings.length) throw new Error("Invalid structured document");
  const active = new Set<object>(); let expanded = 0;
  const convert = (node: unknown, depth: number): unknown => {
    if (depth > 64 || ++expanded > 100000) throw new Error("Document expansion limit");
    if (node === null) return null;
    if (isAlias(node)) {
      const resolved = node.resolve(document);
      if (!resolved) throw new Error("Unresolved document alias");
      return convert(resolved, depth + 1);
    }
    if (isScalar(node)) {
      if (typeof node.value === "string" && Buffer.byteLength(node.value) > 16384) throw new Error("Document string limit");
      return node.value;
    }
    if (!isMap(node) && !isSeq(node)) throw new Error("Invalid document node");
    if (active.has(node)) throw new Error("Recursive document alias");
    active.add(node);
    try {
      if (isSeq(node)) return node.items.map(child => convert(child, depth + 1));
      const result: Record<string, unknown> = Object.create(null);
      const put = (key: string, value: unknown) => {
        if (Object.hasOwn(result, key)) throw new Error("Duplicate document key");
        result[key] = value;
      };
      for (const pair of node.items) {
        if (isScalar(pair.key) && typeof pair.key.value === "symbol" && pair.key.value.description === "<<") {
          const value = convert(pair.value, depth + 1), sources = Array.isArray(value) ? value : [value];
          for (const source of sources) {
            if (!source || typeof source !== "object" || Array.isArray(source) || source instanceof Date) throw new Error("Invalid YAML merge source");
            for (const [key, value] of Object.entries(source)) put(key, value);
          }
        } else {
          const key = convert(pair.key, depth + 1);
          // Every field in these authorities is textual; coercion could turn a sequence into a valid field.
          if (typeof key !== "string") throw new Error("Document mapping keys must be strings");
          put(key, convert(pair.value, depth + 1));
        }
      }
      return result;
    } finally { active.delete(node); }
  };
  const value = convert(document.contents, 1);
  let count = 0;
  const inspect = (item: unknown, depth: number) => {
    if (depth > 32) throw new Error("Document nesting limit");
    if (item === null || typeof item !== "object" || item instanceof Date) return;
    const values = Array.isArray(item) ? item : Object.values(item);
    count += values.length; if (count > 20000) throw new Error("Document collection limit");
    if (!Array.isArray(item)) for (const key of Object.keys(item)) inspect(key, depth + 1);
    for (const child of values) inspect(child, depth + 1);
  };
  inspect(value, 1); return value;
}
