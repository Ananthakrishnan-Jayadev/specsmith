/** Feeds, published-page links and the run log. */

export interface PageLink {
  pageId: string;
  title: string;
  /** Confluence version number right after SpecSmith's last write. */
  version: number;
  /** sha256 of the storage-format body SpecSmith last wrote. */
  bodyHash: string;
  url?: string;
}

export interface ConfluenceLinks {
  spaceKey: string;
  spaceId: string;
  parent?: PageLink;
  /** Keyed by file name. */
  pages: Record<string, PageLink>;
}

export interface FeedMeta {
  feedId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  /** File names in this feed (each stored separately). */
  files: string[];
  confluence?: ConfluenceLinks;
}

export type RowStatus = 'created' | 'updated' | 'skipped' | 'failed' | 'dry-run';
export type RowAction = 'create' | 'update' | 'skip' | 'none';

export interface RunRow {
  /** Human label, e.g. the page title. */
  target: string;
  action: RowAction;
  status: RowStatus;
  message: string;
  id?: string;
  url?: string;
}

export interface RunRecord {
  runId: string;
  feedId: string;
  kind: 'publish-confluence';
  dryRun: boolean;
  actor: string | null;
  startedAt: string;
  finishedAt: string;
  rows: RunRow[];
  counts: Record<RowStatus, number>;
}

export function countRows(rows: RunRow[]): Record<RowStatus, number> {
  const counts: Record<RowStatus, number> = { created: 0, updated: 0, skipped: 0, failed: 0, 'dry-run': 0 };
  for (const r of rows) counts[r.status]++;
  return counts;
}
