/**
 * No false positives: the exact set of sensitive columns the rules flag in the
 * demo feed. Regression for txn_id being flagged as a phone number and
 * branch_no as a postal code.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/config';
import { createProfiler } from '../../src/profile/profiler';
import { buildFileSpec } from '../../src/spec/build';
import { parseCsv } from '../helpers/csv';

function sensitive(file: string): Record<string, string> {
  const [header = [], ...rows] = parseCsv(readFileSync(join(__dirname, '../../demo-data/retail-accounts/v1', file), 'utf8'));
  const p = createProfiler(header, { nullTokens: defaultConfig.types.nullTokens, booleanTokens: defaultConfig.types.booleanTokens });
  for (const r of rows) p.addRow(r);
  const spec = buildFileSpec(p.finish(file), defaultConfig);
  return Object.fromEntries(spec.columns.filter((c) => c.pii.value).map((c) => [c.sourceName, `${c.pii.value?.classification}:${c.pii.value?.category}`]));
}

describe('sensitive columns in the demo feed (exact)', () => {
  it('customers', () => {
    expect(sensitive('customers.csv')).toEqual({
      first_nm: 'PII:person_name', last_nm: 'PII:person_name', c_email: 'PII:email', phone_no: 'PII:phone',
      dob: 'PII:date_of_birth', c_sin: 'PII:government_id', addr_line1: 'PII:address', postal_cd: 'PII:postal_code',
    });
  });
  it('accounts has none', () => {
    expect(sensitive('accounts.csv')).toEqual({});
  });
  it('transactions', () => {
    expect(sensitive('transactions.csv')).toEqual({ ip_addr: 'PII:ip_address', device_id: 'PII:device_id' });
  });
  it('cards', () => {
    expect(sensitive('cards.csv')).toEqual({
      card_no: 'PCI:card_number', cardholder_nm: 'PCI:cardholder_name', exp_mm_yy: 'PCI:card_expiry', cvv: 'PCI:card_security_code',
    });
  });
});
