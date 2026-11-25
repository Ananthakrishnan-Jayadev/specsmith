import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/config';
import { profileRows } from '../../src/profile/profiler';
import { buildFileSpec } from '../../src/spec/build';
import { mergeFileSpec } from '../../src/spec/merge';

const build = (rows: string[][]) => buildFileSpec(profileRows('t.csv', rows), defaultConfig);

describe('mergeFileSpec', () => {
  it('keeps user edits when rules re-run, and takes fresh derived values otherwise', () => {
    const v1 = build([['cust_id', 'amt'], ['C1', '1'], ['C2', '2']]);
    const amtCol = v1.columns[1];
    if (!amtCol) throw new Error('missing');
    const edited = {
      ...v1,
      columns: [v1.columns[0], { ...amtCol, description: { value: 'Amount in CAD', source: 'user' as const }, targetName: { value: 'amount_cad', source: 'user' as const } }],
    } as typeof v1;

    const fresh = build([['cust_id', 'amt'], ['C1', '1.5'], ['C2', '2']]);
    const merged = mergeFileSpec(edited, fresh);
    const amt = merged.columns[1];
    expect(amt?.description).toEqual({ value: 'Amount in CAD', source: 'user' });
    expect(amt?.targetName.value).toBe('amount_cad');
    expect(amt?.type.value).toMatchObject({ type: 'decimal' }); // derived → derived: fresh wins
  });

  it('adds new columns and drops removed ones', () => {
    const a = build([['x', 'y'], ['1', '2']]);
    const b = build([['x', 'z'], ['1', '2']]);
    expect(mergeFileSpec(a, b).columns.map((c) => c.sourceName)).toEqual(['x', 'z']);
  });
});
