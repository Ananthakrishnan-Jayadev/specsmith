import type { SpikeReport, SpikeStep, StepStatus } from '../shared/api';

export interface StepOutcome<T> {
  status: StepStatus;
  detail: string;
  value?: T;
}

/**
 * Collects spike steps. Each step is isolated: an exception becomes a
 * `fail` row and later steps still run (per-row tolerance).
 */
export class StepRecorder {
  readonly steps: SpikeStep[] = [];
  readonly links: { label: string; url: string }[] = [];
  private readonly started = Date.now();

  constructor(private readonly spike: string) {}

  async run<T>(step: string, fn: () => Promise<StepOutcome<T>>): Promise<T | undefined> {
    const t0 = Date.now();
    try {
      const out = await fn();
      this.steps.push({ step, status: out.status, detail: out.detail, ms: Date.now() - t0 });
      return out.value;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.steps.push({ step, status: 'fail', detail: `threw: ${msg}`, ms: Date.now() - t0 });
      return undefined;
    }
  }

  skip(step: string, detail: string): void {
    this.steps.push({ step, status: 'skip', detail, ms: 0 });
  }

  report(): SpikeReport {
    return {
      spike: this.spike,
      startedAt: new Date(this.started).toISOString(),
      totalMs: Date.now() - this.started,
      steps: this.steps,
      links: this.links,
    };
  }
}
