/**
 * The contract between the Custom UI (static/app) and the backend resolver.
 * Types only, with no runtime imports, so the UI can `import type` it safely.
 *
 * Backend: makeResolver<SpecSmithApi>(...)   (src/resolvers/index.ts)
 * Frontend: makeInvoke<SpecSmithApi>()        (static/app/src/api.ts)
 * A mismatch between the two sides is a compile error.
 */

export interface AppInfo {
  app: 'SpecSmith';
  version: string;
  serverTime: string;
  accountId: string | null;
  cloudId: string | null;
  moduleKey: string | null;
}

export type SpecSmithApi = {
  getAppInfo: () => AppInfo;
};
