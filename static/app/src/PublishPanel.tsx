/**
 * Preview → Approve & publish, with per-row results and the run log.
 * "Approve" is only enabled for a preview of the current spec revision.
 */
import { useEffect, useState } from 'react';
import { api, type FeedMeta, type RunRecord, type Targets } from './api';

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

function RunTable({ run }: { run: RunRecord }) {
  return (
    <table className="rows">
      <thead>
        <tr><th>Page</th><th>Action</th><th>Result</th><th>Details</th></tr>
      </thead>
      <tbody>
        {run.rows.map((r, i) => (
          <tr key={i}>
            <td>{r.url ? <a href={r.url} target="_blank" rel="noreferrer" className="link">{r.target} ↗</a> : r.target}</td>
            <td>{r.action}</td>
            <td><span className={`pill pill-${r.status}`}>{r.status}</span></td>
            <td className="detail">{r.message}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const summary = (run: RunRecord) =>
  Object.entries(run.counts).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`).join(' · ');

export function PublishPanel(props: {
  feed: FeedMeta | null;
  revision: number;
  /** Saves the current specs; returns the saved feed. */
  save: () => Promise<FeedMeta>;
}) {
  const { feed, revision, save } = props;
  const [spaces, setSpaces] = useState<Targets['spaces']>([]);
  const [spaceKey, setSpaceKey] = useState('');
  const [busy, setBusy] = useState<'preview' | 'publish' | null>(null);
  const [preview, setPreview] = useState<{ run: RunRecord; revision: number; spaceKey: string } | null>(null);
  const [result, setResult] = useState<RunRecord | null>(null);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api('listSpaces')
      .then((t) => {
        setSpaces(t.spaces);
        if (t.errors.length) setError(t.errors.join('; '));
      })
      .catch((e) => setError(errText(e)));
  }, []);

  // A feed already published somewhere is locked to that space.
  const lockedSpace = feed?.confluence?.spaceKey ?? null;
  useEffect(() => {
    if (lockedSpace) setSpaceKey(lockedSpace);
    else setSpaceKey((k) => k || spaces[0]?.key || '');
  }, [lockedSpace, spaces]);

  const refreshRuns = (feedId: string) => api('listRuns', { feedId }).then(setRuns).catch(() => undefined);
  const feedId = feed?.feedId;
  useEffect(() => {
    if (feedId) api('listRuns', { feedId }).then(setRuns).catch(() => undefined);
  }, [feedId]);

  const doPreview = async () => {
    setBusy('preview');
    setError(null);
    setResult(null);
    try {
      const saved = await save();
      const run = await api('publishFeed', { feedId: saved.feedId, spaceKey, dryRun: true });
      setPreview({ run, revision, spaceKey });
      void refreshRuns(saved.feedId);
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(null);
    }
  };

  const doPublish = async () => {
    if (!feed || !preview) return;
    setBusy('publish');
    setError(null);
    try {
      const run = await api('publishFeed', { feedId: feed.feedId, spaceKey: preview.spaceKey, dryRun: false });
      setResult(run);
      setPreview(null);
      void refreshRuns(feed.feedId);
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(null);
    }
  };

  const stale = preview !== null && (preview.revision !== revision || preview.spaceKey !== spaceKey);
  const failed = preview?.run.counts.failed ?? 0;
  const writes = preview ? preview.run.rows.filter((r) => r.status === 'dry-run').length : 0;

  return (
    <section className="publish">
      <h2>Publish to Confluence</h2>
      <div className="row">
        <label className="field">
          <span className="field-label">Space</span>
          <select value={spaceKey} onChange={(e) => setSpaceKey(e.target.value)} disabled={!!lockedSpace}>
            {spaces.map((s) => <option key={s.id} value={s.key}>{s.name} ({s.key})</option>)}
          </select>
        </label>
        <button type="button" className="button button-secondary" disabled={!spaceKey || busy !== null} onClick={() => void doPreview()}>
          {busy === 'preview' ? 'Saving & previewing…' : 'Preview (dry run)'}
        </button>
        <button type="button" className="button" disabled={!preview || stale || writes === 0 || busy !== null} onClick={() => void doPublish()}>
          {busy === 'publish' ? 'Publishing…' : `Approve & publish${writes ? ` ${writes} page${writes > 1 ? 's' : ''}` : ''}`}
        </button>
      </div>
      {lockedSpace && <p className="muted">This feed is published to {lockedSpace}; it always publishes there.</p>}
      {error && <p className="status-error">{error}</p>}

      {preview && (
        <div className="report">
          <p className={stale ? 'warn-text' : 'muted'}>
            {stale ? 'The spec changed after this preview. Preview again before publishing.' : `Dry run: ${summary(preview.run)}. Nothing has been written yet.`}
            {failed > 0 && !stale && ` ${failed} page(s) will be skipped because of the problems below.`}
          </p>
          <RunTable run={preview.run} />
        </div>
      )}
      {result && (
        <div className="report">
          <p className={result.counts.failed ? 'warn-text' : 'status-ok'}>Published: {summary(result)}.</p>
          <RunTable run={result} />
        </div>
      )}

      {runs.length > 0 && (
        <details className="runs">
          <summary>Run history ({runs.length})</summary>
          <ul>
            {runs.map((r) => (
              <li key={r.runId}>
                <details>
                  <summary>
                    {new Date(r.startedAt).toLocaleString()} · {r.dryRun ? 'preview' : 'publish'} · {summary(r)}
                  </summary>
                  <RunTable run={r} />
                </details>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
