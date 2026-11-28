/** Detected foreign keys with accept/reject, plus a live ER diagram preview. */
import { useMemo } from 'react';
import type { FileSpec } from '../../../src/domain/spec';
import type { Relationship } from '../../../src/domain/relationship';
import { decideRelationship } from '../../../src/rules/relationships';
import { renderErd } from '../../../src/render/erd';
import { SourceBadge } from './spec/Badge';

export function RelationshipsPanel(props: { specs: FileSpec[]; relationships: Relationship[]; canDetect: boolean; onChange: (r: Relationship[]) => void }) {
  const { specs, relationships, canDetect, onChange } = props;
  // renderErd escapes every name it writes, so injecting its SVG is safe.
  const svg = useMemo(() => renderErd(specs, relationships), [specs, relationships]);
  const table = (file: string) => specs.find((s) => s.fileName === file)?.tableName.value ?? file;

  return (
    <section className="publish">
      <h2>Relationships</h2>
      {!canDetect && <p className="muted">Relationships are detected from the uploaded files. Re-upload the CSVs to detect again; saved decisions are kept.</p>}
      {relationships.length === 0 ? (
        <p className="muted">No relationships between files were found.</p>
      ) : (
        <table className="rows">
          <thead>
            <tr><th>From</th><th>To</th><th>Evidence</th><th>Status</th><th /></tr>
          </thead>
          <tbody>
            {relationships.map((r) => (
              <tr key={r.id} className={r.decision.value === 'rejected' ? 'row-muted' : ''}>
                <td className="mono">{table(r.fromFile)}.{r.fromColumn}</td>
                <td className="mono">{table(r.toFile)}.{r.toColumn}</td>
                <td className="detail">
                  <span className={`loz ${r.confidence === 'high' ? 'loz-ok' : ''}`}>{r.confidence}</span> {r.evidence}
                </td>
                <td>
                  {r.decision.value === 'proposed' ? 'Proposed' : r.decision.value === 'accepted' ? 'Confirmed' : 'Rejected'}{' '}
                  <SourceBadge source={r.decision.source} evidence={r.decision.evidence} />
                </td>
                <td className="actions">
                  <button type="button" className="chip" disabled={r.decision.value === 'accepted'} onClick={() => onChange(decideRelationship(relationships, r.id, 'accepted'))}>Confirm</button>
                  <button type="button" className="chip" disabled={r.decision.value === 'rejected'} onClick={() => onChange(decideRelationship(relationships, r.id, 'rejected'))}>Reject</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {specs.length > 0 && (
        <details className="erd" open>
          <summary>ER diagram (dashed = proposed, solid = confirmed)</summary>
          <div className="erd-canvas" dangerouslySetInnerHTML={{ __html: svg }} />
        </details>
      )}
    </section>
  );
}
