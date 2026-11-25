import { useMemo, useState } from 'react';
import type { ColumnSpec, FileSpec, PiiSpec } from '../../../../src/domain/spec';
import { editField, formatType, parseType, setPrimaryKey } from '../../../../src/spec/edit';
import { maskSamples } from '../../../../src/rules/pii';
import { EditableCell } from './EditableCell';
import { SourceBadge } from './Badge';

type Filter = 'all' | 'tbd' | 'pii' | 'findings';

const yesNo = [
  { label: 'Yes', text: 'yes' },
  { label: 'No', text: 'no' },
];
const parseYesNo = (t: string) => (t === 'yes' ? true : t === 'no' ? false : null);

const piiOptions = [
  { label: 'PII (personal data)', text: 'PII' },
  { label: 'PCI (payment card data)', text: 'PCI' },
  { label: 'None', text: 'NONE' },
];

function parsePii(text: string, current: PiiSpec | null): PiiSpec | null {
  if (text !== 'PII' && text !== 'PCI' && text !== 'NONE') return null;
  // Keep the category only when the classification is unchanged.
  return current?.classification === text && current.category ? { classification: text, category: current.category } : { classification: text };
}

function PiiLabel({ pii }: { pii: PiiSpec | null }) {
  if (!pii) return <em>TBD</em>;
  const cls = pii.classification === 'PCI' ? 'loz loz-pci' : pii.classification === 'PII' ? 'loz loz-pii' : 'loz';
  return <span className={cls}>{pii.classification}{pii.category ? ` · ${pii.category.replace(/_/g, ' ')}` : ''}</span>;
}

function ProfileSummary({ c }: { c: ColumnSpec }) {
  const p = c.profile;
  const nullPct = p.rowCount ? Math.round((p.nullCount / p.rowCount) * 100) : 0;
  const samples = maskSamples(p.samples, c.pii.value).slice(0, 3);
  const top = p.topPatterns[0]?.pattern;
  return (
    <td className="profile">
      <span>{nullPct}% empty · {p.distinctCapped ? '≥' : ''}{p.distinctCount.toLocaleString()} distinct</span>
      {top && <span className="mono">{top}</span>}
      {samples.length > 0 && <span className="samples">{samples.join(', ')}</span>}
    </td>
  );
}

export function SpecGrid({ spec, onChange }: { spec: FileSpec; onChange: (s: FileSpec) => void }) {
  const [filter, setFilter] = useState<Filter>('all');
  const withFindings = useMemo(() => new Set(spec.findings.map((f) => f.column).filter(Boolean)), [spec.findings]);

  const visible = spec.columns.filter((c) => {
    if (filter === 'tbd') return [c.targetName, c.type, c.nullable, c.pii, c.description].some((f) => f.source === 'tbd');
    if (filter === 'pii') return c.pii.value?.classification === 'PII' || c.pii.value?.classification === 'PCI';
    if (filter === 'findings') return withFindings.has(c.sourceName);
    return true;
  });

  const edit = (c: ColumnSpec) => ({
    targetName: (v: string) => onChange(editField(spec, c.sourceName, 'targetName', v)),
    type: (v: ReturnType<typeof parseType>) => onChange(editField(spec, c.sourceName, 'type', v)),
    nullable: (v: boolean | null) => onChange(editField(spec, c.sourceName, 'nullable', v)),
    pii: (v: PiiSpec | null) => onChange(editField(spec, c.sourceName, 'pii', v)),
    description: (v: string | null) => onChange(editField(spec, c.sourceName, 'description', v)),
  });

  return (
    <div>
      <div className="toolbar" role="group" aria-label="Filter columns">
        {(['all', 'tbd', 'pii', 'findings'] as const).map((f) => (
          <button key={f} type="button" className={`chip ${filter === f ? 'chip-on' : ''}`} onClick={() => setFilter(f)}>
            {f === 'all' ? `All (${spec.columns.length})` : f === 'tbd' ? 'Needs input' : f === 'pii' ? 'PII / PCI' : 'Has findings'}
          </button>
        ))}
        <span className="muted legend">Click a cell to edit. Hover a badge for its evidence. Yellow = not yet decided.</span>
      </div>
      <div className="grid-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th>#</th><th>Source column</th><th>Target name</th><th>Type</th><th>Nullable</th><th>Key</th><th>Classification</th><th>Description</th><th>Profile</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((c) => {
              const e = edit(c);
              return (
                <tr key={c.sourceName}>
                  <td className="num">{c.position + 1}</td>
                  <td className="mono">{c.sourceName}{withFindings.has(c.sourceName) && <span className="dot" title="Has lint findings" />}</td>
                  <EditableCell field={c.targetName} display={(v) => <span className="mono">{v}</span>} toText={(v) => v}
                    parse={(t) => (/^[a-z][a-z0-9_]*$/.test(t.trim()) ? t.trim() : null)} placeholder="snake_case" onSave={e.targetName} />
                  <EditableCell field={c.type} display={(v) => <span className="mono">{formatType(v)}</span>} toText={(v) => formatType(v)}
                    parse={parseType} placeholder="e.g. string(20), decimal(10,2)" onSave={e.type} />
                  <EditableCell field={c.nullable} display={(v) => (v === null ? 'TBD' : v ? 'Yes' : 'No')} toText={(v) => (v === null ? '' : v ? 'yes' : 'no')}
                    parse={parseYesNo} options={yesNo} onSave={e.nullable} />
                  <td className="cell">
                    <label className="key-toggle" title={c.primaryKey.evidence}>
                      <input type="radio" name={`pk-${spec.fileName}`} checked={c.primaryKey.value} onChange={() => onChange(setPrimaryKey(spec, c.sourceName))} />
                      {c.primaryKey.value && <SourceBadge source={c.primaryKey.source} evidence={c.primaryKey.evidence} />}
                    </label>
                  </td>
                  <EditableCell field={c.pii} display={(v) => <PiiLabel pii={v} />} toText={(v) => v?.classification ?? ''}
                    parse={(t) => parsePii(t, c.pii.value)}
                    options={piiOptions} onSave={e.pii} />
                  <EditableCell field={c.description} display={(v) => v} toText={(v) => v ?? ''}
                    parse={(t) => (t.trim().length > 0 && t.trim().length <= 500 ? t.trim() : null)} placeholder="Business description" onSave={e.description} />
                  <ProfileSummary c={c} />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {spec.findings.length > 0 && (
        <details className="findings" open={spec.findings.some((f) => f.severity === 'error')}>
          <summary>Findings ({spec.findings.length})</summary>
          <ul>
            {spec.findings.map((f, i) => (
              <li key={i}>
                <span className={`sev sev-${f.severity}`}>{f.severity}</span>
                {f.column && <span className="mono"> {f.column}</span>}: {f.message}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
