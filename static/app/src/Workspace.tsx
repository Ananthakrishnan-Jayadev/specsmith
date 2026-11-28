import { useCallback, useEffect, useState, type DragEvent } from 'react';
import type { FileSpec } from '../../../src/domain/spec';
import { defaultConfig } from '../../../src/config';
import { buildFileSpec } from '../../../src/spec/build';
import { specStats } from '../../../src/spec/edit';
import { mergeFileSpec } from '../../../src/spec/merge';
import { sanitizeForUpload } from '../../../src/spec/sanitize';
import { api, type FeedMeta } from './api';
import { runProfile, type ProfileMode } from './profiling/runProfile';
import { SpecGrid } from './spec/SpecGrid';
import { PublishPanel } from './PublishPanel';
import { StoriesPanel } from './StoriesPanel';
import { RunHistory } from './RunHistory';

/** Frontend invoke payload limit is 500 KB (Forge docs); keep headroom. */
const MAX_SPEC_CHARS = 450_000;

interface FileState {
  name: string;
  status: 'profiling' | 'done' | 'error';
  rows: number;
  mode?: ProfileMode;
  ms?: number;
  error?: string;
}

export function Workspace() {
  const [feedName, setFeedName] = useState('Retail Accounts');
  const [feed, setFeed] = useState<FeedMeta | null>(null);
  const [savedFeeds, setSavedFeeds] = useState<FeedMeta[]>([]);
  const [files, setFiles] = useState<FileState[]>([]);
  const [specs, setSpecsRaw] = useState<FileSpec[]>([]);
  const [revision, setRevision] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [runsVersion, setRunsVersion] = useState(0);

  /** Every spec change bumps the revision, which invalidates an earlier preview. */
  const setSpecs = useCallback((fn: (ss: FileSpec[]) => FileSpec[]) => {
    setSpecsRaw(fn);
    setRevision((r) => r + 1);
  }, []);

  useEffect(() => {
    api('listFeeds').then(setSavedFeeds).catch(() => undefined);
  }, [feed?.feedId]);

  const openFeed = async (feedId: string) => {
    setLoadError(null);
    try {
      const { meta, files: loaded } = await api('getFeed', { feedId });
      setFeed(meta);
      setFeedName(meta.name);
      setFiles([]);
      setSpecs(() => loaded.sort((a, b) => a.fileName.localeCompare(b.fileName)));
      setActive(loaded[0]?.fileName ?? null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  };

  /** After a run, reload feed metadata (published links, locked space/project). */
  const afterRun = () => {
    setRunsVersion((v) => v + 1);
    api('listFeeds')
      .then((all) => {
        setSavedFeeds(all);
        setFeed((f) => (f ? (all.find((x) => x.feedId === f.feedId) ?? f) : f));
      })
      .catch(() => undefined);
  };

  const save = async (): Promise<FeedMeta> => {
    const clean = specs.map(sanitizeForUpload);
    const tooBig = clean.find((s) => JSON.stringify(s).length > MAX_SPEC_CHARS);
    if (tooBig) throw new Error(`${tooBig.fileName} is too large to save in one request (over ${MAX_SPEC_CHARS.toLocaleString()} characters).`);
    const meta = await api('saveFeed', { feedId: feed?.feedId ?? null, name: feedName, fileNames: clean.map((s) => s.fileName) });
    for (const spec of clean) await api('saveFile', { feedId: meta.feedId, spec });
    setFeed(meta);
    return meta;
  };
  const [active, setActive] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const patchFile = (name: string, patch: Partial<FileState>) => setFiles((fs) => fs.map((f) => (f.name === name ? { ...f, ...patch } : f)));

  const addFiles = async (list: FileList | File[]) => {
    const csvs = [...list].filter((f) => /\.(csv|txt)$/i.test(f.name) || f.type === 'text/csv');
    if (csvs.length === 0) return;
    setFiles((fs) => [...fs.filter((f) => !csvs.some((c) => c.name === f.name)), ...csvs.map((c) => ({ name: c.name, status: 'profiling' as const, rows: 0 }))]);
    await Promise.all(
      csvs.map(async (file) => {
        const t0 = performance.now();
        try {
          const { profile, mode } = await runProfile(file, (rows) => patchFile(file.name, { rows }));
          const fresh = buildFileSpec(profile, defaultConfig);
          // Re-uploading a file keeps reviewer edits (precedence: user > derived).
          setSpecs((ss) => {
            const old = ss.find((s) => s.fileName === file.name);
            const spec = old ? mergeFileSpec(old, fresh) : fresh;
            return [...ss.filter((s) => s.fileName !== file.name), spec].sort((a, b) => a.fileName.localeCompare(b.fileName));
          });
          setActive((a) => a ?? file.name);
          patchFile(file.name, { status: 'done', rows: profile.rowCount, mode, ms: Math.round(performance.now() - t0) });
        } catch (err) {
          patchFile(file.name, { status: 'error', error: err instanceof Error ? err.message : String(err) });
        }
      }),
    );
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void addFiles(e.dataTransfer.files);
  };

  const current = specs.find((s) => s.fileName === active) ?? specs[0];

  return (
    <section className="card">
      <div className="feed-header">
        <label className="field">
          <span className="field-label">Feed name</span>
          <input value={feedName} onChange={(e) => { setFeedName(e.target.value); setRevision((r) => r + 1); }} />
        </label>
        {savedFeeds.length > 0 && (
          <label className="field">
            <span className="field-label">Open a saved feed</span>
            <select value={feed?.feedId ?? ''} onChange={(e) => e.target.value && void openFeed(e.target.value)}>
              <option value="">{feed ? 'Unsaved changes' : 'Choose…'}</option>
              {savedFeeds.map((f) => <option key={f.feedId} value={f.feedId}>{f.name} ({f.files.length} files)</option>)}
            </select>
          </label>
        )}
        {feed && <span className="muted saved-note">Saved as {feed.feedId}{feed.confluence ? ` · published to ${feed.confluence.spaceKey}` : ''}</span>}
      </div>
      {loadError && <p className="status-error">{loadError}</p>}

      <div
        className={`dropzone ${dragging ? 'dropzone-on' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <p><strong>Drop CSV extracts here</strong> or</p>
        <label className="button">
          Choose files
          <input type="file" accept=".csv,text/csv" multiple hidden onChange={(e) => e.target.files && void addFiles(e.target.files)} />
        </label>
        <p className="muted">Files are profiled in your browser. Raw data is never uploaded.</p>
      </div>

      {files.length > 0 && (
        <ul className="file-status">
          {files.map((f) => (
            <li key={f.name}>
              <span className="mono">{f.name}</span>{' '}
              {f.status === 'profiling' && <span className="muted">profiling… {f.rows.toLocaleString()} rows</span>}
              {f.status === 'done' && <span className="muted">{f.rows.toLocaleString()} rows · {f.ms} ms · {f.mode === 'worker' ? 'background thread' : 'main thread'}</span>}
              {f.status === 'error' && <span className="status-error">{f.error}</span>}
            </li>
          ))}
        </ul>
      )}

      {specs.length > 0 && current && (
        <>
          <div className="tabs" role="tablist">
            {specs.map((s) => {
              const st = specStats(s);
              return (
                <button key={s.fileName} role="tab" aria-selected={s.fileName === current.fileName}
                  className={`tab ${s.fileName === current.fileName ? 'tab-on' : ''}`} onClick={() => setActive(s.fileName)}>
                  <span className="mono">{s.tableName.value}</span>
                  <span className="tab-stats">
                    {st.columns} cols · <span className={st.tbd ? 'warn-text' : ''}>{st.tbd} TBD</span>
                    {st.pii + st.pci > 0 && ` · ${st.pii + st.pci} sensitive`}
                    {st.errors > 0 && <span className="status-error"> · {st.errors} errors</span>}
                  </span>
                </button>
              );
            })}
          </div>
          <SpecGrid spec={current} onChange={(next) => setSpecs((ss) => ss.map((s) => (s.fileName === next.fileName ? next : s)))} />
          <PublishPanel feed={feed} revision={revision} save={save} onRun={afterRun} />
          <StoriesPanel feed={feed} revision={revision} save={save} onRun={afterRun} />
          <RunHistory feedId={feed?.feedId ?? null} version={runsVersion} />
        </>
      )}
    </section>
  );
}
