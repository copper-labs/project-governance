import type { DecisionRequest } from "./decisions.ts";

/** Deterministic term overlap weighted toward terms that distinguish candidates; ties preserve discovery order. */
export function lexicalContextOrder(request: DecisionRequest): string[] {
  const words = (value: string) => new Set(value.toLowerCase().match(/[\p{L}\p{N}_]{3,}/gu) ?? []);
  const query = words(request.purpose);
  const documents = request.candidates.map(candidate => words(`${candidate.id}\n${candidate.excerpt}`));
  const weights = new Map([...query].map(term => [term, Math.log(1 + documents.length / (1 + documents.filter(document => document.has(term)).length))]));
  return request.candidates.map((candidate, index) => ({ id: candidate.id, index,
    score: [...query].reduce((sum, term) => sum + (documents[index]!.has(term) ? weights.get(term)! : 0), 0),
  })).sort((left, right) => right.score - left.score || left.index - right.index).map(candidate => candidate.id);
}
