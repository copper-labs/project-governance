import { execFileSync, spawnSync } from "node:child_process";
import { parse } from "yaml";
import type { ChangeScope, SourceRangeApprovalLocator, ValidationSubject } from "../change-subject.ts";
import { canonical, digest, object } from "../core.ts";
import { compiledRuntimeLock } from "../runtime-lock.ts";
import { executingRuntimeLockDigest, runtimeExecutionIdentity } from "../runtime-execution-identity.ts";

const lockPath = "config/governance/runtime.lock.yaml";
const locatorKey = "project-governance.sourceRangeOwner";
const githubName = "[a-zA-Z0-9_.-]+";
const remotePattern = new RegExp(`^(?:https://github\\.com/|git@github\\.com:|ssh://git@github\\.com/)(${githubName}/${githubName})$`, "u");

export function sourceRangeRepository(location: string): string | undefined {
  return remotePattern.exec(location.replace(/\.git$/u, ""))?.[1]?.toLowerCase();
}

function gitText(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", timeout: 5000, maxBuffer: 16384,
    stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_NO_REPLACE_OBJECTS: "1" } }).trim();
}

/** The local Git metadata supplies a locator. GitHub supplies the decision and authority. */
export function sourceRangeOwnerLocator(root: string): SourceRangeApprovalLocator | null {
  const input = spawnSync("git", ["config", "--local", "--get-all", locatorKey],
    { cwd: root, encoding: "utf8", timeout: 5000, maxBuffer: 2048, stdio: ["ignore", "pipe", "ignore"] });
  if (input.status === 1 && !input.error) return null;
  if (input.status !== 0 || input.error) throw new Error("Cannot read source range review locator");
  const lines = input.stdout.trim().split("\n");
  if (lines.length !== 1) throw new Error("One exact source range review locator is required");
  const row = object(JSON.parse(lines[0]!), "source range review locator");
  const origin = sourceRangeRepository(gitText(root, ["remote", "get-url", "--push", "origin"]));
  if (Object.keys(row).length !== 3 || typeof row.repository !== "string" || row.repository !== origin ||
      typeof row.branch !== "string" || typeof row.comment !== "string" || !/^[A-Za-z0-9_=-]{1,128}$/u.test(row.comment) ||
      gitText(root, ["check-ref-format", "--normalize", `refs/heads/${row.branch}`]) !== `refs/heads/${row.branch}`)
    throw new Error("Invalid source range review locator");
  return { repository: row.repository, branch: row.branch, comment: row.comment };
}

export function sourceRangeOwnerRequest(subject: {
  repositoryId: number; repository: string; branch: string; base: string; candidateTree: string;
  previousProjection: string; successorProjection: string;
  checkerLock: string; checkerArchive: string; producerInputs: [string, string][];
}) {
  return `project-governance source-range request v1\n\n\`\`\`json\n${JSON.stringify(JSON.parse(canonical(subject)), null, 2)}\n\`\`\``;
}

export function sourceRangeOwnerDecision(request: string) {
  return `Approve Project Governance source-range transition ${digest(request)}`;
}

export function sourceRangeAdministratorDecision(request: string) {
  return `Authorize Project Governance source-range transition as repository administrator ${digest(request)}`;
}

const commentQuery = `query($id: ID!) {
  viewer { databaseId }
  node(id: $id) { ... on IssueComment {
    body lastEditedAt isMinimized
    author { ... on User { databaseId } }
    issue { body state lastEditedAt author { ... on User { databaseId } }
      closureHistory: timelineItems(first: 1, itemTypes: [CLOSED_EVENT, REOPENED_EVENT]) { nodes { __typename } }
      repository { databaseId nameWithOwner viewerPermission }
    }
  } }
}`;

/** The CLI supplies a credential only. A system HTTPS client reads the decision from GitHub. */
function githubToken(): string {
  const token = execFileSync("gh", ["auth", "token", "--hostname", "github.com"],
    { encoding: "utf8", timeout: 5000, maxBuffer: 1024, stdio: ["ignore", "pipe", "ignore"],
      env: { ...process.env, GH_PROMPT_DISABLED: "1" } }).trim();
  if (!/^[A-Za-z0-9_]{1,256}$/u.test(token)) throw new Error("GitHub approval credential is unavailable");
  return token;
}

function github(token: string, endpoint: string, body?: object): Record<string, unknown> {
  const args = ["--disable", "--config", "-", "--silent", "--fail", "--max-time", "5", "--max-filesize", "262144",
    "--proto", "=https", "--noproxy", "*", "--header", "Accept: application/vnd.github+json",
    "--header", "X-GitHub-Api-Version: 2022-11-28", "--user-agent", "Project-Governance"];
  if (body) args.push("--header", "Content-Type: application/json", "--data-binary", JSON.stringify(body));
  return object(JSON.parse(execFileSync("/usr/bin/curl", [...args, `https://api.github.com/${endpoint}`],
    { encoding: "utf8", timeout: 6000, maxBuffer: 256 * 1024, stdio: ["pipe", "pipe", "ignore"],
      env: {}, input: `header = "Authorization: Bearer ${token}"\n` })), "GitHub approval response");
}

function ownerId(value: unknown): number {
  const id = object(value, "GitHub user").databaseId;
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id < 1) throw new Error("Missing GitHub user");
  return id;
}

export function verifySourceRangeOwnerResponse(response: Record<string, unknown>, expected: Parameters<typeof sourceRangeOwnerRequest>[0],
  liveBranch: Record<string, unknown>, protection: Record<string, unknown>): void {
  const comment = object(response.node, "GitHub review comment");
  const issue = object(comment.issue, "GitHub review request");
  const repository = object(issue.repository, "GitHub review repository");
  const request = sourceRangeOwnerRequest(expected), reviewer = ownerId(comment.author);
  const author = ownerId(issue.author);
  const authorized = reviewer === author
    ? repository.viewerPermission === "ADMIN" && comment.body === sourceRangeAdministratorDecision(request)
    : comment.body === sourceRangeOwnerDecision(request);
  const users = object(protection.restrictions, "GitHub branch restrictions").users;
  const closureHistory = object(issue.closureHistory, "GitHub review closure history").nodes;
  if (repository.databaseId !== expected.repositoryId || typeof repository.nameWithOwner !== "string" ||
      repository.nameWithOwner.toLowerCase() !== expected.repository || issue.state !== "OPEN" ||
      !Array.isArray(closureHistory) || closureHistory.length !== 0 ||
      issue.lastEditedAt !== null || issue.body !== request || author !== ownerId(response.viewer) ||
      !authorized || comment.lastEditedAt !== null || comment.isMinimized !== false ||
      liveBranch.name !== expected.branch || liveBranch.protected !== true ||
      object(liveBranch.commit, "GitHub branch commit").sha !== expected.base ||
      object(protection.enforce_admins, "GitHub branch admin enforcement").enabled !== true ||
      object(protection.allow_force_pushes, "GitHub force push policy").enabled !== false ||
      object(protection.allow_deletions, "GitHub deletion policy").enabled !== false ||
      !Array.isArray(users) || !users.some(user => user?.id === reviewer && user?.type === "User"))
    throw new Error("Hosted source range decision is absent, stale, altered or unauthorized");
}

/** Bind approval to the executing checker, captured source tree and still-live protected base. */
export function verifySourceRangeOwner(locator: SourceRangeApprovalLocator, subject: ValidationSubject, scope: ChangeScope,
  previousProjection: string, successorProjection: string, inputs: Map<string, string>): void {
  if (!scope.base_ref || !scope.candidate_tree ||
      (scope.mode !== "staged" && (!scope.candidate_ref ||
        gitText(subject.root, ["show", "-s", "--format=%P", scope.candidate_ref]) !== scope.base_ref)))
    throw new Error("No exact source range owner review subject");
  const lock = compiledRuntimeLock(parse(subject.read(lockPath, 4096).toString("utf8")));
  const checkerLock = digest(lock), checkerArchive = runtimeExecutionIdentity().archiveDigest;
  if (!checkerArchive || executingRuntimeLockDigest() !== checkerLock)
    throw new Error("Captured checker pin differs from the verified executing runtime");
  const endpoint = `repos/${locator.repository}/branches/${encodeURIComponent(locator.branch)}`;
  const token = githubToken();
  const branch = github(token, endpoint), protection = github(token, `${endpoint}/protection`);
  const response = github(token, "graphql", { query: commentQuery, variables: { id: locator.comment } });
  if (Object.hasOwn(response, "errors")) throw new Error("GitHub approval query failed");
  const data = object(response.data, "GitHub approval data");
  const comment = object(data.node, "GitHub review comment");
  const repository = object(object(comment.issue, "GitHub review request").repository, "GitHub review repository");
  const repositoryId = github(token, `repos/${locator.repository}`).id;
  if (typeof repositoryId !== "number" || !Number.isSafeInteger(repositoryId) || repositoryId < 1 ||
      repository.databaseId !== repositoryId) throw new Error("GitHub repository identity mismatch");
  verifySourceRangeOwnerResponse(data, { repositoryId, repository: locator.repository, branch: locator.branch,
    base: scope.base_ref, candidateTree: scope.candidate_tree, previousProjection, successorProjection,
    checkerLock, checkerArchive, producerInputs: [...inputs.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0) }, branch, protection);
}
