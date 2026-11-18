import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { materializeChangePacket } from "../src/change-packet.ts";
import { prepareCommand } from "../src/cli.ts";
import { resolveChangeScope, SOURCE_RANGE_PROJECTION_PATH } from "../src/change-subject.ts";
import { sourceRangeAdministratorDecision, sourceRangeOwnerDecision, sourceRangeOwnerRequest, sourceRangeRepository,
  verifySourceRangeOwnerResponse } from "../src/checkers/dependency-source-range-owner.ts";
import { prePushCheckRequest } from "../src/git-hooks.ts";

const expected = { repositoryId: 11, repository: "fixture/project", branch: "release/beta", base: "a".repeat(40),
  candidateTree: "b".repeat(40), previousProjection: "sha256:" + "1".repeat(64), successorProjection: "sha256:" + "2".repeat(64),
  checkerLock: "sha256:" + "3".repeat(64), checkerArchive: "sha256:" + "4".repeat(64),
  producerInputs: [["package.json", "sha256:" + "5".repeat(64)]] as [string, string][] };

// All identities and hosted responses in this fixture are synthetic.
function syntheticHostedReview() {
  const packet = sourceRangeOwnerRequest(expected);
  return { response: { viewer: { databaseId: 21 }, node: { body: sourceRangeOwnerDecision(packet), lastEditedAt: null as string | null,
    isMinimized: false, author: { databaseId: 22 }, issue: { body: packet, state: "OPEN", lastEditedAt: null as string | null,
      author: { databaseId: 21 }, closureHistory: { nodes: [] as Array<{ __typename: string }> | null },
      repository: { databaseId: 11, nameWithOwner: "fixture/project", viewerPermission: "ADMIN" } } } },
  branch: { name: expected.branch, protected: true, commit: { sha: expected.base } },
  protection: { enforce_admins: { enabled: true }, allow_force_pushes: { enabled: false }, allow_deletions: { enabled: false },
    restrictions: { users: [{ type: "User", id: 22 }] } } };
}

test("exact hosted approval admits the complete request from a different current protected publisher", () => {
  const { response, branch, protection } = syntheticHostedReview();
  verifySourceRangeOwnerResponse(response, expected, branch, protection);
  assert.match(response.node.issue.body, /"producerInputs"/);
});

test("repository administrator can authorize their exact protected transition explicitly", () => {
  const { response, branch, protection } = syntheticHostedReview();
  response.node.author.databaseId = response.viewer.databaseId;
  protection.restrictions.users[0]!.id = response.viewer.databaseId;
  assert.throws(() => verifySourceRangeOwnerResponse(response, expected, branch, protection));
  response.node.body = sourceRangeAdministratorDecision(response.node.issue.body);
  verifySourceRangeOwnerResponse(response, expected, branch, protection);
  assert.throws(() => verifySourceRangeOwnerResponse(response, { ...expected, candidateTree: "c".repeat(40) }, branch, protection));
  assert.throws(() => verifySourceRangeOwnerResponse(response, expected, branch, {
    ...protection, restrictions: { users: [] },
  }));
  response.node.issue.repository.viewerPermission = "MAINTAIN";
  assert.throws(() => verifySourceRangeOwnerResponse(response, expected, branch, protection));
});

test("hosted approval refuses absent, edited, withdrawn, self-approved and unentitled decisions", () => {
  const cases: Record<string, (fixture: ReturnType<typeof syntheticHostedReview>) => void> = {
    "missing decision": f => { f.response.node.body = ""; },
    "edited decision": f => { f.response.node.lastEditedAt = "2026-11-18T00:00:00Z"; },
    "edited request": f => { f.response.node.issue.lastEditedAt = "2026-11-18T00:00:00Z"; },
    "closed request": f => { f.response.node.issue.state = "CLOSED"; },
    "reopened request with the original decision": f => { f.response.node.issue.closureHistory.nodes = [{ __typename: "ReopenedEvent" }]; },
    "unavailable issue closure history": f => { f.response.node.issue.closureHistory.nodes = null; },
    "minimized decision": f => { f.response.node.isMinimized = true; },
    "same reviewer and proposer": f => { f.response.node.author.databaseId = 21; f.protection.restrictions.users[0]!.id = 21; },
    "different publisher": f => { f.response.viewer.databaseId = 22; },
    "removed reviewer": f => { f.protection.restrictions.users = []; },
    "removed admin protection": f => { f.protection.enforce_admins.enabled = false; },
    "force push enabled": f => { f.protection.allow_force_pushes.enabled = true; },
    "branch deletion enabled": f => { f.protection.allow_deletions.enabled = true; },
    "moved live head": f => { f.branch.commit.sha = expected.candidateTree; },
    "unprotected branch": f => { f.branch.protected = false; },
  };
  for (const [name, change] of Object.entries(cases)) {
    const f = syntheticHostedReview(); change(f);
    assert.throws(() => verifySourceRangeOwnerResponse(f.response, expected, f.branch, f.protection), /GitHub|Hosted/, name);
  }
  const f = syntheticHostedReview();
  assert.throws(() => verifySourceRangeOwnerResponse({}, expected, f.branch, f.protection));
});

test("approval refuses reuse after changing any identity or producer input", () => {
  const { response, branch, protection } = syntheticHostedReview();
  const cases: Array<Partial<typeof expected>> = [{ repositoryId: 33 }, { repository: "fixture/fork" }, { branch: "release/other" },
    { base: "c".repeat(40) }, { candidateTree: "c".repeat(40) }, { previousProjection: expected.successorProjection },
    { successorProjection: expected.previousProjection }, { checkerLock: expected.checkerArchive }, { checkerArchive: expected.checkerLock },
    { producerInputs: [] }, { producerInputs: [["package.json", expected.checkerLock]] }];
  for (const changes of cases) assert.throws(() => verifySourceRangeOwnerResponse(response, { ...expected, ...changes }, branch, protection));
});

test("captured staged and committed trees bind the prospective change and cannot be pushed to another ref", async () => {
  const root = mkdtempSync(join(tmpdir(), "range-owner-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  const url = "git@github.com:fixture/project.git";
  const input = (tree: string, destination: string, base: string) =>
    Readable.from([`refs/heads/local ${tree} refs/heads/${destination} ${base}\n`]);
  try {
    git("init", "-q"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.invalid");
    git("config", "commit.gpgsign", "false"); git("remote", "add", "origin", url);
    git("commit", "--allow-empty", "-qm", "Initial fixture");
    const base = git("rev-parse", "HEAD");
    mkdirSync(join(root, dirname(SOURCE_RANGE_PROJECTION_PATH)), { recursive: true });
    writeFileSync(join(root, SOURCE_RANGE_PROJECTION_PATH), "{}\n");
    git("add", SOURCE_RANGE_PROJECTION_PATH);
    const tree = git("write-tree");
    assert.equal(resolveChangeScope(root, { staged: true }).candidate_tree, tree);
    git("commit", "-qm", "Prospective fixture");
    const candidate = git("rev-parse", "HEAD");
    assert.equal(resolveChangeScope(root, { baseRef: base, candidateRef: candidate }).candidate_tree, tree);
    const withoutOwner = await prePushCheckRequest(root, ["origin", url], input(candidate, expected.branch, base));
    git("config", "--local", "project-governance.sourceRangeOwner", JSON.stringify({ repository: expected.repository, branch: expected.branch, comment: "synthetic" }));
    const first = await prePushCheckRequest(root, ["origin", url], input(candidate, expected.branch, base));
    assert.deepEqual(first.sourceRangePush, { owner: { repository: expected.repository, branch: expected.branch, comment: "synthetic" } });
    await assert.rejects(prePushCheckRequest(root, ["origin", url], input(candidate, "release/other", base)), /destination/);
    await assert.rejects(prePushCheckRequest(root, ["origin", "git@github.com:fixture/fork.git"], input(candidate, expected.branch, base)), /destination/);
    await assert.rejects(prePushCheckRequest(root, ["origin", url], input(candidate, expected.branch, "0".repeat(40)), { GOVERNANCE_BASE_REF: base }), /destination/);
    git("config", "--local", "project-governance.sourceRangeOwner", JSON.stringify({ repository: expected.repository, branch: "release/other", comment: "other" }));
    await assert.rejects(prePushCheckRequest(root, ["origin", url], input(candidate, expected.branch, base)), /destination/);
    const packs = fileURLToPath(new URL("../../../src/project_governance_runtime/packs/", import.meta.url));
    const prepare = (request: typeof first) => prepareCommand(request.args, root, packs, "check", request.sourceRangePush);
    const prepared = prepare(first);
    const divergentRemote = git("commit-tree", tree, "-p", base, "-m", "Remote with the same projection on another lineage");
    const divergent = await prePushCheckRequest(root, ["origin", url], input(candidate, "release/other", divergentRemote));
    assert.equal(prepare(divergent).scope.base_ref, base);
    assert.deepEqual(prepare(divergent).scope.source_range_push, { owner: null });
    assert.deepEqual(prepare(withoutOwner).scope.source_range_push, { owner: null });
    assert.deepEqual(prepared.scope.source_range_push, first.sourceRangePush);
    const packetDir = join(root, "captured");
    await materializeChangePacket(root, prepared.scope, packetDir);
    const packet = JSON.parse(readFileSync(join(packetDir, "change-packet.json"), "utf8"));
    assert.deepEqual(packet.source_range_push, first.sourceRangePush);
    assert.equal(sourceRangeRepository("https://github.com/fixture/project"), expected.repository);
    assert.equal(sourceRangeRepository("https://github.com@invalid/fixture/project"), undefined);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
