import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/config';
import { profileRows } from '../../src/profile/profiler';
import { buildFileSpec } from '../../src/spec/build';
import { editField } from '../../src/spec/edit';
import { publishSpecPages, type PublishInput } from '../../src/gatekeeper/publish';
import type { ConfluenceLinks } from '../../src/domain/feed';
import { FakeConfluence } from './fake-confluence';

const file = (name: string) => buildFileSpec(profileRows(name, [['id', 'v'], ['1', 'a'], ['2', 'b']]), defaultConfig);
const input = (links?: ConfluenceLinks, files = [file('a.csv'), file('b.csv')]): PublishInput => ({
  feedId: 'f1', feedName: 'Retail', files, spaceKey: 'SPEC', links,
});
const statuses = (rows: { status: string }[]) => rows.map((r) => r.status);

describe('publishSpecPages', () => {
  it('dry run plans creates and writes nothing', async () => {
    const c = new FakeConfluence();
    const r = await publishSpecPages(c, input(), { dryRun: true });
    expect(r.rows.map((x) => [x.target, x.action, x.status])).toEqual([
      ['Retail: Feed Spec', 'create', 'dry-run'],
      ['Retail: a', 'create', 'dry-run'],
      ['Retail: b', 'create', 'dry-run'],
    ]);
    expect(c.writes).toBe(0);
    expect(r.links).toBeNull();
  });

  it('creates parent then children under it, records links and ownership', async () => {
    const c = new FakeConfluence();
    const r = await publishSpecPages(c, input(), { dryRun: false });
    expect(statuses(r.rows)).toEqual(['created', 'created', 'created']);
    const parentId = r.links?.parent?.pageId;
    expect(r.links?.pages['a.csv']).toMatchObject({ title: 'Retail: a', version: 1 });
    const child = c.pages.get(r.links?.pages['a.csv']?.pageId ?? '');
    expect(child?.parentId).toBe(parentId);
    expect(child?.owner).toEqual({ feedId: 'f1', file: 'a.csv' });
  });

  it('skips unchanged pages and updates changed ones', async () => {
    const c = new FakeConfluence();
    const first = await publishSpecPages(c, input(), { dryRun: false });
    const again = await publishSpecPages(c, input(first.links ?? undefined), { dryRun: false });
    expect(statuses(again.rows)).toEqual(['skipped', 'skipped', 'skipped']);

    const files = [editField(file('a.csv'), 'id', 'description', 'Row id'), file('b.csv')];
    const changed = await publishSpecPages(c, input(again.links ?? undefined, files), { dryRun: false });
    expect(changed.rows.map((x) => x.status)).toEqual(['updated', 'updated', 'skipped']); // parent summary changed too (TBD count)
    expect(changed.links?.pages['a.csv']?.version).toBe(2);
  });

  it('fails closed when a page was edited outside SpecSmith, and leaves it untouched', async () => {
    const c = new FakeConfluence();
    const first = await publishSpecPages(c, input(), { dryRun: false });
    const aId = first.links?.pages['a.csv']?.pageId ?? '';
    c.humanEdit(aId);
    const files = [editField(file('a.csv'), 'id', 'description', 'Row id'), file('b.csv')];
    const r = await publishSpecPages(c, input(first.links ?? undefined, files), { dryRun: false });
    const aRow = r.rows.find((x) => x.target === 'Retail: a');
    expect(aRow?.status).toBe('failed');
    expect(aRow?.message).toMatch(/edited outside SpecSmith \(Confluence version 2, SpecSmith last wrote version 1\)/);
    expect(c.pages.get(aId)?.version).toBe(2); // not overwritten
    expect(r.rows.find((x) => x.target === 'Retail: b')?.status).toBe('skipped'); // others continue
  });

  it('fails closed on duplicate titles and on foreign same-titled pages', async () => {
    const c = new FakeConfluence();
    c.addForeignPage('Retail: a');
    c.addForeignPage('Retail: b');
    c.addForeignPage('Retail: b');
    const r = await publishSpecPages(c, input(), { dryRun: true });
    expect(r.rows[1]?.message).toMatch(/not created by this SpecSmith feed/);
    expect(r.rows[2]?.message).toMatch(/2 pages are titled "Retail: b".*Refusing to guess/);
  });

  it('re-adopts its own pages when local links were lost', async () => {
    const c = new FakeConfluence();
    await publishSpecPages(c, input(), { dryRun: false });
    const r = await publishSpecPages(c, input(undefined), { dryRun: true });
    expect(r.rows.every((x) => x.action === 'update')).toBe(true);
    expect(r.rows[0]?.message).toMatch(/Re-linking/);
  });

  it('per-row tolerance: a failed parent create fails dependent creates only', async () => {
    const c = new FakeConfluence();
    c.failCreateFor.add('Retail: Feed Spec');
    const r = await publishSpecPages(c, input(), { dryRun: false });
    expect(statuses(r.rows)).toEqual(['failed', 'failed', 'failed']);
    expect(r.rows[0]?.message).toMatch(/boom/);
    expect(r.rows[1]?.message).toMatch(/parent page is not available/);
  });

  it('a single failing child does not stop the others', async () => {
    const c = new FakeConfluence();
    c.failCreateFor.add('Retail: a');
    const r = await publishSpecPages(c, input(), { dryRun: false });
    expect(statuses(r.rows)).toEqual(['created', 'failed', 'created']);
  });

  it('fails everything closed for unknown spaces or a different space', async () => {
    const c = new FakeConfluence();
    const r = await publishSpecPages(c, { ...input(), spaceKey: 'NOPE' }, { dryRun: true });
    expect(r.rows.every((x) => x.status === 'failed' && /NOPE was not found/.test(x.message))).toBe(true);
    const moved = await publishSpecPages(c, input({ spaceKey: 'OTHER', spaceId: '9', pages: {} }), { dryRun: true });
    expect(moved.rows[0]?.message).toMatch(/already published to space OTHER/);
  });

  it('recreates a page that was deleted in Confluence', async () => {
    const c = new FakeConfluence();
    const first = await publishSpecPages(c, input(), { dryRun: false });
    c.pages.delete(first.links?.pages['b.csv']?.pageId ?? '');
    const r = await publishSpecPages(c, input(first.links ?? undefined), { dryRun: false });
    expect(statuses(r.rows)).toEqual(['skipped', 'skipped', 'created']);
  });
});

describe('export attachments', () => {
  const withExports = (links?: ConfluenceLinks, files = [file('a.csv'), file('b.csv')]): PublishInput => ({
    ...input(links, files),
    exports: [
      { name: 'ddl.sql', contentType: 'text/plain', description: 'DDL', content: `ddl for ${files.length}` },
      { name: 'checks.sql', contentType: 'text/plain', description: 'Checks', content: 'checks' },
    ],
  });

  it('plans, uploads to the parent, then skips unchanged and updates changed files', async () => {
    const c = new FakeConfluence();
    const dry = await publishSpecPages(c, withExports(), { dryRun: true });
    expect(dry.rows.slice(-2).map((r) => [r.target, r.action, r.status])).toEqual([
      ['Attachment: ddl.sql', 'create', 'dry-run'],
      ['Attachment: checks.sql', 'create', 'dry-run'],
    ]);
    const first = await publishSpecPages(c, withExports(), { dryRun: false });
    const parentId = first.links?.parent?.pageId;
    expect(c.attachments.has(`${parentId}/ddl.sql`)).toBe(true);
    expect(c.pages.get(parentId ?? '')?.body).toContain('ri:filename="ddl.sql"');

    const again = await publishSpecPages(c, withExports(first.links ?? undefined), { dryRun: false });
    expect(again.rows.slice(-2).map((r) => r.status)).toEqual(['skipped', 'skipped']);

    const changed = await publishSpecPages(c, withExports(again.links ?? undefined, [file('a.csv')]), { dryRun: false });
    expect(changed.rows.find((r) => r.target === 'Attachment: ddl.sql')?.status).toBe('updated');
    expect(changed.rows.find((r) => r.target === 'Attachment: checks.sql')?.status).toBe('skipped');
  });

  it('fails attachments closed when the parent page cannot be published, and tolerates upload errors', async () => {
    const c = new FakeConfluence();
    c.failCreateFor.add('Retail: Feed Spec');
    const r = await publishSpecPages(c, withExports(), { dryRun: false });
    expect(r.rows.slice(-2).every((x) => x.status === 'failed' && /parent page is not available/.test(x.message))).toBe(true);

    const c2 = new FakeConfluence();
    c2.failUploads = true;
    const r2 = await publishSpecPages(c2, withExports(), { dryRun: false });
    expect(r2.rows.slice(0, 3).every((x) => x.status === 'created')).toBe(true);
    expect(r2.rows.slice(-2).every((x) => x.status === 'failed')).toBe(true);
  });
});
