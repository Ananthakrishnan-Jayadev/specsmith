/**
 * Data checks decided by rules from the spec (core rule 1: rules decide).
 * Used by the SQL check export now and the test plan (F10) later.
 * Check ids are stable so test results can be matched across runs.
 */
import type { ColumnSpec, FileSpec } from '../domain/spec';
import { isActive, type Relationship } from '../domain/relationship';

export type CheckType = 'notNull' | 'unique' | 'maxLength' | 'acceptedValues' | 'fkPresent';

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
  /** For fkPresent: the referenced table and column. */
  refTable?: string;
  refColumn?: string;
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

export interface ResolvedRelationship {
  rel: Relationship;
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
}

/** Maps a relationship's source names to current target table/column names. */
export function resolveRelationships(files: FileSpec[], rels: Relationship[]): ResolvedRelationship[] {
  const find = (file: string, col: string) => {
    const f = files.find((x) => x.fileName === file);
    const c = f?.columns.find((x) => x.sourceName === col);
    return f && c ? { table: f.tableName.value, column: c.targetName.value } : null;
  };
  return rels.filter(isActive).flatMap((rel) => {
    const from = find(rel.fromFile, rel.fromColumn);
    const to = find(rel.toFile, rel.toColumn);
    return from && to ? [{ rel, fromTable: from.table, fromColumn: from.column, toTable: to.table, toColumn: to.column }] : [];
  });
}

/** All checks for a feed: per-column checks plus one fkPresent check per active relationship. */
export function checksForFeed(files: FileSpec[], rels: Relationship[] = []): Check[] {
  const perFile = [...files].sort((a, b) => a.fileName.localeCompare(b.fileName)).flatMap(checksFor);
  const fks = resolveRelationships(files, rels).map((r): Check => ({
    id: `chk-${r.fromTable}-${r.fromColumn}-fk`, type: 'fkPresent', table: r.fromTable, column: r.fromColumn,
    expected: `every value exists in ${r.toTable}.${r.toColumn}`, refTable: r.toTable, refColumn: r.toColumn,
  }));
  return [...perFile, ...fks];
}
