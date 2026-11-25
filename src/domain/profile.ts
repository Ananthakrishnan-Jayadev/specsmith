/**
 * Column profile: the ONLY description of a file that leaves the browser.
 * Contains statistics and shapes, never full columns of raw values.
 * At most `samples.length <= 5` raw values, which are masked before sending
 * when a PII hint fires (see rules/pii.ts).
 */

export interface PatternCount {
  /** Shape mask, e.g. "9{3}-9{3}-9{3}", "a+@a+.a+", "Aa+". */
  pattern: string;
  count: number;
}

/** Counts of non-null values that parse as each kind. */
export interface KindCounts {
  integer: number;
  decimal: number;
  boolean: number;
  date: number;
  timestamp: number;
}

/** Counts of non-null values matching content signals used by PII rules. */
export interface ValueSignals {
  email: number;
  /** 13–19 digit strings (ignoring spaces/dashes) that pass the Luhn check. */
  luhnCard: number;
  /** 9-digit strings (ignoring spaces/dashes) that pass the Luhn check. */
  luhn9: number;
  ipv4: number;
  /** 10–11 digit phone-like strings (digits, spaces, dashes, dots, parentheses, leading +). */
  phone: number;
  /** Postal-code-like shapes, e.g. "A9A 9A9" or 5-digit ZIP. */
  postal: number;
  uuid: number;
  /** Integer-looking values with a leading zero (e.g. "00412"): must stay strings. */
  leadingZero: number;
  /** Values with leading or trailing whitespace. */
  untrimmed: number;
}

export interface ColumnProfile {
  /** Header text exactly as it appeared in the file. */
  name: string;
  /** 0-based column position. */
  position: number;
  rowCount: number;
  nullCount: number;
  /** Exact up to `distinctCap`; when `distinctCapped` it is a lower bound. */
  distinctCount: number;
  distinctCapped: boolean;
  minLength: number | null;
  maxLength: number | null;
  kinds: KindCounts;
  /** Date formats seen, e.g. { "YYYY-MM-DD": 120, "DD/MM/YYYY": 3 }. */
  dateFormats: Record<string, number>;
  /** ISO strings (date or timestamp). */
  minDate: string | null;
  maxDate: string | null;
  minNumber: number | null;
  maxNumber: number | null;
  /** Max digits after the decimal point among decimal values. */
  maxScale: number;
  /** Max total significant digits among numeric values. */
  maxPrecision: number;
  signals: ValueSignals;
  /** Top shape masks by frequency (max 5). */
  topPatterns: PatternCount[];
  /** Up to 5 distinct example values (raw). Mask before sending if PII. */
  samples: string[];
  /** Up to N distinct value hashes (FNV-1a, hex) for cross-file overlap (F8). */
  valueHashes: string[];
}

export interface FileProfile {
  fileName: string;
  rowCount: number;
  columns: ColumnProfile[];
  /** Header problems found while parsing (duplicates, blanks, ...). */
  headerWarnings: string[];
  /** True when the file was sampled rather than fully read. */
  sampled: boolean;
}
