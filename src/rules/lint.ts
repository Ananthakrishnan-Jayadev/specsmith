import type { LintConfig, LintRuleId } from '../config';
import type { LintFinding } from '../domain/spec';

/** Applies configured severity (or drops the finding when the rule is off). */
export function finding(cfg: LintConfig, ruleId: LintRuleId, column: string | null, message: string): LintFinding[] {
  const severity = cfg.rules[ruleId];
  return severity === 'off' ? [] : [{ ruleId, severity, column, message }];
}

const ORDER = { error: 0, warning: 1, info: 2 } as const;

export function sortFindings(fs: LintFinding[]): LintFinding[] {
  return [...fs].sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || (a.column ?? '').localeCompare(b.column ?? ''));
}
