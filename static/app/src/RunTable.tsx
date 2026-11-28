import type { RunRecord } from './api';

export function RunTable({ run, label = 'Target' }: { run: RunRecord; label?: string }) {
  return (
    <table className="rows">
      <thead>
        <tr><th>{label}</th><th>Action</th><th>Result</th><th>Details</th></tr>
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

export const runSummary = (run: RunRecord) =>
  Object.entries(run.counts).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`).join(' · ');

export const runKindLabel = (run: RunRecord) => (run.kind === 'plan-stories' ? 'Jira stories' : 'Confluence spec');
