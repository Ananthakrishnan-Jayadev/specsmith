/**
 * Gatekeeper: plans and writes the feed's Jira Epic + stories.
 *
 * Idempotent: issues are matched by stored links, or re-found by SpecSmith
 * labels. SpecSmith owns only summary + description; if either was changed
 * in Jira since SpecSmith wrote it, that issue fails closed. Status,
 * assignee, estimates and comments are never touched after creation.
 */
import type { StoryTemplatesConfig, StoryTemplate } from '../config';
import type { FileSpec } from '../domain/spec';
import type { IssueRef, JiraLinks, RunRow } from '../domain/feed';
import { buildStoryContent, feedFacts, ownedTextOf, type StoryContent } from '../stories/content';
import type { IssueSnapshot, IssueTypeMeta, JiraPort } from './jira-port';
import { sha256 } from './publish';

export interface StoriesInput {
  feedId: string;
  feedName: string;
  files: FileSpec[];
  projectKey: string;
  templates: StoryTemplatesConfig;
  links: JiraLinks | undefined;
  /** Confluence parent page URL, if the spec is published. */
  specUrl: string | null;
}

export interface StoriesResult {
  rows: RunRow[];
  links: JiraLinks | null;
}

type Decision =
  | { action: 'create' }
  | { action: 'update'; issue: IssueSnapshot; adopted: boolean }
  | { action: 'skip'; issue: IssueSnapshot }
  | { action: 'fail'; reason: string };

interface Item {
  template: StoryTemplate;
  isEpic: boolean;
  content: StoryContent;
  hash: string;
  labels: string[];
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
export const feedLabel = (feedId: string) => `specsmith-feed-${feedId}`;
export const templateLabel = (key: string) => `specsmith-tpl-${key}`;

/** Prefers configured names, then Jira's hierarchy (Epic level 1, standard level 0). */
export function pickIssueTypes(types: IssueTypeMeta[], cfg: StoryTemplatesConfig['issueTypes']): { epic?: IssueTypeMeta; story?: IssueTypeMeta } {
  const byName = (names: string[], pool: IssueTypeMeta[]) => names.map((n) => pool.find((t) => t.name.toLowerCase() === n.toLowerCase())).find(Boolean);
  const standard = types.filter((t) => !t.subtask && (t.hierarchyLevel ?? 0) === 0);
  const epic = byName(cfg.epic, types) ?? types.find((t) => t.hierarchyLevel === 1);
  const story = byName(cfg.story, standard) ?? standard[0];
  return { ...(epic ? { epic } : {}), ...(story ? { story } : {}) };
}

async function decide(port: JiraPort, input: StoriesInput, item: Item, ref: IssueRef | undefined): Promise<Decision> {
  if (ref) {
    const issue = await port.getIssue(ref.key);
    if (issue) {
      const current = sha256(ownedTextOf(issue.summary, issue.description));
      if (current !== ref.contentHash) {
        return { action: 'fail', reason: `${issue.key}: summary or description was edited in Jira since SpecSmith wrote it. Copy the change into the template or revert it, then run again.` };
      }
      return ref.contentHash === item.hash ? { action: 'skip', issue } : { action: 'update', issue, adopted: false };
    }
    // Issue deleted or no longer visible: look for it by label, else recreate.
  }
  const found = await port.findByLabels(input.projectKey, [feedLabel(input.feedId), templateLabel(item.template.key)]);
  if (found.length === 0) return { action: 'create' };
  if (found.length > 1) return { action: 'fail', reason: `${found.length} issues (${found.map((f) => f.key).join(', ')}) carry the SpecSmith labels for "${item.template.key}". Refusing to guess; delete the duplicates.` };
  return { action: 'update', issue: found[0] as IssueSnapshot, adopted: true };
}

function row(item: Item, d: Decision, dryRun: boolean, url?: string): RunRow {
  const target = `${item.isEpic ? 'Epic' : 'Story'}: ${item.content.summary}`;
  switch (d.action) {
    case 'create':
      return { target, action: 'create', status: dryRun ? 'dry-run' : 'created', message: 'New issue.' };
    case 'update':
      return { target, action: 'update', status: dryRun ? 'dry-run' : 'updated', message: d.adopted ? `Re-linking ${d.issue.key}, created by this feed earlier.` : `${d.issue.key}: content changed.`, id: d.issue.key, ...(url ? { url } : {}) };
    case 'skip':
      return { target, action: 'skip', status: 'skipped', message: `${d.issue.key}: no changes.`, id: d.issue.key, ...(url ? { url } : {}) };
    case 'fail':
      return { target, action: 'none', status: 'failed', message: d.reason };
  }
}

export async function planStories(port: JiraPort, input: StoriesInput, opts: { dryRun: boolean }): Promise<StoriesResult> {
  const facts = feedFacts(input.feedName, input.files);
  const mk = (template: StoryTemplate, isEpic: boolean): Item => {
    const content = buildStoryContent(template, facts, input.specUrl);
    return { template, isEpic, content, hash: sha256(content.ownedText), labels: [...input.templates.labels, feedLabel(input.feedId), templateLabel(template.key)] };
  };
  const items = [mk(input.templates.epic, true), ...input.templates.stories.map((t) => mk(t, false))];
  const failAll = (reason: string): StoriesResult => ({
    rows: items.map((i) => ({ target: `${i.isEpic ? 'Epic' : 'Story'}: ${i.content.summary}`, action: 'none', status: 'failed', message: reason })),
    links: null,
  });

  if (input.links && input.links.projectKey !== input.projectKey) {
    return failAll(`This feed's stories already live in project ${input.links.projectKey}. Moving them to another project is not supported.`);
  }
  let project: { id: string; key: string } | null;
  let types: { epic?: IssueTypeMeta; story?: IssueTypeMeta };
  let pointsFieldId: string | undefined;
  try {
    project = await port.getProject(input.projectKey);
    if (!project) return failAll(`Project ${input.projectKey} was not found or you cannot see it.`);
    const all = await port.getIssueTypes(project.key);
    types = pickIssueTypes(all, input.templates.issueTypes);
    if (!types.epic || !types.story) {
      return failAll(`Project ${project.key} needs an Epic-level and a Story/Task issue type; it has: ${all.map((t) => t.name).join(', ') || 'none'}. Use a software project or change config/story-templates.json.`);
    }
    const fields = await port.getCreateFields(project.key, types.story.id);
    pointsFieldId = input.templates.storyPointFields.map((n) => fields.find((f) => f.name.toLowerCase() === n.toLowerCase())).find(Boolean)?.fieldId;
  } catch (e) {
    return failAll(`Could not read project ${input.projectKey}: ${errText(e)}`);
  }
  const epicType = types.epic;
  const storyType = types.story;

  const refFor = (i: Item) => (i.isEpic ? input.links?.epic : input.links?.stories[i.template.key]);
  const decisions: Decision[] = [];
  for (const i of items) {
    try {
      decisions.push(await decide(port, input, i, refFor(i)));
    } catch (e) {
      decisions.push({ action: 'fail', reason: `Could not check the issue: ${errText(e)}` });
    }
  }

  if (opts.dryRun) {
    const rows = items.map((it, n) => row(it, decisions[n] as Decision, true));
    if (pointsFieldId === undefined) {
      for (const r of rows) if (r.action === 'create' && r.target.startsWith('Story')) r.message += ' (No story-points field on this issue type; points will be skipped.)';
    }
    return { rows, links: null };
  }

  const links: JiraLinks = { projectKey: project.key, projectId: project.id, stories: { ...(input.links?.stories ?? {}) }, ...(input.links?.epic ? { epic: input.links.epic } : {}) };
  const rows: RunRow[] = [];
  const created = new Set<string>(); // template keys created in this run
  const keyOf = new Map<string, string>(); // template key → issue key
  let epicKey: string | undefined;

  for (const [n, it] of items.entries()) {
    const d = decisions[n] as Decision;
    try {
      if (d.action === 'fail') {
        rows.push(row(it, d, false));
        continue;
      }
      if (!it.isEpic && d.action === 'create' && !epicKey) {
        rows.push({ target: `Story: ${it.content.summary}`, action: 'none', status: 'failed', message: 'The Epic is not available, so this story cannot be created under it.' });
        continue;
      }
      let issueKey: string;
      let issueId: string;
      if (d.action === 'create') {
        const res = await port.createIssue({
          projectKey: project.key,
          issueTypeId: it.isEpic ? epicType.id : storyType.id,
          summary: it.content.summary,
          description: it.content.description,
          labels: it.labels,
          ...(it.isEpic ? {} : { parentKey: epicKey as string }),
          ...(!it.isEpic && pointsFieldId && it.template.points !== undefined ? { points: { fieldId: pointsFieldId, value: it.template.points } } : {}),
        });
        issueKey = res.key;
        issueId = res.id;
        created.add(it.template.key);
      } else {
        issueKey = d.issue.key;
        issueId = d.issue.id;
        if (d.action === 'update') await port.updateIssue(issueKey, { summary: it.content.summary, description: it.content.description });
      }
      if (it.isEpic) epicKey = issueKey;
      keyOf.set(it.template.key, issueKey);

      const notes: string[] = [];
      const prev = refFor(it);
      let specUrl = prev?.specUrl;
      if (input.specUrl && (d.action !== 'skip' || prev?.specUrl !== input.specUrl)) {
        try {
          await port.upsertRemoteLink(issueKey, `specsmith:${input.feedId}:${it.template.key}:spec`, input.specUrl, `${input.feedName}: Feed Spec`);
          specUrl = input.specUrl;
        } catch (e) {
          notes.push(`could not link the spec page: ${errText(e)}`);
        }
      }
      const url = port.browseUrl(issueKey);
      const ref: IssueRef = { key: issueKey, id: issueId, contentHash: d.action === 'skip' ? (prev?.contentHash ?? it.hash) : it.hash, ...(url ? { url } : {}), ...(specUrl ? { specUrl } : {}) };
      if (it.isEpic) links.epic = ref;
      else links.stories[it.template.key] = ref;

      const r = row(it, d, false, url);
      const message = (d.action === 'create' ? `${issueKey} created.` : r.message) + (notes.length ? ` Warning: ${notes.join('; ')}` : '');
      rows.push({ ...r, id: issueKey, ...(url ? { url } : {}), message });
    } catch (e) {
      rows.push({ target: `${it.isEpic ? 'Epic' : 'Story'}: ${it.content.summary}`, action: 'none', status: 'failed', message: errText(e) });
      if (it.isEpic && d.action !== 'create' && d.action !== 'fail') epicKey = d.issue.key; // existing epic still usable
    }
  }

  // Dependency links, only where at least one side is new (existing pairs were linked when created).
  for (const it of items) {
    for (const blocker of it.template.blockedBy ?? []) {
      const blockedKey = keyOf.get(it.template.key);
      const blockerKey = keyOf.get(blocker);
      if (!blockedKey || !blockerKey || !(created.has(it.template.key) || created.has(blocker))) continue;
      try {
        await port.linkBlocks(blockerKey, blockedKey);
      } catch (e) {
        const r = rows.find((x) => x.id === blockedKey);
        if (r) r.message += ` Warning: could not link "${blocker}" as blocking: ${errText(e)}`;
      }
    }
  }
  return { rows, links };
}
