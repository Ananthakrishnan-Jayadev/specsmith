/** KV port backed by Forge KVS (@forge/kvs). Backend only. */
import kvs, { WhereConditions } from '@forge/kvs';
import type { KV } from './kv';

export const forgeKV: KV = {
  get: <T>(key: string) => kvs.get<T>(key),
  set: <T>(key: string, value: T) => kvs.set(key, value),
  delete: (key: string) => kvs.delete(key),
};

/** Values whose key starts with `prefix`, in key order (max 100). */
export async function listByPrefix<T>(prefix: string, limit = 20): Promise<T[]> {
  const res = await kvs.query().where('key', WhereConditions.beginsWith(prefix)).limit(Math.min(limit, 100)).getMany<T>();
  return res.results.map((r) => r.value);
}
