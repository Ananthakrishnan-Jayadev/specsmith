import { describe, expect, it } from 'vitest';
import { planPageWrite } from '../../src/gatekeeper/page-plan';

describe('planPageWrite', () => {
  it('creates when no page has the title', () => {
    expect(planPageWrite('Feed spec', [])).toEqual({ op: 'create' });
  });

  it('updates the single match with the next version number', () => {
    expect(planPageWrite('Feed spec', [{ id: '42', version: 3 }])).toEqual({ op: 'update', id: '42', nextVersion: 4 });
  });

  it('fails closed when the title is ambiguous', () => {
    const plan = planPageWrite('Feed spec', [
      { id: '1', version: 1 },
      { id: '2', version: 5 },
    ]);
    expect(plan.op).toBe('fail');
    if (plan.op === 'fail') expect(plan.reason).toMatch(/2 pages titled "Feed spec".*Refusing to guess/);
  });
});
