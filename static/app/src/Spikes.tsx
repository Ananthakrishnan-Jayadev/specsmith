/**
 * Phase 0 spike panel. Throwaway UI that exercises platform capabilities
 * (S2, S4–S7) and shows per-step results. Removed once Week 1 lands.
 */
import { useEffect, useRef, useState } from 'react';
import { rovo } from '@forge/bridge';
import { api, type QueueStatus, type SpikeReport, type Targets } from './api';

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

function ReportView({ report }: { report: SpikeReport }) {
  return (
    <div className="report">
      <p className="muted">
        {report.spike}: {report.steps.filter((s) => s.status === 'pass').length}/{report.steps.length} passed in {report.totalMs} ms
      </p>
      <table className="rows">
        <thead>
          <tr><th>Step</th><th>Result</th><th>Detail</th><th>ms</th></tr>
        </thead>
        <tbody>
          {report.steps.map((s, i) => (
            <tr key={i}>
              <td>{s.step}</td>
              <td><span className={`pill pill-${s.status}`}>{s.status}</span></td>
              <td className="detail">{s.detail}</td>
              <td className="num">{s.ms}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {report.links.length > 0 && (
        <p>
          {report.links.map((l) => (
            <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="link">{l.label} ↗</a>
          ))}
        </p>
      )}
    </div>
  );
}

function useRunner() {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<SpikeReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<SpikeReport>) => {
    setBusy(true);
    setError(null);
    try {
      setReport(await fn());
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };
  return { busy, report, error, run };
}

export function Spikes() {
  const [targets, setTargets] = useState<Targets | null>(null);
  const [spaceKey, setSpaceKey] = useState('');
  const [projectKey, setProjectKey] = useState('');
  const [dryRun, setDryRun] = useState(true);
  const conf = useRunner();
  const jira = useRunner();
  const store = useRunner();

  useEffect(() => {
    api('listTargets')
      .then((t) => {
        setTargets(t);
        setSpaceKey((k) => k || t.spaces[0]?.key || '');
        setProjectKey((k) => k || t.projects[0]?.key || '');
      })
      .catch((e) => setTargets({ spaces: [], projects: [], errors: [errText(e)] }));
  }, []);

  const pageUrl = conf.report?.links[0]?.url ?? null;

  return (
    <section className="card">
      <h2>Phase 0 spikes</h2>
      {targets === null && <p className="muted">Loading spaces and projects…</p>}
      {targets?.errors.map((e) => <p key={e} className="status-error">{e}</p>)}

      <label className="toggle">
        <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} /> Dry run (no writes)
      </label>

      <div className="spike">
        <h3>S6 Confluence: page, yellow cells, version conflict, attachment, property</h3>
        <div className="row">
          <select value={spaceKey} onChange={(e) => setSpaceKey(e.target.value)} aria-label="Space">
            {targets?.spaces.map((s) => <option key={s.id} value={s.key}>{s.name} ({s.key})</option>)}
          </select>
          <button className="button" disabled={conf.busy || !spaceKey} onClick={() => void conf.run(() => api('spikeConfluence', { spaceKey, dryRun }))}>
            {conf.busy ? 'Running…' : dryRun ? 'Preview' : 'Run'}
          </button>
        </div>
        {conf.error && <p className="status-error">{conf.error}</p>}
        {conf.report && <ReportView report={conf.report} />}
      </div>

      <div className="spike">
        <h3>S7 Jira: epic, stories, link, remote link, transition</h3>
        <div className="row">
          <select value={projectKey} onChange={(e) => setProjectKey(e.target.value)} aria-label="Project">
            {targets?.projects.map((p) => <option key={p.id} value={p.key}>{p.name} ({p.key}, {p.style})</option>)}
          </select>
          <button className="button" disabled={jira.busy || !projectKey} onClick={() => void jira.run(() => api('spikeJira', { projectKey, dryRun, pageUrl }))}>
            {jira.busy ? 'Running…' : dryRun ? 'Preview' : 'Run'}
          </button>
        </div>
        {jira.error && <p className="status-error">{jira.error}</p>}
        {jira.report && <ReportView report={jira.report} />}
      </div>

      <div className="spike">
        <h3>S4 Storage: KVS round trip and value-size limit</h3>
        <button className="button" disabled={store.busy} onClick={() => void store.run(() => api('spikeStorage'))}>
          {store.busy ? 'Running…' : 'Run'}
        </button>
        {store.error && <p className="status-error">{store.error}</p>}
        {store.report && <ReportView report={store.report} />}
      </div>

      <QueueSpike />
      <RovoSpike />
    </section>
  );
}

function QueueSpike() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<QueueStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const timer = useRef<number | null>(null);
  const EVENTS = 10;
  const LONG = 70;

  useEffect(() => () => { if (timer.current) window.clearInterval(timer.current); }, []);

  const start = async () => {
    setError(null);
    setStatus(null);
    try {
      const { jobId: id } = await api('spikeQueueStart', { events: EVENTS, longSleepSeconds: LONG });
      setJobId(id);
      setStartedAt(Date.now());
      if (timer.current) window.clearInterval(timer.current);
      timer.current = window.setInterval(async () => {
        try {
          const s = await api('spikeQueueStatus', { jobId: id });
          setStatus(s);
          if (s.records.length >= EVENTS && timer.current) window.clearInterval(timer.current);
        } catch (e) {
          setError(errText(e));
        }
      }, 5000);
    } catch (e) {
      setError(errText(e));
    }
  };

  return (
    <div className="spike">
      <h3>S5 Queue: {EVENTS} events, event 0 sleeps {LONG}s (past the 55 s default)</h3>
      <button className="button" onClick={() => void start()}>Start job</button>
      {error && <p className="status-error">{error}</p>}
      {jobId && (
        <div className="report">
          <p className="muted">
            Job {jobId}. Elapsed {startedAt ? Math.round((Date.now() - startedAt) / 1000) : 0}s. Records {status?.records.length ?? 0}/{EVENTS}.
            {status?.stats && ` Stats: ${status.stats.success} ok, ${status.stats.inProgress} running, ${status.stats.failed} failed.`}
            {status?.error && ` (${status.error})`}
          </p>
          <ul className="records">
            {status?.records
              .slice()
              .sort((a, b) => a.eventIndex - b.eventIndex)
              .map((r) => (
                <li key={r.eventIndex}>#{r.eventIndex}: slept {r.sleptSeconds}s, done {r.finishedAt.slice(11, 19)} (arg keys: {r.argKeys})</li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function RovoSpike() {
  const [enabled, setEnabled] = useState<string>('checking…');
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    rovo.isEnabled().then((v) => setEnabled(String(v))).catch((e) => setEnabled(`error: ${errText(e)}`));
  }, []);

  const open = async () => {
    try {
      await rovo.open({ type: 'forge', agentKey: 'specsmith-ping-agent', agentName: 'SpecSmith Ping', prompt: 'ping from the SpecSmith page' });
      setResult('rovo.open resolved: check that the chat opened with the prompt filled in');
    } catch (e) {
      setResult(`rovo.open failed: ${errText(e)}`);
    }
  };

  return (
    <div className="spike">
      <h3>S2 Rovo: open the agent from the app</h3>
      <p className="muted">rovo.isEnabled() → {enabled}</p>
      <button className="button" onClick={() => void open()}>Open SpecSmith Ping in Rovo</button>
      {result && <p>{result}</p>}
    </div>
  );
}
