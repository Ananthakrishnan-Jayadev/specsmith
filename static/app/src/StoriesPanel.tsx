/** Jira: Preview → Approve the Epic + stories, with per-row results. */
import { useEffect, useState } from 'react';
import { api, type FeedMeta, type Targets } from './api';
import { RunTable, runSummary } from './RunTable';
import { useDryRunFlow } from './useDryRunFlow';

export function StoriesPanel(props: { feed: FeedMeta | null; revision: number; save: () => Promise<FeedMeta>; onRun: () => void }) {
  const { feed, revision, save, onRun } = props;
  const [projects, setProjects] = useState<Targets['projects']>([]);
  const [projectKey, setProjectKey] = useState('');

  useEffect(() => {
    api('listSpaces').then((t) => setProjects(t.projects)).catch(() => undefined);
  }, []);

  const locked = feed?.jira?.epic ? feed.jira.projectKey : null;
  useEffect(() => {
    if (locked) setProjectKey(locked);
    else setProjectKey((k) => k || projects[0]?.key || '');
  }, [locked, projects]);

  const flow = useDryRunFlow({
    revision, target: projectKey, save, onRun,
    run: (feedId, target, dryRun) => api('planFeedStories', { feedId, projectKey: target, dryRun }),
  });
  const specPublished = !!feed?.confluence?.parent;

  return (
    <section className="publish">
      <h2>2. Plan the delivery in Jira</h2>
      {!specPublished && <p className="muted">Tip: publish the spec first so every story links to it.</p>}
      <div className="row">
        <label className="field">
          <span className="field-label">Project</span>
          <select value={projectKey} onChange={(e) => setProjectKey(e.target.value)} disabled={!!locked}>
            {projects.map((p) => <option key={p.id} value={p.key}>{p.name} ({p.key})</option>)}
          </select>
        </label>
        <button type="button" className="button button-secondary" disabled={!projectKey || flow.busy !== null} onClick={() => void flow.doPreview()}>
          {flow.busy === 'preview' ? 'Saving & previewing…' : 'Preview stories (dry run)'}
        </button>
        <button type="button" className="button" disabled={!flow.preview || flow.stale || flow.writes === 0 || flow.busy !== null} onClick={() => void flow.doApply()}>
          {flow.busy === 'apply' ? 'Creating…' : `Approve & write${flow.writes ? ` ${flow.writes} issue${flow.writes > 1 ? 's' : ''}` : ''}`}
        </button>
      </div>
      {locked && <p className="muted">This feed's stories live in {locked}.</p>}
      {flow.error && <p className="status-error">{flow.error}</p>}
      {flow.preview && (
        <div className="report">
          <p className={flow.stale ? 'warn-text' : 'muted'}>
            {flow.stale ? 'The spec changed after this preview. Preview again.' : `Dry run: ${runSummary(flow.preview.run)}. Nothing has been written yet.`}
          </p>
          <RunTable run={flow.preview.run} label="Issue" />
        </div>
      )}
      {flow.result && (
        <div className="report">
          <p className={flow.result.counts.failed ? 'warn-text' : 'status-ok'}>Done: {runSummary(flow.result)}.</p>
          <RunTable run={flow.result} label="Issue" />
          {!flow.result.counts.failed && specPublished && (
            <p className="muted">Publish the spec again to add the Epic link to the Confluence parent page.</p>
          )}
        </div>
      )}
    </section>
  );
}
