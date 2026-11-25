/**
 * End-to-end rules check on the synthetic demo feed: CSV → profile → spec.
 * The expectations mirror the quirks planted in demo-data/generate.mts.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/config';
import { createProfiler } from '../../src/profile/profiler';
import { buildFileSpec } from '../../src/spec/build';
import type { ColumnSpec, FileSpec } from '../../src/domain/spec';
import { parseCsv } from '../helpers/csv';

function specFor(version: 'v1' | 'v2', file: string): FileSpec {
  const [header = [], ...rows] = parseCsv(readFileSync(join(__dirname, '../../demo-data/retail-accounts', version, file), 'utf8'));
  const p = createProfiler(header, { nullTokens: defaultConfig.types.nullTokens, booleanTokens: defaultConfig.types.booleanTokens });
  for (const r of rows) p.addRow(r);
  return buildFileSpec(p.finish(file), defaultConfig);
}

const colOf = (s: FileSpec, name: string): ColumnSpec => {
  const c = s.columns.find((x) => x.sourceName === name);
  if (!c) throw new Error(`no column ${name}`);
  return c;
};

describe('demo feed v1: customers.csv', () => {
  const s = specFor('v1', 'customers.csv');
  const c = (n: string) => colOf(s, n);

  it('finds the primary key and derives names', () => {
    expect(c('cust_id').primaryKey.value).toBe(true);
    expect(c('cust_id').nullable.value).toBe(false);
    expect(c('cust_id').targetName.value).toBe('customer_id');
    expect(s.tableName.value).toBe('customers');
  });

  it('classifies PII from names and content', () => {
    expect(c('c_email').pii.value).toEqual({ classification: 'PII', category: 'email' });
    expect(c('c_sin').pii.value?.category).toBe('government_id');
    expect(c('c_sin').pii.evidence).toMatch(/luhn9/);
    expect(c('dob').pii.value?.category).toBe('date_of_birth');
    expect(c('first_nm').pii.value?.category).toBe('person_name');
    expect(c('postal_cd').pii.value?.category).toBe('postal_code');
    expect(c('phone_no').pii.value?.category).toBe('phone');
    expect(c('segment_cd').pii.source).toBe('tbd');
  });

  it('infers types', () => {
    expect(c('dob').type.value).toEqual({ type: 'date', format: 'YYYY-MM-DD' });
    expect(c('FLAG_X').type.value).toEqual({ type: 'boolean' });
    expect(c('marketing_opt_in').type.value).toEqual({ type: 'boolean' });
    expect(c('created_ts').type.value?.type).toBe('timestamp');
    expect(c('c_sin').type.value?.type).toBe('string');
    expect(c('kyc_status').nullable.value).toBe(true); // "N/A" is a null token
  });

  it('lints the ugly columns', () => {
    const ids = (col: string) => s.findings.filter((f) => f.column === col).map((f) => f.ruleId);
    expect(ids('col_17')).toContain('unclear-name');
    expect(ids('FLAG_X')).toContain('unclear-name');
    expect(ids('city')).toContain('untrimmed-values');
    expect(s.findings[0]?.severity).not.toBe('info'); // sorted by severity
  });

  it('leaves descriptions tbd for humans/agents', () => {
    expect(s.columns.every((col) => col.description.source === 'tbd')).toBe(true);
  });
});

describe('demo feed v1: other files', () => {
  it('cards: PCI columns and text card numbers', () => {
    const s = specFor('v1', 'cards.csv');
    expect(colOf(s, 'card_no').pii.value).toEqual({ classification: 'PCI', category: 'card_number' });
    expect(colOf(s, 'card_no').type.value?.type).toBe('string');
    expect(colOf(s, 'cvv').pii.value?.classification).toBe('PCI');
    expect(colOf(s, 'exp_mm_yy').pii.value?.category).toBe('card_expiry');
    expect(colOf(s, 'cardholder_nm').pii.value?.category).toBe('cardholder_name');
    expect(colOf(s, 'card_id').primaryKey.value).toBe(true);
  });

  it('accounts: leading-zero branch codes and decimals', () => {
    const s = specFor('v1', 'accounts.csv');
    expect(colOf(s, 'branch_no').type.value).toEqual({ type: 'string', length: 10 });
    expect(colOf(s, 'current_bal_amt').type.value?.type).toBe('decimal');
    expect(colOf(s, 'interest_rate').type.value).toMatchObject({ type: 'decimal', scale: 4 });
    expect(colOf(s, 'acct_id').primaryKey.value).toBe(true);
    expect(colOf(s, 'cust_id').primaryKey.value).toBe(false);
  });

  it('transactions: DD/MM dates, IPs, device ids', () => {
    const s = specFor('v1', 'transactions.csv');
    expect(colOf(s, 'posting_dt').type.value).toEqual({ type: 'date', format: 'DD/MM/YYYY' });
    expect(colOf(s, 'ip_addr').pii.value?.category).toBe('ip_address');
    expect(colOf(s, 'device_id').pii.value?.category).toBe('device_id');
    expect(colOf(s, 'txn_amt').type.value?.type).toBe('decimal');
    expect(colOf(s, 'txn_id').type.value).toEqual({ type: 'integer' });
  });
});

describe('demo feed v2 differences are visible to the rules', () => {
  it('widened branch_no and new PII column', () => {
    expect(colOf(specFor('v2', 'accounts.csv'), 'branch_no').type.value).toEqual({ type: 'string', length: 20 });
    const c2 = specFor('v2', 'customers.csv');
    expect(colOf(c2, 'alt_phone_no').pii.value?.category).toBe('phone');
    expect(colOf(c2, 'email_address').pii.value?.category).toBe('email');
  });
});
