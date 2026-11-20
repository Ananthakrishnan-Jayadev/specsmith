import { describe, expect, it } from 'vitest';
import { planAttachment } from '../../src/gatekeeper/attachment-plan';

describe('planAttachment', () => {
  it('creates when nothing is recorded', () => {
    expect(planAttachment(undefined, 'h1')).toEqual({ op: 'create' });
  });
  it('skips when the content hash is unchanged', () => {
    expect(planAttachment({ id: 'att1', sha256: 'h1' }, 'h1')).toEqual({ op: 'skip', id: 'att1' });
  });
  it('updates the recorded attachment when content changed', () => {
    expect(planAttachment({ id: 'att1', sha256: 'h1' }, 'h2')).toEqual({ op: 'update', id: 'att1' });
  });
});
