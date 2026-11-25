/**
 * Stores JSON values larger than one KVS entry (240 KiB, spike S4) as chunks.
 *
 * Write order makes partial failures harmless: chunks go under a NEW revision
 * first, the pointer is switched last, then old chunks are deleted. A reader
 * always sees either the old or the new value, never a mix.
 */
import type { KV } from './kv';

export const CHUNK_CHARS = 200_000; // safely under the 245,760-char limit after JSON string quoting

interface Pointer {
  rev: string;
  chunks: number;
  chars: number;
}

const chunkKey = (key: string, rev: string, i: number) => `${key}#${rev}#${i}`;

export async function putJson(kv: KV, key: string, value: unknown, rev = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`): Promise<void> {
  const text = JSON.stringify(value);
  const parts: string[] = [];
  for (let i = 0; i < text.length; i += CHUNK_CHARS) parts.push(text.slice(i, i + CHUNK_CHARS));
  if (parts.length === 0) parts.push('');
  const old = await kv.get<Pointer>(key);
  for (const [i, part] of parts.entries()) await kv.set(chunkKey(key, rev, i), part);
  await kv.set<Pointer>(key, { rev, chunks: parts.length, chars: text.length });
  if (old && old.rev !== rev) {
    for (let i = 0; i < old.chunks; i++) await kv.delete(chunkKey(key, old.rev, i));
  }
}

export async function getJson<T>(kv: KV, key: string): Promise<T | undefined> {
  const ptr = await kv.get<Pointer>(key);
  if (!ptr) return undefined;
  let text = '';
  for (let i = 0; i < ptr.chunks; i++) {
    const part = await kv.get<string>(chunkKey(key, ptr.rev, i));
    if (part === undefined) throw new Error(`Stored value "${key}" is incomplete (chunk ${i} of ${ptr.chunks} missing).`);
    text += part;
  }
  if (text.length !== ptr.chars) throw new Error(`Stored value "${key}" is corrupt (length ${text.length}, expected ${ptr.chars}).`);
  return JSON.parse(text) as T;
}

export async function deleteJson(kv: KV, key: string): Promise<void> {
  const ptr = await kv.get<Pointer>(key);
  await kv.delete(key);
  if (ptr) for (let i = 0; i < ptr.chunks; i++) await kv.delete(chunkKey(key, ptr.rev, i));
}
