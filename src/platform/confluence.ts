/** ConfluencePort over the real REST API (v2), always as the current user. */
import { route } from '@forge/api';
import { VersionConflictError, type ConfluencePort, type PageInfo, type PageOwner, type WrittenPage } from '../gatekeeper/confluence-port';
import { callProduct, describeError } from './product-api';
import { buildMultipart } from './multipart';
import { XSRF_HEADER } from '../gatekeeper/attachment-plan';

interface V2Page { id: string; title: string; status?: string; version?: { number: number }; _links?: { webui?: string } }
interface Paged<T> { results: T[] }
interface Prop { id: string; key: string; value: unknown; version?: { number: number } }

const OWNER_KEY = 'specsmith';
const toInfo = (p: V2Page): PageInfo => ({ id: p.id, title: p.title, version: p.version?.number ?? 0 });

function isOwner(v: unknown): v is PageOwner {
  return typeof v === 'object' && v !== null && typeof (v as PageOwner).feedId === 'string' && typeof (v as PageOwner).file === 'string';
}

export function confluencePort(siteUrl: string | null): ConfluencePort {
  const urlOf = (p: V2Page) => (siteUrl && p._links?.webui ? `${siteUrl}/wiki${p._links.webui}` : undefined);
  const written = (p: V2Page): WrittenPage => {
    const url = urlOf(p);
    return { id: p.id, version: p.version?.number ?? 1, ...(url ? { url } : {}) };
  };

  return {
    async findSpace(key) {
      const r = await callProduct<Paged<{ id: string; key: string }>>('confluence', route`/wiki/api/v2/spaces?keys=${key}`);
      if (!r.ok) throw new Error(describeError(r));
      const s = r.data?.results[0];
      return s ? { id: s.id, key: s.key } : null;
    },

    async getPage(id) {
      const r = await callProduct<V2Page>('confluence', route`/wiki/api/v2/pages/${id}`);
      if (r.status === 404) return null;
      if (!r.ok || !r.data) throw new Error(describeError(r));
      return r.data.status && r.data.status !== 'current' ? null : toInfo(r.data);
    },

    async findPagesByTitle(spaceId, title) {
      const r = await callProduct<Paged<V2Page>>('confluence', route`/wiki/api/v2/pages?space-id=${spaceId}&title=${title}&status=current`);
      if (!r.ok) throw new Error(describeError(r));
      return (r.data?.results ?? []).map(toInfo);
    },

    async getOwner(pageId) {
      const r = await callProduct<Paged<Prop>>('confluence', route`/wiki/api/v2/pages/${pageId}/properties?key=${OWNER_KEY}`);
      if (!r.ok) throw new Error(describeError(r));
      const v = r.data?.results[0]?.value;
      return isOwner(v) ? { feedId: v.feedId, file: v.file } : null;
    },

    async createPage({ spaceId, parentId, title, body }) {
      const r = await callProduct<V2Page>('confluence', route`/wiki/api/v2/pages`, {
        method: 'POST',
        json: { spaceId, status: 'current', title, ...(parentId ? { parentId } : {}), body: { representation: 'storage', value: body } },
      });
      if (!r.ok || !r.data) throw new Error(describeError(r));
      return written(r.data);
    },

    async updatePage({ id, title, body, version }) {
      const r = await callProduct<V2Page>('confluence', route`/wiki/api/v2/pages/${id}`, {
        method: 'PUT',
        json: { id, status: 'current', title, body: { representation: 'storage', value: body }, version: { number: version, message: 'Published by SpecSmith' } },
      });
      if (r.status === 409) throw new VersionConflictError(describeError(r));
      if (!r.ok || !r.data) throw new Error(describeError(r));
      return written(r.data);
    },

    async setOwner(pageId, owner) {
      const existing = await callProduct<Paged<Prop>>('confluence', route`/wiki/api/v2/pages/${pageId}/properties?key=${OWNER_KEY}`);
      if (!existing.ok) throw new Error(describeError(existing));
      const prop = existing.data?.results[0];
      const r = prop
        ? await callProduct('confluence', route`/wiki/api/v2/pages/${pageId}/properties/${prop.id}`, {
            method: 'PUT',
            json: { key: OWNER_KEY, value: owner, version: { number: (prop.version?.number ?? 1) + 1 } },
          })
        : await callProduct('confluence', route`/wiki/api/v2/pages/${pageId}/properties`, { method: 'POST', json: { key: OWNER_KEY, value: owner } });
      if (!r.ok) throw new Error(describeError(r));
    },

    async uploadAttachment(pageId, file) {
      const mp = buildMultipart([{ field: 'file', filename: file.name, contentType: file.contentType, content: file.content }], { minorEdit: 'true' });
      const r = await callProduct<{ results?: { id: string }[] }>('confluence', route`/wiki/rest/api/content/${pageId}/child/attachment`, {
        method: 'PUT',
        rawBody: mp.body,
        headers: { 'Content-Type': mp.contentType, ...XSRF_HEADER },
      });
      const id = r.data?.results?.[0]?.id;
      if (!r.ok || !id) throw new Error(describeError(r));
      return { id };
    },
  };
}
