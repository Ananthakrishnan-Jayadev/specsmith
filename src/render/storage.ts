/**
 * Builders for Confluence "storage format" (XHTML). Every piece of text that
 * comes from data MUST go through escapeXml: column names and descriptions are
 * untrusted input.
 */

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const COLOURS = { yellow: '#fff0b3', grey: '#f4f5f7', purple: '#eae6ff' } as const;

export interface Cell {
  text: string;
  /** true = yellow (TBD); or an explicit colour from COLOURS. */
  highlight?: boolean | string;
  /** Render the text in monospace. */
  code?: boolean;
}

/** One highlighted cell, in the markup the Confluence editor itself produces. */
function td(cell: Cell): string {
  const colour = cell.highlight === true ? COLOURS.yellow : typeof cell.highlight === 'string' ? cell.highlight : null;
  const attrs = colour ? ` class="highlight-${colour}" data-highlight-colour="${colour}"` : '';
  const text = escapeXml(cell.text);
  return `<td${attrs}><p>${cell.code ? `<code>${text}</code>` : text}</p></td>`;
}

export function table(headers: string[], rows: Cell[][]): string {
  const head = `<tr>${headers.map((h) => `<th><p><strong>${escapeXml(h)}</strong></p></th>`).join('')}</tr>`;
  const body = rows.map((r) => `<tr>${r.map(td).join('')}</tr>`).join('');
  return `<table data-layout="default"><tbody>${head}${body}</tbody></table>`;
}

export function paragraph(text: string): string {
  return `<p>${escapeXml(text)}</p>`;
}

export function heading(level: 1 | 2 | 3, text: string): string {
  return `<h${level}>${escapeXml(text)}</h${level}>`;
}

/** Embeds an image attached to the same page. */
export function attachedImage(filename: string): string {
  return `<ac:image><ri:attachment ri:filename="${escapeXml(filename)}" /></ac:image>`;
}

/** Confluence info panel macro. `inner` must already be storage format. */
export function infoPanel(inner: string): string {
  return `<ac:structured-macro ac:name="info"><ac:rich-text-body>${inner}</ac:rich-text-body></ac:structured-macro>`;
}

/** Lists the page's child pages. */
export function childrenMacro(): string {
  return '<ac:structured-macro ac:name="children" />';
}

export function bulletList(items: string[]): string {
  return `<ul>${items.map((i) => `<li>${escapeXml(i)}</li>`).join('')}</ul>`;
}
