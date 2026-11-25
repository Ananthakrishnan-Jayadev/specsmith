/**
 * Profiles + config → FileSpec. Pure and deterministic. Every value is
 * `derived` (with evidence) or `tbd`; nothing here is AI.
 */
import type { RulesConfig } from '../config';
import type { FileProfile } from '../domain/profile';
import type { ColumnSpec, FieldValue, FileSpec, LintFinding } from '../domain/spec';
import { dedupeNames, deriveTargetName, tableNameFromFile } from '../rules/naming';
import { inferNullable, inferType } from '../rules/types';
import { detectPrimaryKey } from '../rules/keys';
import { detectPii } from '../rules/pii';
import { finding, sortFindings } from '../rules/lint';

export function buildFileSpec(profile: FileProfile, cfg: RulesConfig): FileSpec {
  const findings: LintFinding[] = [];
  for (const w of profile.headerWarnings) findings.push(...finding(cfg.lint, 'header', null, w));

  const key = detectPrimaryKey(profile.columns);
  if (!key.primary) findings.push(...finding(cfg.lint, 'no-primary-key', null, `No primary key candidate: ${key.evidence}.`));

  const names = profile.columns.map((c) => deriveTargetName(c.name, cfg.naming));
  const deduped = dedupeNames(names.map((n) => n.targetName));
  for (const c of deduped.collisions) findings.push(...finding(cfg.lint, 'name-collision', null, `Several columns map to "${c}"; later ones were suffixed.`));

  const columns: ColumnSpec[] = profile.columns.map((p, i) => {
    const name = names[i] as (typeof names)[number];
    for (const issue of name.issues) findings.push(...finding(cfg.lint, issue.ruleId, p.name, issue.message));

    const type = inferType(p, cfg.types);
    if (type.field.value === null) findings.push(...finding(cfg.lint, 'all-null', p.name, 'Every value is empty; type cannot be inferred.'));
    if (type.ambiguousDate) findings.push(...finding(cfg.lint, 'ambiguous-date-format', p.name, 'Dates could be DD/MM or MM/DD; confirm the format.'));
    if (type.mixed) findings.push(...finding(cfg.lint, 'mixed-types', p.name, `Mixed values: ${type.mixed}. Typed as text.`));
    if (p.signals.untrimmed > 0) findings.push(...finding(cfg.lint, 'untrimmed-values', p.name, `${p.signals.untrimmed} values have leading/trailing spaces.`));
    if (p.distinctCount === 1 && p.rowCount > 1) findings.push(...finding(cfg.lint, 'constant-column', p.name, 'Every value is the same.'));

    const isKey = key.primary === p.name;
    const nullable: FieldValue<boolean | null> = isKey
      ? { value: false, source: 'derived', evidence: 'primary key' }
      : inferNullable(p);
    const pii = detectPii(p, cfg.pii);
    if (pii.value && pii.value.classification !== 'NONE') {
      findings.push(...finding(cfg.lint, 'pii-review', p.name, `${pii.value.classification} (${pii.value.category ?? 'unspecified'}); confirm classification and masking.`));
    }

    return {
      sourceName: p.name,
      position: p.position,
      targetName: { value: deduped.names[i] as string, source: 'derived', evidence: name.evidence },
      type: type.field,
      nullable,
      primaryKey: isKey
        ? { value: true, source: 'derived', evidence: key.evidence }
        : { value: false, source: 'derived', evidence: key.primary ? `primary key is ${key.primary}` : 'no key candidate' },
      pii,
      description: { value: null, source: 'tbd', evidence: 'needs a business description' },
      profile: p,
    };
  });

  return {
    fileName: profile.fileName,
    tableName: { value: tableNameFromFile(profile.fileName, cfg.naming), source: 'derived', evidence: 'from file name' },
    rowCount: profile.rowCount,
    columns,
    findings: sortFindings(findings),
  };
}

/** Fields a reviewer still has to fill or confirm (tbd), per column. */
export function tbdFields(c: ColumnSpec): string[] {
  const fields: [string, FieldValue<unknown>][] = [
    ['targetName', c.targetName], ['type', c.type], ['nullable', c.nullable], ['primaryKey', c.primaryKey], ['pii', c.pii], ['description', c.description],
  ];
  return fields.filter(([, f]) => f.source === 'tbd').map(([k]) => k);
}
