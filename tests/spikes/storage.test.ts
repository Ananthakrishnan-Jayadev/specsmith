import { describe, expect, it, vi } from 'vitest';

vi.mock('@forge/kvs', () => ({ default: {} }));
const { sameData } = await import('../../src/spikes/storage');

describe('sameData', () => {
  it('ignores object key order (KVS reorders keys)', () => {
    expect(sameData({ feed: 'r', at: 1, cols: [{ a: 1, b: 2 }] }, { at: 1, cols: [{ b: 2, a: 1 }], feed: 'r' })).toBe(true);
  });
  it('detects real differences', () => {
    expect(sameData({ a: 1 }, { a: 2 })).toBe(false);
    expect(sameData({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(sameData([1, 2], [2, 1])).toBe(false);
    expect(sameData({ a: [] }, { a: {} })).toBe(false);
  });
});
