/**
 * Decides how to publish an attachment idempotently, without listing the
 * page's attachments (that would need an extra scope). SpecSmith records
 * {id, sha256} per filename in its own page content property.
 */

export interface AttachmentRecord {
  id: string;
  sha256: string;
}

export type AttachmentPlan =
  | { op: 'skip'; id: string }
  | { op: 'update'; id: string }
  | { op: 'create' };

export function planAttachment(recorded: AttachmentRecord | undefined, sha256: string): AttachmentPlan {
  if (!recorded) return { op: 'create' };
  if (recorded.sha256 === sha256) return { op: 'skip', id: recorded.id };
  return { op: 'update', id: recorded.id };
}
