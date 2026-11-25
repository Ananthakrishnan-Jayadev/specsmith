import { describe, expect, it } from 'vitest';
import { normalizeHeaders, profileRows } from '../../src/profile/profiler';

const rows = [
  ['﻿cust_id', 'email', 'dob', 'balance', 'flag', ' notes ', 'email'],
  ['C001', 'a.b@example.com', '1980-01-31', '10.50', 'Y', 'x', 'dup'],
  ['C002', 'c@example.org', '1975-12-01', '-3', 'N', '', 'dup'],
  ['C003', 'NULL', '1990-06-15', '0.125', 'y', 'n/a', 'dup'],
  ['C004', 'd@example.net', '', '7', 'n'],
];

describe('profileRows', () => {
  const p = profileRows('customers.csv', rows);
  const col = (name: string) => p.columns.find((c) => c.name === name)!;

  it('counts rows, nulls and distinct values', () => {
    expect(p.rowCount).toBe(4);
    expect(col('cust_id')).toMatchObject({ nullCount: 0, distinctCount: 4, minLength: 4, maxLength: 4 });
    expect(col('email').nullCount).toBe(1);
    expect(col('dob').nullCount).toBe(1);
  });

  it('records kinds, numeric ranges and scale', () => {
    expect(col('balance').kinds).toMatchObject({ integer: 2, decimal: 2 });
    expect(col('balance')).toMatchObject({ minNumber: -3, maxNumber: 10.5, maxScale: 3 });
    expect(col('flag').kinds.boolean).toBe(4);
    expect(col('dob')).toMatchObject({ minDate: '1975-12-01', maxDate: '1990-06-15', dateFormats: { 'YYYY-MM-DD': 3 } });
  });

  it('records content signals and patterns', () => {
    expect(col('email').signals.email).toBe(3);
    expect(col('cust_id').topPatterns).toEqual([{ pattern: 'A9{3}', count: 4 }]);
  });

  it('keeps at most 5 distinct samples and a hash per distinct value', () => {
    expect(col('cust_id').samples).toEqual(['C001', 'C002', 'C003', 'C004']);
    expect(col('cust_id').valueHashes).toHaveLength(4);
  });

  it('treats missing trailing fields as null and reports header problems', () => {
    expect(col('notes').nullCount).toBe(3);
    expect(p.headerWarnings.some((w) => w.includes('leading/trailing spaces'))).toBe(true);
    expect(p.headerWarnings.some((w) => w.includes('Duplicate header "email"'))).toBe(true);
    expect(p.columns[0]?.name).toBe('cust_id'); // BOM stripped
  });

  it('caps distinct counting', () => {
    const many = [['id'], ...Array.from({ length: 30 }, (_, i) => [String(i)])];
    const c = profileRows('x.csv', many, { distinctCap: 10, hashCap: 5 }).columns[0]!;
    expect(c).toMatchObject({ distinctCount: 10, distinctCapped: true });
    expect(c.valueHashes).toHaveLength(5);
  });

  it('warns about rows longer than the header', () => {
    expect(profileRows('x.csv', [['a'], ['1', '2']]).headerWarnings[0]).toMatch(/more fields than the header/);
  });
});

describe('normalizeHeaders', () => {
  it('names blank headers', () => {
    expect(normalizeHeaders(['a', '']).names).toEqual(['a', 'column_2']);
  });
});
