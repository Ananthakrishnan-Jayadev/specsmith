/**
 * Merges a freshly built spec into an existing (possibly human-edited) one.
 * Core rule 3: every field goes through applyIfAllowed, so a lower-precedence
 * value never replaces a higher one (a user edit survives re-profiling).
 * Columns are matched by source name; new columns come from `fresh`, removed
 * columns are dropped (drift reporting is F13's job).
 */
import type { ColumnSpec, FieldValue, FileSpec } from '../domain/spec';
import { applyIfAllowed } from '../rules/precedence';

function pick<T>(existing: FieldValue<T>, fresh: FieldValue<T>): FieldValue<T> {
  const r = applyIfAllowed(existing, fresh);
  // applyIfAllowed copies {value, source}; keep the evidence of whichever field won.
  return r.applied ? { ...fresh } : { ...existing };
}

export function mergeColumn(existing: ColumnSpec, fresh: ColumnSpec): ColumnSpec {
  return {
    ...fresh,
    targetName: pick(existing.targetName, fresh.targetName),
    type: pick(existing.type, fresh.type),
    nullable: pick(existing.nullable, fresh.nullable),
    primaryKey: pick(existing.primaryKey, fresh.primaryKey),
    pii: pick(existing.pii, fresh.pii),
    description: pick(existing.description, fresh.description),
  };
}

export function mergeFileSpec(existing: FileSpec, fresh: FileSpec): FileSpec {
  const byName = new Map(existing.columns.map((c) => [c.sourceName, c]));
  return {
    ...fresh,
    tableName: pick(existing.tableName, fresh.tableName),
    columns: fresh.columns.map((c) => {
      const old = byName.get(c.sourceName);
      return old ? mergeColumn(old, c) : c;
    }),
  };
}
