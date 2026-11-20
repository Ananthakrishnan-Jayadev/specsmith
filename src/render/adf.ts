/** Minimal Atlassian Document Format (ADF) builders for Jira descriptions. */

export interface AdfDoc {
  type: 'doc';
  version: 1;
  content: AdfNode[];
}
export type AdfNode =
  | { type: 'paragraph'; content: AdfText[] }
  | { type: 'bulletList'; content: { type: 'listItem'; content: { type: 'paragraph'; content: AdfText[] }[] }[] };
export interface AdfText {
  type: 'text';
  text: string;
}

const text = (t: string): AdfText[] => (t.length > 0 ? [{ type: 'text', text: t }] : []);

export function doc(...content: AdfNode[]): AdfDoc {
  return { type: 'doc', version: 1, content };
}

export function para(t: string): AdfNode {
  return { type: 'paragraph', content: text(t) };
}

export function bullets(items: string[]): AdfNode {
  return {
    type: 'bulletList',
    content: items.map((i) => ({ type: 'listItem', content: [{ type: 'paragraph', content: text(i) }] })),
  };
}
