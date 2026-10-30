/** Lexical fallback ignores connective words; JEV still receives the complete original request. */
const STOP = new Set("the and for with from this that these those into about have has had are was were will would should could please fix update change continue task bound intent which what when where how whether also before after still through their them then than only both there each can our its not".split(" "));
export const contextTerms = (value: string) => new Set((value.replace(/([a-z])([A-Z])/gu, "$1 $2").toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []).filter(term => !STOP.has(term)));

/** Preserve literal identifiers alongside split words; common prose words still earn no match. */
export const contextSearchTerms = (value: string) => new Set([
  ...(value.toLowerCase().match(/[\p{L}\p{N}_]{3,}/gu) ?? []).filter(term => !STOP.has(term)), ...contextTerms(value),
]);
