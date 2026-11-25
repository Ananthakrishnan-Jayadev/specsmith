/**
 * What leaves the browser: a spec with no value hashes and with samples of
 * sensitive (or unclassified-but-flagged) columns replaced by their shapes.
 * Idempotent, so the backend can safely apply it again.
 */
import type { FileSpec } from '../domain/spec';
import { maskSamples } from '../rules/pii';

export function sanitizeForUpload(spec: FileSpec): FileSpec {
  return {
    ...spec,
    columns: spec.columns.map((c) => ({
      ...c,
      profile: { ...c.profile, valueHashes: [], samples: maskSamples(c.profile.samples, c.pii.value) },
    })),
  };
}
