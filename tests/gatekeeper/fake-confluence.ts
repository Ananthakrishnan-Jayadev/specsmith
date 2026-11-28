import { VersionConflictError, type ConfluencePort, type PageInfo, type PageOwner, type WrittenPage } from '../../src/gatekeeper/confluence-port';

interface FakePage extends PageInfo {
  spaceId: string;
  parentId?: string;
  body: string;
  owner?: PageOwner;
}

/** In-memory Confluence with the behaviours the Gatekeeper relies on. */
export class FakeConfluence implements ConfluencePort {
  pages = new Map<string, FakePage>();
  spaces = new Map([['SPEC', '100']]);
  writes = 0;
  failCreateFor = new Set<string>();
  private next = 1000;

  async findSpace(key: string) {
    const id = this.spaces.get(key);
    return id ? { id, key } : null;
  }
  async getPage(id: string) {
    const p = this.pages.get(id);
    return p ? { id: p.id, title: p.title, version: p.version } : null;
  }
  async findPagesByTitle(spaceId: string, title: string) {
    return [...this.pages.values()].filter((p) => p.spaceId === spaceId && p.title === title).map(({ id, title: t, version }) => ({ id, title: t, version }));
  }
  async getOwner(pageId: string) {
    return this.pages.get(pageId)?.owner ?? null;
  }
  async createPage(i: { spaceId: string; parentId?: string; title: string; body: string }): Promise<WrittenPage> {
    if (this.failCreateFor.has(i.title)) throw new Error('HTTP 500: boom');
    this.writes++;
    const id = String(this.next++);
    this.pages.set(id, { id, title: i.title, version: 1, spaceId: i.spaceId, body: i.body, ...(i.parentId ? { parentId: i.parentId } : {}) });
    return { id, version: 1, url: `https://x/wiki/${id}` };
  }
  async updatePage(i: { id: string; title: string; body: string; version: number }): Promise<WrittenPage> {
    const p = this.pages.get(i.id);
    if (!p) throw new Error('HTTP 404');
    if (i.version !== p.version + 1) throw new VersionConflictError('HTTP 409');
    this.writes++;
    Object.assign(p, { title: i.title, body: i.body, version: i.version });
    return { id: p.id, version: p.version };
  }
  async setOwner(pageId: string, owner: PageOwner) {
    const p = this.pages.get(pageId);
    if (p) p.owner = owner;
  }
  attachments = new Map<string, { id: string; content: string }>(); // key: pageId/name
  failUploads = false;
  async uploadAttachment(pageId: string, file: { name: string; content: string }) {
    if (this.failUploads) throw new Error('HTTP 500: upload failed');
    this.writes++;
    const key = `${pageId}/${file.name}`;
    const id = this.attachments.get(key)?.id ?? `att${this.next++}`;
    this.attachments.set(key, { id, content: file.content });
    return { id };
  }
  /** Simulates a person editing a page in Confluence. */
  humanEdit(id: string) {
    const p = this.pages.get(id);
    if (p) p.version++;
  }
  addForeignPage(title: string, spaceId = '100') {
    const id = String(this.next++);
    this.pages.set(id, { id, title, version: 3, spaceId, body: '<p>someone else</p>' });
    return id;
  }
}
