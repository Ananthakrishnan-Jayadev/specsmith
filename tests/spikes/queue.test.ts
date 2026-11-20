import { describe, expect, it, vi } from 'vitest';

vi.mock('@forge/kvs', () => ({ default: {}, WhereConditions: {} }));
vi.mock('@forge/events', () => ({ Queue: vi.fn() }));

const { readEvent } = await import('../../src/spikes/queue');

describe('readEvent', () => {
  it('reads an AsyncEvent shape', () => {
    const r = readEvent({ body: { index: 2, sleepSeconds: 1 }, jobId: 'j1', queueName: 'q' });
    expect(r.body).toEqual({ index: 2, sleepSeconds: 1 });
    expect(r.jobId).toBe('j1');
    expect(r.argKeys).toBe('body,jobId,queueName');
  });

  it('reads a resolver-style payload shape', () => {
    expect(readEvent({ payload: { index: 0, sleepSeconds: 70 } }).body?.sleepSeconds).toBe(70);
  });

  it('rejects malformed bodies', () => {
    expect(readEvent({ body: { index: 'x' } }).body).toBeNull();
    expect(readEvent(undefined).body).toBeNull();
  });
});
