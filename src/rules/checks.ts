/**
 * Data checks decided by rules from the spec (core rule 1: rules decide).
 * Used by the SQL check export now and the test plan (F10) later.
 * Check ids are stable so test results can be matched across runs.
 */
import type { ColumnSpec, FileSpec } from '../domain/spec';

export type CheckType = 'notNull' | 'unique' | 'maxLength' | 'acceptedValues';

export interface Check {
  id: string;
  type: CheckType;
  table: string;
  column: string;
  /** The exact expected value, quoted verbatim in test wording. */
  expected: string;
  /** For maxLength / acceptedValues. */
  length?: number;
  values?: string[];
}

/** Low-cardinality, fully sampled, non-sensitive columns get an allowed-values check. */
export function acceptedValuesOf(c: ColumnSpec): string[] | null {
  const p = c.profile;
  const sensitive = c.pii.value !== null && c.pii.value.classification !== 'NONE';
  const isText = c.type.value?.type === 'string';
  if (sensitive || !isText || c.primaryKey.value) return null;
  if (p.distinctCapped || p.distinctCount < 2 || p.distinctCount > 5 || p.samples.length !== p.distinctCount) return null;
  // Codes, not free text: every sample is short and has no spaces.
  if (!p.samples.every((s) => s.length <= 20 && !/\s/.test(s))) return null;
  return [...p.samples].sort();
}

export function checksFor(spec: FileSpec): Check[] {
  const table = spec.tableName.value;
  const out: Check[] = [];
  for (const c of [...spec.columns].sort((a, b) => a.position - b.position)) {
    const col = c.targetName.value;
    const id = (t: string) => `chk-${table}-${col}-${t}`;
    if (c.nullable.value === false) out.push({ id: id('not-null'), type: 'notNull', table, column: col, expected: 'no empty values' });
    if (c.primaryKey.value) out.push({ id: id('unique'), type: 'unique', table, column: col, expected: 'every value is unique' });
    const t = c.type.value;
    if (t?.type === 'string' && t.length !== undefined) {
      out.push({ id: id('max-length'), type: 'maxLength', table, column: col, expected: `length <= ${t.length}`, length: t.length });
    }
    const values = acceptedValuesOf(c);
    if (values) out.push({ id: id('accepted-values'), type: 'acceptedValues', table, column: col, expected: `one of ${values.join(', ')}`, values });
  }
  return out;
}
