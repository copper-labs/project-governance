/** Tokenize legacy quoted command declarations without invoking a shell or expanding variables. */
export function commandTokens(source: string): string[] {
  const tokens: string[] = []; let token = "", started = false, quote: "'" | '"' | null = null;
  for (let index = 0; index < source.length; index++) {
    const char = source[index]!;
    if (char === "\0") throw new Error("NUL is not permitted in a command");
    if (quote === "'") { if (char === "'") quote = null; else token += char; continue; }
    if (char === "\\") {
      const next = source[++index]; if (next === undefined) throw new Error("Unterminated command escape");
      // Match shlex's POSIX double-quote behavior, without shell expansion.
      if (quote === '"' && !['"', "\\"].includes(next)) token += "\\";
      token += next; started = true; continue;
    }
    if (quote === '"') { if (char === '"') quote = null; else token += char; continue; }
    if (char === "'" || char === '"') { quote = char; started = true; continue; }
    if (/[ \t\r\n]/u.test(char)) { if (started) { tokens.push(token); token = ""; started = false; } continue; }
    token += char; started = true;
  }
  if (quote) throw new Error("Unterminated command quote");
  if (started) tokens.push(token);
  return tokens;
}
export interface CommandBindings { stage: string; commit_message_file?: string; pr_body_file?: string; pr_title?: string }
/** Substitutions replace entire tokens only; missing required inputs never dispatch an incomplete command. */
export function resolveCommandArgv(entry: unknown, bindings: CommandBindings): string[] {
  let raw: unknown = entry;
  if (entry && typeof entry === "object" && !Array.isArray(entry)) {
    const record = entry as Record<string, unknown>;
    if (Object.keys(record).some(key => !["run", "stages"].includes(key))) throw new Error("Unsupported command fields");
    raw = record["run"];
  }
  const tokens = typeof raw === "string" ? commandTokens(raw) : raw;
  if (!Array.isArray(tokens) || !tokens.length || tokens.some(token => typeof token !== "string" || token.includes("\0"))) throw new Error("Command requires nonempty string argv");
  const allowed: Record<string, string | undefined> = { "{stage}": bindings.stage || "explicit", "{commit_message_file}": bindings.commit_message_file, "{pr_body_file}": bindings.pr_body_file, "{pr_title}": bindings.pr_title };
  const result = tokens.map((token: string) => {
    if (Object.hasOwn(allowed, token)) { const value = allowed[token]; if (!value) throw new Error("Required command input is missing"); return value; }
    if (token.startsWith("{") && token.endsWith("}")) throw new Error("Unknown command placeholder");
    return token;
  });
  if (!result[0]) throw new Error("Command executable is empty");
  return result;
}
