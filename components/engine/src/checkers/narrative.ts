import type { Finding } from "../checker-results.ts";

const PLACEHOLDERS = new Set(["-", "n/a", "na", "none", "not applicable", "placeholder", "same as above", "see diff", "to be added", "to be determined", "todo", "tbd", "unknown", "various"]);
const GENERIC = new Set(["bug fix", "change", "changes", "cleanup", "draft", "fix", "fixes", "misc", "misc changes", "pr", "pull request", "refactor", "test", "testing", "update", "updates", "wip", "work in progress"]);
const lines = (value: string) => value.split(/\r\n|[\n\r\v\f\u001c-\u001e\u0085\u2028\u2029]/u);
export const withoutComments = (value: string) => value.replace(/<!--[\s\S]*?-->/g, match => "\n".repeat((match.match(/\n/g) ?? []).length));
const authored = (value: string) => lines(withoutComments(value)).map(v => v.trim()).filter(Boolean).join("\n");
const strip = (value: string) => value.replace(/^[ .:;,\-—–]+|[ .:;,\-—–]+$/g, "");
export function isPlaceholder(value: string): boolean {
  const normalized = strip(authored(value).toLowerCase().replace(/[`*_]/g, "").replace(/\s+/g, " "));
  return !normalized || PLACEHOLDERS.has(normalized) || /^<[^<>]+>$/.test(normalized) || /^\[[^\[\]]+\]$/.test(normalized);
}
export function unhelpfulOutcome(value: string): boolean {
  const normalized = strip(authored(value).replace(/\s+/g, " ")).toLowerCase();
  return isPlaceholder(value) || GENERIC.has(normalized) || /^(?:#[0-9]+|[a-z][a-z0-9_-]*-[0-9]+|[0-9]+)$/.test(normalized);
}
const finding = (rule_id: string, path: string, message: string, line = 1): Finding => ({ rule_id, severity: "blocking", path, line, message });
const payload = (check: string, findings: Finding[]) => ({ version: 1, check, status: findings.length ? "failed" : "passed", finding_count: findings.length, findings });
const SCISSORS = /^-+[ \t]*>8[ \t]*-+$/;
const TRAILER = /^(?:(?:signed-off|co-authored|reviewed|acked|tested|reported|suggested|helped|mentored)-by|change-id|depends-on|fixes|closes|refs|see-also):[ \t]+\S/i;
const QUOTED = "'[^'\\n]+'";
const GENERATED = [new RegExp(`^Merge branch ${QUOTED}(?: (?:into|of) .+)?$`), new RegExp(`^Merge branches ${QUOTED}(?:, ${QUOTED})*(?: and ${QUOTED})?(?: into .+)?$`),
  new RegExp(`^Merge remote-tracking branch ${QUOTED}(?: into .+)?$`), new RegExp(`^Merge tag ${QUOTED}(?: into .+)?$`), /^Merge commit '[0-9a-fA-F]{7,64}'(?: into .+)?$/, /^Merge pull request #[0-9]+ from .+$/, /^(?:Revert|Reapply) ".+"$/, /^(?:fixup|squash|amend)![ \t]+.+$/];

/** Validate authored commit content while preserving Git-owned generated messages and comment cleanup. */
export function checkCommitMessage(text: string, path: string, configuredMarker = "#") {
  const findings: Finding[] = [];
  let marker = !configuredMarker || configuredMarker === "auto" ? "#" : configuredMarker;
  for (const line of lines(text)) {
    const match = /^([^A-Za-z0-9\s][^\s]*)[ \t]+(.+)$/.exec(line);
    if (match && SCISSORS.test(match[2]!.trim())) { marker = match[1]!; break; }
  }
  const records: Array<{ line: number; text: string }> = [];
  for (const [index, line] of lines(text).entries()) {
    if (line.startsWith(marker)) { if (SCISSORS.test(line.slice(marker.length).trim())) break; continue; }
    records.push({ line: index + 1, text: line });
  }
  while (records.length && !records[0]!.text.trim()) records.shift();
  while (records.length && !records.at(-1)!.text.trim()) records.pop();
  const subject = (records[0]?.text ?? "").replace(/^\ufeff+/, "").trim(), line = records[0]?.line ?? 1;
  if ([...subject].length < 8) findings.push(finding("commit-message.short-subject", path, "commit subject must contain at least eight characters", line));
  else if (unhelpfulOutcome(subject)) findings.push(finding("commit-message.unhelpful-subject", path, "commit subject must state a useful outcome, not a placeholder, generic label, or ticket alone", line));
  if (!findings.length && subject && !GENERATED.some(regex => regex.test(subject))) {
    const bodyRecords = records.slice(1).filter(r => r.text.trim() && !TRAILER.test(r.text.trim()));
    const body = bodyRecords.map(r => r.text).join("\n").trim();
    if (!body) findings.push(finding("commit-message.body-missing", path, "commit body needs a short authored explanation beyond Git trailers"));
    else if (isPlaceholder(body)) findings.push(finding("commit-message.body-placeholder", path, "replace the placeholder commit body with an authored explanation", bodyRecords[0]!.line));
  }
  return payload("commit-message", findings);
}

/** Preserve source line positions while excluding hidden guidance and fenced examples from authored fields. */
function visibleLines(text: string): Array<{ text: string; line: number }> {
  let fence: string | null = null;
  return lines(withoutComments(text)).map((text, index) => {
    const marker = text.trimStart().slice(0, 3);
    if (["```", "~~~"].includes(marker)) { if (fence === null) fence = marker; else if (fence === marker) fence = null; return { text: "", line: index + 1 }; }
    return { text: fence === null ? text : "", line: index + 1 };
  });
}
const REQUIRED = [["product-impact", "Product impact"], ["nature-of-change", "Nature of the change"], ["code-areas-impacted", "Code areas impacted"], ["why", "Why"]] as const;

/** Enforce deterministic narrative structure, leaving editorial quality and technical judgment to review. */
export function checkPrDescription(titleInput: string | null, body: string, path: string, titlePath = "pull-request-title") {
  const findings: Finding[] = [], title = titleInput?.trim() ?? "";
  if (titleInput === null) findings.push(finding("pr-description.title-missing", titlePath, "pull request title is missing; pass --pr-title with --pr-body-file"));
  else if (!title || lines(title).length !== 1) findings.push(finding("pr-description.title-multiline", titlePath, "pull request title must be one line"));
  else if ([...title].length < 8) findings.push(finding("pr-description.title-short", titlePath, "pull request title must contain at least eight characters"));
  else if (unhelpfulOutcome(title)) findings.push(finding("pr-description.title-unhelpful", titlePath, "pull request title must state a useful outcome, not a placeholder, generic label, or ticket alone"));
  if (!authored(body)) { findings.push(finding("pr-description.empty-body", path, "pull request body needs the required change-narrative sections")); return payload("pr-description", findings); }
  const visible = visibleLines(body), headings: Array<{ title: string; index: number; line: number }> = [];
  for (const [index, record] of visible.entries()) {
    const disallowed = /^[ \t]*#{1,6}[ \t]+(Outcome|Validation|Risks or required action)[ \t]*:?(?:[ \t]+#+)?[ \t]*$/i.exec(record.text);
    if (disallowed) {
      const title = disallowed[1]!;
      findings.push(finding("pr-description.section-not-allowed", path, title.toLowerCase() === "outcome" ? "put the pull request outcome in its title; remove the Outcome body section" : `remove the ${title} body section; use checks or Product impact as appropriate`, record.line));
    }
    const match = /^##[ \t]+(.+?)[ \t]*$/.exec(record.text);
    if (match) headings.push({ title: match[1]!, index, line: record.line });
  }
  const positions: number[] = [];
  for (const [id, title] of REQUIRED) {
    const found = headings.filter(h => h.title === title), first = found[0];
    if (!first) { findings.push(finding("pr-description.section-missing", path, `required pull request section is missing: ## ${title}`)); continue; }
    positions.push(first.index);
    if (found.length > 1) findings.push(finding("pr-description.section-duplicate", path, `pull request section must appear once: ## ${title}`, found[1]!.line));
    const next = headings[headings.indexOf(first) + 1]?.index ?? visible.length;
    const content = visible.slice(first.index + 1, next);
    if (isPlaceholder(content.map(v => v.text).join("\n"))) findings.push(finding("pr-description.field-placeholder", path, `pull request section needs authored content: ## ${title}`, first.line));
    if (!["product-impact", "code-areas-impacted"].includes(id)) continue;
    const bullets = content.flatMap(record => { const match = /^[ \t]*[-*+][ \t]+(.+?)[ \t]*$/.exec(record.text); return match ? [{ value: match[1]!, line: record.line }] : []; });
    if (!bullets.length) { findings.push(finding("pr-description.bullets-missing", path, `pull request section needs at least one bullet: ## ${title}`, first.line)); continue; }
    for (const bullet of bullets) if (isPlaceholder(bullet.value)) findings.push(finding("pr-description.field-placeholder", path, `pull request bullet needs authored content: ## ${title}`, bullet.line));
    if (id === "product-impact") for (const bullet of bullets) {
      const colon = bullet.value.indexOf(":");
      if (colon < 0) findings.push(finding("pr-description.product-impact-shape", path, "each Product impact bullet must use '<top-level area>: <how the change surfaces>'", bullet.line));
      else if (isPlaceholder(bullet.value.slice(0, colon)) || isPlaceholder(bullet.value.slice(colon + 1))) findings.push(finding("pr-description.field-placeholder", path, "Product impact needs an authored area and surface explanation", bullet.line));
    }
  }
  if (positions.length === REQUIRED.length && positions.some((p, i) => i > 0 && p < positions[i - 1]!)) findings.push(finding("pr-description.section-order", path, "pull request sections must follow Product impact, Nature of the change, Code areas impacted, then Why", Math.min(...positions) + 1));
  return payload("pr-description", findings);
}
