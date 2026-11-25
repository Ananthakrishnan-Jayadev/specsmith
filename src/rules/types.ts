import type { TypesConfig } from '../config';
import type { ColumnProfile } from '../domain/profile';
import type { FieldValue, TypeSpec } from '../domain/spec';

const pct = (x: number) => `${(x * 100).toFixed(x === 1 ? 0 : 1)}%`;

export function standardLength(maxLength: number, cfg: TypesConfig): number {
  const wanted = Math.ceil(maxLength * cfg.lengthHeadroom);
  return cfg.standardLengths.find((l) => l >= wanted) ?? wanted;
}

/** Picks the date format for a column; mixed definite formats → null (ambiguous). */
export function resolveDateFormat(formats: Record<string, number>): { format: string | null; ambiguous: boolean } {
  const keys = Object.keys(formats);
  const definite = keys.filter((k) => !k.includes('|'));
  if (definite.length === 1) return { format: definite[0] ?? null, ambiguous: false };
  if (definite.length > 1) return { format: null, ambiguous: true };
  return keys.length > 0 ? { format: keys[0] ?? null, ambiguous: true } : { format: null, ambiguous: false };
}

export interface TypeResult {
  field: FieldValue<TypeSpec | null>;
  ambiguousDate: boolean;
  /** Set when values are a mix of kinds below the threshold. */
  mixed: string | null;
}

export function inferType(p: ColumnProfile, cfg: TypesConfig): TypeResult {
  const nonNull = p.rowCount - p.nullCount;
  if (nonNull === 0) {
    return { field: { value: null, source: 'tbd', evidence: 'all values are empty' }, ambiguousDate: false, mixed: null };
  }
  const share = (n: number) => n / nonNull;
  const th = cfg.typeThreshold;
  const of = `${nonNull} non-null values`;
  const derived = (value: TypeSpec, evidence: string, extra: Partial<TypeResult> = {}): TypeResult => ({
    field: { value, source: 'derived', evidence },
    ambiguousDate: false,
    mixed: null,
    ...extra,
  });
  const asString = (evidence: string, extra: Partial<TypeResult> = {}) =>
    derived({ type: 'string', length: standardLength(p.maxLength ?? 1, cfg) }, `${evidence}; max length ${p.maxLength ?? 0}`, extra);

  if (share(p.kinds.boolean) >= th && p.distinctCount <= 2) {
    return derived({ type: 'boolean' }, `${pct(share(p.kinds.boolean))} of ${of} are boolean tokens (${p.samples.join('/')})`);
  }
  if (p.signals.leadingZero > 0) return asString(`${p.signals.leadingZero} values have leading zeros (identifier, kept as text)`);
  if (share(p.signals.luhnCard) >= th) return asString('card-number-like digits are kept as text');

  const numeric = p.kinds.integer + p.kinds.decimal;
  if (share(p.kinds.integer) >= th && p.maxPrecision <= cfg.integerMaxPrecision) {
    return derived({ type: 'integer' }, `${pct(share(p.kinds.integer))} of ${of} are integers; range ${p.minNumber}..${p.maxNumber}`);
  }
  if (share(numeric) >= th) {
    const scale = p.maxScale;
    const precision = Math.min(cfg.maxDecimalPrecision, Math.max(scale + 1, p.maxPrecision + cfg.decimalExtraIntegerDigits));
    return derived(
      { type: 'decimal', precision, scale },
      `${pct(share(numeric))} of ${of} are numeric; max ${p.maxPrecision} digits, ${scale} decimals; range ${p.minNumber}..${p.maxNumber}`,
    );
  }
  if (share(p.kinds.timestamp) >= th) {
    const { format } = resolveDateFormat(p.dateFormats);
    return derived(
      { type: 'timestamp', ...(format ? { format } : {}) },
      `${pct(share(p.kinds.timestamp))} of ${of} are timestamps (${format ?? 'mixed formats'}); ${p.minDate}..${p.maxDate}`,
    );
  }
  if (share(p.kinds.date) >= th) {
    const { format, ambiguous } = resolveDateFormat(p.dateFormats);
    return derived(
      { type: 'date', ...(format ? { format } : {}) },
      `${pct(share(p.kinds.date))} of ${of} are dates (${format ?? 'mixed formats'}); ${p.minDate}..${p.maxDate}`,
      { ambiguousDate: ambiguous },
    );
  }

  const kinds: [string, number][] = [
    ['integer', p.kinds.integer], ['numeric', numeric], ['date', p.kinds.date], ['timestamp', p.kinds.timestamp], ['boolean', p.kinds.boolean],
  ];
  const [bestKind, bestCount] = kinds.reduce((a, b) => (b[1] > a[1] ? b : a));
  const mixed = share(bestCount) >= 0.5 ? `${pct(share(bestCount))} of values are ${bestKind}; the rest are not` : null;
  return asString(mixed ? `mixed values (${mixed})` : 'free text or codes', { mixed });
}

export function inferNullable(p: ColumnProfile): FieldValue<boolean | null> {
  if (p.rowCount === 0) return { value: null, source: 'tbd', evidence: 'no rows' };
  return p.nullCount > 0
    ? { value: true, source: 'derived', evidence: `${p.nullCount} empty values (${pct(p.nullCount / p.rowCount)})` }
    : { value: false, source: 'derived', evidence: `no empty values in ${p.rowCount} rows` };
}
