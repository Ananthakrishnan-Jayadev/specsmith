/**
 * Profiles a file in a web worker; if the worker can't start (e.g. a
 * Content-Security-Policy blocks it), falls back to the main thread.
 */
import type { FileProfile } from '../../../../src/domain/profile';
import { defaultConfig } from '../../../../src/config';
import type { ProfileMessage, ProfileRequest } from './messages';
import { profileFile, type ProfileFileOptions } from './profileFile';

export type ProfileMode = 'worker' | 'main-thread';

export const PROFILE_OPTIONS: ProfileFileOptions = {
  profiler: { nullTokens: defaultConfig.types.nullTokens, booleanTokens: defaultConfig.types.booleanTokens },
  maxRows: 250_000,
  encoding: 'UTF-8',
};

function inWorker(file: File, options: ProfileFileOptions, onProgress: (rows: number) => void): Promise<FileProfile> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./profile.worker.ts', import.meta.url), { type: 'module' });
    } catch (err) {
      reject(err);
      return;
    }
    let started = false;
    worker.onmessage = (e: MessageEvent<ProfileMessage>) => {
      started = true;
      const m = e.data;
      if (m.type === 'progress') onProgress(m.rows);
      else {
        worker.terminate();
        if (m.type === 'done') resolve(m.profile);
        else reject(new Error(m.message));
      }
    };
    worker.onerror = (e) => {
      worker.terminate();
      // An error before any message means the worker never loaded: let the caller fall back.
      reject(Object.assign(new Error(e.message || 'worker failed to start'), { workerStartFailure: !started }));
    };
    const req: ProfileRequest = { file, options };
    worker.postMessage(req);
  });
}

export async function runProfile(
  file: File,
  onProgress: (rows: number) => void,
  options: ProfileFileOptions = PROFILE_OPTIONS,
): Promise<{ profile: FileProfile; mode: ProfileMode }> {
  try {
    return { profile: await inWorker(file, options, onProgress), mode: 'worker' };
  } catch (err) {
    const startFailure = typeof err === 'object' && err !== null && 'workerStartFailure' in err && (err as { workerStartFailure: boolean }).workerStartFailure;
    if (!startFailure && err instanceof Error && !/worker/i.test(err.message)) throw err; // a real parse error
    console.warn('[specsmith] worker unavailable, profiling on the main thread:', err);
    return { profile: await profileFile(file, options, onProgress), mode: 'main-thread' };
  }
}
