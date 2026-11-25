import { useState, type ReactNode } from 'react';
import type { FieldValue } from '../../../../src/domain/spec';
import { SourceBadge } from './Badge';

/**
 * A spec cell: shows the value and its source badge; yellow when TBD.
 * Click to edit. `parse` returns null to reject invalid input.
 */
export function EditableCell<T>(props: {
  field: FieldValue<T>;
  display: (v: T) => ReactNode;
  toText: (v: T) => string;
  parse: (text: string) => T | null;
  onSave: (v: T) => void;
  placeholder?: string;
  options?: { label: string; text: string }[];
}) {
  const { field, display, toText, parse, onSave, options } = props;
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState(false);

  const start = () => {
    setText(field.source === 'tbd' && field.value === null ? '' : toText(field.value));
    setError(false);
    setEditing(true);
  };
  const commit = (value = text) => {
    const v = parse(value);
    if (v === null) {
      setError(true);
      return;
    }
    onSave(v);
    setEditing(false);
  };

  const cls = `cell ${field.source === 'tbd' ? 'cell-tbd' : ''}`;
  if (editing) {
    return (
      <td className={cls}>
        {options ? (
          <select autoFocus value={text} onChange={(e) => commit(e.target.value)} onBlur={() => setEditing(false)}>
            <option value="" disabled>Choose…</option>
            {options.map((o) => <option key={o.text} value={o.text}>{o.label}</option>)}
          </select>
        ) : (
          <input
            autoFocus
            className={error ? 'input-error' : ''}
            value={text}
            placeholder={props.placeholder}
            onChange={(e) => { setText(e.target.value); setError(false); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') setEditing(false);
            }}
            onBlur={() => (parse(text) === null ? setEditing(false) : commit())}
            aria-invalid={error}
          />
        )}
      </td>
    );
  }
  return (
    <td className={cls}>
      <button type="button" className="cell-button" onClick={start} title="Click to edit">
        <span className="cell-value">{field.source === 'tbd' && field.value === null ? <em>TBD</em> : display(field.value)}</span>
        <SourceBadge source={field.source} evidence={field.evidence} />
      </button>
    </td>
  );
}
