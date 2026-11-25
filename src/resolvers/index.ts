import { makeResolver } from '@forge/resolver';
import type { SpecSmithApi } from '../shared/api';
import { buildAppInfo } from './app-info';
import { listTargets } from '../spikes/targets';
import { spikeConfluence } from '../spikes/confluence';
import { spikeJira } from '../spikes/jira';
import { spikeStorage } from '../spikes/storage';
import { queueStatus, startQueueSpike } from '../spikes/queue';
import { getFeed, listFeeds, listRuns, publishFeed, saveFeed, saveFile } from './feeds';

const accountOf = (context: Record<string, unknown>): string | null =>
  typeof context['accountId'] === 'string' ? context['accountId'] : null;

const siteUrlOf = (context: Record<string, unknown>): string | null =>
  typeof context['siteUrl'] === 'string' ? context['siteUrl'] : null;

/**
 * Backend for the SpecSmith Custom UI. Each key must match SpecSmithApi.
 * Handlers stay thin: they unpack the request and call other modules.
 */
export const handler = makeResolver<SpecSmithApi>({
  getAppInfo: ({ context }) => buildAppInfo(context, new Date()),
  listTargets: () => listTargets(),
  listSpaces: () => listTargets(),
  listFeeds: () => listFeeds(),
  getFeed: ({ payload }) => getFeed(payload),
  saveFeed: ({ payload }) => saveFeed(payload),
  saveFile: ({ payload }) => saveFile(payload),
  publishFeed: ({ payload, context }) => publishFeed(payload, { accountId: accountOf(context), siteUrl: siteUrlOf(context) }),
  listRuns: ({ payload }) => listRuns(payload),
  spikeConfluence: ({ payload, context }) => spikeConfluence(payload.spaceKey, payload.dryRun, siteUrlOf(context)),
  spikeJira: ({ payload, context }) => spikeJira(payload.projectKey, payload.dryRun, payload.pageUrl, siteUrlOf(context)),
  spikeStorage: () => spikeStorage(),
  spikeQueueStart: ({ payload }) => startQueueSpike(payload.events, payload.longSleepSeconds),
  spikeQueueStatus: ({ payload }) => queueStatus(payload.jobId),
});
