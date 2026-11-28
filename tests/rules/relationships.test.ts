import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/config';
import { profileRows } from '../../src/profile/profiler';
import { buildFileSpec } from '../../src/spec/build';
import { decideRelationship, detectRelationships, mergeRelationships } from '../../src/rules/relationships';
import { demoFeed } from '../helpers/demo';

describe('detectRelationships on the demo feed', () => {
  const rels = detectRelationships(demoFeed());
  const pairs = rels.map((r) => `${r.fromFile}.${r.fromColumn} -> ${r.toFile}.${r.toColumn} (${r.confidence})`);

  it('finds exactly the three planted foreign keys', () => {
    expect(pairs).toEqual([
      'accounts.csv.cust_id -> customers.csv.cust_id (high)',
      'cards.csv.acct_id -> accounts.csv.acct_id (high)',
      'transactions.csv.acct_id -> accounts.csv.acct_id (high)',
    ]);
  });

  it('explains the evidence and starts as a derived proposal', () => {
    expect(rels[2]?.evidence).toMatch(/100\.0% of .* distinct transactions\.acct_id values exist in accounts\.acct_id \(primary key, 800 values\); same column name/);
    expect(rels[0]?.decision).toMatchObject({ value: 'proposed', source: 'derived' });
  });
});

describe('detection guards', () => {
  const spec = (name: string, rows: string[][]) => buildFileSpec(profileRows(name, rows), defaultConfig);

  it('needs high overlap without a name match, and ignores low-cardinality columns', () => {
    const parent = spec('p.csv', [['pid'], ...Array.from({ length: 20 }, (_, i) => [`K${i}`])]);
    const childGood = spec('c.csv', [['cid', 'ref'], ...Array.from({ length: 20 }, (_, i) => [`C${i}`, `K${i % 15}`])]);
    expect(detectRelationships([parent, childGood]).map((r) => r.fromColumn)).toEqual(['ref']);
    const childPartial = spec('d.csv', [['did', 'ref'], ...Array.from({ length: 20 }, (_, i) => [`D${i}`, i < 15 ? `K${i}` : `Z${i}`])]);
    expect(detectRelationships([parent, childPartial])).toEqual([]); // 75% overlap, different names
    const flags = spec('f.csv', [['fid', 'flag'], ['F1', 'K1'], ['F2', 'K2']]);
    expect(detectRelationships([parent, flags])).toEqual([]); // only 2 distinct values, no name match
  });
});

describe('mergeRelationships / decideRelationship', () => {
  const rels = detectRelationships(demoFeed());
  const files = ['accounts.csv', 'cards.csv', 'customers.csv', 'transactions.csv'];

  it('keeps reviewer decisions when detection re-runs', () => {
    const decided = decideRelationship(rels, rels[0]?.id ?? '', 'rejected');
    const merged = mergeRelationships(decided, rels, files);
    expect(merged[0]?.decision).toMatchObject({ value: 'rejected', source: 'user' });
    expect(merged[1]?.decision.source).toBe('derived');
  });

  it('keeps accepted relationships that are no longer detected, drops ones for removed files', () => {
    const accepted = decideRelationship(rels, rels[1]?.id ?? '', 'accepted');
    const merged = mergeRelationships(accepted, [], files);
    expect(merged.map((r) => r.id)).toEqual([rels[1]?.id]);
    expect(mergeRelationships(accepted, rels, ['accounts.csv', 'customers.csv']).map((r) => r.fromFile)).toEqual(['accounts.csv']);
  });
});
