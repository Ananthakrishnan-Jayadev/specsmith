import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/config';
import { profileRows } from '../../src/profile/profiler';
import { buildFileSpec } from '../../src/spec/build';
import { sanitizeForUpload } from '../../src/spec/sanitize';

describe('sanitizeForUpload', () => {
  const spec = buildFileSpec(profileRows('c.csv', [['c_sin', 'segment_cd'], ['903-738-417', 'RETAIL'], ['917-372-492', 'SMB']]), defaultConfig);

  it('masks sensitive samples, keeps others, drops value hashes', () => {
    const s = sanitizeForUpload(spec);
    expect(s.columns[0]?.profile.samples).toEqual(['‹9{3}-9{3}-9{3}›', '‹9{3}-9{3}-9{3}›']);
    expect(s.columns[1]?.profile.samples).toEqual(['RETAIL', 'SMB']);
    expect(s.columns.every((c) => c.profile.valueHashes.length === 0)).toBe(true);
    expect(JSON.stringify(s)).not.toContain('903-738-417');
  });

  it('is idempotent', () => {
    expect(sanitizeForUpload(sanitizeForUpload(spec))).toEqual(sanitizeForUpload(spec));
  });
});
