/** Synthetic ledger decisions qualify exact binding and lifecycle, never actual human consent. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { Store } from "../../harness/src/store/store.ts";
import { digest } from "../src/core.ts";
import { ApiSignoffStore } from "../src/api-signoff-store.ts";
import { apiSignoffSubject, type ApiSignoffSubject, type ApiSignoffHostObservation, type ApiSignoffReceipt } from "../src/api-signoff.ts";

const subject: ApiSignoffSubject = { version: 1, contractId: "sample-api", contractDigest: digest("contract"),
  cells: [{ product: "sample", language: "typescript", platform: "ios" }], sections: { methods: digest("methods") }, reviewDigest: digest("review") };
const host: ApiSignoffHostObservation = { kind: "local-native-confirmation", eventId: "synthetic-event", observedAt: "2026-10-29T00:00:00Z",
  uid: 501, username: "fixture", executable: "/fixture/node", nodeVersion: "v24.16.0", packageVersion: "4.5.0-preview.1",
  packageDigest: digest("package"), hostExportDigest: digest("host"), adapterDigest: digest("adapter"), lockDigest: digest("lock") };
const locator = (record: ApiSignoffReceipt) => ({ kind: "api-signoff-v1" as const, id: record.id, repositoryId: record.repositoryId });
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "api-signoff-store-")), path = join(directory, "harness.db");
  const existing = new Store(path); existing.close();
  return { path, open: () => new ApiSignoffStore(path, { readOnly: false }) };
}

test("fresh exact approval verifies through a separate read-only connection without changing database bytes", () => {
  const f = fixture(), writer = f.open();
  const record = writer.recordConfirmation("review-1", subject, host, null); writer.close();
  const before = readFileSync(f.path), reader = new ApiSignoffStore(f.path);
  try {
    assert.equal(reader.verify(locator(record), subject).id, record.id);
    assert.throws(() => reader.recordConfirmation("forged", subject, host, null), /read-only/);
  } finally { reader.close(); }
  assert.deepEqual(readFileSync(f.path), before);
});

test("readback never creates a missing store or initializes signoff tables", () => {
  const f = fixture();
  assert.throws(() => new ApiSignoffStore(f.path + ".missing")); assert.equal(existsSync(f.path + ".missing"), false);
  const reader = new ApiSignoffStore(f.path);
  try { assert.throws(() => reader.verify({ kind: "api-signoff-v1", id: "fake", repositoryId: reader.repositoryId }, subject), /no such table/); }
  finally { reader.close(); }
  const db = new DatabaseSync(f.path, { readOnly: true });
  try { assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name LIKE 'engine_api_signoff%'").get()!.n, 0); }
  finally { db.close(); }
});

test("every contract, cell, section and review identity is checked; edited JSON grants nothing", () => {
  const f = fixture(), store = f.open();
  try {
    const record = store.recordConfirmation("review", subject, host, null);
    const variants = [ { ...subject, contractDigest: digest("other") }, { ...subject, contractId: "another-api" },
      { ...subject, reviewDigest: digest("edited-review") }, { ...subject, sections: { methods: digest("new-methods") } },
      ...["product", "language", "platform"].map(key => ({ ...subject, cells: [{ ...subject.cells[0]!, [key]: "different" }] })) ];
    for (const variant of variants) assert.throws(() => store.verify(locator(record), variant), /subject mismatch/);
    assert.throws(() => store.verify({ ...locator(record), id: "invented" }, subject), /not found/);
    assert.throws(() => store.verify({ ...locator(record), repositoryId: "other" }, subject), /repository mismatch/);
    assert.throws(() => store.verify({ ...locator(record), approved: true } as never, subject), /locator/);
  } finally { store.close(); }
});

test("cell and section ordering are immaterial but duplicate or incomplete cells refuse", () => {
  const scoped = { ...subject, cells: [...subject.cells, { product: "sample", language: "dart", platform: "android" }],
    sections: { types: digest("types"), methods: digest("methods") } };
  assert.deepEqual(apiSignoffSubject(scoped), apiSignoffSubject({ ...scoped, cells: [...scoped.cells].reverse(), sections: { methods: digest("methods"), types: digest("types") } }));
  for (const bad of [{ ...subject, cells: [subject.cells[0], subject.cells[0]] },
    { ...subject, cells: [{ product: "sample", language: "typescript" }] }, { ...subject, sections: {} },
    { ...subject, contractDigest: "approved" }, { ...subject, actor: "operator" }]) assert.throws(() => apiSignoffSubject(bad));
});

test("revocation invalidates old locators and request replay without deleting evidence", () => {
  const f = fixture(), store = f.open();
  try {
    const record = store.recordConfirmation("review", subject, host, null);
    assert.throws(() => store.revoke(locator(record), 99, host), /revision changed/);
    const revoked = store.revoke(locator(record), 1, host); assert.equal(revoked.revision, 2);
    assert.throws(() => store.verify(locator(record), subject), /revoked/);
    assert.throws(() => store.replay("review", subject, null), /revoked/);
    assert.deepEqual(store.revoke(locator(record), 1, host), revoked);
    assert.equal(store.recordConfirmation("new-human-review", subject, host, null).revision, 1);
  } finally { store.close(); }
});

test("supersession is explicit, atomic, scoped and rejects a competing stale predecessor", () => {
  const f = fixture(), first = f.open(), second = f.open();
  try {
    const old = first.recordConfirmation("review-1", subject, host, null);
    const changed = { ...subject, contractDigest: digest("v2") }, predecessor = { id: old.id, revision: 1 };
    assert.throws(() => first.recordConfirmation("review-2", changed, host, null), /predecessor/);
    assert.throws(() => first.recordConfirmation("review-2", changed, host, { ...predecessor, revision: 9 }), /revision/);
    assert.equal(first.verify(locator(old), subject).id, old.id);
    const current = first.recordConfirmation("review-2", changed, host, predecessor);
    assert.throws(() => second.recordConfirmation("racing-review", { ...changed, contractDigest: digest("v3") }, host, predecessor), /predecessor/);
    assert.throws(() => first.verify(locator(old), subject), /superseded/);
    assert.equal(first.verify(locator(current), changed).id, current.id);
    assert.equal(first.replay("review-2", changed, predecessor)!.id, current.id);
    assert.throws(() => first.recordConfirmation("review-2", subject, host, predecessor), /different inputs/);
    assert.throws(() => first.recordConfirmation("other-contract", { ...changed, contractId: "other" }, host, { id: current.id, revision: 1 }), /predecessor/);
  } finally { first.close(); second.close(); }
});

test("immutable-envelope corruption refuses readback rather than treating malformed data as approval", () => {
  const f = fixture(), store = f.open();
  const record = store.recordConfirmation("review", subject, host, null); store.close();
  const db = new DatabaseSync(f.path);
  try { db.prepare("UPDATE engine_api_signoff_v1 SET record=? WHERE id=?").run(JSON.stringify({ ...record, host: { ...host, username: "edited" } }), record.id); }
  finally { db.close(); }
  const reader = new ApiSignoffStore(f.path);
  try { assert.throws(() => reader.verify(locator(record), subject), /Corrupt/); } finally { reader.close(); }
});
