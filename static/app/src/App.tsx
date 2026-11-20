import { useCallback, useEffect, useState } from 'react';
import { getAppInfo, type AppInfo } from './api';
import { Spikes } from './Spikes';

type State =
  | { kind: 'loading' }
  | { kind: 'ok'; info: AppInfo; roundTripMs: number }
  | { kind: 'error'; message: string };

export function App() {
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
    <main className="page">
      <header className="header">
        <h1>SpecSmith</h1>
        <p className="tagline">AI drafts, rules decide, humans approve.</p>
      </header>

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
            <dt>Server time</dt>
            <dd>{state.info.serverTime}</dd>
            <dt>Your account</dt>
            <dd>{state.info.accountId ?? 'unknown'}</dd>
            <dt>Site (cloud ID)</dt>
            <dd>{state.info.cloudId ?? 'unknown'}</dd>
            <dt>Module</dt>
            <dd>{state.info.moduleKey ?? 'unknown'}</dd>
          </dl>
        )}
        <button type="button" className="button" onClick={() => void check()} disabled={state.kind === 'loading'}>
          Check again
        </button>
      </section>

      <Spikes />
    </main>
  );
}
