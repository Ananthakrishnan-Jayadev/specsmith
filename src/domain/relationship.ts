import type { FieldValue } from './spec';

export type RelationshipDecision = 'proposed' | 'accepted' | 'rejected';

/** A foreign key from one file's column to another file's key column (source names). */
export interface Relationship {
  id: string;
  fromFile: string;
  fromColumn: string;
  toFile: string;
  toColumn: string;
  /** Share of the from-column's distinct values found in the to-column. */
  overlap: number;
  fromDistinct: number;
  confidence: 'high' | 'medium';
  evidence: string;
  /** derived 'proposed' from rules; 'accepted' / 'rejected' by a reviewer (source user). */
  decision: FieldValue<RelationshipDecision>;
}

export const isActive = (r: Relationship) => r.decision.value !== 'rejected';
