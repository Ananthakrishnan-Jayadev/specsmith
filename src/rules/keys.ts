import type { ColumnProfile } from '../domain/profile';
import { tokens } from './naming';

export interface KeyResult {
  /** Source name of the chosen primary key, or null. */
  primary: string | null;
  evidence: string;
  /** All single-column unique, non-null candidates. */
  candidates: string[];
}

const ID_TOKENS = new Set(['id', 'key', 'no', 'num', 'number', 'code', 'cd']);

/** Single-column primary key candidates: no nulls, every value distinct, counted exactly. */
export function detectPrimaryKey(columns: ColumnProfile[]): KeyResult {
  const candidates = columns.filter((c) => c.rowCount > 0 && c.nullCount === 0 && !c.distinctCapped && c.distinctCount === c.rowCount);
  if (candidates.length === 0) return { primary: null, evidence: 'no column is unique and fully populated', candidates: [] };
  const score = (c: ColumnProfile) => {
    const t = tokens(c.name);
    return (ID_TOKENS.has(t[t.length - 1] ?? '') ? 4 : 0) + (c.position === 0 ? 2 : 0) - c.position * 0.01 - (c.maxLength ?? 0) * 0.001;
  };
  const ranked = [...candidates].sort((a, b) => score(b) - score(a));
  const best = ranked[0] as ColumnProfile;
  const others = ranked.slice(1).map((c) => c.name);
  return {
    primary: best.name,
    evidence: `unique and non-null in all ${best.rowCount} rows${others.length ? `; other unique columns: ${others.join(', ')}` : ''}`,
    candidates: ranked.map((c) => c.name),
  };
}
