/**
 * Spike S6: Confluence writes. Find space → duplicate-title check → create/update
 * page (storage format, yellow cells, attached image) → stale-version conflict →
 * attachment upload (v1 multipart) → content property.
 */
import { route } from '@forge/api';
import type { SpikeReport } from '../shared/api';
import { callProduct, describeError } from '../platform/product-api';
import { buildMultipart } from '../platform/multipart';
import { createHash } from 'node:crypto';
import { planPageWrite, type ExistingPage } from '../gatekeeper/page-plan';
import { XSRF_HEADER, planAttachment, type AttachmentRecord } from '../gatekeeper/attachment-plan';
import { attachedImage, heading, paragraph, table } from '../render/storage';
import { StepRecorder } from './steps';

const TITLE = 'SpecSmith Spike S6';
const SVG_NAME = 'specsmith-spike.svg';

interface PageSummary { id: string; version?: { number: number }; _links?: { webui?: string } }
interface Paged<T> { results: T[] }
interface PropertySummary { id: string; key: string; value: unknown; version?: { number: number } }

function spikeBody(now: string): string {
  return [
    heading(2, 'Spike S6: storage format check'),
    paragraph(`Written by SpecSmith at ${now}. Safe to delete.`),
    table(
      ['Column', 'Type', 'Description'],
      [
        [{ text: 'cust_id' }, { text: 'string(9)' }, { text: 'Customer identifier' }],
        [{ text: 'col_17' }, { text: 'TBD', highlight: true }, { text: 'TBD', highlight: true }],
        [{ text: '<script>alert(1)</script>' }, { text: 'escaped?' }, { text: 'This row proves escaping works' }],
      ],
    ),
    heading(3, 'Attached SVG'),
    attachedImage(SVG_NAME),
  ].join('');
}

const svgFor = (stamp: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="80" viewBox="0 0 320 80">
<rect x="1" y="1" width="140" height="78" rx="6" fill="#e9f2ff" stroke="#0c66e4"/><text x="71" y="45" font-family="sans-serif" font-size="14" text-anchor="middle">accounts</text>
<rect x="179" y="1" width="140" height="78" rx="6" fill="#e9f2ff" stroke="#0c66e4"/><text x="249" y="45" font-family="sans-serif" font-size="14" text-anchor="middle">transactions</text>
<line x1="141" y1="40" x2="179" y2="40" stroke="#44546f" stroke-width="2"/><!-- ${stamp} --></svg>`;

export async function spikeConfluence(spaceKey: string, dryRun: boolean, siteUrl: string | null): Promise<SpikeReport> {
  const rec = new StepRecorder('S6 Confluence');

  const spaceId = await rec.run('find space by key', async () => {
    const r = await callProduct<Paged<{ id: string }>>('confluence', route`/wiki/api/v2/spaces?keys=${spaceKey}`);
    if (!r.ok) return { status: 'fail', detail: describeError(r) };
    const id = r.data?.results[0]?.id;
    return id ? { status: 'pass', detail: `space ${spaceKey} → id ${id}`, value: id } : { status: 'fail', detail: `no space with key ${spaceKey} (fail closed)` };
  });
  if (!spaceId) return rec.report();

  const plan = await rec.run('duplicate-title check', async () => {
    const r = await callProduct<Paged<PageSummary>>(
      'confluence',
      route`/wiki/api/v2/pages?space-id=${spaceId}&title=${TITLE}&status=current`,
    );
    if (!r.ok) return { status: 'fail', detail: describeError(r) };
    const matches: ExistingPage[] = (r.data?.results ?? []).map((p) => ({ id: p.id, version: p.version?.number ?? 0 }));
    const p = planPageWrite(TITLE, matches);
    return { status: p.op === 'fail' ? 'fail' : 'pass', detail: `plan: ${JSON.stringify(p)}`, value: p };
  });
  if (!plan || plan.op === 'fail') return rec.report();

  if (dryRun) {
    rec.steps.push({ step: 'write page', status: 'dry-run', detail: `would ${plan.op} "${TITLE}"`, ms: 0 });
    rec.skip('attachment, property, conflict', 'dry run: no writes');
    return rec.report();
  }

  const body = { representation: 'storage', value: spikeBody(new Date().toISOString()) };
  const page = await rec.run('write page', async () => {
    const r =
      plan.op === 'create'
        ? await callProduct<PageSummary>('confluence', route`/wiki/api/v2/pages`, {
            method: 'POST',
            json: { spaceId, status: 'current', title: TITLE, body },
          })
        : await callProduct<PageSummary>('confluence', route`/wiki/api/v2/pages/${plan.id}`, {
            method: 'PUT',
            json: { id: plan.id, status: 'current', title: TITLE, body, version: { number: plan.nextVersion, message: 'SpecSmith spike' } },
          });
    if (!r.ok || !r.data) return { status: 'fail', detail: describeError(r) };
    const url = siteUrl && r.data._links?.webui ? `${siteUrl}/wiki${r.data._links.webui}` : null;
    if (url) rec.links.push({ label: 'Spike page', url });
    return { status: 'pass', detail: `${plan.op}d page ${r.data.id} (version ${r.data.version?.number ?? '?'})`, value: r.data };
  });
  if (!page) return rec.report();
  const currentVersion = page.version?.number ?? 1;

  await rec.run('stale-version update is rejected', async () => {
    const r = await callProduct('confluence', route`/wiki/api/v2/pages/${page.id}`, {
      method: 'PUT',
      json: { id: page.id, status: 'current', title: TITLE, body, version: { number: currentVersion } },
    });
    return r.ok
      ? { status: 'fail', detail: 'stale version was ACCEPTED: version check cannot detect outside edits' }
      : { status: 'pass', detail: `rejected as expected → HTTP ${r.status}` };
  });

  // Our own page property records what SpecSmith published: { attachments: { [filename]: {id, sha256} } }.
  interface SpecsmithProp { attachments?: Record<string, AttachmentRecord>; [k: string]: unknown }
  const propState = await rec.run('read SpecSmith page property', async () => {
    const r = await callProduct<Paged<PropertySummary>>('confluence', route`/wiki/api/v2/pages/${page.id}/properties?key=specsmith`);
    if (!r.ok) return { status: 'fail', detail: describeError(r) };
    const prop = r.data?.results[0];
    const value = (prop?.value ?? {}) as SpecsmithProp;
    return { status: 'pass', detail: prop ? `found (version ${prop.version?.number ?? '?'})` : 'none yet', value: { prop, value } };
  });
  if (!propState) return rec.report();

  // Content changes every run (timestamp comment) so the update path is exercised.
  const svg = svgFor(new Date().toISOString());
  const sha256 = createHash('sha256').update(svg).digest('hex');
  const recorded = propState.value.attachments?.[SVG_NAME];
  const attPlan = planAttachment(recorded, sha256);

  const attachment = await rec.run(`attachment: ${attPlan.op}`, async () => {
    if (attPlan.op === 'skip') return { status: 'pass', detail: `unchanged (sha ${sha256.slice(0, 8)}), skipped`, value: { id: attPlan.id, sha256 } };
    const mp = buildMultipart([{ field: 'file', filename: SVG_NAME, contentType: 'image/svg+xml', content: svg }], { minorEdit: 'true' });
    const r = await callProduct<{ results?: { id: string }[] }>('confluence', route`/wiki/rest/api/content/${page.id}/child/attachment`, {
      method: 'PUT',
      rawBody: mp.body,
      headers: { 'Content-Type': mp.contentType, ...XSRF_HEADER },
    });
    const id = r.data?.results?.[0]?.id;
    return r.ok && id
      ? { status: 'pass', detail: `${recorded ? 'updated' : 'created'} ${SVG_NAME} → ${id}`, value: { id, sha256 } }
      : { status: 'fail', detail: describeError(r) };
  });

  await rec.run('write SpecSmith page property', async () => {
    const attachments = { ...(propState.value.attachments ?? {}), ...(attachment ? { [SVG_NAME]: attachment } : {}) };
    const value: SpecsmithProp = { app: 'specsmith', spike: 'S6', at: new Date().toISOString(), attachments };
    const prop = propState.prop;
    const r = prop
      ? await callProduct('confluence', route`/wiki/api/v2/pages/${page.id}/properties/${prop.id}`, {
          method: 'PUT',
          json: { key: 'specsmith', value, version: { number: (prop.version?.number ?? 1) + 1 } },
        })
      : await callProduct('confluence', route`/wiki/api/v2/pages/${page.id}/properties`, { method: 'POST', json: { key: 'specsmith', value } });
    return r.ok ? { status: 'pass', detail: `${prop ? 'updated' : 'created'}; records ${Object.keys(attachments).length} attachment(s)` } : { status: 'fail', detail: describeError(r) };
  });

  return rec.report();
}
