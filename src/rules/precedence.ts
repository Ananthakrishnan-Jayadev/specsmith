/**
 * Core rule 3: value precedence.
 *
 *   user > config > reused > derived > ai > tbd
 *
 * This is the ONLY place the order is defined. Every write to a spec field
 * must go through `applyIfAllowed` (or check `canOverwrite`) so a
 * lower-precedence source can never replace a higher-precedence value.
 */

export const SOURCES = ['user', 'config', 'reused', 'derived', 'ai', 'tbd'] as const;
export type Source = (typeof SOURCES)[number];

/** Lower number = higher precedence (user = 0). */
export function rank(source: Source): number {
  return SOURCES.indexOf(source);
}

export function isSource(value: unknown): value is Source {
  return typeof value === 'string' && (SOURCES as readonly string[]).includes(value);
}

/**
 * An incoming value may replace an existing one only when its source has
 * equal or higher precedence. Equal is allowed so a user can edit their own
 * value, or a rule can be re-derived with new data.
 */
export function canOverwrite(existing: Source, incoming: Source): boolean {
  return rank(incoming) <= rank(existing);
}

export interface Sourced<T> {
  value: T;
  source: Source;
}

export type ApplyResult<T> =
  | { applied: true; field: Sourced<T> }
  | { applied: false; field: Sourced<T>; reason: string };

/**
 * Pure: returns the field that should be stored after offering `incoming`.
 * Never mutates its inputs. A missing existing field counts as `tbd`.
 */
export function applyIfAllowed<T>(existing: Sourced<T> | undefined, incoming: Sourced<T>): ApplyResult<T> {
  if (existing === undefined || canOverwrite(existing.source, incoming.source)) {
    return { applied: true, field: { ...incoming } };
  }
  return {
    applied: false,
    field: { ...existing },
    reason: `'${incoming.source}' cannot overwrite '${existing.source}' (precedence: ${SOURCES.join(' > ')})`,
  };
}
