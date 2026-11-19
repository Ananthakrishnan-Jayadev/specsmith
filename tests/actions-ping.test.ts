import { describe, expect, it } from 'vitest';
import { buildPong, ping } from '../src/actions/ping';

describe('ping action', () => {
  const fixed = new Date('2026-11-19T00:00:00.000Z');

  it('returns pong with the echoed message', () => {
    expect(buildPong({ message: 'hello' }, fixed)).toEqual({
      reply: 'pong',
      serverTime: '2026-11-19T00:00:00.000Z',
      echo: 'hello',
    });
  });

  it('handles a missing payload', () => {
    expect(buildPong(undefined, fixed).echo).toBeNull();
  });

  it('handler ignores the Forge context argument', () => {
    // Forge calls handler(payload, context); extra args must not break it.
    const handler = ping as unknown as (p: unknown, ctx: unknown) => ReturnType<typeof ping>;
    expect(handler({ message: 'x' }, { installContext: 'ari:...' }).reply).toBe('pong');
  });
});
