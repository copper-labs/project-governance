import { test } from 'node:test';
import assert from 'node:assert/strict';
import { symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixture } from './helpers.ts';
import { report, recordPaths, touch } from '../src/ops/concurrency.ts';
import { workContext } from '../src/store/location.ts';
test('real intentions distinguish two readers, reader/writer and explore-mode writes', () => {
    const f = fixture(), w = workContext(f.root), workspaceId = f.store.workspace(w.locator, f.root);
    const other = f.store.createTask('explore', [{ kind: 'scope', body: f.root, provenance: 'operator' }], { mode: 'explore' });
    const add = (session: string, taskId: string, mode: 'read' | 'write', path = 'a.ts') => recordPaths(f.store, { session, taskId, mode, paths: [path], workspaceId, cwd: f.root });
    const status = () => report(f.store, { session: 'a', taskId: f.task.taskId, workspaceId, worktree: f.root, cwd: f.root });
    add('a', f.task.taskId, 'read');
    add('b', other.taskId, 'read');
    assert.equal(status().overlappingPaths.length, 0);
    add('b', other.taskId, 'write');
    assert.equal(status().overlappingPaths[0]?.risk, 'reader-writer');
    add('a', f.task.taskId, 'write');
    assert.ok(status().overlappingPaths.some(x => x.risk === 'write-overlap'));
    f.store.releaseIntents('b', workspaceId);
    assert.equal(status().overlappingPaths.length, 0);
    f.store.close();
});
test('symlink aliases share intentions and unavailable drift is unknown', () => {
    const f = fixture(), w = workContext(f.root), workspaceId = f.store.workspace(w.locator, f.root);
    symlinkSync('a.ts', join(f.root, 'alias.ts'));
    for (const [session, path, mode] of [['a', 'a.ts', 'read'], ['b', 'alias.ts', 'write']] as const)
        recordPaths(f.store, { session, taskId: f.task.taskId, mode, paths: [path], workspaceId, cwd: f.root });
    const status = () => report(f.store, { session: 'a', taskId: f.task.taskId, workspaceId, worktree: f.root, cwd: f.root });
    assert.equal(status().overlappingPaths[0]?.risk, 'reader-writer');
    writeFileSync(join(f.root, 'large'), Buffer.alloc(9 * 1024 * 1024));
    assert.equal(status().treeChangedSinceYouLastActed, 'unknown');
    f.store.close();
});
test('activity-only commands preserve the last explicit tree observation', () => {
    const f = fixture();
    f.store.recordActivity({ session: 'a', worktree: f.root, taskId: f.task.taskId, treeDigest: 'tree:previous' });
    touch(f.store, { session: 'a', taskId: f.task.taskId, worktree: f.root, cwd: f.root });
    assert.equal(f.store.readActivity('a', f.root)?.treeDigest, 'tree:previous');
    f.store.close();
});
