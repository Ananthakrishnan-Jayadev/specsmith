/**
 * Thin wrapper over Forge product fetch. Always runs as the current user
 * (asUser), so SpecSmith can never do more than the person clicking.
 * Never throws for HTTP errors: returns { ok:false, status, errorText }.
 */
import { asUser, type Route } from '@forge/api';

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  errorText: string | null;
}

export interface CallInit {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  json?: unknown;
  rawBody?: string;
  headers?: Record<string, string>;
}

export async function callProduct<T>(product: 'confluence' | 'jira', path: Route, init: CallInit = {}): Promise<ApiResult<T>> {
  const headers: Record<string, string> = { Accept: 'application/json', ...init.headers };
  let body: string | undefined;
  if (init.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(init.json);
  } else if (init.rawBody !== undefined) {
    body = init.rawBody;
  }
  const opts = { method: init.method ?? 'GET', headers, ...(body !== undefined ? { body } : {}) };
  const client = asUser();
  const res = product === 'confluence' ? await client.requestConfluence(path, opts) : await client.requestJira(path, opts);
  const text = await res.text();
  let data: T | null = null;
  if (text.length > 0) {
    try {
      data = JSON.parse(text) as T;
    } catch {
      data = null;
    }
  }
  return { ok: res.ok, status: res.status, data: res.ok ? data : null, errorText: res.ok ? null : text.slice(0, 500) };
}

export function describeError(r: ApiResult<unknown>): string {
  return `HTTP ${r.status}: ${r.errorText ?? 'no body'}`;
}
