import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/config';
import { dedupeNames, deriveTargetName, tableNameFromFile, toSnakeCase } from '../../src/rules/naming';

const cfg = defaultConfig.naming;

describe('toSnakeCase', () => {
  it.each([
    ['CustID', 'cust_id'], ['cust-id', 'cust_id'], [' Cust ID ', 'cust_id'], ['FLAG_X', 'flag_x'], ['HTTPStatusCode', 'http_status_code'],
  ])('%s → %s', (a, b) => expect(toSnakeCase(a)).toBe(b));
});

describe('deriveTargetName', () => {
  it('expands abbreviations with evidence', () => {
    expect(deriveTargetName('cust_id', cfg)).toMatchObject({ targetName: 'customer_id', evidence: 'naming rules: abbreviations expanded' });
    expect(deriveTargetName('txn_amt', cfg).targetName).toBe('transaction_amount');
  });
  it('flags unclear, reserved and long names', () => {
    expect(deriveTargetName('col_17', cfg).issues.map((i) => i.ruleId)).toContain('unclear-name');
    expect(deriveTargetName('FLAG_X', cfg).issues.map((i) => i.ruleId)).toContain('unclear-name');
    expect(deriveTargetName('date', cfg).issues.map((i) => i.ruleId)).toContain('reserved-word');
    expect(deriveTargetName('x'.repeat(70) + 'y', cfg).issues.map((i) => i.ruleId)).toContain('name-too-long');
  });
  it('can leave abbreviations alone', () => {
    expect(deriveTargetName('cust_id', { ...cfg, expandAbbreviations: false }).targetName).toBe('cust_id');
  });
  it('prefixes names starting with a digit', () => {
    expect(deriveTargetName('2fa_flag', cfg).targetName).toBe('c_2fa_flag');
  });
});

describe('tableNameFromFile / dedupeNames', () => {
  it('derives table names and suffixes duplicates', () => {
    expect(tableNameFromFile('Customer Accounts.csv', cfg)).toBe('customer_accounts');
    expect(dedupeNames(['a', 'b', 'a'])).toEqual({ names: ['a', 'b', 'a_2'], collisions: ['a'] });
  });
});
