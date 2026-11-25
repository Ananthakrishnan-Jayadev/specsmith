import { describe, expect, it } from 'vitest';
import { MemoryKV } from '../../src/storage/kv';
import { CHUNK_CHARS, deleteJson, getJson, putJson } from '../../src/storage/chunked';
import { FeedRepo, fileKey, newFeedId } from '../../src/storage/feeds';

describe('chunked JSON storage', () => {
  it('round-trips values larger than one chunk', async () => {
    const kv = new MemoryKV();
    const big = { rows: Array.from({ length: 30_000 }, (_, i) => ({ i, name: `col_${i}` })) };
    await putJson(kv, 'k', big);
    expect(JSON.stringify(big).length).toBeGreaterThan(CHUNK_CHARS);
    expect([...kv.data.keys()].filter((k) => k.startsWith('k#')).length).toBeGreaterThan(1);
    expect(await getJson(kv, 'k')).toEqual(big);
  });

  it('replaces the old revision and deletes its chunks', async () => {
    const kv = new MemoryKV();
    await putJson(kv, 'k', 'x'.repeat(CHUNK_CHARS * 2), 'r1');
    await putJson(kv, 'k', 'small', 'r2');
    expect(await getJson(kv, 'k')).toBe('small');
    expect([...kv.data.keys()].some((k) => k.includes('#r1#'))).toBe(false);
  });

  it('keeps the old value readable if a write dies before the pointer switch', async () => {
    const kv = new MemoryKV();
    await putJson(kv, 'k', { v: 1 }, 'r1');
    const failing = Object.assign(Object.create(kv) as MemoryKV, {
      set: async (key: string, value: unknown) => {
        if (key === 'k') throw new Error('crash before pointer');
        return kv.set(key, value);
      },
    });
    await expect(putJson(failing, 'k', { v: 2 }, 'r2')).rejects.toThrow('crash');
    expect(await getJson(kv, 'k')).toEqual({ v: 1 });
  });

  it('detects missing chunks instead of returning garbage', async () => {
    const kv = new MemoryKV();
    await putJson(kv, 'k', 'abc', 'r1');
    await kv.delete('k#r1#0');
    await expect(getJson(kv, 'k')).rejects.toThrow(/incomplete/);
  });

  it('deletes all chunks', async () => {
    const kv = new MemoryKV();
    await putJson(kv, 'k', 'abc');
    await deleteJson(kv, 'k');
    expect(kv.data.size).toBe(0);
  });
});

describe('FeedRepo', () => {
  it('stores feeds in an index, newest first', async () => {
    const repo = new FeedRepo(new MemoryKV());
    await repo.put({ feedId: 'a', name: 'A', createdAt: '2026-01-01', updatedAt: '2026-01-01', files: [] });
    await repo.put({ feedId: 'b', name: 'B', createdAt: '2026-01-02', updatedAt: '2026-01-03', files: [] });
    await repo.put({ feedId: 'a', name: 'A2', createdAt: '2026-01-01', updatedAt: '2026-01-02', files: [] });
    expect((await repo.list()).map((f) => f.name)).toEqual(['B', 'A2']);
  });

  it('makes file names safe for keys and ids unique', () => {
    expect(fileKey('my file (1).csv')).toBe('my_file__1_.csv');
    expect(newFeedId()).not.toBe(newFeedId());
  });
});
