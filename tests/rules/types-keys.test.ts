import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/config';
import { inferNullable, inferType, resolveDateFormat, standardLength } from '../../src/rules/types';
import { detectPrimaryKey } from '../../src/rules/keys';
import { profileRows } from '../../src/profile/profiler';

const col = (values: string[], name = 'c') => {
  const c = profileRows('t.csv', [[name], ...values.map((v) => [v])]).columns[0];
  if (!c) throw new Error('no column');
  return c;
};
const t = (values: string[]) => inferType(col(values), defaultConfig.types).field;

describe('inferType', () => {
  it('infers the basic types with evidence', () => {
    expect(t(['1', '22', '-3']).value).toEqual({ type: 'integer' });
    expect(t(['1.50', '22', '-3.125']).value).toEqual({ type: 'decimal', precision: 6, scale: 3 });
    expect(t(['Y', 'N', 'Y']).value).toEqual({ type: 'boolean' });
    expect(t(['2024-01-01', '2024-02-29']).value).toEqual({ type: 'date', format: 'YYYY-MM-DD' });
    expect(t(['2024-01-01 10:00:00']).value).toEqual({ type: 'timestamp', format: 'ISO-8601 timestamp' });
    expect(t(['hello', 'world!']).value).toEqual({ type: 'string', length: 10 });
    expect(t(['1', '2']).evidence).toMatch(/100% of 2 non-null values are integers/);
  });

  it('keeps leading-zero codes and card numbers as text', () => {
    expect(t(['00412', '00007']).value).toEqual({ type: 'string', length: 10 });
    expect(t(['4111111111111111']).value?.type).toBe('string');
  });

  it('resolves DD/MM when any value proves it, flags truly ambiguous dates', () => {
    expect(t(['05/06/2024', '31/12/2024']).value).toEqual({ type: 'date', format: 'DD/MM/YYYY' });
    const amb = inferType(col(['05/06/2024', '01/02/2024']), defaultConfig.types);
    expect(amb.ambiguousDate).toBe(true);
  });

  it('reports mixed columns and empty columns', () => {
    const mixed = inferType(col(['1', '2', '3', 'x']), defaultConfig.types);
    expect(mixed.field.value?.type).toBe('string');
    expect(mixed.mixed).toMatch(/75\.0% of values are integer/);
    expect(t(['', ''])).toMatchObject({ value: null, source: 'tbd' });
  });
});

describe('helpers', () => {
  it('rounds lengths up to standard sizes with headroom', () => {
    expect(standardLength(7, defaultConfig.types)).toBe(20);
    expect(standardLength(5000, defaultConfig.types)).toBe(7500);
  });
  it('resolves date formats', () => {
    expect(resolveDateFormat({ 'YYYY-MM-DD': 3, 'DD/MM/YYYY': 1 })).toEqual({ format: null, ambiguous: true });
  });
  it('infers nullability', () => {
    expect(inferNullable(col(['a', '']))).toMatchObject({ value: true, source: 'derived' });
    expect(inferNullable(col(['a', 'b']))).toMatchObject({ value: false });
  });
});

describe('detectPrimaryKey', () => {
  it('prefers an id-like unique non-null column', () => {
    const p = profileRows('t.csv', [
      ['email', 'cust_id', 'name'],
      ['a@x.io', 'C1', 'A'],
      ['b@x.io', 'C2', 'A'],
    ]);
    expect(detectPrimaryKey(p.columns)).toMatchObject({ primary: 'cust_id', candidates: ['cust_id', 'email'] });
  });
  it('returns null when nothing is unique', () => {
    expect(detectPrimaryKey(profileRows('t.csv', [['a'], ['1'], ['1']]).columns).primary).toBeNull();
  });
});
