/**
 * Shared Preview → Approve flow. Approve is only allowed for a preview of the
 * current spec revision and the same target (space/project).
 */
import { useState } from 'react';
import type { FeedMeta, RunRecord } from './api';

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function useDryRunFlow(opts: {
  revision: number;
  target: string;
  save: () => Promise<FeedMeta>;
  run: (feedId: string, target: string, dryRun: boolean) => Promise<RunRecord>;
  onRun: () => void;
}) {
  const [busy, setBusy] = useState<'preview' | 'apply' | null>(null);
  const [preview, setPreview] = useState<{ run: RunRecord; revision: number; target: string; feedId: string } | null>(null);
  const [result, setResult] = useState<RunRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  const doPreview = async () => {
    setBusy('preview');
    setError(null);
    setResult(null);
    try {
      const saved = await opts.save();
      const run = await opts.run(saved.feedId, opts.target, true);
      setPreview({ run, revision: opts.revision, target: opts.target, feedId: saved.feedId });
      opts.onRun();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(null);
    }
  };

  const doApply = async () => {
    if (!preview) return;
    setBusy('apply');
    setError(null);
    try {
      setResult(await opts.run(preview.feedId, preview.target, false));
      setPreview(null);
      opts.onRun();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(null);
    }
  };

  const stale = preview !== null && (preview.revision !== opts.revision || preview.target !== opts.target);
  const writes = preview ? preview.run.rows.filter((r) => r.status === 'dry-run').length : 0;
  return { busy, preview, result, error, setError, stale, writes, doPreview, doApply };
}
