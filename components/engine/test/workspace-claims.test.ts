import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { workspaceClaim } from "../src/workspace-claims.ts";
import { ResourceRegistry } from "../src/resources.ts";

test("workspace admission permits readers beside one writer and serializes aliases, descendants and sessions", () => {
  const root = mkdtempSync(join(tmpdir(), "workspace-claims-"));
  const a = join(root, "a"), child = join(a, "child"), b = join(root, "b"), alias = join(root, "alias");
  mkdirSync(child, { recursive: true }); mkdirSync(b); symlinkSync(a, alias);
  const registry = new ResourceRegistry(join(root, "registry.sqlite"));
  const other = new ResourceRegistry(registry.path);
  try {
    const claim = (path: string, mode: "reader" | "writer" | "exclusive", id: string, session?: string) => workspaceClaim([path], mode, id, session ? { provider: "claude", conversationId: session } : undefined);
    const writer = registry.acquire([claim(a, "writer", "w")], "w", "w");
    const reader = other.acquire([claim(alias, "reader", "r")], "r", "r");
    other.acquire([claim(a, "reader", "r2")], "r2", "r2");
    assert.throws(() => other.acquire([claim(child, "writer", "w2")], "w2", "w2"), /WORKSPACE_BUSY/);
    assert.throws(() => other.acquire([claim(alias, "exclusive", "x"), "device:test"], "x", "x"), /WORKSPACE_BUSY/);
    assert.equal(registry.inspect().some(row => row.resource === "device:test"), false);
    const sibling = other.acquire([claim(b, "exclusive", "b", "native-session")], "b", "b");
    assert.throws(() => registry.acquire([claim(a, "reader", "session", "native-session")], "session", "session"), /WORKSPACE_BUSY/);
    assert.deepEqual(registry.acquire([claim(a, "writer", "w")], "w", "w"), writer);
    registry.release(writer, "writer cleanup"); registry.release(reader, "reader cleanup"); registry.release(sibling, "sibling cleanup");
    other.acquire([claim(child, "writer", "w3")], "w3", "w3");
    assert.throws(() => registry.acquire(["workspace-v1:{}"], "bad", "bad"), /workspace claim id/);
  } finally { other.close(); registry.close(); rmSync(root, { recursive: true, force: true }); }
});
