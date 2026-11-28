import { useEffect, useState } from 'react';
import { api, type RunRecord } from './api';
import { RunTable, runKindLabel, runSummary } from './RunTable';

export function RunHistory({ feedId, version }: { feedId: string | null; version: number }) {
  const [runs, setRuns] = useState<RunRecord[]>([]);
  useEffect(() => {
    if (feedId) api('listRuns', { feedId }).then(setRuns).catch(() => undefined);
  }, [feedId, version]);
  if (runs.length === 0) return null;
  return (
    <details className="runs">
      <summary>Run history ({runs.length})</summary>
      <ul>
        {runs.map((r) => (
          <li key={r.runId}>
            <details>
              <summary>{new Date(r.startedAt).toLocaleString()} · {runKindLabel(r)} · {r.dryRun ? 'preview' : 'applied'} · {runSummary(r)}</summary>
              <RunTable run={r} />
            </details>
          </li>
        ))}
      </ul>
    </details>
  );
}
