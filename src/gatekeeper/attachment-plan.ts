/**
 * Decides whether an attachment needs uploading, without listing the page's
 * attachments (that would need an extra scope). SpecSmith records
 * {id, sha256} per filename in its own page content property.
 *
 * Upload = PUT /wiki/rest/api/content/{pageId}/child/attachment (create-or-update
 * by filename) with header `X-Atlassian-Token: nocheck`. Verified in spike S6;
 * POST .../{attachmentId}/data returned 400 through Forge, so we don't use it.
 */

export interface AttachmentRecord {
  id: string;
  sha256: string;
}

export type AttachmentPlan = { op: 'skip'; id: string } | { op: 'upload' };

export function planAttachment(recorded: AttachmentRecord | undefined, sha256: string): AttachmentPlan {
  return recorded && recorded.sha256 === sha256 ? { op: 'skip', id: recorded.id } : { op: 'upload' };
}

/** The exact header value from the Confluence docs. `no-check` is not reliable for updates. */
export const XSRF_HEADER = { 'X-Atlassian-Token': 'nocheck' } as const;
