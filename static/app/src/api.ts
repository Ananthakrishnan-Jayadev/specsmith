import { makeInvoke } from '@forge/bridge';
import type { SpecSmithApi } from '../../../src/shared/api';

export type { AppInfo } from '../../../src/shared/api';

/** Typed against the backend resolver: wrong keys or shapes fail to compile. */
const invoke = makeInvoke<SpecSmithApi>();

export const getAppInfo = () => invoke('getAppInfo');
