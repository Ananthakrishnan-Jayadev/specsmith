import { describe, expect, it } from 'vitest';
import { SOURCES, applyIfAllowed, canOverwrite, isSource, rank } from '../../src/rules/precedence';

describe('precedence order', () => {
  it('is user > config > reused > derived > ai > tbd', () => {
    expect(SOURCES).toEqual(['user', 'config', 'reused', 'derived', 'ai', 'tbd']);
    expect(rank('user')).toBeLessThan(rank('config'));
    expect(rank('reused')).toBeLessThan(rank('derived'));
    expect(rank('ai')).toBeLessThan(rank('tbd'));
  });
});

describe('canOverwrite', () => {
  it('lets every source overwrite every source of lower or equal precedence', () => {
    for (const existing of SOURCES) {
      for (const incoming of SOURCES) {
        expect(canOverwrite(existing, incoming)).toBe(rank(incoming) <= rank(existing));
      }
    }
  });

  it('never lets AI overwrite a rule-derived or human value', () => {
    expect(canOverwrite('derived', 'ai')).toBe(false);
    expect(canOverwrite('reused', 'ai')).toBe(false);
    expect(canOverwrite('user', 'ai')).toBe(false);
  });

  it('lets AI fill a tbd field', () => {
    expect(canOverwrite('tbd', 'ai')).toBe(true);
  });
});

describe('applyIfAllowed', () => {
  it('applies when there is no existing value', () => {
    const r = applyIfAllowed(undefined, { value: 'x', source: 'ai' });
    expect(r).toEqual({ applied: true, field: { value: 'x', source: 'ai' } });
  });

  it('keeps the existing value and explains why when blocked', () => {
    const existing = { value: 'Customer id', source: 'user' as const };
    const r = applyIfAllowed(existing, { value: 'Some id', source: 'ai' });
    expect(r.applied).toBe(false);
    expect(r.field).toEqual(existing);
    if (!r.applied) expect(r.reason).toContain("'ai' cannot overwrite 'user'");
  });

  it('does not mutate its inputs', () => {
    const existing = { value: 'a', source: 'tbd' as const };
    const incoming = { value: 'b', source: 'derived' as const };
    const r = applyIfAllowed(existing, incoming);
    expect(r.field).not.toBe(incoming);
    expect(existing).toEqual({ value: 'a', source: 'tbd' });
  });
});

describe('isSource', () => {
  it('accepts only known sources', () => {
    expect(isSource('reused')).toBe(true);
    expect(isSource('admin')).toBe(false);
    expect(isSource(42)).toBe(false);
  });
});
