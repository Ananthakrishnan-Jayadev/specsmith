/** JSON Schema (draft 2020-12): one definition per file. */
import type { ColumnSpec, FileSpec } from '../domain/spec';

function prop(c: ColumnSpec): Record<string, unknown> {
  const t = c.type.value;
  const base: Record<string, unknown> = t === null ? { type: 'string' }
    : t.type === 'integer' ? { type: 'integer' }
    : t.type === 'decimal' ? { type: 'number' }
    : t.type === 'boolean' ? { type: 'boolean' }
    : t.type === 'date' ? { type: 'string', format: 'date' }
    : t.type === 'timestamp' ? { type: 'string', format: 'date-time' }
    : { type: 'string', ...(t.length !== undefined ? { maxLength: t.length } : {}) };
  if (c.nullable.value !== false) base.type = [base.type as string, 'null'];
  if (c.description.value) base.description = c.description.value;
  if (c.pii.value && c.pii.value.classification !== 'NONE') base['x-classification'] = c.pii.value.classification;
  return base;
}

export function jsonSchemaExport(feedName: string, files: FileSpec[]): string {
  const defs = Object.fromEntries(
    [...files].sort((a, b) => a.fileName.localeCompare(b.fileName)).map((s) => {
      const cols = [...s.columns].sort((a, b) => a.position - b.position);
      return [s.tableName.value, {
        type: 'object',
        additionalProperties: false,
        properties: Object.fromEntries(cols.map((c) => [c.targetName.value, prop(c)])),
        required: cols.filter((c) => c.nullable.value === false).map((c) => c.targetName.value),
      }];
    }),
  );
  return `${JSON.stringify({ $schema: 'https://json-schema.org/draft/2020-12/schema', title: `${feedName} feed records`, $defs: defs }, null, 2)}\n`;
}
