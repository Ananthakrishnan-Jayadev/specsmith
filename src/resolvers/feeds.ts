/**
 * Feed endpoints: save/load specs, publish through the Gatekeeper, run log.
 * Thin glue: validation + repo + gatekeeper. Logic lives in pure modules.
 */
import type { FeedMeta, RunRecord } from '../domain/feed';
import { countRows } from '../domain/feed';
import type { FileSpec } from '../domain/spec';
import type { Relationship } from '../domain/relationship';
import { FeedRepo, newFeedId } from '../storage/feeds';
import { forgeKV, listByPrefix } from '../storage/forge-kv';
import { publishSpecPages } from '../gatekeeper/publish';
import { confluencePort } from '../platform/confluence';
import { jiraPort } from '../platform/jira';
import { planStories } from '../gatekeeper/stories';
import { defaultConfig } from '../config';
import { exportPack } from '../exporters';
import { sanitizeForUpload } from '../spec/sanitize';

const repo = () => new FeedRepo(forgeKV);
const now = () => new Date().toISOString();

export async function saveFeed(p: { feedId: string | null; name: string; fileNames: string[]; relationships: Relationship[] }): Promise<FeedMeta> {
  const name = p.name.trim();
  if (!name || name.length > 80) throw new Error('Feed name must be 1–80 characters.');
  const r = repo();
  const existing = p.feedId ? await r.get(p.feedId) : undefined;
  if (p.feedId && !existing) throw new Error(`Feed ${p.feedId} not found.`);
  // Fail closed on duplicate names: two feeds with one name would publish to the same page titles.
  // Checked only when creating or renaming, so feeds that already share a name can still be saved.
  const renaming = !existing || existing.name.trim().toLowerCase() !== name.toLowerCase();
  const clash = renaming ? (await r.list()).find((f) => f.feedId !== existing?.feedId && f.name.trim().toLowerCase() === name.toLowerCase()) : undefined;
  if (clash) throw new Error(`A feed named "${clash.name}" already exists (id ${clash.feedId}). Open it from "Open a saved feed", or choose another name.`);
  if (p.relationships.length > 200) throw new Error('Too many relationships.');
  const relationships = p.relationships.filter((r) => p.fileNames.includes(r.fromFile) && p.fileNames.includes(r.toFile));
  const meta: FeedMeta = existing
    ? { ...existing, name, files: p.fileNames, relationships, updatedAt: now() }
    : { feedId: newFeedId(), name, files: p.fileNames, relationships, createdAt: now(), updatedAt: now() };
  for (const gone of (existing?.files ?? []).filter((f) => !p.fileNames.includes(f))) await r.deleteFile(meta.feedId, gone);
  await r.put(meta);
  return meta;
}

export async function saveFile(p: { feedId: string; spec: FileSpec }): Promise<{ ok: true }> {
  const r = repo();
  const meta = await r.get(p.feedId);
  if (!meta) throw new Error(`Feed ${p.feedId} not found.`);
  if (!meta.files.includes(p.spec.fileName)) throw new Error(`${p.spec.fileName} is not part of feed ${meta.name}.`);
  const spec = sanitizeForUpload(p.spec); // defence in depth: the UI sanitizes too
  await r.putFile(p.feedId, spec);
  return { ok: true };
}

export async function listFeeds(): Promise<FeedMeta[]> {
  return repo().list();
}

export async function getFeed(p: { feedId: string }): Promise<{ meta: FeedMeta; files: FileSpec[] }> {
  const r = repo();
  const meta = await r.get(p.feedId);
  if (!meta) throw new Error(`Feed ${p.feedId} not found.`);
  return { meta, files: await r.getFiles(meta) };
}

export async function publishFeed(
  p: { feedId: string; spaceKey: string; dryRun: boolean },
  ctx: { accountId: string | null; siteUrl: string | null },
): Promise<RunRecord> {
  const r = repo();
  const meta = await r.get(p.feedId);
  if (!meta) throw new Error(`Feed ${p.feedId} not found.`);
  const files = await r.getFiles(meta);
  const startedAt = now();
  const result = await publishSpecPages(
    confluencePort(ctx.siteUrl),
    {
      feedId: meta.feedId, feedName: meta.name, files, spaceKey: p.spaceKey, links: meta.confluence,
      exports: exportPack(meta.feedId, meta.name, files, meta.relationships ?? []),
      relationships: meta.relationships ?? [],
      ...(meta.jira?.epic ? { delivery: { epicKey: meta.jira.epic.key, ...(meta.jira.epic.url ? { epicUrl: meta.jira.epic.url } : {}) } } : {}),
    },
    { dryRun: p.dryRun },
  );
  // Only record links when something was actually published (a fully failed run must not lock the space).
  if (!p.dryRun && result.links && (result.links.parent || Object.keys(result.links.pages).length > 0)) {
    const latest = (await r.get(meta.feedId)) ?? meta;
    await r.put({ ...latest, confluence: result.links, updatedAt: now() });
  }
  const run: RunRecord = {
    runId: `${meta.feedId}-${Date.parse(startedAt).toString(36)}`,
    feedId: meta.feedId,
    kind: 'publish-confluence',
    dryRun: p.dryRun,
    actor: ctx.accountId,
    startedAt,
    finishedAt: now(),
    rows: result.rows,
    counts: countRows(result.rows),
  };
  await r.addRun(run);
  return run;
}

export async function planFeedStories(
  p: { feedId: string; projectKey: string; dryRun: boolean },
  ctx: { accountId: string | null; siteUrl: string | null },
): Promise<RunRecord> {
  const r = repo();
  const meta = await r.get(p.feedId);
  if (!meta) throw new Error(`Feed ${p.feedId} not found.`);
  const files = await r.getFiles(meta);
  const startedAt = now();
  const result = await planStories(
    jiraPort(ctx.siteUrl),
    {
      feedId: meta.feedId, feedName: meta.name, files, projectKey: p.projectKey, templates: defaultConfig.stories,
      links: meta.jira, specUrl: meta.confluence?.parent?.url ?? null,
    },
    { dryRun: p.dryRun },
  );
  // Re-read before writing so a concurrent Confluence publish's links are kept.
  if (!p.dryRun && result.links && (result.links.epic || Object.keys(result.links.stories).length > 0)) {
    const latest = (await r.get(meta.feedId)) ?? meta;
    await r.put({ ...latest, jira: result.links, updatedAt: now() });
  }
  const run: RunRecord = {
    runId: `${meta.feedId}-s${Date.parse(startedAt).toString(36)}`,
    feedId: meta.feedId,
    kind: 'plan-stories',
    dryRun: p.dryRun,
    actor: ctx.accountId,
    startedAt,
    finishedAt: now(),
    rows: result.rows,
    counts: countRows(result.rows),
  };
  await r.addRun(run);
  return run;
}

export async function listRuns(p: { feedId: string }): Promise<RunRecord[]> {
  return listByPrefix<RunRecord>(`run:${p.feedId}:`, 20);
}
