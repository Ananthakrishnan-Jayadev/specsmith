import { makeResolver } from '@forge/resolver';
import type { SpecSmithApi } from '../shared/api';
import { buildAppInfo } from './app-info';

/**
 * Backend for the SpecSmith Custom UI. Each key must match SpecSmithApi.
 * Handlers stay thin: they unpack the request and call pure functions.
 */
export const handler = makeResolver<SpecSmithApi>({
  getAppInfo: ({ context }) => {
    // Spike: record which context fields Forge provides (keys only, no values).
    console.log(`[specsmith] getAppInfo context keys: ${Object.keys(context).sort().join(',')}`);
    return buildAppInfo(context, new Date());
  },
});
