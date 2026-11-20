/**
 * Spike S5: async events. Push N events; event 0 sleeps past the 55 s default
 * to prove `timeoutSeconds` works. The consumer records each run in KVS so the
 * UI can poll progress alongside Queue job stats.
 */
import kvs, { WhereConditions } from '@forge/kvs';
import { Queue } from '@forge/events';
import type { QueueStatus } from '../shared/api';

export const SPIKE_QUEUE = 'specsmith-spike';
const queue = new Queue({ key: SPIKE_QUEUE });

interface SpikeEventBody extends Record<string, unknown> {
  index: number;
  sleepSeconds: number;
}

export async function startQueueSpike(events: number, longSleepSeconds: number): Promise<{ jobId: string }> {
  const n = Math.min(Math.max(1, Math.floor(events)), 50); // docs: 50 events per push
  const payload = Array.from({ length: n }, (_, index) => ({
    body: { index, sleepSeconds: index === 0 ? Math.min(longSleepSeconds, 600) : 1 } satisfies SpikeEventBody,
  }));
  const { jobId } = await queue.push(payload);
  return { jobId };
}

/** Accepts either an AsyncEvent ({ body, jobId }) or a resolver-style ({ payload }) argument. */
export function readEvent(arg: unknown): { body: SpikeEventBody | null; jobId: string; argKeys: string } {
  const a = (arg ?? {}) as Record<string, unknown>;
  const raw = (a['body'] ?? a['payload'] ?? null) as Record<string, unknown> | null;
  const body = raw && typeof raw['index'] === 'number' && typeof raw['sleepSeconds'] === 'number' ? (raw as SpikeEventBody) : null;
  const jobId = typeof a['jobId'] === 'string' ? a['jobId'] : 'unknown';
  return { body, jobId, argKeys: Object.keys(a).sort().join(',') };
}

export async function spikeConsumer(arg: unknown): Promise<void> {
  const { body, jobId, argKeys } = readEvent(arg);
  console.log(`[specsmith] spike consumer start job=${jobId} keys=${argKeys} body=${JSON.stringify(body)}`);
  if (!body) return;
  await new Promise((r) => setTimeout(r, body.sleepSeconds * 1000));
  // KVS keys allow [a-zA-Z0-9:._\s-#]; jobIds may contain other characters, so sanitise.
  const safeJob = jobId.replace(/[^a-zA-Z0-9._-]/g, '_');
  await kvs.set(`spike:s5:${safeJob}:${String(body.index).padStart(2, '0')}`, {
    eventIndex: body.index,
    sleptSeconds: body.sleepSeconds,
    finishedAt: new Date().toISOString(),
    argKeys,
  });
  console.log(`[specsmith] spike consumer done job=${jobId} index=${body.index}`);
}

export async function queueStatus(jobId: string): Promise<QueueStatus> {
  const safeJob = jobId.replace(/[^a-zA-Z0-9._-]/g, '_');
  let stats: QueueStatus['stats'] = null;
  let error: string | null = null;
  try {
    stats = await queue.getJob(jobId).getStats();
  } catch (err) {
    error = `getStats: ${err instanceof Error ? err.message : String(err)}`;
  }
  const res = await kvs.query().where('key', WhereConditions.beginsWith(`spike:s5:${safeJob}:`)).limit(50).getMany<QueueStatus['records'][number]>();
  return { jobId, stats, records: res.results.map((r) => r.value), error };
}
