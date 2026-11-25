/**
 * Reviewer edits. Pure functions shared by the UI and tests.
 * An edit always becomes source `user` (highest precedence) via applyIfAllowed.
 */
import type { ColumnSpec, FieldValue, FileSpec, LogicalType, PiiSpec, TypeSpec } from '../domain/spec';
import { applyIfAllowed } from '../rules/precedence';

const TYPES: LogicalType[] = ['integer', 'decimal', 'date', 'timestamp', 'boolean', 'string'];

/** TypeSpec → "string(20)", "decimal(10,2)", "date [DD/MM/YYYY]", "integer". */
export function formatType(t: TypeSpec | null): string {
  if (!t) return 'TBD';
  const size = t.type === 'decimal' && t.precision !== undefined ? `(${t.precision},${t.scale ?? 0})` : t.type === 'string' && t.length !== undefined ? `(${t.length})` : '';
  return `${t.type}${size}${t.format ? ` [${t.format}]` : ''}`;
}

/** Inverse of formatType. Returns null for anything it can't parse (the UI then refuses the edit). */
export function parseType(text: string): TypeSpec | null {
  const m = /^\s*([a-z]+)\s*(?:\(\s*(\d+)\s*(?:,\s*(\d+)\s*)?\))?\s*(?:\[\s*([^\]]+?)\s*\])?\s*$/i.exec(text);
  if (!m) return null;
  const type = (m[1] ?? '').toLowerCase() as LogicalType;
  if (!TYPES.includes(type)) return null;
  const a = m[2] !== undefined ? Number(m[2]) : undefined;
  const b = m[3] !== undefined ? Number(m[3]) : undefined;
  const format = m[4];
  if (type === 'string') return b === undefined ? { type, ...(a !== undefined ? { length: a } : {}) } : null;
  if (type === 'decimal') {
    if (a === undefined) return { type };
    const scale = b ?? 0;
    return a >= 1 && scale <= a ? { type, precision: a, scale } : null;
  }
  if (a !== undefined) return null; // sizes only make sense for string/decimal
  if ((type === 'date' || type === 'timestamp') && format) return { type, format };
  return format ? null : { type };
}

export type EditableField = 'targetName' | 'type' | 'nullable' | 'primaryKey' | 'pii' | 'description';
type FieldTypes = {
  targetName: string;
  type: TypeSpec | null;
  nullable: boolean | null;
  primaryKey: boolean;
  pii: PiiSpec | null;
  description: string | null;
};

/** Returns a new FileSpec with one field of one column set by the reviewer. */
export function editField<F extends EditableField>(spec: FileSpec, sourceName: string, field: F, value: FieldTypes[F], by = 'reviewer'): FileSpec {
  return {
    ...spec,
    columns: spec.columns.map((c): ColumnSpec => {
      if (c.sourceName !== sourceName) return c;
      const current = c[field] as FieldValue<FieldTypes[F]>;
      const r = applyIfAllowed(current, { value, source: 'user' });
      return { ...c, [field]: { ...r.field, evidence: `set by ${by}` } };
    }),
  };
}

/** Making one column the primary key un-marks the others (single-column keys for now). */
export function setPrimaryKey(spec: FileSpec, sourceName: string): FileSpec {
  let next = spec;
  for (const c of spec.columns) {
    const isKey = c.sourceName === sourceName;
    if (c.primaryKey.value !== isKey || isKey) next = editField(next, c.sourceName, 'primaryKey', isKey);
  }
  return editField(next, sourceName, 'nullable', false);
}

export interface SpecStats {
  columns: number;
  tbd: number;
  pii: number;
  pci: number;
  errors: number;
  warnings: number;
}

export function specStats(spec: FileSpec): SpecStats {
  const fields = (c: ColumnSpec) => [c.targetName, c.type, c.nullable, c.primaryKey, c.pii, c.description];
  return {
    columns: spec.columns.length,
    tbd: spec.columns.reduce((n, c) => n + fields(c).filter((f) => f.source === 'tbd').length, 0),
    pii: spec.columns.filter((c) => c.pii.value?.classification === 'PII').length,
    pci: spec.columns.filter((c) => c.pii.value?.classification === 'PCI').length,
    errors: spec.findings.filter((f) => f.severity === 'error').length,
    warnings: spec.findings.filter((f) => f.severity === 'warning').length,
  };
}
