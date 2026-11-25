import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/config';
import { profileRows } from '../../src/profile/profiler';
import { buildFileSpec } from '../../src/spec/build';
import { editField, formatType, parseType, setPrimaryKey, specStats } from '../../src/spec/edit';

describe('formatType / parseType', () => {
  it.each([
    [{ type: 'string', length: 20 }, 'string(20)'],
    [{ type: 'decimal', precision: 10, scale: 2 }, 'decimal(10,2)'],
    [{ type: 'date', format: 'DD/MM/YYYY' }, 'date [DD/MM/YYYY]'],
    [{ type: 'integer' }, 'integer'],
  ] as const)('%o ⇄ %s', (spec, text) => {
    expect(formatType(spec)).toBe(text);
    expect(parseType(text)).toEqual(spec);
  });

  it('is forgiving about case and spaces', () => {
    expect(parseType(' DECIMAL ( 12 , 4 ) ')).toEqual({ type: 'decimal', precision: 12, scale: 4 });
    expect(parseType('decimal(8)')).toEqual({ type: 'decimal', precision: 8, scale: 0 });
  });

  it('rejects nonsense', () => {
    for (const bad of ['varchar(10)', 'integer(5)', 'decimal(2,5)', 'string(1,2)', 'boolean [x]', '']) expect(parseType(bad)).toBeNull();
    expect(formatType(null)).toBe('TBD');
  });
});

const spec = () => buildFileSpec(profileRows('t.csv', [['id', 'name', 'code'], ['1', 'a', 'X'], ['2', '', 'Y']]), defaultConfig);

describe('editField', () => {
  it('records reviewer edits as user values without touching other columns', () => {
    const s = editField(spec(), 'name', 'description', 'Customer display name');
    expect(s.columns[1]?.description).toEqual({ value: 'Customer display name', source: 'user', evidence: 'set by reviewer' });
    expect(s.columns[0]?.description.source).toBe('tbd');
  });
});

describe('setPrimaryKey', () => {
  it('moves the key and makes it non-nullable', () => {
    const s = setPrimaryKey(spec(), 'code');
    expect(s.columns.map((c) => c.primaryKey.value)).toEqual([false, false, true]);
    expect(s.columns[2]?.nullable).toMatchObject({ value: false, source: 'user' });
  });
});

describe('specStats', () => {
  it('counts tbd fields, PII and findings', () => {
    const st = specStats(spec());
    expect(st.columns).toBe(3);
    expect(st.tbd).toBeGreaterThanOrEqual(3); // descriptions + unmatched PII
  });
});
