import { describe, expect, it } from 'vitest';
import { buildAppInfo } from '../../src/resolvers/app-info';

describe('buildAppInfo', () => {
  const now = new Date('2026-11-19T12:00:00.000Z');

  it('copies known string fields from the Forge context', () => {
    const info = buildAppInfo({ accountId: 'abc', cloudId: 'cid', moduleKey: 'specsmith-home', siteUrl: 'https://x.atlassian.net' }, now);
    expect(info).toEqual({
      app: 'SpecSmith',
      version: expect.any(String),
      serverTime: '2026-11-19T12:00:00.000Z',
      accountId: 'abc',
      cloudId: 'cid',
      moduleKey: 'specsmith-home',
      siteUrl: 'https://x.atlassian.net',
    });
  });

  it('returns null for missing, empty or non-string fields', () => {
    const info = buildAppInfo({ accountId: '', cloudId: 42 }, now);
    expect(info.accountId).toBeNull();
    expect(info.cloudId).toBeNull();
    expect(info.moduleKey).toBeNull();
  });
});
