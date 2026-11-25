import { useState, type DragEvent } from 'react';
import type { FileSpec } from '../../../src/domain/spec';
import { defaultConfig } from '../../../src/config';
import { buildFileSpec } from '../../../src/spec/build';
import { specStats } from '../../../src/spec/edit';
import { runProfile, type ProfileMode } from './profiling/runProfile';
import { SpecGrid } from './spec/SpecGrid';

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
  const [files, setFiles] = useState<FileState[]>([]);
  const [specs, setSpecs] = useState<FileSpec[]>([]);
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
          const spec = buildFileSpec(profile, defaultConfig);
          setSpecs((ss) => [...ss.filter((s) => s.fileName !== file.name), spec].sort((a, b) => a.fileName.localeCompare(b.fileName)));
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
          <input value={feedName} onChange={(e) => setFeedName(e.target.value)} />
        </label>
      </div>

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
        </>
      )}
    </section>
  );
}
