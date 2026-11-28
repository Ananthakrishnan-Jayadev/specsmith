/** Confluence: Preview → Approve & publish, with per-row results. */
import { useEffect, useState } from 'react';
import { api, type FeedMeta, type Targets } from './api';
import { RunTable, runSummary } from './RunTable';
import { useDryRunFlow } from './useDryRunFlow';

export function PublishPanel(props: { feed: FeedMeta | null; revision: number; save: () => Promise<FeedMeta>; onRun: () => void }) {
  const { feed, revision, save, onRun } = props;
  const [spaces, setSpaces] = useState<Targets['spaces']>([]);
  const [spaceKey, setSpaceKey] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    api('listSpaces')
      .then((t) => {
        setSpaces(t.spaces);
        if (t.errors.length) setLoadError(t.errors.join('; '));
      })
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : String(e)));
  }, []);

  const locked = feed?.confluence?.parent ? feed.confluence.spaceKey : null;
  useEffect(() => {
    if (locked) setSpaceKey(locked);
    else setSpaceKey((k) => k || spaces[0]?.key || '');
  }, [locked, spaces]);

  const flow = useDryRunFlow({
    revision, target: spaceKey, save, onRun,
    run: (feedId, target, dryRun) => api('publishFeed', { feedId, spaceKey: target, dryRun }),
  });
  const failed = flow.preview?.run.counts.failed ?? 0;

  return (
    <section className="publish">
      <h2>1. Publish the spec to Confluence</h2>
      <div className="row">
        <label className="field">
          <span className="field-label">Space</span>
          <select value={spaceKey} onChange={(e) => setSpaceKey(e.target.value)} disabled={!!locked}>
            {spaces.map((s) => <option key={s.id} value={s.key}>{s.name} ({s.key})</option>)}
          </select>
        </label>
        <button type="button" className="button button-secondary" disabled={!spaceKey || flow.busy !== null} onClick={() => void flow.doPreview()}>
          {flow.busy === 'preview' ? 'Saving & previewing…' : 'Preview (dry run)'}
        </button>
        <button type="button" className="button" disabled={!flow.preview || flow.stale || flow.writes === 0 || flow.busy !== null} onClick={() => void flow.doApply()}>
          {flow.busy === 'apply' ? 'Publishing…' : `Approve & publish${flow.writes ? ` ${flow.writes} page${flow.writes > 1 ? 's' : ''}` : ''}`}
        </button>
      </div>
      {locked && <p className="muted">This feed is published to {locked}; it always publishes there.</p>}
      {(loadError || flow.error) && <p className="status-error">{flow.error ?? loadError}</p>}
      {flow.preview && (
        <div className="report">
          <p className={flow.stale ? 'warn-text' : 'muted'}>
            {flow.stale ? 'The spec changed after this preview. Preview again before publishing.' : `Dry run: ${runSummary(flow.preview.run)}. Nothing has been written yet.`}
            {failed > 0 && !flow.stale && ` ${failed} page(s) will be skipped because of the problems below.`}
          </p>
          <RunTable run={flow.preview.run} label="Page" />
        </div>
      )}
      {flow.result && (
        <div className="report">
          <p className={flow.result.counts.failed ? 'warn-text' : 'status-ok'}>Published: {runSummary(flow.result)}.</p>
          <RunTable run={flow.result} label="Page" />
        </div>
      )}
    </section>
  );
}
