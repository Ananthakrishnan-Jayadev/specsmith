import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/config';
import { profileRows } from '../../src/profile/profiler';
import { buildFileSpec } from '../../src/spec/build';
import { editField } from '../../src/spec/edit';
import { feedLabel, pickIssueTypes, planStories, templateLabel, type StoriesInput } from '../../src/gatekeeper/stories';
import type { JiraLinks } from '../../src/domain/feed';
import { FakeJira } from './fake-jira';

const file = () => buildFileSpec(profileRows('accounts.csv', [['acct_id', 'c_email'], ['A1', 'a@x.io'], ['A2', 'b@x.io']]), defaultConfig);
const input = (over: Partial<StoriesInput> = {}): StoriesInput => ({
  feedId: 'f1', feedName: 'Retail', files: [file()], projectKey: 'SSD', templates: defaultConfig.stories,
  links: undefined, specUrl: 'https://x/wiki/spec', ...over,
});
const statuses = (rows: { status: string }[]) => rows.map((r) => r.status);
const ITEMS = 1 + defaultConfig.stories.stories.length;

describe('pickIssueTypes', () => {
  it('prefers configured names, falls back to hierarchy', () => {
    const r = pickIssueTypes([{ id: '1', name: 'Deliverable', hierarchyLevel: 1 }, { id: '2', name: 'Task', hierarchyLevel: 0 }], defaultConfig.stories.issueTypes);
    expect([r.epic?.name, r.story?.name]).toEqual(['Deliverable', 'Task']);
  });
});

describe('planStories', () => {
  it('dry run plans an epic + 7 stories and writes nothing', async () => {
    const j = new FakeJira();
    const r = await planStories(j, input(), { dryRun: true });
    expect(r.rows).toHaveLength(ITEMS);
    expect(r.rows[0]?.target).toBe('Epic: Retail: data feed onboarding');
    expect(new Set(statuses(r.rows))).toEqual(new Set(['dry-run']));
    expect(j.writes).toBe(0);
  });

  it('creates the epic first, stories under it, points, labels, dependency and spec links', async () => {
    const j = new FakeJira();
    const r = await planStories(j, input(), { dryRun: false });
    expect(new Set(statuses(r.rows))).toEqual(new Set(['created']));
    const epicKey = r.links?.epic?.key ?? '';
    const signoff = j.issues.get(r.links?.stories['requirements-signoff']?.key ?? '');
    expect(signoff?.parentKey).toBe(epicKey);
    expect(signoff?.fields['customfield_10016']).toBe(2);
    expect(signoff?.labels).toEqual(['specsmith', feedLabel('f1'), templateLabel('requirements-signoff')]);
    // test-execution is blocked by build-curated-analytics and test-design
    const k = (t: string) => r.links?.stories[t]?.key;
    expect(j.links).toContainEqual([k('build-curated-analytics'), k('test-execution')]);
    expect(j.links).toContainEqual([k('test-design'), k('test-execution')]);
    expect(j.remote.size).toBe(ITEMS);
  });

  it('second run skips everything (despite Jira adding ADF attributes) and creates no duplicate links', async () => {
    const j = new FakeJira();
    const first = await planStories(j, input(), { dryRun: false });
    const linkCount = j.links.length;
    const again = await planStories(j, input({ links: first.links ?? undefined }), { dryRun: false });
    expect(new Set(statuses(again.rows))).toEqual(new Set(['skipped']));
    expect(j.links.length).toBe(linkCount);
  });

  it('updates content when the spec changes', async () => {
    const j = new FakeJira();
    const first = await planStories(j, input(), { dryRun: false });
    const edited = editField(file(), 'acct_id', 'description', 'Account id');
    const r = await planStories(j, input({ links: first.links ?? undefined, files: [edited] }), { dryRun: false });
    // TBD count appears in epic + sign-off text, so those change; others skip.
    expect(r.rows.filter((x) => x.status === 'updated').map((x) => x.id)).toEqual([first.links?.epic?.key, first.links?.stories['requirements-signoff']?.key]);
  });

  it('fails closed when summary/description was edited in Jira, but ignores status changes', async () => {
    const j = new FakeJira();
    const first = await planStories(j, input(), { dryRun: false });
    const links = first.links as JiraLinks;
    const build = j.issues.get(links.stories['build-raw-curated']?.key ?? '');
    if (build) build.summary = 'Someone renamed this';
    const signoff = j.issues.get(links.stories['requirements-signoff']?.key ?? '');
    if (signoff) signoff.status = 'Done';
    const r = await planStories(j, input({ links }), { dryRun: true });
    const buildRow = r.rows.find((x) => x.target.includes('raw to curated'));
    expect(buildRow?.status).toBe('failed');
    expect(buildRow?.message).toMatch(/edited in Jira/);
    expect(r.rows.find((x) => x.target.includes('sign-off'))?.status).toBe('skipped');
  });

  it('re-adopts its issues by label when links are lost, and refuses duplicates', async () => {
    const j = new FakeJira();
    await planStories(j, input(), { dryRun: false });
    const r = await planStories(j, input(), { dryRun: true });
    expect(r.rows.every((x) => x.action === 'update' && /Re-linking/.test(x.message))).toBe(true);
    await planStories(j, input({ links: undefined, feedId: 'f1' }), { dryRun: false }); // adopts, no new issues
    expect(j.issues.size).toBe(ITEMS);
    const dupKey = [...j.issues.keys()][1] as string;
    const dup = j.issues.get(dupKey);
    if (dup) j.issues.set('SSD-99', { ...dup, key: 'SSD-99' });
    const r2 = await planStories(j, input(), { dryRun: true });
    expect(r2.rows.some((x) => x.status === 'failed' && /Refusing to guess/.test(x.message))).toBe(true);
  });

  it('fails everything closed for an unknown project, wrong project or missing issue types', async () => {
    const j = new FakeJira();
    expect((await planStories(j, input({ projectKey: 'NOPE' }), { dryRun: true })).rows[0]?.message).toMatch(/NOPE was not found/);
    expect((await planStories(j, input({ links: { projectKey: 'OTHER', projectId: '1', stories: {} } }), { dryRun: true })).rows[0]?.message).toMatch(/already live in project OTHER/);
    j.types = [{ id: '9', name: 'Task', hierarchyLevel: 0 }];
    expect((await planStories(j, input(), { dryRun: true })).rows[0]?.message).toMatch(/needs an Epic-level/);
  });

  it('per-row tolerance: failed epic blocks story creation; one failed story does not stop others', async () => {
    const j = new FakeJira();
    j.failCreateFor.add('data feed onboarding');
    const r = await planStories(j, input(), { dryRun: false });
    expect(r.rows[0]?.status).toBe('failed');
    expect(r.rows.slice(1).every((x) => /Epic is not available/.test(x.message))).toBe(true);

    const j2 = new FakeJira();
    j2.failCreateFor.add('test design');
    const r2 = await planStories(j2, input(), { dryRun: false });
    expect(statuses(r2.rows).filter((s) => s === 'failed')).toHaveLength(1);
    expect(statuses(r2.rows).filter((s) => s === 'created')).toHaveLength(ITEMS - 1);
  });

  it('skips points when the issue type has no points field, and says so in the preview', async () => {
    const j = new FakeJira();
    j.fields = [];
    const r = await planStories(j, input(), { dryRun: true });
    expect(r.rows[1]?.message).toMatch(/points will be skipped/);
  });
});
