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
  siteUrl: string | null;
}

/* ---------- Phase 0 spikes (removed once Week 1 lands) ---------- */

export type StepStatus = 'pass' | 'fail' | 'dry-run' | 'skip';

export interface SpikeStep {
  step: string;
  status: StepStatus;
  detail: string;
  ms: number;
}

export interface SpikeReport {
  spike: string;
  startedAt: string;
  totalMs: number;
  steps: SpikeStep[];
  links: { label: string; url: string }[];
}

export interface Targets {
  spaces: { id: string; key: string; name: string }[];
  projects: { id: string; key: string; name: string; style: string }[];
  errors: string[];
}

export interface QueueStatus {
  jobId: string;
  stats: { success: number; inProgress: number; failed: number } | null;
  records: { eventIndex: number; sleptSeconds: number; finishedAt: string; argKeys: string }[];
  error: string | null;
}

export type SpecSmithApi = {
  getAppInfo: () => AppInfo;
  listTargets: () => Targets;
  spikeConfluence: (p: { spaceKey: string; dryRun: boolean }) => SpikeReport;
  spikeJira: (p: { projectKey: string; dryRun: boolean; pageUrl: string | null }) => SpikeReport;
  spikeStorage: () => SpikeReport;
  spikeQueueStart: (p: { events: number; longSleepSeconds: number }) => { jobId: string };
  spikeQueueStatus: (p: { jobId: string }) => QueueStatus;
};
