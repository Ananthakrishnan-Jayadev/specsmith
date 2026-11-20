import { describe, expect, it } from 'vitest';
import { XSRF_HEADER, planAttachment } from '../../src/gatekeeper/attachment-plan';

describe('planAttachment', () => {
  it('uploads when nothing is recorded', () => {
    expect(planAttachment(undefined, 'h1')).toEqual({ op: 'upload' });
  });
  it('skips when the content hash is unchanged', () => {
    expect(planAttachment({ id: 'att1', sha256: 'h1' }, 'h1')).toEqual({ op: 'skip', id: 'att1' });
  });
  it('uploads when content changed', () => {
    expect(planAttachment({ id: 'att1', sha256: 'h1' }, 'h2')).toEqual({ op: 'upload' });
  });
  it('uses the documented XSRF header spelling', () => {
    expect(XSRF_HEADER['X-Atlassian-Token']).toBe('nocheck');
  });
});
