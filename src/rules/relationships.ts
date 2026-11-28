/**
 * Foreign-key detection across files from hashed distinct values (computed in
 * the browser; hashes never leave it). Rules only: a candidate needs
 *   - compatible types,
 *   - a target that is the other file's primary key with a complete hash set,
 *   - >= 98% of the from-column's values present in the target (90% with a name match).
 */
import type { ColumnSpec, FileSpec } from '../domain/spec';
import type { Relationship } from '../domain/relationship';
import { applyIfAllowed } from './precedence';

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
export const relationshipId = (fromFile: string, fromColumn: string, toFile: string, toColumn: string) =>
  `rel:${fromFile}:${fromColumn}->${toFile}:${toColumn}`;

function typeFamily(c: ColumnSpec): string | null {
  const t = c.type.value?.type;
  return t === 'integer' || t === 'decimal' ? 'number' : t === 'string' ? 'string' : null;
}

function completeHashes(c: ColumnSpec): boolean {
  const p = c.profile;
  return !p.distinctCapped && p.valueHashes.length > 0 && p.valueHashes.length === p.distinctCount;
}

export function detectRelationships(files: FileSpec[]): Relationship[] {
  const out: Relationship[] = [];
  for (const a of files) {
    for (const from of a.columns) {
      if (from.primaryKey.value || from.profile.valueHashes.length === 0) continue;
      const family = typeFamily(from);
      if (!family) continue;
      const fromSet = from.profile.valueHashes;
      let best: Relationship | null = null;
      for (const b of files) {
        if (b === a) continue;
        const to = b.columns.find((c) => c.primaryKey.value);
        if (!to || typeFamily(to) !== family || !completeHashes(to)) continue;
        const nameMatch = from.sourceName === to.sourceName || from.targetName.value === to.targetName.value;
        if (from.profile.distinctCount < 10 && !nameMatch) continue; // flags and codes overlap by accident
        const target = new Set(to.profile.valueHashes);
        const matched = fromSet.reduce((n, h) => n + (target.has(h) ? 1 : 0), 0);
        const overlap = matched / fromSet.length;
        const minOverlap = nameMatch ? 0.9 : 0.98;
        if (overlap < minOverlap) continue;
        const confidence: Relationship['confidence'] = overlap >= 0.98 && nameMatch ? 'high' : 'medium';
        const sampled = fromSet.length < from.profile.distinctCount ? ` (sample of ${fromSet.length.toLocaleString('en-US')})` : '';
        const evidence = `${pct(overlap)} of ${fromSet.length.toLocaleString('en-US')} distinct ${a.tableName.value}.${from.sourceName} values${sampled} exist in ${b.tableName.value}.${to.sourceName} (primary key, ${to.profile.distinctCount.toLocaleString('en-US')} values)${nameMatch ? '; same column name' : ''}`;
        const rel: Relationship = {
          id: relationshipId(a.fileName, from.sourceName, b.fileName, to.sourceName),
          fromFile: a.fileName, fromColumn: from.sourceName, toFile: b.fileName, toColumn: to.sourceName,
          overlap: Math.round(overlap * 10_000) / 10_000, fromDistinct: fromSet.length, confidence, evidence,
          decision: { value: 'proposed', source: 'derived', evidence: 'detected by value overlap' },
        };
        if (!best || rel.overlap > best.overlap || (rel.overlap === best.overlap && confidence === 'high')) best = rel;
      }
      if (best) out.push(best);
    }
  }
  return out.sort((x, y) => x.id.localeCompare(y.id));
}

/**
 * Merges fresh detection with stored relationships. Reviewer decisions survive
 * (precedence); user-accepted relationships are kept even if not re-detected;
 * relationships for files no longer in the feed are dropped.
 */
export function mergeRelationships(existing: Relationship[], fresh: Relationship[], fileNames: string[]): Relationship[] {
  const present = new Set(fileNames);
  const byId = new Map(existing.map((r) => [r.id, r]));
  const merged = fresh.map((f) => {
    const old = byId.get(f.id);
    if (!old) return f;
    const r = applyIfAllowed(old.decision, f.decision);
    return { ...f, decision: r.applied ? f.decision : old.decision };
  });
  const freshIds = new Set(fresh.map((f) => f.id));
  const keptUser = existing.filter((r) => !freshIds.has(r.id) && r.decision.source === 'user');
  return [...merged, ...keptUser].filter((r) => present.has(r.fromFile) && present.has(r.toFile)).sort((x, y) => x.id.localeCompare(y.id));
}

export function decideRelationship(rels: Relationship[], id: string, value: 'accepted' | 'rejected'): Relationship[] {
  return rels.map((r) => (r.id === id ? { ...r, decision: { value, source: 'user', evidence: 'set by reviewer' } } : r));
}
