/**
 * Pure value classifiers used by the profiler. Each works on one raw string.
 */

export function luhnValid(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/** FNV-1a 32-bit hash as 8 hex chars. Used only for cross-file overlap, not security. */
export function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Shape mask: digits keep exact run lengths (they carry meaning: 3-3-3, 4-digit codes),
 * letters collapse to A/A+ and a/a+, whitespace collapses, other characters stay literal.
 *   "123-456-789" → "9{3}-9{3}-9{3}",  "john.doe@x.com" → "a+.a+@a.a+",  "C000123" → "A9{6}"
 */
export function shapeOf(value: string, maxChars = 64): string {
  const v = value.length > maxChars ? value.slice(0, maxChars) : value;
  let out = '';
  let i = 0;
  while (i < v.length) {
    const ch = v.charAt(i);
    const cls = /\d/.test(ch) ? '9' : /[A-Z]/.test(ch) ? 'A' : /[a-z]/.test(ch) ? 'a' : /\s/.test(ch) ? ' ' : null;
    if (cls === null) {
      out += ch;
      i++;
      continue;
    }
    let j = i;
    while (j < v.length && classOf(v.charAt(j)) === cls) j++;
    const n = j - i;
    if (cls === '9') out += n > 1 ? `9{${n}}` : '9';
    else if (cls === ' ') out += ' ';
    else out += n > 1 ? `${cls}+` : cls;
    i = j;
  }
  return value.length > maxChars ? `${out}…` : out;
}

function classOf(ch: string): string | null {
  return /\d/.test(ch) ? '9' : /[A-Z]/.test(ch) ? 'A' : /[a-z]/.test(ch) ? 'a' : /\s/.test(ch) ? ' ' : null;
}

export type NumberKind = { kind: 'integer' | 'decimal'; value: number; precision: number; scale: number; leadingZero: boolean };

export function parseNumber(v: string): NumberKind | null {
  const m = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(v);
  if (!m || (m[2] === '' && (m[3] ?? '') === '')) return null;
  const intPart = m[2] ?? '';
  const frac = m[3];
  const leadingZero = intPart.length > 1 && intPart.startsWith('0');
  const sigInt = intPart.replace(/^0+/, '');
  const scale = frac === undefined ? 0 : frac.length;
  const value = Number(v);
  if (!Number.isFinite(value)) return null;
  return {
    kind: frac === undefined ? 'integer' : 'decimal',
    value,
    precision: Math.max(1, sigInt.length + scale),
    scale,
    leadingZero,
  };
}

export interface ParsedDate {
  kind: 'date' | 'timestamp';
  format: string;
  /** ISO 8601 (date: YYYY-MM-DD, timestamp: as given, normalized separator). */
  iso: string;
}

function validYmd(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1) return false;
  const days = [31, (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return d <= (days[m - 1] ?? 0);
}

const pad = (n: number) => String(n).padStart(2, '0');

export function parseDate(v: string): ParsedDate | null {
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return validYmd(y, mo, d) ? { kind: 'date', format: 'YYYY-MM-DD', iso: v } : null;
  }
  m = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(v);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return validYmd(y, mo, d) ? { kind: 'date', format: 'YYYY/MM/DD', iso: `${m[1]}-${m[2]}-${m[3]}` } : null;
  }
  m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
  if (m) {
    const [a, b, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const dmy = validYmd(y, b, a);
    const mdy = validYmd(y, a, b);
    if (dmy && !mdy) return { kind: 'date', format: 'DD/MM/YYYY', iso: `${y}-${pad(b)}-${pad(a)}` };
    if (mdy && !dmy) return { kind: 'date', format: 'MM/DD/YYYY', iso: `${y}-${pad(a)}-${pad(b)}` };
    // Both readings valid (day <= 12): ambiguous. Record as DD/MM/YYYY|MM/DD/YYYY; rules resolve per column.
    if (dmy && mdy) return { kind: 'date', format: 'DD/MM/YYYY|MM/DD/YYYY', iso: `${y}-${pad(b)}-${pad(a)}` };
    return null;
  }
  m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})?$/.exec(v);
  if (m) {
    const [y, mo, d, h, mi, s] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0)];
    if (!validYmd(y, mo, d) || h > 23 || mi > 59 || s > 59) return null;
    return { kind: 'timestamp', format: m[7] ? 'ISO-8601 timestamp with zone' : 'ISO-8601 timestamp', iso: v.replace(' ', 'T') };
  }
  return null;
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const PHONE_RE = /^\+?[\d\s().-]{10,20}$/;
// Content signals must not fire on bare digit runs (IDs, codes): only formatted shapes count.
// Bare digits are still caught when the column NAME matches a keyword (rules/pii.ts).
const POSTAL_RE = /^([A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d|\d{5}-\d{4})$/;

export function isIpv4(v: string): boolean {
  const m = IPV4_RE.exec(v);
  return !!m && m.slice(1).every((p) => Number(p) <= 255);
}

export function isPhone(v: string): boolean {
  if (!PHONE_RE.test(v) || /^\d+$/.test(v)) return false; // bare digits are IDs, not phones
  const digits = v.replace(/\D/g, '');
  return digits.length === 10 || digits.length === 11;
}

export function isPostal(v: string): boolean {
  return POSTAL_RE.test(v);
}
