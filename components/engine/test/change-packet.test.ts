import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, openSync, closeSync, ftruncateSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveChangeScope, subjectDigest } from "../src/change-subject.ts";
import { materializeChangePacket, PacketCaptureError } from "../src/change-packet.ts";
import { fileDigest } from "../src/core.ts";

test("external checker packets carry exact staged bytes and content hashes", async () => {
  const root = mkdtempSync(join(tmpdir(), "materialized-packet-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root });
  try {
    git("init", "-q"); git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-qm", "Initial");
    writeFileSync(join(root, "example.txt"), "staged\n"); git("add", ".");
    const scope = resolveChangeScope(root, { staged: true }); writeFileSync(join(root, "example.txt"), "later\n");
    const result = await materializeChangePacket(root, scope, join(root, "packet"));
    const after = result.packet.records[0]!["after_path"] as string;
    assert.equal(readFileSync(after, "utf8"), "staged\n");
    assert.equal(fileDigest(after).slice(7), result.packet.records[0]!["after_sha256"]);
    assert.equal(fileDigest(result.path).slice(7), result.env["PROJECT_GOVERNANCE_CHANGE_PACKET_SHA256"]);
    await assert.rejects(() => materializeChangePacket(root, { ...scope, subject_digest: "incorrect" }, join(root, "bad")));
  } finally { rmSync(root, { recursive: true, force: true }); }
});


test("oversized committed input fails visibly without publishing a partial packet", async () => {
  const root = mkdtempSync(join(tmpdir(), "committed-packet-limit-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  try {
    git("init", "-q"); git("config", "user.name", "Test"); git("config", "user.email", "test@example.invalid"); git("commit", "--allow-empty", "-qm", "base");
    const base = git("rev-parse", "HEAD");
    writeFileSync(join(root, "committed.zip"), Buffer.alloc(17 * 1024 * 1024)); git("add", "."); git("commit", "-qm", "candidate");
    const scope = resolveChangeScope(root, { baseRef: base, candidateRef: git("rev-parse", "HEAD") });
    const directory = join(root, "packet");
    await assert.rejects(() => materializeChangePacket(root, scope, directory), error => error instanceof PacketCaptureError &&
      error.capture.reason === "source-over-limit" && error.capture.source_kind === "git" && error.capture.side === "after" &&
      error.capture.size_bytes === 17 * 1024 * 1024 && error.capture.limit_bytes === 16 * 1024 * 1024);
    assert.equal(existsSync(directory), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("opted-in staged and committed packets prove large before and after-image bytes", async () => {
  const root = mkdtempSync(join(tmpdir(), "large-immutable-packet-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  try {
    git("init", "-q"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.invalid");
    const name = "proposal.json", file = join(root, name);
    const before = '["' + "a".repeat(17 * 1024 * 1024) + '"]\n';
    const after = before.replace('["a', '["b');
    writeFileSync(file, before); git("add", name); git("commit", "-qm", "base");
    const base = git("rev-parse", "HEAD");
    writeFileSync(file, after); git("add", name);
    const staged = resolveChangeScope(root, { staged: true });
    await assert.rejects(materializeChangePacket(root, staged, join(root, "default")), PacketCaptureError);
    writeFileSync(file, "opposing live image\n");
    const stagedPacket = await materializeChangePacket(root, staged, join(root, "staged"), { largeImmutable: true });
    assert.equal(fileDigest(stagedPacket.packet.records[0]!.before_path as string).slice(7), stagedPacket.packet.records[0]!.before_sha256);
    assert.equal(readFileSync(stagedPacket.packet.records[0]!.before_path as string, "utf8") === before, true);
    assert.equal(stagedPacket.readLargeAfter(name)?.toString() === after, true);
    assert.equal(stagedPacket.packet.subject_digest, staged.subject_digest);
    assert.equal(stagedPacket.env.PROJECT_GOVERNANCE_CHANGE_PACKET_SHA256, fileDigest(stagedPacket.path).slice(7));
    await assert.rejects(materializeChangePacket(root, resolveChangeScope(root, { baseRef: base }), join(root, "live"), { largeImmutable: true }), PacketCaptureError);
    assert.equal(existsSync(join(root, "live")), false);

    git("commit", "-qm", "candidate"); const candidate = git("rev-parse", "HEAD");
    writeFileSync(file, "opposing staged image\n"); git("add", name);
    const committed = resolveChangeScope(root, { baseRef: base, candidateRef: candidate });
    const committedPacket = await materializeChangePacket(root, committed, join(root, "committed"), { largeImmutable: true });
    assert.equal(committedPacket.packet.candidate_ref, candidate);
    assert.equal(committedPacket.packet.records[0]!.before_sha256, stagedPacket.packet.records[0]!.before_sha256);
    assert.equal(committedPacket.packet.records[0]!.after_sha256, stagedPacket.packet.records[0]!.after_sha256);
    const image = committedPacket.packet.records[0]!.after_path as string;
    rmSync(image); writeFileSync(image, "tampered\n");
    assert.throws(() => committedPacket.readLargeAfter(name), /changed/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("the immutable extension refuses an over-budget Git blob before publishing any packet", async () => {
  const root = mkdtempSync(join(tmpdir(), "large-immutable-bound-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  try {
    git("init", "-q"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.invalid");
    writeFileSync(join(root, "a.txt"), "before\n"); git("add", "a.txt"); git("commit", "-qm", "base");
    writeFileSync(join(root, "a.txt"), "after\n");
    const max = 128 * 1024 * 1024;
    const fd = openSync(join(root, "too-large.bin"), "wx");
    try { ftruncateSync(fd, max + 1); } finally { closeSync(fd); }
    git("add", ".");
    const destination = join(root, "packet");
    await assert.rejects(materializeChangePacket(root, resolveChangeScope(root, { staged: true }), destination, { largeImmutable: true }),
      error => error instanceof PacketCaptureError && error.capture.size_bytes === max + 1 && error.capture.limit_bytes === max);
    assert.equal(existsSync(destination), false);
    const large = 17 * 1024 * 1024;
    const input = join(root, "within-cap.bin");
    const smallerFd = openSync(input, "wx");
    try { ftruncateSync(smallerFd, large); } finally { closeSync(smallerFd); }
    git("add", "within-cap.bin");
    const scope = resolveChangeScope(root, { staged: true });
    const record = scope.records.find(item => item.path === "within-cap.bin")!;
    const source = record.after!;
    const records = Array.from({ length: 31 }, (_, index) => {
      const path = `packet-${index}.bin`;
      return { ...record, path, after: { ...source, path } };
    });
    await assert.rejects(materializeChangePacket(root, { ...scope, records, subject_digest: subjectDigest(records) },
      destination, { largeImmutable: true }), error => error instanceof PacketCaptureError &&
      error.capture.size_bytes === large && error.capture.limit_bytes === 2 * 1024 * 1024);
    assert.equal(existsSync(destination), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("expanded committed packet retains every side beyond the ordinary 512 MiB limit", async () => {
  const root = mkdtempSync(join(tmpdir(), "expanded-immutable-packet-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const deadlineAt = Date.now() + 30_000;
  try {
    git("init", "-q"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.invalid");
    git("commit", "--allow-empty", "-qm", "base");
    const base = git("rev-parse", "HEAD");
    const image = Buffer.alloc(17 * 1024 * 1024); image[0] = 13;
    writeFileSync(join(root, "input.data"), image);
    const blob = git("hash-object", "-w", "input.data");
    for (let index = 0; index < 31; index++) git("update-index", "--add", "--cacheinfo", `100644,${blob},image-${index}.bin`);
    git("commit", "-qm", "reviewed candidate");
    const candidate = git("rev-parse", "HEAD"), scope = resolveChangeScope(root, { baseRef: base, candidateRef: candidate });
    const exactComparison = { base, candidate };
    const target = join(root, "packet"), expanded = { largeImmutable: true, deadlineAt, exactComparison };

    await assert.rejects(materializeChangePacket(root, scope, target, { largeImmutable: true, deadlineAt }),
      (error: unknown) => error instanceof PacketCaptureError && error.capture.reason === "source-over-limit");
    await assert.rejects(materializeChangePacket(root, scope, target, { ...expanded, exactComparison: { base: candidate, candidate } }), /exact committed comparison/);
    await assert.rejects(materializeChangePacket(root, { ...scope, mode: "staged" }, target, expanded), /exact committed comparison/);
    await assert.rejects(materializeChangePacket(root, scope, target, { ...expanded, cancelled: () => true }), /capture/);
    assert.equal(existsSync(target), false);

    const result = await materializeChangePacket(root, scope, target, expanded);
    const paths = result.packet.records.map(record => record.after_path as string);
    assert.equal(new Set(paths).size, 31);
    assert.equal(result.packet.subject_digest, scope.subject_digest);
    const expected = fileDigest(join(root, "input.data")).slice(7);
    assert.ok(result.packet.records.every(record => record.before_path === null && record.after_sha256 === expected));
    assert.equal(fileDigest(paths.at(-1)!).slice(7), expected);
    assert.deepEqual(result.readLargeAfter("image-30.bin"), image);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
