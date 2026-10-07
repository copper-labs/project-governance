/** Decode only documented metadata layouts so fake provider responses test transmitted facts. */
export function wireMetadataEvidence(wire: any, question: any): { id: string; text: string } {
  if (wire.state.layout === "compact-v1") {
    const id = question.instructions.question.match(/state\.items\.(c\d+)/u)?.[1];
    if (!id || !wire.state.items[id]) throw new Error("Question has no supplied compact item");
    const item = wire.state.items[id];
    return { id: item.path, text: item.facts === null ? item.path : typeof item.facts === "string"
      ? item.facts : JSON.stringify({ path: item.path, ...item.facts }) };
  }
  const id = question.instructions.evidenceIds[1];
  const evidence = wire.state.layout === "shared-v1" ? wire.state.evidence : question.instructions.evidence;
  const item = evidence.find((item: any) => item.id === id);
  if (!item) throw new Error("Question has no supplied shared item");
  return item;
}

/** Resolve the actual named passage the provider receives, rather than a fixture-side answer key. */
export function wirePassageEvidence(wire: any, question: any): { path: string; passage: string; sourceUnits: any[]; kind?: string;
  ranges?: Array<{ firstLine: number; lastLine: number; totalLines: number; excerptDigest: string }> } {
  if (wire.state.layout === "compact-v1") {
    const id = question.instructions.question.match(/state\.items\.(c\d+)/u)?.[1];
    if (!id || !wire.state.items[id]) throw new Error("Question has no supplied compact passage");
    return wire.state.items[id];
  }
  const id = question.instructions.evidenceIds[1];
  const item = wire.state.evidence.find((item: any) => item.id === id);
  if (!item) throw new Error("Question has no supplied passage");
  return JSON.parse(item.text);
}
