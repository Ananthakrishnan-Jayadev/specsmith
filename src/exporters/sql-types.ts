import type { TypeSpec } from '../domain/spec';

/** Logical type → ANSI SQL type. TBD types become wide text and are flagged. */
export function sqlType(t: TypeSpec | null): { sql: string; tbd: boolean } {
  if (!t) return { sql: 'VARCHAR(4000)', tbd: true };
  switch (t.type) {
    case 'integer': return { sql: 'BIGINT', tbd: false };
    case 'decimal': return { sql: t.precision !== undefined ? `DECIMAL(${t.precision},${t.scale ?? 0})` : 'DECIMAL(38,10)', tbd: false };
    case 'date': return { sql: 'DATE', tbd: false };
    case 'timestamp': return { sql: 'TIMESTAMP', tbd: false };
    case 'boolean': return { sql: 'BOOLEAN', tbd: false };
    case 'string': return { sql: `VARCHAR(${t.length ?? 255})`, tbd: false };
  }
}

/** Quoted SQL identifier (for raw source names, which may contain anything). */
export const quoteIdent = (s: string) => `"${s.replace(/"/g, '""')}"`;
/** SQL string literal. */
export const sqlString = (s: string) => `'${s.replace(/'/g, "''")}'`;
