/**
 * Streaming column profiler. Feed rows one at a time (e.g. from a PapaParse
 * step callback in a web worker), then call finish(). Pure: no I/O, no globals.
 */
import type { ColumnProfile, FileProfile, KindCounts, ValueSignals } from '../domain/profile';
import { EMAIL_RE, UUID_RE, fnv1a, isIpv4, isPhone, isPostal, luhnValid, parseDate, parseNumber, shapeOf } from './values';

export interface ProfilerOptions {
  /** Values treated as null (compared trimmed, case-insensitive). Empty string is always null. */
  nullTokens: string[];
  /** Values treated as booleans (compared trimmed, case-insensitive). */
  booleanTokens: string[];
  /** Exact distinct counting up to this many values per column. */
  distinctCap: number;
  /** Max distinct value hashes kept per column (for relationship detection). */
  hashCap: number;
  sampleCount: number;
}

export const DEFAULT_PROFILER_OPTIONS: ProfilerOptions = {
  nullTokens: ['null', 'n/a', 'na', 'none', '\\n'],
  booleanTokens: ['true', 'false', 't', 'f', 'y', 'n', 'yes', 'no'],
  distinctCap: 10_000,
  hashCap: 2_000,
  sampleCount: 5,
};

interface ColumnState {
  name: string;
  position: number;
  nullCount: number;
  distinct: Set<string>;
  distinctCapped: boolean;
  hashes: string[];
  minLength: number | null;
  maxLength: number | null;
  kinds: KindCounts;
  dateFormats: Map<string, number>;
  minDate: string | null;
  maxDate: string | null;
  minNumber: number | null;
  maxNumber: number | null;
  maxScale: number;
  maxPrecision: number;
  signals: ValueSignals;
  patterns: Map<string, number>;
  samples: string[];
}

const emptySignals = (): ValueSignals => ({
  email: 0, luhnCard: 0, luhn9: 0, ipv4: 0, phone: 0, postal: 0, uuid: 0, leadingZero: 0, untrimmed: 0,
});

/** Cleans headers and reports problems: BOM, blanks, duplicates, surrounding spaces. */
export function normalizeHeaders(raw: string[]): { names: string[]; warnings: string[] } {
  const warnings: string[] = [];
  const seen = new Map<string, number>();
  const names = raw.map((h, i) => {
    let name = i === 0 ? h.replace(/^\uFEFF/, '') : h;
    if (name !== name.trim()) {
      warnings.push(`Column ${i + 1} header "${name}" has leading/trailing spaces (trimmed).`);
      name = name.trim();
    }
    if (name === '') {
      name = `column_${i + 1}`;
      warnings.push(`Column ${i + 1} has a blank header; named "${name}".`);
    }
    const key = name.toLowerCase();
    const count = seen.get(key) ?? 0;
    if (count > 0) warnings.push(`Duplicate header "${name}" (column ${i + 1}).`);
    seen.set(key, count + 1);
    return name;
  });
  return { names, warnings };
}

export function createProfiler(rawHeaders: string[], options: Partial<ProfilerOptions> = {}) {
  const opts = { ...DEFAULT_PROFILER_OPTIONS, ...options };
  const nullSet = new Set(opts.nullTokens.map((t) => t.toLowerCase()));
  const boolSet = new Set(opts.booleanTokens.map((t) => t.toLowerCase()));
  const { names, warnings } = normalizeHeaders(rawHeaders);
  let rowCount = 0;
  let longRows = 0;

  const cols: ColumnState[] = names.map((name, position) => ({
    name, position, nullCount: 0, distinct: new Set(), distinctCapped: false, hashes: [],
    minLength: null, maxLength: null,
    kinds: { integer: 0, decimal: 0, boolean: 0, date: 0, timestamp: 0 },
    dateFormats: new Map(), minDate: null, maxDate: null, minNumber: null, maxNumber: null,
    maxScale: 0, maxPrecision: 0, signals: emptySignals(), patterns: new Map(), samples: [],
  }));

  function addValue(c: ColumnState, raw: string | undefined): void {
    const value = raw ?? '';
    const trimmed = value.trim();
    if (trimmed === '' || nullSet.has(trimmed.toLowerCase())) {
      c.nullCount++;
      return;
    }
    if (value !== trimmed) c.signals.untrimmed++;
    c.minLength = c.minLength === null ? value.length : Math.min(c.minLength, value.length);
    c.maxLength = c.maxLength === null ? value.length : Math.max(c.maxLength, value.length);

    if (!c.distinct.has(trimmed)) {
      if (c.distinct.size < opts.distinctCap) {
        c.distinct.add(trimmed);
        if (c.hashes.length < opts.hashCap) c.hashes.push(fnv1a(trimmed));
        if (c.samples.length < opts.sampleCount) c.samples.push(trimmed);
      } else {
        c.distinctCapped = true;
      }
    }

    const pattern = shapeOf(trimmed);
    c.patterns.set(pattern, (c.patterns.get(pattern) ?? 0) + 1);

    if (boolSet.has(trimmed.toLowerCase())) c.kinds.boolean++;
    const num = parseNumber(trimmed);
    if (num) {
      c.kinds[num.kind]++;
      if (num.leadingZero) c.signals.leadingZero++;
      c.minNumber = c.minNumber === null ? num.value : Math.min(c.minNumber, num.value);
      c.maxNumber = c.maxNumber === null ? num.value : Math.max(c.maxNumber, num.value);
      c.maxScale = Math.max(c.maxScale, num.scale);
      c.maxPrecision = Math.max(c.maxPrecision, num.precision);
    }
    const date = parseDate(trimmed);
    if (date) {
      c.kinds[date.kind]++;
      c.dateFormats.set(date.format, (c.dateFormats.get(date.format) ?? 0) + 1);
      if (c.minDate === null || date.iso < c.minDate) c.minDate = date.iso;
      if (c.maxDate === null || date.iso > c.maxDate) c.maxDate = date.iso;
    }

    if (EMAIL_RE.test(trimmed)) c.signals.email++;
    const digits = trimmed.replace(/[\s-]/g, '');
    if (/^\d+$/.test(digits)) {
      if (digits.length >= 13 && digits.length <= 19 && luhnValid(digits)) c.signals.luhnCard++;
      if (digits.length === 9 && luhnValid(digits)) c.signals.luhn9++;
    }
    if (isIpv4(trimmed)) c.signals.ipv4++;
    if (isPhone(trimmed)) c.signals.phone++;
    if (isPostal(trimmed)) c.signals.postal++;
    if (UUID_RE.test(trimmed)) c.signals.uuid++;
  }

  return {
    addRow(row: string[]): void {
      rowCount++;
      if (row.length > cols.length) longRows++;
      for (const c of cols) addValue(c, row[c.position]);
    },

    finish(fileName: string, sampled = false): FileProfile {
      const headerWarnings = [...warnings];
      if (longRows > 0) headerWarnings.push(`${longRows} row(s) had more fields than the header; extra fields were ignored.`);
      const columns: ColumnProfile[] = cols.map((c) => ({
        name: c.name,
        position: c.position,
        rowCount,
        nullCount: c.nullCount,
        distinctCount: c.distinct.size,
        distinctCapped: c.distinctCapped,
        minLength: c.minLength,
        maxLength: c.maxLength,
        kinds: c.kinds,
        dateFormats: Object.fromEntries(c.dateFormats),
        minDate: c.minDate,
        maxDate: c.maxDate,
        minNumber: c.minNumber,
        maxNumber: c.maxNumber,
        maxScale: c.maxScale,
        maxPrecision: c.maxPrecision,
        signals: c.signals,
        topPatterns: [...c.patterns.entries()]
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .slice(0, 5)
          .map(([pattern, count]) => ({ pattern, count })),
        samples: c.samples,
        valueHashes: c.hashes,
      }));
      return { fileName, rowCount, columns, headerWarnings, sampled };
    },
  };
}

/** Convenience for tests and small inputs: first row is the header. */
export function profileRows(fileName: string, rows: string[][], options: Partial<ProfilerOptions> = {}): FileProfile {
  const [header = [], ...data] = rows;
  const p = createProfiler(header, options);
  for (const r of data) p.addRow(r);
  return p.finish(fileName);
}
