/**
 * Feed repository: metadata, per-file specs (chunked) and the run log.
 * Keys:
 *   feeds:index                 string[] of feedIds
 *   feed:<id>                   FeedMeta
 *   feed:<id>:file:<fileKey>    FileSpec (chunked)
 *   run:<id>:<reverseTime>      RunRecord (newest sorts first)
 */
import type { FileSpec } from '../domain/spec';
import type { FeedMeta, RunRecord } from '../domain/feed';
import type { KV } from './kv';
import { deleteJson, getJson, putJson } from './chunked';

const INDEX = 'feeds:index';
const feedKey = (id: string) => `feed:${id}`;
/** KVS keys allow [a-zA-Z0-9:._\s-#]; file names may contain anything else. */
export const fileKey = (fileName: string) => fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
const specKey = (id: string, fileName: string) => `feed:${id}:file:${fileKey(fileName)}`;

export function newFeedId(now = Date.now()): string {
  return `f${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export class FeedRepo {
  constructor(private readonly kv: KV) {}

  async list(): Promise<FeedMeta[]> {
    const ids = (await this.kv.get<string[]>(INDEX)) ?? [];
    const metas = await Promise.all(ids.map((id) => this.kv.get<FeedMeta>(feedKey(id))));
    return metas.filter((m): m is FeedMeta => m !== undefined).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  get(id: string): Promise<FeedMeta | undefined> {
    return this.kv.get<FeedMeta>(feedKey(id));
  }

  async put(meta: FeedMeta): Promise<void> {
    await this.kv.set(feedKey(meta.feedId), meta);
    const ids = (await this.kv.get<string[]>(INDEX)) ?? [];
    if (!ids.includes(meta.feedId)) await this.kv.set(INDEX, [...ids, meta.feedId]);
  }

  async putFile(feedId: string, spec: FileSpec): Promise<void> {
    await putJson(this.kv, specKey(feedId, spec.fileName), spec);
  }

  getFile(feedId: string, fileName: string): Promise<FileSpec | undefined> {
    return getJson<FileSpec>(this.kv, specKey(feedId, fileName));
  }

  deleteFile(feedId: string, fileName: string): Promise<void> {
    return deleteJson(this.kv, specKey(feedId, fileName));
  }

  async getFiles(meta: FeedMeta): Promise<FileSpec[]> {
    const specs = await Promise.all(meta.files.map((f) => this.getFile(meta.feedId, f)));
    return specs.filter((s): s is FileSpec => s !== undefined);
  }

  async addRun(run: RunRecord): Promise<string> {
    const reverse = String(9_999_999_999_999 - Date.parse(run.startedAt)).padStart(13, '0');
    const key = `run:${run.feedId}:${reverse}`;
    await this.kv.set(key, run);
    return key;
  }
}
