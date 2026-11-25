import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/config';
import { detectPii, keywordMatches, maskSamples } from '../../src/rules/pii';
import { profileRows } from '../../src/profile/profiler';

const one = (name: string, values: string[]) => {
  const c = profileRows('t.csv', [[name], ...values.map((v) => [v])]).columns[0];
  if (!c) throw new Error('no column');
  return c;
};

describe('keywordMatches', () => {
  it('matches whole tokens only', () => {
    expect(keywordMatches('c_sin', 'sin')).toBe(true);
    expect(keywordMatches('business_type', 'sin')).toBe(false);
    expect(keywordMatches('card_no', 'card_no')).toBe(true);
    expect(keywordMatches('cardholder_nm', 'card_no')).toBe(false);
  });
});

describe('detectPii', () => {
  it('uses keyword + content signal, PCI over PII', () => {
    const r = detectPii(one('card_no', ['4111111111111111', '4000056655665556']), defaultConfig.pii);
    expect(r.value).toEqual({ classification: 'PCI', category: 'card_number' });
    expect(r.source).toBe('derived');
    expect(r.evidence).toMatch(/card_no.*100\.0% of values match luhnCard/);
  });

  it('detects by content alone when the name is meaningless', () => {
    const r = detectPii(one('col_9', ['a@example.com', 'b@example.org']), defaultConfig.pii);
    expect(r.value?.category).toBe('email');
  });

  it('prefers the strongest rule (ip_addr is an IP, not an address)', () => {
    expect(detectPii(one('ip_addr', ['10.0.0.1', '192.168.1.20']), defaultConfig.pii).value?.category).toBe('ip_address');
  });

  it('never claims NONE: unmatched columns stay tbd', () => {
    expect(detectPii(one('txn_amt', ['1.00', '2.50']), defaultConfig.pii)).toMatchObject({ value: null, source: 'tbd' });
  });
});

describe('maskSamples', () => {
  it('replaces sensitive samples with shapes', () => {
    expect(maskSamples(['903-738-417'], { classification: 'PII', category: 'government_id' })).toEqual(['‹9{3}-9{3}-9{3}›']);
    expect(maskSamples(['abc'], null)).toEqual(['abc']);
  });
});

describe('pii config', () => {
  it('only uses known classifications and signals', () => {
    const signals = ['email', 'luhnCard', 'luhn9', 'ipv4', 'phone', 'postal', 'uuid', 'leadingZero', 'untrimmed'];
    for (const r of defaultConfig.pii.rules) {
      expect(['PII', 'PCI']).toContain(r.classification);
      if (r.signal) expect(signals).toContain(r.signal);
      expect(r.keywords.every((k) => k === k.toLowerCase())).toBe(true);
    }
  });
});
