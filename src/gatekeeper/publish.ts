/**
 * Gatekeeper: publishes a feed's spec pages to Confluence.
 *
 *   plan  → one row per page: create | update | skip | fail (with reason)
 *   dryRun → return the plan as `dry-run` rows, write nothing
 *   execute → parent first, then files; each row independent (per-row tolerance)
 *
 * Fail-closed rules (core rule 5):
 *   - space not found
 *   - feed already published to a different space
 *   - page edited outside SpecSmith since our last write (version moved)
 *   - several pages with the same title
 *   - a same-titled page that this feed did not create
 *   - a file page that needs creating but the parent page is unavailable
 */
import { createHash } from 'node:crypto';
import type { ConfluenceLinks, PageLink, RunRow } from '../domain/feed';
import type { FileSpec } from '../domain/spec';
import { fileTitle, parentTitle, renderFilePage, renderParentPage, type Delivery } from '../render/spec-page';
import { VersionConflictError, type ConfluencePort, type PageInfo } from './confluence-port';
import { planAttachment } from './attachment-plan';
import type { ExportFile } from '../exporters';
import type { Relationship } from '../domain/relationship';

export const PARENT = '__parent__';

export interface PublishInput {
  feedId: string;
  feedName: string;
  files: FileSpec[];
  spaceKey: string;
  links: ConfluenceLinks | undefined;
  /** Jira epic to link from the parent page, once stories exist. */
  delivery?: Delivery;
  /** Files attached to the parent page (export pack). */
  exports?: ExportFile[];
  relationships?: Relationship[];
}

interface Target {
  key: string; // PARENT or file name
  title: string;
  body: string;
  bodyHash: string;
}

type Decision =
  | { action: 'create' }
  | { action: 'update'; page: PageInfo; adopted: boolean }
  | { action: 'skip'; page: PageInfo }
  | { action: 'fail'; reason: string };

export interface PublishResult {
  rows: RunRow[];
  links: ConfluenceLinks | null;
}

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

function targetsFor(input: PublishInput): Target[] {
  const mk = (key: string, title: string, body: string): Target => ({ key, title, body, bodyHash: sha256(body) });
  return [
    mk(PARENT, parentTitle(input.feedName), renderParentPage(input.feedName, input.files, {
      ...(input.delivery ? { delivery: input.delivery } : {}),
      exports: (input.exports ?? []).filter((e) => e.contentType !== 'image/svg+xml').map(({ name, description }) => ({ name, description })),
      relationships: input.relationships ?? [],
      ...((input.exports ?? []).some((e) => e.name === 'erd.svg') ? { erdFile: 'erd.svg' } : {}),
    })),
    ...[...input.files].sort((a, b) => a.fileName.localeCompare(b.fileName)).map((f) => mk(f.fileName, fileTitle(input.feedName, f), renderFilePage(input.feedName, f))),
  ];
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function decide(port: ConfluencePort, spaceId: string, feedId: string, t: Target, link: PageLink | undefined): Promise<Decision> {
  if (link) {
    const page = await port.getPage(link.pageId);
    if (page) {
      if (page.version !== link.version) {
        return {
          action: 'fail',
          reason: `"${page.title}" was edited outside SpecSmith (Confluence version ${page.version}, SpecSmith last wrote version ${link.version}). Copy those edits into SpecSmith or revert them, then publish again.`,
        };
      }
      if (page.title === t.title && link.bodyHash === t.bodyHash) return { action: 'skip', page };
      return { action: 'update', page, adopted: false };
    }
    // Our page was deleted: fall through and look it up by title like a new page.
  }
  const matches = await port.findPagesByTitle(spaceId, t.title);
  if (matches.length === 0) return { action: 'create' };
  if (matches.length > 1) return { action: 'fail', reason: `${matches.length} pages are titled "${t.title}" in this space. Refusing to guess which one to update.` };
  const only = matches[0] as PageInfo;
  const owner = await port.getOwner(only.id);
  if (owner?.feedId === feedId) return { action: 'update', page: only, adopted: true };
  if (owner) {
    return { action: 'fail', reason: `A page titled "${t.title}" belongs to another SpecSmith feed (id ${owner.feedId}). Open that feed to update it, or rename this feed.` };
  }
  return { action: 'fail', reason: `A page titled "${t.title}" already exists and was not created by SpecSmith. Rename or move it, or publish to another space.` };
}

function planRow(t: Target, d: Decision, dryRun: boolean): RunRow {
  const base = { target: t.title };
  switch (d.action) {
    case 'create':
      return { ...base, action: 'create', status: dryRun ? 'dry-run' : 'created', message: 'New page.' };
    case 'update':
      return { ...base, action: 'update', status: dryRun ? 'dry-run' : 'updated', message: d.adopted ? 'Re-linking a page this feed created earlier.' : 'Content changed.', id: d.page.id };
    case 'skip':
      return { ...base, action: 'skip', status: 'skipped', message: 'No changes since the last publish.', id: d.page.id };
    case 'fail':
      return { ...base, action: 'none', status: 'failed', message: d.reason };
  }
}

export async function publishSpecPages(port: ConfluencePort, input: PublishInput, opts: { dryRun: boolean }): Promise<PublishResult> {
  const targets = targetsFor(input);
  const exportsList = input.exports ?? [];
  const attachTarget = (name: string) => `Attachment: ${name}`;
  const failAll = (reason: string): PublishResult => ({
    rows: [...targets.map((t) => t.title), ...exportsList.map((e) => attachTarget(e.name))].map((target) => ({ target, action: 'none', status: 'failed', message: reason })),
    links: null,
  });
  const attachPlans = exportsList.map((e) => {
    const sha = sha256(e.content);
    const recorded = input.links?.attachments?.[e.name];
    return { file: e, sha, recorded, plan: planAttachment(recorded, sha) };
  });

  if (input.links && input.links.spaceKey !== input.spaceKey) {
    return failAll(`This feed is already published to space ${input.links.spaceKey}. Publishing to a different space is not supported.`);
  }
  let space: { id: string; key: string } | null;
  try {
    space = await port.findSpace(input.spaceKey);
  } catch (e) {
    return failAll(`Could not look up space ${input.spaceKey}: ${errText(e)}`);
  }
  if (!space) return failAll(`Space ${input.spaceKey} was not found or you cannot see it.`);
  const spaceId = space.id;

  const linkFor = (key: string) => (key === PARENT ? input.links?.parent : input.links?.pages[key]);
  const decisions: Decision[] = [];
  for (const t of targets) {
    try {
      decisions.push(await decide(port, spaceId, input.feedId, t, linkFor(t.key)));
    } catch (e) {
      decisions.push({ action: 'fail', reason: `Could not check the page: ${errText(e)}` });
    }
  }

  if (opts.dryRun) {
    const parentOk = (decisions[0] as Decision).action !== 'fail';
    const attachRows: RunRow[] = attachPlans.map((a) =>
      !parentOk
        ? { target: attachTarget(a.file.name), action: 'none', status: 'failed', message: 'The parent page has a problem, so its attachments cannot be published.' }
        : a.plan.op === 'skip'
          ? { target: attachTarget(a.file.name), action: 'skip', status: 'skipped', message: 'Unchanged.' }
          : { target: attachTarget(a.file.name), action: a.recorded ? 'update' : 'create', status: 'dry-run', message: a.file.description },
    );
    return { rows: [...targets.map((t, i) => planRow(t, decisions[i] as Decision, true)), ...attachRows], links: null };
  }

  const links: ConfluenceLinks = {
    spaceKey: space.key, spaceId, pages: { ...(input.links?.pages ?? {}) },
    ...(input.links?.parent ? { parent: input.links.parent } : {}),
    attachments: { ...(input.links?.attachments ?? {}) },
  };
  const rows: RunRow[] = [];
  let parentId: string | undefined;

  for (const [i, t] of targets.entries()) {
    const d = decisions[i] as Decision;
    const isParent = t.key === PARENT;
    try {
      if (d.action === 'fail') {
        rows.push(planRow(t, d, false));
        continue;
      }
      if (d.action === 'skip') {
        if (isParent) parentId = d.page.id;
        rows.push(planRow(t, d, false));
        continue;
      }
      if (d.action === 'create' && !isParent && !parentId) {
        rows.push({ target: t.title, action: 'none', status: 'failed', message: 'The feed parent page is not available, so this page cannot be created under it.' });
        continue;
      }
      const written =
        d.action === 'create'
          ? await port.createPage({ spaceId, title: t.title, body: t.body, ...(isParent ? {} : { parentId: parentId as string }) })
          : await port.updatePage({ id: d.page.id, title: t.title, body: t.body, version: d.page.version + 1 });
      const link: PageLink = { pageId: written.id, title: t.title, version: written.version, bodyHash: t.bodyHash, ...(written.url ? { url: written.url } : {}) };
      if (isParent) {
        links.parent = link;
        parentId = written.id;
      } else links.pages[t.key] = link;

      let note = '';
      try {
        await port.setOwner(written.id, { feedId: input.feedId, file: t.key });
      } catch (e) {
        note = ` (warning: could not record ownership: ${errText(e)})`;
      }
      const row = planRow(t, d, false);
      rows.push({ ...row, id: written.id, ...(written.url ? { url: written.url } : {}), message: row.message + note });
    } catch (e) {
      const reason = e instanceof VersionConflictError ? `"${t.title}" changed while publishing. Publish again to re-check it.` : errText(e);
      rows.push({ target: t.title, action: 'none', status: 'failed', message: reason });
      if (isParent && d.action === 'update') parentId = d.page.id; // existing parent still usable
    }
  }
  // Export attachments on the parent page (after the page exists).
  for (const a of attachPlans) {
    const target = attachTarget(a.file.name);
    if (!parentId) {
      rows.push({ target, action: 'none', status: 'failed', message: 'The parent page is not available, so its attachments cannot be published.' });
      continue;
    }
    if (a.plan.op === 'skip') {
      rows.push({ target, action: 'skip', status: 'skipped', message: 'Unchanged.' });
      continue;
    }
    try {
      const { id } = await port.uploadAttachment(parentId, { name: a.file.name, contentType: a.file.contentType, content: a.file.content });
      (links.attachments ??= {})[a.file.name] = { id, sha256: a.sha };
      rows.push({ target, action: a.recorded ? 'update' : 'create', status: a.recorded ? 'updated' : 'created', message: a.file.description, id });
    } catch (e) {
      rows.push({ target, action: 'none', status: 'failed', message: errText(e) });
    }
  }
  return { rows, links };
}
