/** Web worker: profiles one file off the main thread. */
import { profileFile } from './profileFile';
import type { ProfileMessage, ProfileRequest } from './messages';

interface WorkerScope {
  onmessage: ((e: MessageEvent<ProfileRequest>) => void) | null;
  postMessage(message: ProfileMessage): void;
}
const scope = self as unknown as WorkerScope;

scope.onmessage = (e) => {
  const { file, options } = e.data;
  profileFile(file, options, (rows) => scope.postMessage({ type: 'progress', rows }))
    .then((profile) => scope.postMessage({ type: 'done', profile }))
    .catch((err: unknown) => scope.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) }));
};
