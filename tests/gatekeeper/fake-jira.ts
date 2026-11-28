import type { IssueSnapshot, IssueTypeMeta, JiraPort, NewIssue } from '../../src/gatekeeper/jira-port';
import type { AdfDoc } from '../../src/render/adf';

interface FakeIssue extends IssueSnapshot {
  typeId: string;
  parentKey?: string;
  fields: Record<string, unknown>;
  status: string;
}

/** In-memory Jira with the behaviours the Story Planner relies on. */
export class FakeJira implements JiraPort {
  issues = new Map<string, FakeIssue>();
  links: [string, string][] = [];
  remote = new Map<string, { key: string; url: string }>();
  types: IssueTypeMeta[] = [
    { id: '1', name: 'Epic', hierarchyLevel: 1 },
    { id: '2', name: 'Story', hierarchyLevel: 0 },
    { id: '3', name: 'Subtask', hierarchyLevel: -1, subtask: true },
  ];
  fields = [{ fieldId: 'customfield_10016', name: 'Story point estimate' }];
  writes = 0;
  failCreateFor = new Set<string>();
  private n = 1;

  async getProject(key: string) {
    return key === 'SSD' ? { id: '10000', key } : null;
  }
  async getIssueTypes() {
    return this.types;
  }
  async getCreateFields() {
    return this.fields;
  }
  async getIssue(key: string) {
    const i = this.issues.get(key);
    return i ? { id: i.id, key: i.key, summary: i.summary, description: i.description, labels: i.labels } : null;
  }
  async findByLabels(_project: string, labels: string[]) {
    return [...this.issues.values()].filter((i) => labels.every((l) => i.labels.includes(l)));
  }
  async createIssue(x: NewIssue) {
    if ([...this.failCreateFor].some((f) => x.summary.includes(f))) throw new Error('HTTP 400: boom');
    this.writes++;
    const key = `SSD-${this.n++}`;
    // Jira adds attributes on save; the planner must compare text, not raw ADF.
    const stored = JSON.parse(JSON.stringify(x.description).replace(/"type":"paragraph"/g, '"type":"paragraph","attrs":{"localId":"x"}')) as unknown;
    this.issues.set(key, {
      id: String(1000 + this.n), key, summary: x.summary, description: stored, labels: x.labels, typeId: x.issueTypeId,
      ...(x.parentKey ? { parentKey: x.parentKey } : {}), fields: x.points ? { [x.points.fieldId]: x.points.value } : {}, status: 'To Do',
    });
    return { id: String(1000 + this.n), key };
  }
  async updateIssue(key: string, f: { summary: string; description: AdfDoc }) {
    const i = this.issues.get(key);
    if (!i) throw new Error('HTTP 404');
    this.writes++;
    i.summary = f.summary;
    i.description = f.description;
  }
  async linkBlocks(blocker: string, blocked: string) {
    this.links.push([blocker, blocked]);
  }
  async upsertRemoteLink(key: string, globalId: string, url: string) {
    this.remote.set(globalId, { key, url });
  }
  browseUrl(key: string) {
    return `https://x/browse/${key}`;
  }
}
