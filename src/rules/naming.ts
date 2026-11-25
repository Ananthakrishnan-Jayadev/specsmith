import type { NamingConfig } from '../config';

/** "CustID", "cust-id", " Cust ID " → "cust_id". */
export function toSnakeCase(name: string): string {
  return name
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

export function tokens(name: string): string[] {
  return toSnakeCase(name).split('_').filter(Boolean);
}

export interface NameResult {
  targetName: string;
  evidence: string;
  issues: { ruleId: 'reserved-word' | 'name-too-long' | 'unclear-name'; message: string }[];
}

export function deriveTargetName(source: string, cfg: NamingConfig): NameResult {
  const snake = toSnakeCase(source) || 'unnamed';
  const parts = snake.split('_');
  const expanded = cfg.expandAbbreviations ? parts.map((p) => cfg.abbreviations[p] ?? p) : parts;
  let target = expanded.join('_');
  if (/^\d/.test(target)) target = `c_${target}`;
  const changes: string[] = [];
  if (snake !== source) changes.push('snake_case');
  if (cfg.expandAbbreviations && expanded.some((p, i) => p !== parts[i])) changes.push('abbreviations expanded');
  const issues: NameResult['issues'] = [];
  if (cfg.reservedWords.includes(target)) issues.push({ ruleId: 'reserved-word', message: `"${target}" is a reserved word.` });
  if (target.length > cfg.maxLength) issues.push({ ruleId: 'name-too-long', message: `"${target}" exceeds ${cfg.maxLength} characters.` });
  if (cfg.unclearNamePatterns.some((p) => new RegExp(p, 'i').test(snake))) {
    issues.push({ ruleId: 'unclear-name', message: `"${source}" does not describe its content; needs a meaningful name and description.` });
  }
  return { targetName: target, evidence: changes.length ? `naming rules: ${changes.join(', ')}` : 'already matches naming rules', issues };
}

/** Table name from a file name: "Customers_2026.csv" → "customers_2026". */
export function tableNameFromFile(fileName: string, cfg: NamingConfig): string {
  return deriveTargetName(fileName.replace(/\.[^.]+$/, ''), { ...cfg, expandAbbreviations: false }).targetName;
}

/** Makes target names unique within a table: second "x" becomes "x_2". */
export function dedupeNames(names: string[]): { names: string[]; collisions: string[] } {
  const seen = new Map<string, number>();
  const collisions: string[] = [];
  const out = names.map((n) => {
    const count = (seen.get(n) ?? 0) + 1;
    seen.set(n, count);
    if (count === 1) return n;
    collisions.push(n);
    return `${n}_${count}`;
  });
  return { names: out, collisions };
}
