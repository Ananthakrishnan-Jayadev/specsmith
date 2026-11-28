/**
 * Story content from templates + spec facts. Pure and deterministic.
 */
import type { StoryTemplate } from '../config';
import type { FileSpec } from '../domain/spec';
import { specStats } from '../spec/edit';
import { adfText, bullets, doc, heading, link, para, text, type AdfDoc } from '../render/adf';

export interface FeedFacts {
  feedName: string;
  fileCount: number;
  tables: string;
  columnCount: number;
  rowCount: number;
  piiCount: number;
  pciCount: number;
  tbdCount: number;
}

export const PLACEHOLDERS: (keyof FeedFacts)[] = ['feedName', 'fileCount', 'tables', 'columnCount', 'rowCount', 'piiCount', 'pciCount', 'tbdCount'];

export function feedFacts(feedName: string, files: FileSpec[]): FeedFacts {
  const stats = files.map(specStats);
  const sum = (k: 'columns' | 'pii' | 'pci' | 'tbd') => stats.reduce((n, s) => n + s[k], 0);
  return {
    feedName,
    fileCount: files.length,
    tables: [...files].map((f) => f.tableName.value).sort().join(', ') || 'none',
    columnCount: sum('columns'),
    rowCount: files.reduce((n, f) => n + f.rowCount, 0),
    piiCount: sum('pii'),
    pciCount: sum('pci'),
    tbdCount: sum('tbd'),
  };
}

/** Replaces {placeholders}. Unknown placeholders throw, so template typos fail tests, not Jira. */
export function fill(template: string, facts: FeedFacts): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    if (!(PLACEHOLDERS as string[]).includes(key)) throw new Error(`Unknown placeholder {${key}} in story template.`);
    const v = facts[key as keyof FeedFacts];
    return typeof v === 'number' ? v.toLocaleString('en-US') : v;
  });
}

export interface StoryContent {
  summary: string;
  description: AdfDoc;
  /** Plain text of summary + description: what SpecSmith owns on the issue. */
  ownedText: string;
}

export function ownedTextOf(summary: string, description: unknown): string {
  return `${summary.trim()}\n${adfText(description).trim()}`;
}

export function buildStoryContent(t: StoryTemplate, facts: FeedFacts, specUrl: string | null): StoryContent {
  const summary = fill(t.summary, facts).slice(0, 255); // Jira summary limit
  const description = doc(
    heading(3, 'Context'),
    para(fill(t.context, facts)),
    heading(3, 'Acceptance criteria'),
    bullets(t.acceptanceCriteria.map((a) => fill(a, facts))),
    heading(3, 'Specification'),
    para(specUrl ? [...text('Column-level spec: '), link(`${facts.feedName}: Feed Spec`, specUrl)] : 'The feed spec has not been published to Confluence yet.'),
    para('Created by SpecSmith. Edit the summary and description in SpecSmith; status, assignee and estimates can be changed freely in Jira.'),
  );
  return { summary, description, ownedText: ownedTextOf(summary, description) };
}
