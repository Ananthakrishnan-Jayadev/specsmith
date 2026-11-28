/** Minimal Atlassian Document Format (ADF) builders for Jira descriptions. */

export interface AdfMark {
  type: 'link';
  attrs: { href: string };
}
export interface AdfText {
  type: 'text';
  text: string;
  marks?: AdfMark[];
}
export type AdfInline = AdfText;
export type AdfNode =
  | { type: 'paragraph'; content: AdfInline[] }
  | { type: 'heading'; attrs: { level: number }; content: AdfInline[] }
  | { type: 'bulletList'; content: { type: 'listItem'; content: { type: 'paragraph'; content: AdfInline[] }[] }[] };
export interface AdfDoc {
  type: 'doc';
  version: 1;
  content: AdfNode[];
}

export const text = (t: string): AdfText[] => (t.length > 0 ? [{ type: 'text', text: t }] : []);
export const link = (t: string, href: string): AdfText => ({ type: 'text', text: t, marks: [{ type: 'link', attrs: { href } }] });

export function doc(...content: AdfNode[]): AdfDoc {
  return { type: 'doc', version: 1, content };
}

export function para(t: string | AdfInline[]): AdfNode {
  return { type: 'paragraph', content: typeof t === 'string' ? text(t) : t };
}

export function heading(level: 1 | 2 | 3, t: string): AdfNode {
  return { type: 'heading', attrs: { level }, content: text(t) };
}

export function bullets(items: string[]): AdfNode {
  return {
    type: 'bulletList',
    content: items.map((i) => ({ type: 'listItem', content: [{ type: 'paragraph', content: text(i) }] })),
  };
}

/**
 * Plain text of an ADF document: text nodes joined, blocks separated by newlines.
 * Used to detect edits made in Jira; tolerant of attributes Jira adds on save.
 */
export function adfText(node: unknown): string {
  if (typeof node !== 'object' || node === null) return '';
  const n = node as { type?: string; text?: string; content?: unknown[] };
  if (n.type === 'text') return n.text ?? '';
  const parts = (n.content ?? []).map(adfText);
  const block = n.type === 'paragraph' || n.type === 'heading' || n.type === 'listItem';
  return block ? `${parts.join('')}\n` : parts.join('');
}
