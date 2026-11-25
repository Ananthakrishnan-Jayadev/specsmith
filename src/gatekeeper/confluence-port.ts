/** What the Gatekeeper needs from Confluence. Real impl: platform/confluence.ts; tests: a fake. */

export interface PageInfo {
  id: string;
  title: string;
  version: number;
}

export interface WrittenPage {
  id: string;
  version: number;
  url?: string;
}

export interface PageOwner {
  feedId: string;
  file: string;
}

export interface ConfluencePort {
  findSpace(key: string): Promise<{ id: string; key: string } | null>;
  /** null when the page doesn't exist or is trashed. */
  getPage(id: string): Promise<PageInfo | null>;
  findPagesByTitle(spaceId: string, title: string): Promise<PageInfo[]>;
  getOwner(pageId: string): Promise<PageOwner | null>;
  createPage(input: { spaceId: string; parentId?: string; title: string; body: string }): Promise<WrittenPage>;
  /** Throws VersionConflictError when `version` is stale. */
  updatePage(input: { id: string; title: string; body: string; version: number }): Promise<WrittenPage>;
  setOwner(pageId: string, owner: PageOwner): Promise<void>;
}

export class VersionConflictError extends Error {}
