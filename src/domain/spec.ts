/**
 * The spec model. Every field carries its provenance so precedence
 * (rules/precedence.ts) can protect higher-trust values.
 */
import type { Source } from '../rules/precedence';
import type { ColumnProfile } from './profile';

export interface FieldValue<T> {
  value: T;
  source: Source;
  /** Why this value was chosen; shown to reviewers. */
  evidence?: string;
}

export type LogicalType = 'integer' | 'decimal' | 'date' | 'timestamp' | 'boolean' | 'string';

export interface TypeSpec {
  type: LogicalType;
  /** string(n) */
  length?: number;
  /** decimal(p,s) */
  precision?: number;
  scale?: number;
  /** For date/timestamp: the source format, e.g. "DD/MM/YYYY". */
  format?: string;
}

export type PiiClass = 'PII' | 'PCI' | 'NONE';

export interface PiiSpec {
  classification: PiiClass;
  /** e.g. "email", "government_id", "card_number". */
  category?: string;
}

export interface ColumnSpec {
  sourceName: string;
  position: number;
  targetName: FieldValue<string>;
  type: FieldValue<TypeSpec | null>;
  nullable: FieldValue<boolean | null>;
  primaryKey: FieldValue<boolean>;
  pii: FieldValue<PiiSpec | null>;
  description: FieldValue<string | null>;
  profile: ColumnProfile;
}

export interface FileSpec {
  fileName: string;
  /** Target table name, derived from the file name. */
  tableName: FieldValue<string>;
  rowCount: number;
  columns: ColumnSpec[];
  findings: LintFinding[];
}

export type Severity = 'error' | 'warning' | 'info';

export interface LintFinding {
  ruleId: string;
  severity: Severity;
  /** Column source name, or null for file-level findings. */
  column: string | null;
  message: string;
}
