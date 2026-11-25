import type { Source } from '../../../../src/rules/precedence';

const LABEL: Record<Source, string> = { user: 'you', config: 'config', reused: 'reused', derived: 'rule', ai: 'AI', tbd: 'TBD' };

export function SourceBadge({ source, evidence }: { source: Source; evidence?: string | undefined }) {
  return (
    <span className={`badge src-${source}`} title={evidence ? `${LABEL[source]}: ${evidence}` : LABEL[source]}>
      {LABEL[source]}
    </span>
  );
}
