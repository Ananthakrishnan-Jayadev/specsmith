import type { PiiConfig, PiiRule } from '../config';
import type { ColumnProfile } from '../domain/profile';
import type { FieldValue, PiiSpec } from '../domain/spec';
import { toSnakeCase } from './naming';
import { shapeOf } from '../profile/values';

/** True when `keyword` (snake_case, may contain _) appears as whole tokens in `name`. */
export function keywordMatches(name: string, keyword: string): boolean {
  const n = `_${toSnakeCase(name)}_`;
  return n.includes(`_${keyword}_`);
}

interface Hit {
  rule: PiiRule;
  keyword: string | null;
  signalShare: number | null;
  score: number;
}

/**
 * Rule-based PII/PCI hint. Returns `derived` when a keyword or content signal
 * matches, otherwise `tbd` (rules never claim NONE; that needs a human or the
 * PII Classifier agent, and is always reviewed).
 */
export function detectPii(p: ColumnProfile, cfg: PiiConfig): FieldValue<PiiSpec | null> {
  const nonNull = p.rowCount - p.nullCount;
  const hits: Hit[] = [];
  for (const rule of cfg.rules) {
    const keyword = rule.keywords.find((k) => keywordMatches(p.name, k)) ?? null;
    const signalShare = rule.signal && nonNull > 0 ? p.signals[rule.signal] / nonNull : null;
    const signalHit = signalShare !== null && signalShare >= (rule.minShare ?? 1);
    if (!keyword && !signalHit) continue;
    const score = (keyword ? 1 : 0) + (signalHit ? 2 : 0) + (rule.classification === 'PCI' ? 0.5 : 0);
    hits.push({ rule, keyword, signalShare: signalHit ? signalShare : null, score });
  }
  if (hits.length === 0) return { value: null, source: 'tbd', evidence: 'no PII keyword or content signal matched' };
  hits.sort((a, b) => b.score - a.score);
  const best = hits[0] as Hit;
  const parts: string[] = [];
  if (best.keyword) parts.push(`name contains "${best.keyword}"`);
  if (best.signalShare !== null && best.rule.signal) parts.push(`${(best.signalShare * 100).toFixed(1)}% of values match ${best.rule.signal} pattern`);
  return {
    value: { classification: best.rule.classification, category: best.rule.category },
    source: 'derived',
    evidence: `rule ${best.rule.category}: ${parts.join('; ')}`,
  };
}

/** Replaces sample values with their shapes when the column is (or may be) sensitive. */
export function maskSamples(samples: string[], pii: PiiSpec | null): string[] {
  if (!pii || pii.classification === 'NONE') return samples;
  return samples.map((s) => (s.startsWith('‹') ? s : `‹${shapeOf(s)}›`)); // idempotent
}
