import { describe, expect, it } from 'vitest';
import { StepRecorder } from '../../src/spikes/steps';

describe('StepRecorder', () => {
  it('keeps going after a step throws and records it as fail', async () => {
    const r = new StepRecorder('t');
    await r.run('boom', async () => {
      throw new Error('nope');
    });
    const v = await r.run('ok', async () => ({ status: 'pass', detail: 'fine', value: 7 }));
    const rep = r.report();
    expect(v).toBe(7);
    expect(rep.steps.map((s) => [s.step, s.status])).toEqual([
      ['boom', 'fail'],
      ['ok', 'pass'],
    ]);
    expect(rep.steps[0]?.detail).toBe('threw: nope');
  });
});
