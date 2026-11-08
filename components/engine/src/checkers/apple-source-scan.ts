import { spawn } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import { readSubjectSource, SourceReadLimitError, type SubjectSource } from "../change-subject.ts";

const exact = ["[CP]", "Pods_", "Pods/", "Pods.xcodeproj", "pod install", "pod update", "pod repo", "pod trunk", "bundle exec pod", "gem install cocoapods", "XCRemoteSwiftPackageReference", "XCLocalSwiftPackageReference"];
const folded = ["cocoapods", "podfile", ".podspec", "swiftpm", "swift package manager"];
const overlap = Math.max(...exact.concat(folded).map(value => value.length)) - 1;

/** Preserve the policy's literal matches across chunks without retaining whole large blobs. */
export async function appleTokenSummary(chunks: AsyncIterable<Buffer>): Promise<string> {
  const decoder = new StringDecoder("utf8"), found = new Set<string>();
  let tail = "";
  const consume = (next: string) => {
    const text = tail + next;
    for (const token of exact) if (text.includes(token)) found.add(token);
    const lower = text.toLowerCase();
    for (const token of folded) {
      if (lower.includes(token)) found.add(token);
    }
    tail = text.slice(-overlap);
  };
  for await (const bytes of chunks) consume(decoder.write(bytes));
  consume(decoder.end());
  return [...found].join("\n");
}

/** Only immutable Git inputs use streaming fallback. Existing live-file identity checks still apply. */
export async function appleSource(root: string, source: SubjectSource, read?: () => Buffer, live = false): Promise<string> {
  try {
    const bytes = read ? read() : readSubjectSource(root, source);
    return await appleTokenSummary((async function* () { yield bytes; })());
  }
  catch (error) {
    if (!(error instanceof SourceReadLimitError) || source.kind === "worktree" || live) throw error;
  }
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(source.identity)) throw Error("Invalid Apple input identity");
  const child = spawn("git", ["cat-file", "blob", source.identity], { cwd: root,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_NO_REPLACE_OBJECTS: "1" }, stdio: ["ignore", "pipe", "ignore"] });
  const exit = new Promise<void>((resolve, reject) => {
    child.once("error", () => reject(Error("Apple input process failed")));
    child.once("close", code => code === 0 ? resolve() : reject(Error("Apple input process did not complete")));
  });
  const timer = setTimeout(() => child.kill("SIGKILL"), 30000);
  try { const [summary] = await Promise.all([appleTokenSummary(child.stdout!), exit]); return summary; }
  catch (error) { child.kill("SIGKILL"); await exit.catch(() => {}); throw error; }
  finally { clearTimeout(timer); }
}
