/**
 * Decides create vs update for a Confluence page, failing closed on ambiguity
 * (core rule 5). Pure: callers supply the pages found by an exact title search.
 */

export interface ExistingPage {
  id: string;
  version: number;
}

export type PagePlan =
  | { op: 'create' }
  | { op: 'update'; id: string; nextVersion: number }
  | { op: 'fail'; reason: string };

export function planPageWrite(title: string, matches: ExistingPage[]): PagePlan {
  if (matches.length === 0) return { op: 'create' };
  if (matches.length > 1) {
    return {
      op: 'fail',
      reason: `${matches.length} pages titled "${title}" exist in this space (ids ${matches.map((m) => m.id).join(', ')}). Refusing to guess which one to update.`,
    };
  }
  const [only] = matches as [ExistingPage];
  return { op: 'update', id: only.id, nextVersion: only.version + 1 };
}
