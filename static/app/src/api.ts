import { makeInvoke } from '@forge/bridge';
import type { SpecSmithApi } from '../../../src/shared/api';

export type { AppInfo, FeedMeta, FileSpec, QueueStatus, RunRecord, RunRow, SpikeReport, Targets } from '../../../src/shared/api';

/** Typed against the backend resolver: wrong keys or shapes fail to compile. */
export const api = makeInvoke<SpecSmithApi>();

export const getAppInfo = () => api('getAppInfo');
