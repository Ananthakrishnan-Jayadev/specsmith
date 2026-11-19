import type { AppInfo } from '../shared/api';
import { APP_VERSION } from '../shared/version';

/** Reads a string field from the Forge invocation context, or null if it is absent. */
function str(context: Record<string, unknown>, key: string): string | null {
  const v = context[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/** Pure: builds AppInfo from the Forge resolver context. */
export function buildAppInfo(context: Record<string, unknown>, now: Date): AppInfo {
  return {
    app: 'SpecSmith',
    version: APP_VERSION,
    serverTime: now.toISOString(),
    accountId: str(context, 'accountId'),
    cloudId: str(context, 'cloudId'),
    moduleKey: str(context, 'moduleKey'),
  };
}
