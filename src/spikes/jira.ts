/**
 * Spike S7: Jira writes. Project + issue types → Epic → 2 Stories under it →
 * "Blocks" link → remote link to the Confluence page → transition a story.
 * Not idempotent yet: each live run creates new issues (F6 adds idempotency).
 */
import { route } from '@forge/api';
import type { SpikeReport } from '../shared/api';
import { callProduct, describeError } from '../platform/product-api';
import { bullets, doc, para } from '../render/adf';
import { StepRecorder } from './steps';

interface IssueTypeMeta { id: string; name: string; subtask?: boolean; hierarchyLevel?: number }
interface Created { id: string; key: string }
interface Transition { id: string; name: string; to?: { name?: string; statusCategory?: { key?: string } } }

/** Pure: pick Epic + a standard work type from create metadata. Exported for tests. */
export function pickIssueTypes(types: IssueTypeMeta[]): { epic?: IssueTypeMeta; story?: IssueTypeMeta } {
  const epic = types.find((t) => t.hierarchyLevel === 1) ?? types.find((t) => t.name === 'Epic');
  const standard = types.filter((t) => !t.subtask && (t.hierarchyLevel ?? 0) === 0);
  const story = standard.find((t) => t.name === 'Story') ?? standard.find((t) => t.name === 'Task') ?? standard[0];
  return { ...(epic ? { epic } : {}), ...(story ? { story } : {}) };
}

export async function spikeJira(projectKey: string, dryRun: boolean, pageUrl: string | null, siteUrl: string | null): Promise<SpikeReport> {
  const rec = new StepRecorder('S7 Jira');
  const browse = (key: string) => (siteUrl ? `${siteUrl}/browse/${key}` : key);

  const types = await rec.run('issue types for project', async () => {
    const r = await callProduct<{ issueTypes: IssueTypeMeta[] }>('jira', route`/rest/api/3/issue/createmeta/${projectKey}/issuetypes`);
    if (!r.ok) return { status: 'fail', detail: describeError(r) };
    const picked = pickIssueTypes(r.data?.issueTypes ?? []);
    const names = (r.data?.issueTypes ?? []).map((t) => `${t.name}(L${t.hierarchyLevel ?? '?'})`).join(', ');
    if (!picked.epic || !picked.story) return { status: 'fail', detail: `need Epic + Story/Task, found: ${names}` };
    return { status: 'pass', detail: `epic=${picked.epic.name}, story=${picked.story.name}; all: ${names}`, value: picked as Required<typeof picked> };
  });
  if (!types) return rec.report();

  if (dryRun) {
    rec.steps.push({ step: 'create issues', status: 'dry-run', detail: `would create 1 ${types.epic.name} + 2 ${types.story.name} in ${projectKey}, link, remote-link, transition`, ms: 0 });
    return rec.report();
  }

  const create = async (summary: string, typeId: string, parentKey?: string) =>
    callProduct<Created>('jira', route`/rest/api/3/issue`, {
      method: 'POST',
      json: {
        fields: {
          project: { key: projectKey },
          issuetype: { id: typeId },
          summary,
          labels: ['specsmith-spike'],
          description: doc(para('Created by the SpecSmith S7 spike. Safe to delete.'), bullets(['Given a feed', 'When the spec is approved', 'Then stories exist'])),
          ...(parentKey ? { parent: { key: parentKey } } : {}),
        },
      },
    });

  const epic = await rec.run('create epic', async () => {
    const r = await create('SpecSmith spike epic', types.epic.id);
    if (!r.ok || !r.data) return { status: 'fail', detail: describeError(r) };
    rec.links.push({ label: `Epic ${r.data.key}`, url: browse(r.data.key) });
    return { status: 'pass', detail: r.data.key, value: r.data };
  });
  if (!epic) return rec.report();

  const stories: Created[] = [];
  for (const n of [1, 2]) {
    const s = await rec.run(`create story ${n} under epic`, async () => {
      const r = await create(`SpecSmith spike story ${n}`, types.story.id, epic.key);
      return r.ok && r.data ? { status: 'pass', detail: `${r.data.key} (parent ${epic.key})`, value: r.data } : { status: 'fail', detail: describeError(r) };
    });
    if (s) stories.push(s);
  }

  const [s1, s2] = stories;
  if (s1 && s2) {
    await rec.run('link story 1 blocks story 2', async () => {
      const r = await callProduct('jira', route`/rest/api/3/issueLink`, {
        method: 'POST',
        json: { type: { name: 'Blocks' }, outwardIssue: { key: s1.key }, inwardIssue: { key: s2.key } },
      });
      return r.ok ? { status: 'pass', detail: `${s1.key} blocks ${s2.key}` } : { status: 'fail', detail: describeError(r) };
    });
  } else rec.skip('link stories', 'needs two stories');

  await rec.run('remote link epic → Confluence', async () => {
    const url = pageUrl ?? (siteUrl ? `${siteUrl}/wiki` : 'https://example.invalid');
    const r = await callProduct('jira', route`/rest/api/3/issue/${epic.key}/remotelink`, {
      method: 'POST',
      json: { globalId: `specsmith-spike:${epic.key}`, object: { url, title: 'SpecSmith spec (spike)' } },
    });
    return r.ok ? { status: 'pass', detail: `linked to ${url}` } : { status: 'fail', detail: describeError(r) };
  });

  if (s1) {
    await rec.run('transition story 1', async () => {
      const t = await callProduct<{ transitions: Transition[] }>('jira', route`/rest/api/3/issue/${s1.key}/transitions`);
      if (!t.ok) return { status: 'fail', detail: describeError(t) };
      const all = t.data?.transitions ?? [];
      const target = all.find((x) => x.to?.statusCategory?.key === 'done') ?? all[0];
      if (!target) return { status: 'fail', detail: 'no transitions available' };
      const r = await callProduct('jira', route`/rest/api/3/issue/${s1.key}/transitions`, { method: 'POST', json: { transition: { id: target.id } } });
      return r.ok
        ? { status: 'pass', detail: `${s1.key} → "${target.to?.name ?? target.name}" (options: ${all.map((x) => x.name).join(', ')})` }
        : { status: 'fail', detail: describeError(r) };
    });
  }

  return rec.report();
}
