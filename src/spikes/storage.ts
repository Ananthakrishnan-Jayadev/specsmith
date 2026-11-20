/** Spike S4: Forge KVS. Round trip, value-size limit (240 KiB per docs), batch timing. */
import kvs from '@forge/kvs';
import type { SpikeReport } from '../shared/api';
import { StepRecorder } from './steps';

/** Order-insensitive deep equality: KVS does not preserve object key order. */
export function sameData(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  if (ka.length !== kb.length || ka.some((k, i) => k !== kb[i])) return false;
  return ka.every((k) => sameData((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

const KIB = 1024;

export async function spikeStorage(): Promise<SpikeReport> {
  const rec = new StepRecorder('S4 Storage (KVS)');
  const key = (s: string) => `spike:s4:${s}`;

  await rec.run('object round trip', async () => {
    const v = { feed: 'retail', columns: [{ name: 'cust_id', source: 'derived' }], at: new Date().toISOString() };
    await kvs.set(key('obj'), v);
    const back = await kvs.get<typeof v>(key('obj'));
    return sameData(back, v) ? { status: 'pass', detail: 'set → get returned equal data (key order not preserved)' } : { status: 'fail', detail: `mismatch: ${JSON.stringify(back)}` };
  });

  for (const size of [200, 239, 245]) {
    await rec.run(`set ${size} KiB string`, async () => {
      const t0 = Date.now();
      try {
        await kvs.set(key(`size-${size}`), 'x'.repeat(size * KIB));
        const ms = Date.now() - t0;
        return size > 240 ? { status: 'fail', detail: `accepted ${size} KiB, so the limit is higher than documented (${ms} ms)` } : { status: 'pass', detail: `stored in ${ms} ms` };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return size > 240 ? { status: 'pass', detail: `rejected as expected: ${msg.slice(0, 200)}` } : { status: 'fail', detail: `unexpectedly rejected: ${msg.slice(0, 200)}` };
      }
    });
  }

  await rec.run('batchSet 20 × 5 KiB', async () => {
    const t0 = Date.now();
    const res = await kvs.batchSet(Array.from({ length: 20 }, (_, i) => ({ key: key(`batch-${i}`), value: 'y'.repeat(5 * KIB) })));
    return { status: 'pass', detail: `${Date.now() - t0} ms; result keys: ${Object.keys(res).join(',')}` };
  });

  await rec.run('cleanup', async () => {
    const keys = ['obj', 'size-200', 'size-239', 'size-245', ...Array.from({ length: 20 }, (_, i) => `batch-${i}`)];
    await Promise.all(keys.map((k) => kvs.delete(key(k))));
    return { status: 'pass', detail: `deleted ${keys.length} keys` };
  });

  return rec.report();
}
