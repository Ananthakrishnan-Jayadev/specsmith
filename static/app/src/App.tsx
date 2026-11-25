import { useCallback, useEffect, useState } from 'react';
import { getAppInfo, type AppInfo } from './api';
import { Spikes } from './Spikes';
import { Workspace } from './Workspace';

type State =
  | { kind: 'loading' }
  | { kind: 'ok'; info: AppInfo; roundTripMs: number }
  | { kind: 'error'; message: string };

function Connection() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const check = useCallback(async () => {
    setState({ kind: 'loading' });
    const started = performance.now();
    try {
      const info = await getAppInfo();
      setState({ kind: 'ok', info, roundTripMs: Math.round(performance.now() - started) });
    } catch (err) {
      setState({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }, []);
  useEffect(() => {
    void check();
  }, [check]);

  return (
    <section className="card" aria-live="polite">
      <h2>Backend connection</h2>
      {state.kind === 'loading' && <p className="muted">Checking…</p>}
      {state.kind === 'error' && <p className="status status-error">Failed: {state.message}</p>}
      {state.kind === 'ok' && (
        <dl className="facts">
          <dt>Status</dt>
          <dd className="status status-ok">Connected ({state.roundTripMs} ms)</dd>
          <dt>Version</dt>
          <dd>{state.info.version}</dd>
          <dt>Site</dt>
          <dd>{state.info.siteUrl ?? 'unknown'}</dd>
        </dl>
      )}
      <button type="button" className="button" onClick={() => void check()} disabled={state.kind === 'loading'}>
        Check again
      </button>
    </section>
  );
}

export function App() {
  return (
    <main className="page">
      <header className="header">
        <h1>SpecSmith</h1>
        <p className="tagline">AI drafts, rules decide, humans approve.</p>
      </header>

      <Workspace />

      <details className="dev">
        <summary>Developer: platform checks</summary>
        <Connection />
        <Spikes />
      </details>
    </main>
  );
}
