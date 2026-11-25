import { describe, expect, it } from 'vitest';
import { fnv1a, isIpv4, isPhone, isPostal, luhnValid, parseDate, parseNumber, shapeOf } from '../../src/profile/values';

describe('luhnValid', () => {
  it('accepts known-valid test numbers and rejects altered ones', () => {
    expect(luhnValid('4111111111111111')).toBe(true);
    expect(luhnValid('4111111111111112')).toBe(false);
    expect(luhnValid('046454286')).toBe(true); // classic 9-digit Luhn example
    expect(luhnValid('12a4')).toBe(false);
  });
});

describe('shapeOf', () => {
  it.each([
    ['123-456-789', '9{3}-9{3}-9{3}'],
    ['john.doe@x.com', 'a+.a+@a.a+'],
    ['C000123', 'A9{6}'],
    ['Main Street', 'Aa+ Aa+'],
    ['K1A 0B1', 'A9A 9A9'],
  ])('%s → %s', (v, s) => expect(shapeOf(v)).toBe(s));

  it('truncates very long values', () => {
    expect(shapeOf('x'.repeat(100), 10)).toBe('a+…');
  });
});

describe('parseNumber', () => {
  it('distinguishes integers, decimals and leading zeros', () => {
    expect(parseNumber('42')).toMatchObject({ kind: 'integer', value: 42, precision: 2, scale: 0, leadingZero: false });
    expect(parseNumber('-1234.50')).toMatchObject({ kind: 'decimal', precision: 6, scale: 2 });
    expect(parseNumber('00412')).toMatchObject({ kind: 'integer', leadingZero: true, precision: 3 });
    expect(parseNumber('0')).toMatchObject({ leadingZero: false });
    expect(parseNumber('1e5')).toBeNull();
    expect(parseNumber('.')).toBeNull();
    expect(parseNumber('abc')).toBeNull();
  });
});

describe('parseDate', () => {
  it('parses ISO and slash dates and validates the calendar', () => {
    expect(parseDate('2024-02-29')).toEqual({ kind: 'date', format: 'YYYY-MM-DD', iso: '2024-02-29' });
    expect(parseDate('2023-02-29')).toBeNull();
    expect(parseDate('31/12/2024')).toEqual({ kind: 'date', format: 'DD/MM/YYYY', iso: '2024-12-31' });
    expect(parseDate('12/31/2024')).toEqual({ kind: 'date', format: 'MM/DD/YYYY', iso: '2024-12-31' });
    expect(parseDate('05/06/2024')?.format).toBe('DD/MM/YYYY|MM/DD/YYYY');
  });

  it('parses ISO timestamps with and without zone', () => {
    expect(parseDate('2024-05-01 13:45:00')).toMatchObject({ kind: 'timestamp', format: 'ISO-8601 timestamp', iso: '2024-05-01T13:45:00' });
    expect(parseDate('2024-05-01T13:45:00.123Z')?.format).toBe('ISO-8601 timestamp with zone');
    expect(parseDate('2024-05-01T25:00')).toBeNull();
  });
});

describe('content signals', () => {
  it('detects ipv4, phones and postal codes', () => {
    expect(isIpv4('192.168.0.1')).toBe(true);
    expect(isIpv4('300.1.1.1')).toBe(false);
    expect(isPhone('(416) 555-0199')).toBe(true);
    expect(isPhone('+1 416 555 0199')).toBe(true);
    expect(isPhone('555-0199')).toBe(false);
    expect(isPhone('9000000296')).toBe(false); // bare 10-digit ID
    expect(isPostal('00296')).toBe(false); // bare 5-digit code
    expect(isPostal('90210-1234')).toBe(true);
    expect(isPostal('K1A 0B1')).toBe(true);
  });

  it('hashes deterministically', () => {
    expect(fnv1a('abc')).toBe(fnv1a('abc'));
    expect(fnv1a('abc')).not.toBe(fnv1a('abd'));
    expect(fnv1a('')).toBe('811c9dc5');
  });
});
