import { describe, expect, it } from 'vitest';
import { toYaml } from '../../src/exporters/yaml';
import { exportPack } from '../../src/exporters';
import { checksFor } from '../../src/rules/checks';
import { editField } from '../../src/spec/edit';
import { demoFeed, demoSpec } from '../helpers/demo';

describe('toYaml', () => {
  it('writes nested data with safe quoting', () => {
    expect(toYaml({ a: 1, 'b c': 'x: "y"', list: ['p', { q: true, r: null }], empty: [], skip: undefined })).toBe(
      'a: 1\n"b c": "x: \\"y\\""\nlist:\n  - "p"\n  - q: true\n    r: null\nempty: []\n',
    );
  });
});

describe('checksFor', () => {
  it('derives not-null, unique, length and allowed-values checks with stable ids', () => {
    const checks = checksFor(demoSpec('v1', 'accounts.csv'));
    const ids = checks.map((c) => c.id);
    expect(ids).toContain('chk-accounts-account_id-unique');
    expect(ids).toContain('chk-accounts-account_id-not-null');
    expect(checks.find((c) => c.id === 'chk-accounts-currency_code-accepted-values')?.values).toEqual(['CAD', 'USD']);
    expect(checks.find((c) => c.id === 'chk-accounts-branch_number-max-length')?.expected).toBe('length <= 10');
  });

  it('never builds allowed-values checks from sensitive columns', () => {
    const checks = checksFor(demoSpec('v1', 'cards.csv'));
    expect(checks.some((c) => c.type === 'acceptedValues' && ['card_number', 'cvv', 'expiry_mm_yy'].includes(c.column))).toBe(false);
  });
});

describe('exportPack on the demo feed', () => {
  const pack = exportPack('fdemo', 'Retail Accounts', demoFeed());
  const file = (n: string) => pack.find((f) => f.name === n)?.content ?? '';

  it('produces six files deterministically', () => {
    expect(pack.map((f) => f.name)).toEqual(['erd.svg', 'ddl.sql', 'schema.yml', 'data-contract.yaml', 'feed.schema.json', 'checks.sql']);
    expect(exportPack('fdemo', 'Retail Accounts', demoFeed())).toEqual(pack);
  });

  it('DDL: zones, keys, and sensitive columns kept out of analytics', () => {
    const ddl = file('ddl.sql');
    expect(ddl).toContain('CREATE TABLE raw.customers (');
    expect(ddl).toContain('"c_sin" VARCHAR(');
    expect(ddl).toContain('CONSTRAINT pk_customers PRIMARY KEY (customer_id)');
    expect(ddl).toMatch(/-- Left out until a masking policy is approved: .*card_number \(PCI card_number\)/);
    const view = ddl.slice(ddl.indexOf('CREATE VIEW analytics.cards'));
    expect(view.slice(0, view.indexOf(';'))).not.toContain('card_number');
  });

  it('JSON Schema parses and marks required fields', () => {
    const js = JSON.parse(file('feed.schema.json')) as { $defs: Record<string, { required: string[]; properties: Record<string, { type: unknown }> }> };
    expect(js.$defs['accounts']?.required).toContain('account_id');
    expect(js.$defs['accounts']?.properties['credit_limit_amount']?.type).toEqual(['number', 'null']);
    expect(js.$defs['accounts']?.properties['current_balance_amount']?.type).toBe('number');
  });

  it('carries reviewer descriptions into dbt and DDL comments, escaped', () => {
    const [accounts, ...rest] = demoFeed();
    if (!accounts) throw new Error('missing accounts');
    const files = [editField(accounts, 'acct_id', 'description', "Account's unique id"), ...rest];
    const p = exportPack('fdemo', 'Retail Accounts', files);
    const get = (n: string) => p.find((x) => x.name === n)?.content ?? '';
    expect(get('ddl.sql')).toContain("COMMENT ON COLUMN curated.accounts.account_id IS 'Account''s unique id';");
    expect(get('schema.yml')).toContain('description: "Account\'s unique id"');
  });

  // Golden files: review the diff whenever an exporter changes on purpose (vitest -u to accept).
  for (const name of ['ddl.sql', 'schema.yml', 'data-contract.yaml', 'feed.schema.json', 'checks.sql']) {
    it(`matches golden ${name}`, async () => {
      await expect(file(name)).toMatchFileSnapshot(`./golden/${name}`);
    });
  }
});

describe('relationships in exports', () => {
  it('adds FK constraints, dbt relationships tests, fk checks and an ERD', async () => {
    const { detectRelationships, decideRelationship } = await import('../../src/rules/relationships');
    const files = demoFeed();
    let rels = detectRelationships(files);
    rels = decideRelationship(rels, rels[1]?.id ?? '', 'accepted');
    rels = decideRelationship(rels, rels[0]?.id ?? '', 'rejected');
    const pack = exportPack('fdemo', 'Retail Accounts', files, rels);
    const f = (n: string) => pack.find((x) => x.name === n)?.content ?? '';
    expect(f('ddl.sql')).toContain('-- Confirmed by a reviewer: ');
    expect(f('ddl.sql')).toContain('ALTER TABLE curated.cards ADD CONSTRAINT fk_cards_account_id FOREIGN KEY (account_id) REFERENCES curated.accounts (account_id);');
    expect(f('ddl.sql')).not.toContain('fk_accounts_customer_id'); // rejected
    expect(f('schema.yml')).toContain(`to: "ref('accounts')"`);
    expect(f('checks.sql')).toContain('-- chk-transactions-account_id-fk: transactions.account_id, expected every value exists in accounts.account_id');
    const svg = f('erd.svg');
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('>accounts</text>');
    expect(svg.match(/<path d="M[^"]*" fill="none"/g)?.length).toBe(2); // two active relationship lines
    expect(svg).toContain('stroke-dasharray'); // the proposed one is dashed
    await expect(svg).toMatchFileSnapshot('./golden/erd.svg');
  });
});
