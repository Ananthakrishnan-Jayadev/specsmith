/** JiraPort over the real REST API (v3), always as the current user. */
import { route } from '@forge/api';
import type { IssueSnapshot, IssueTypeMeta, JiraPort } from '../gatekeeper/jira-port';
import { callProduct, describeError } from './product-api';

interface RawIssue { id: string; key: string; fields?: { summary?: string; description?: unknown; labels?: string[] } }

const snap = (i: RawIssue): IssueSnapshot => ({
  id: i.id, key: i.key, summary: i.fields?.summary ?? '', description: i.fields?.description ?? null, labels: i.fields?.labels ?? [],
});

const PROJECT_KEY = /^[A-Z][A-Z0-9_]{0,19}$/;
const LABEL = /^[A-Za-z0-9_-]+$/;

/**
 * Jira's issueLink API: the issue in `inwardIssue` shows the link type's
 * OUTWARD description ("blocks"). Verified on the demo site 2026-11-28:
 * SSD-6 "is blocked by" SSD-5 and "blocks" SSD-7.
 */
const BLOCKS_DIRECTION = (blocker: string, blocked: string) => ({ inwardIssue: { key: blocker }, outwardIssue: { key: blocked } });

export function jiraPort(siteUrl: string | null): JiraPort {
  const fail = (r: { status: number; errorText: string | null }) => new Error(describeError({ ok: false, data: null, ...r }));
  return {
    async getProject(key) {
      if (!PROJECT_KEY.test(key)) return null;
      const r = await callProduct<{ id: string; key: string }>('jira', route`/rest/api/3/project/${key}`);
      if (r.status === 404) return null;
      if (!r.ok || !r.data) throw fail(r);
      return { id: r.data.id, key: r.data.key };
    },

    async getIssueTypes(projectKey) {
      const r = await callProduct<{ issueTypes?: IssueTypeMeta[] }>('jira', route`/rest/api/3/issue/createmeta/${projectKey}/issuetypes`);
      if (!r.ok) throw fail(r);
      return (r.data?.issueTypes ?? []).map(({ id, name, subtask, hierarchyLevel }) => ({ id, name, ...(subtask !== undefined ? { subtask } : {}), ...(hierarchyLevel !== undefined ? { hierarchyLevel } : {}) }));
    },

    async getCreateFields(projectKey, issueTypeId) {
      const r = await callProduct<{ results?: { fieldId: string; name: string }[]; fields?: { fieldId: string; name: string }[] }>(
        'jira', route`/rest/api/3/issue/createmeta/${projectKey}/issuetypes/${issueTypeId}?maxResults=200`,
      );
      if (!r.ok) throw fail(r);
      return (r.data?.results ?? r.data?.fields ?? []).map(({ fieldId, name }) => ({ fieldId, name }));
    },

    async getIssue(key) {
      const r = await callProduct<RawIssue>('jira', route`/rest/api/3/issue/${key}?fields=summary,description,labels`);
      if (r.status === 404) return null;
      if (!r.ok || !r.data) throw fail(r);
      return snap(r.data);
    },

    async findByLabels(projectKey, labels) {
      if (!PROJECT_KEY.test(projectKey) || !labels.every((l) => LABEL.test(l))) throw new Error('Unsafe project key or label in JQL.');
      const jql = `project = "${projectKey}" AND ${labels.map((l) => `labels = "${l}"`).join(' AND ')}`;
      const r = await callProduct<{ issues?: RawIssue[] }>('jira', route`/rest/api/3/search/jql?jql=${jql}&fields=summary,description,labels&maxResults=50`);
      if (!r.ok) throw fail(r);
      return (r.data?.issues ?? []).map(snap);
    },

    async createIssue(x) {
      const fields: Record<string, unknown> = {
        project: { key: x.projectKey },
        issuetype: { id: x.issueTypeId },
        summary: x.summary,
        description: x.description,
        labels: x.labels,
        ...(x.parentKey ? { parent: { key: x.parentKey } } : {}),
        ...(x.points ? { [x.points.fieldId]: x.points.value } : {}),
      };
      const r = await callProduct<{ id: string; key: string }>('jira', route`/rest/api/3/issue`, { method: 'POST', json: { fields } });
      if (!r.ok || !r.data) throw fail(r);
      return { id: r.data.id, key: r.data.key };
    },

    async updateIssue(key, f) {
      const r = await callProduct('jira', route`/rest/api/3/issue/${key}`, { method: 'PUT', json: { fields: { summary: f.summary, description: f.description } } });
      if (!r.ok) throw fail(r);
    },

    async linkBlocks(blocker, blocked) {
      const r = await callProduct('jira', route`/rest/api/3/issueLink`, { method: 'POST', json: { type: { name: 'Blocks' }, ...BLOCKS_DIRECTION(blocker, blocked) } });
      if (!r.ok) throw fail(r);
    },

    async upsertRemoteLink(issueKey, globalId, url, title) {
      const r = await callProduct('jira', route`/rest/api/3/issue/${issueKey}/remotelink`, { method: 'POST', json: { globalId, object: { url, title } } });
      if (!r.ok) throw fail(r);
    },

    browseUrl(key) {
      return siteUrl ? `${siteUrl}/browse/${key}` : undefined;
    },
  };
}
